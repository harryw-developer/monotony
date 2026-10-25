import { motion } from 'framer-motion'
import { type ReactNode, useEffect, useState } from 'react'
import { PlayerStyle } from '../components/PlayerStyle'
import { Avatar, Button, Chip, Field, HoldButton, Keypad, NumberField, Sheet, SystemAvatar, Toggle } from '../components/ui'
import { formatCode, money } from '../lib/format'
import type { Player, Rules } from '../lib/types'
import { lockedFor, useGame } from './GameContext'
import { BottomNav, MuteButton } from './GameScreen'
import { TxRow } from './History'

type SheetState =
  | { kind: 'player'; id: string }
  | { kind: 'bulk'; action: 'payout' | 'collect' | 'go' }
  | { kind: 'broadcast' }
  | { kind: 'lock'; playerId: string | null }
  | { kind: 'parking' }
  | { kind: 'rules' }
  | { kind: 'deputy' }
  | { kind: 'handover' }
  | { kind: 'history' }
  | { kind: 'end' }

export default function Bank() {
  const { state, players, currency, admin, byId, serverOffset } = useGame()
  const [sheet, setSheet] = useState<SheetState | null>(null)
  const close = () => setSheet(null)
  const g = state.game
  const goClaims = state.requests.filter((r) => r.kind === 'go')
  const anyLocked = players.some((p) => lockedFor(p, serverOffset) !== null)
  const deputy = byId.get(g.deputy_player ?? '')

  useEffect(() => {
    document.body.classList.add('vault')
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', '#14121F')
    return () => {
      document.body.classList.remove('vault')
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', '#FFF8EC')
    }
  }, [])

  return (
    <div data-theme="vault" className="min-h-dvh bg-vault text-paper">
      <div className="mx-auto max-w-[520px] px-4 pb-28">
        <header className="safe-top flex items-center gap-3 pb-4">
          <SystemAvatar kind="bank" size={56} />
          <div className="min-w-0 flex-1">
            <p className="font-display text-[32px] leading-none">The Bank</p>
            <p className="text-[13px] font-semibold text-paper/60">
              Unlimited funds · Game {formatCode(g.code)}
              {g.status === 'paused' && ' · PAUSED'}
            </p>
          </div>
          <MuteButton dark />
        </header>

        <div className="grid grid-cols-3 gap-2.5">
          <Control icon="🏁" label={`Pay GO ${money(g.go_amount, currency)}`} tone="bg-sun text-ink" onClick={() => setSheet({ kind: 'bulk', action: 'go' })} />
          <Control
            icon={g.status === 'paused' ? '▶️' : '⏸'}
            label={g.status === 'paused' ? 'Resume' : 'Pause'}
            tone={g.status === 'paused' ? 'bg-money text-ink' : 'bg-vault-card'}
            onClick={() => admin('pause', { paused: g.status !== 'paused' })}
          />
          <Control icon="📣" label="Broadcast" onClick={() => setSheet({ kind: 'broadcast' })} />
          {anyLocked ? (
            <Control icon="🔓" label="Unlock all" tone="bg-hot text-ink" onClick={() => admin('unlock', {}, 'Everyone unlocked')} />
          ) : (
            <Control icon="🔒" label="Lock all" onClick={() => setSheet({ kind: 'lock', playerId: null })} />
          )}
          <Control icon="💸" label="Pay out" onClick={() => setSheet({ kind: 'bulk', action: 'payout' })} />
          <Control icon="🧲" label="Collect" onClick={() => setSheet({ kind: 'bulk', action: 'collect' })} />
          {g.rules.free_parking && (
            <Control icon="🅿️" label={`Pot ${money(g.free_parking, currency)}`} tone="bg-sun text-ink" onClick={() => setSheet({ kind: 'parking' })} />
          )}
        </div>

        {(goClaims.length > 0 || !g.rules.auto_go) && (
          <section className="brut mt-5 bg-vault-card p-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-xl">Pass GO claims</h2>
              <button
                className={`brut-sm press h-11 px-3 text-[13px] font-semibold ${g.rules.auto_go ? 'bg-money text-ink' : 'bg-vault'}`}
                onClick={() => admin('edit_rules', { rules: { auto_go: !g.rules.auto_go } })}
              >
                Auto-approve: {g.rules.auto_go ? 'on' : 'off'}
              </button>
            </div>
            {goClaims.length === 0 && <p className="mt-2 text-[13px] text-paper/60">No claims waiting.</p>}
            <ul className="mt-2 space-y-2">
              {goClaims.map((r) => {
                const p = byId.get(r.from_player)
                return (
                  <motion.li layout key={r.id} className="flex items-center gap-2" initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
                    {p && <Avatar avatar={p.avatar} colour={p.colour} size={44} />}
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {p?.name} · {money(r.amount, currency)}
                    </span>
                    <Button size="sm" variant="vault" onClick={() => admin('go_decision', { request: r.id, approve: false })}>
                      ✕
                    </Button>
                    <Button size="sm" variant="money" onClick={() => admin('go_decision', { request: r.id, approve: true })}>
                      Approve
                    </Button>
                  </motion.li>
                )
              })}
            </ul>
          </section>
        )}

        <h2 className="font-display mt-6 mb-2 text-xl">Players</h2>
        <div className="grid grid-cols-2 gap-3">
          {players.map((p) => (
            <PlayerCard key={p.id} p={p} onClick={() => setSheet({ kind: 'player', id: p.id })} />
          ))}
        </div>

        <h2 className="font-display mt-6 mb-2 text-xl">Game</h2>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="vault" onClick={() => setSheet({ kind: 'history' })}>
            🧾 History
          </Button>
          <Button variant="vault" onClick={() => setSheet({ kind: 'rules' })}>
            ⚙️ Rules
          </Button>
          <Button variant="vault" onClick={() => setSheet({ kind: 'deputy' })} className="truncate">
            🫡 {deputy ? `Deputy: ${deputy.name}` : 'Deputy'}
          </Button>
          <Button variant="vault" onClick={() => setSheet({ kind: 'handover' })}>
            🤝 Hand over
          </Button>
        </div>
        <div className="mt-3">
          <Button variant="hot" block onClick={() => setSheet({ kind: 'end' })}>
            🏁 End game
          </Button>
        </div>
      </div>

      {sheet?.kind === 'player' && <PlayerSheet id={sheet.id} onClose={close} onLock={() => setSheet({ kind: 'lock', playerId: sheet.id })} />}
      <BulkSheet open={sheet?.kind === 'bulk'} action={sheet?.kind === 'bulk' ? sheet.action : 'payout'} onClose={close} />
      <BroadcastSheet open={sheet?.kind === 'broadcast'} onClose={close} />
      <LockSheet open={sheet?.kind === 'lock'} playerId={sheet?.kind === 'lock' ? sheet.playerId : null} onClose={close} />
      <PickSheet
        open={sheet?.kind === 'parking'}
        title={`Pay out ${money(g.free_parking, currency)} pot to`}
        onClose={close}
        onPick={async (p) => (await admin('parking_payout', { player: p.id })) && close()}
      />
      <PickSheet
        open={sheet?.kind === 'deputy'}
        title="Deputy Banker"
        hint="Your deputy gets the Bank controls whenever your phone is offline for 45 seconds."
        exclude={[g.banker_player ?? '']}
        selected={g.deputy_player}
        extra={
          g.deputy_player ? (
            <Button variant="vault" block onClick={async () => (await admin('set_deputy', { player: null }, 'Deputy removed')) && close()}>
              No deputy
            </Button>
          ) : null
        }
        onClose={close}
        onPick={async (p) => (await admin('set_deputy', { player: p.id }, `${p.name} is your deputy`)) && close()}
      />
      <PickSheet
        open={sheet?.kind === 'handover'}
        title="Hand the Bank to"
        hint="They become the Banker. You keep playing as a normal player."
        exclude={[g.banker_player ?? '']}
        hold
        onClose={close}
        onPick={async (p) => (await admin('hand_over', { player: p.id })) && close()}
      />
      <RulesSheet open={sheet?.kind === 'rules'} onClose={close} />
      <HistorySheet open={sheet?.kind === 'history'} onClose={close} />
      <Sheet open={sheet?.kind === 'end'} onClose={close} dark title="End the game?">
        <p className="mb-4 text-paper/70">Everyone sees the final standings and the winner. The game code stops working.</p>
        <HoldButton onConfirm={async () => (await admin('end_game')) && close()}>Hold to end game</HoldButton>
      </Sheet>
      <BottomNav />
    </div>
  )
}

function Control({ icon, label, onClick, tone = 'bg-vault-card' }: { icon: string; label: string; onClick: () => void; tone?: string }) {
  return (
    <button onClick={onClick} className={`brut press flex min-h-[88px] flex-col items-center justify-center gap-1 px-1 py-2 text-center ${tone}`}>
      <span className="text-3xl leading-none">{icon}</span>
      <span className="font-display text-[15px] leading-tight">{label}</span>
    </button>
  )
}

function StatusChips({ p }: { p: Player }) {
  const { state, serverOffset } = useGame()
  return (
    <div className="flex flex-wrap justify-center gap-1">
      {p.is_banker && <Chip tone="grape">Banker</Chip>}
      {state.game.deputy_player === p.id && <Chip tone="grape">Deputy</Chip>}
      {p.frozen && <Chip tone="sky">🧊 Frozen</Chip>}
      {lockedFor(p, serverOffset) !== null && <Chip tone="hot">🔒 Locked</Chip>}
      {p.bankrupt && <Chip tone="hot">💀 Bankrupt</Chip>}
      {!p.online && <Chip tone="paper">Offline</Chip>}
    </div>
  )
}

function PlayerCard({ p, onClick }: { p: Player; onClick: () => void }) {
  const { currency } = useGame()
  return (
    <button onClick={onClick} className={`brut press flex flex-col items-center gap-1.5 bg-vault-card p-3 text-center ${p.bankrupt ? 'opacity-50' : ''}`}>
      <Avatar avatar={p.avatar} colour={p.colour} size={56} dim={p.bankrupt} />
      <span className="font-display w-full truncate text-lg leading-tight">{p.name}</span>
      <span className={`font-display tnum text-2xl leading-none ${p.balance != null && p.balance < 0 ? 'text-hot' : ''}`}>{money(p.balance, currency)}</span>
      <StatusChips p={p} />
    </button>
  )
}

function AmountEntry({
  value, onChange, label, children,
}: { value: number; onChange: (v: number) => void; label: string; children: ReactNode }) {
  const { currency } = useGame()
  return (
    <div className="space-y-3">
      <div className="text-center">
        <p className="text-[13px] font-semibold tracking-wide text-paper/60 uppercase">{label}</p>
        <p className={`font-display tnum text-[56px] leading-none ${value ? '' : 'opacity-30'}`}>{money(value, currency)}</p>
      </div>
      <Keypad value={value} onChange={onChange} dark />
      {children}
    </div>
  )
}

type Mode = 'menu' | 'pay' | 'collect' | 'transfer' | 'set' | 'rename' | 'restyle' | 'bankrupt'

function PlayerSheet({ id, onClose, onLock }: { id: string; onClose: () => void; onLock: () => void }) {
  const { byId, players, admin, currency, state, serverOffset } = useGame()
  const p = byId.get(id)
  const [mode, setMode] = useState<Mode>('menu')
  const [amount, setAmount] = useState(0)
  const [to, setTo] = useState<Player | null>(null)
  const [name, setName] = useState(p?.name ?? '')
  const [avatar, setAvatar] = useState(p?.avatar ?? 'car')
  const [colour, setColour] = useState(p?.colour ?? 'blue')
  if (!p || p.kicked) return null
  const back = () => {
    setMode('menu')
    setAmount(0)
    setTo(null)
  }
  const done = (ok: boolean) => ok && back()
  const others = players.filter((x) => x.id !== p.id)
  const locked = lockedFor(p, serverOffset) !== null

  return (
    <Sheet
      open
      onClose={onClose}
      dark
      title={
        <span className="flex items-center gap-3">
          {mode !== 'menu' && (
            <button onClick={back} aria-label="Back" className="brut-sm press flex h-12 w-12 items-center justify-center bg-vault-card text-xl">
              ←
            </button>
          )}
          <Avatar avatar={p.avatar} colour={p.colour} size={48} />
          <span className="min-w-0 truncate">
            {p.name}
            <span className="tnum block text-base text-paper/60">{money(p.balance, currency)}</span>
          </span>
        </span>
      }
    >
      {mode === 'menu' && (
        <div className="space-y-3">
          <StatusChips p={p} />
          <div className="grid grid-cols-2 gap-3">
            <Button variant="money" size="lg" onClick={() => setMode('pay')}>
              💸 Pay from Bank
            </Button>
            <Button variant="sun" size="lg" onClick={() => setMode('collect')}>
              🧲 Collect
            </Button>
            <Button variant="vault" size="lg" disabled={others.length === 0} onClick={() => setMode('transfer')}>
              ↔️ Move money
            </Button>
            <Button variant="vault" size="lg" onClick={() => setMode('set')}>
              ✏️ Set balance
            </Button>
            <Button variant={p.frozen ? 'sky' : 'vault'} size="lg" onClick={() => admin('freeze', { player: p.id, frozen: !p.frozen })}>
              🧊 {p.frozen ? 'Unfreeze' : 'Freeze'}
            </Button>
            {locked ? (
              <Button variant="hot" size="lg" onClick={() => admin('unlock', { player: p.id })}>
                🔓 Unlock
              </Button>
            ) : (
              <Button variant="vault" size="lg" onClick={onLock}>
                🔒 Lock app
              </Button>
            )}
            <Button variant="vault" size="lg" onClick={() => (setName(p.name), setMode('rename'))}>
              🏷️ Rename
            </Button>
            <Button variant="vault" size="lg" onClick={() => (setAvatar(p.avatar), setColour(p.colour), setMode('restyle'))}>
              🎨 Avatar
            </Button>
          </div>
          {p.bankrupt ? (
            <Button variant="money" size="lg" block onClick={() => admin('unbankrupt', { player: p.id })}>
              Bring back into game
            </Button>
          ) : (
            <Button variant="hot" size="lg" block onClick={() => setMode('bankrupt')}>
              💀 Bankrupt…
            </Button>
          )}
          {!p.is_banker && (
            <HoldButton variant="hot" onConfirm={async () => (await admin('kick', { player: p.id }, `${p.name} removed`)) && onClose()}>
              Hold to kick {p.name}
            </HoldButton>
          )}
        </div>
      )}

      {(mode === 'pay' || mode === 'collect') && (
        <AmountEntry value={amount} onChange={setAmount} label={mode === 'pay' ? `Bank pays ${p.name}` : `Bank takes from ${p.name}`}>
          <Button
            size="xl"
            variant={mode === 'pay' ? 'money' : 'sun'}
            block
            disabled={!amount}
            onClick={async () => done(await admin(mode === 'pay' ? 'payout' : 'collect', { players: [p.id], amount }, mode === 'pay' ? `Paid ${p.name}` : `Collected from ${p.name}`))}
          >
            {mode === 'pay' ? 'Pay' : 'Collect'} {money(amount, currency)}
          </Button>
        </AmountEntry>
      )}

      {mode === 'transfer' && !to && (
        <div>
          <p className="mb-3 font-semibold text-paper/70">Move money from {p.name} to…</p>
          <PlayerGrid players={others} onPick={setTo} />
        </div>
      )}
      {mode === 'transfer' && to && (
        <AmountEntry value={amount} onChange={setAmount} label={`${p.name} → ${to.name}`}>
          <Button size="xl" variant="grape" block disabled={!amount} onClick={async () => done(await admin('transfer', { from: p.id, to: to.id, amount }, `Moved to ${to.name}`))}>
            Move {money(amount, currency)}
          </Button>
        </AmountEntry>
      )}

      {mode === 'set' && (
        <AmountEntry value={amount} onChange={setAmount} label={`New balance (now ${money(p.balance, currency)})`}>
          <HoldButton variant="hot" onConfirm={async () => done(await admin('set_balance', { player: p.id, amount }, 'Balance set'))}>
            Hold to set {money(amount, currency)}
          </HoldButton>
        </AmountEntry>
      )}

      {mode === 'rename' && (
        <div className="space-y-4">
          <Field label="New name" value={name} onChange={setName} dark autoFocus />
          <Button size="xl" variant="grape" block disabled={!name.trim()} onClick={async () => done(await admin('rename', { player: p.id, name: name.trim() }, 'Renamed'))}>
            Rename
          </Button>
        </div>
      )}

      {mode === 'restyle' && (
        <div className="space-y-4">
          <div className="flex justify-center">
            <Avatar avatar={avatar} colour={colour} size={80} />
          </div>
          <PlayerStyle avatar={avatar} colour={colour} onAvatar={setAvatar} onColour={setColour} dark />
          <Button size="xl" variant="grape" block onClick={async () => done(await admin('restyle', { player: p.id, avatar, colour }, 'Look updated'))}>
            Save
          </Button>
        </div>
      )}

      {mode === 'bankrupt' && (
        <div className="space-y-3">
          <p className="font-semibold text-paper/70">
            {p.name}’s {money(Math.max(0, p.balance ?? 0), currency)} goes to…
          </p>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setTo(null)}
              className={`brut-sm press flex flex-col items-center gap-1 p-2 ${!to ? 'bg-grape' : 'bg-vault-card'}`}
            >
              <SystemAvatar kind="bank" size={44} />
              <span className="font-display">Bank</span>
            </button>
            {others.map((o) => (
              <button key={o.id} onClick={() => setTo(o)} className={`brut-sm press flex flex-col items-center gap-1 p-2 ${to?.id === o.id ? 'bg-grape' : 'bg-vault-card'}`}>
                <Avatar avatar={o.avatar} colour={o.colour} size={44} />
                <span className="font-display w-full truncate">{o.name}</span>
              </button>
            ))}
          </div>
          <HoldButton onConfirm={async () => done(await admin('bankrupt', { player: p.id, to: to?.id ?? null }))}>
            Hold to bankrupt {p.name}
          </HoldButton>
        </div>
      )}
      {state.game.status === 'paused' && mode === 'menu' && <p className="mt-3 text-center text-[13px] text-paper/50">Game is paused: players can’t pay, but Bank controls still work.</p>}
    </Sheet>
  )
}

function PlayerGrid({ players, onPick, selected, multi }: { players: Player[]; onPick: (p: Player) => void; selected?: string[]; multi?: boolean }) {
  const { currency } = useGame()
  return (
    <div className="grid grid-cols-3 gap-2">
      {players.map((o) => {
        const on = selected?.includes(o.id)
        return (
          <button
            key={o.id}
            onClick={() => onPick(o)}
            aria-pressed={multi ? on : undefined}
            className={`brut-sm press relative flex flex-col items-center gap-1 p-2 ${on ? 'bg-grape' : 'bg-vault-card'} ${o.bankrupt ? 'opacity-50' : ''}`}
          >
            {multi && <span className="absolute top-1 right-2 font-display">{on ? '✓' : ''}</span>}
            <Avatar avatar={o.avatar} colour={o.colour} size={48} dim={o.bankrupt} />
            <span className="font-display w-full truncate">{o.name}</span>
            <span className="tnum text-[13px] text-paper/60">{money(o.balance, currency)}</span>
          </button>
        )
      })}
    </div>
  )
}

function BulkSheet({ open, action, onClose }: { open: boolean; action: 'payout' | 'collect' | 'go'; onClose: () => void }) {
  const { players, admin, currency, state } = useGame()
  const [ids, setIds] = useState<string[]>([])
  const [amount, setAmount] = useState(0)
  useEffect(() => {
    if (open) {
      setIds([])
      setAmount(action === 'go' ? state.game.go_amount : 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, action])
  const active = players.filter((p) => !p.bankrupt)
  const toggle = (p: Player) => setIds((s) => (s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id]))
  const title = action === 'go' ? 'Pay GO to' : action === 'payout' ? 'Pay out from Bank' : 'Collect to Bank'
  const go = async () => {
    const ok = await admin(action === 'collect' ? 'collect' : 'payout', { players: ids, amount, note: action === 'go' ? 'Passed GO' : undefined }, `${action === 'collect' ? 'Collected' : 'Paid'} ${money(amount, currency)} × ${ids.length}`)
    if (ok) onClose()
  }
  return (
    <Sheet open={open} onClose={onClose} dark title={title}>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-paper/70">{ids.length ? `${ids.length} selected` : 'Tap players'}</span>
        <button className="brut-sm press h-11 bg-vault-card px-3 text-[13px] font-semibold" onClick={() => setIds(ids.length === active.length ? [] : active.map((p) => p.id))}>
          {ids.length === active.length ? 'None' : 'Everyone'}
        </button>
      </div>
      <PlayerGrid players={active} selected={ids} multi onPick={toggle} />
      <div className="mt-4">
        {action === 'go' ? (
          <Button size="xl" variant="sun" block disabled={!ids.length || !amount} onClick={go}>
            Pay {money(amount, currency)} each
          </Button>
        ) : (
          <AmountEntry value={amount} onChange={setAmount} label="Amount each">
            <Button size="xl" variant={action === 'payout' ? 'money' : 'sun'} block disabled={!ids.length || !amount} onClick={go}>
              {action === 'payout' ? 'Pay' : 'Collect'} {money(amount, currency)} each
            </Button>
          </AmountEntry>
        )}
      </div>
    </Sheet>
  )
}

function BroadcastSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { admin } = useGame()
  const [msg, setMsg] = useState('')
  const presets = ['Snack break! 🍕', 'Last round!', 'Auction time 🔨', 'Check your balance']
  return (
    <Sheet open={open} onClose={onClose} dark title="Broadcast">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button key={p} onClick={() => setMsg(p)} className="brut-sm press h-11 bg-vault-card px-3 text-sm font-semibold">
              {p}
            </button>
          ))}
        </div>
        <Field label="Message to everyone" value={msg} onChange={setMsg} maxLength={120} dark placeholder="Type a message" />
        <Button size="xl" variant="grape" block disabled={!msg.trim()} onClick={async () => (await admin('broadcast', { message: msg.trim() }, 'Sent to everyone')) && (setMsg(''), onClose())}>
          Send to all phones
        </Button>
      </div>
    </Sheet>
  )
}

function LockSheet({ open, playerId, onClose }: { open: boolean; playerId: string | null; onClose: () => void }) {
  const { admin, byId } = useGame()
  const [secs, setSecs] = useState<number | null>(30)
  const [msg, setMsg] = useState('Jail!')
  const who = playerId ? byId.get(playerId)?.name : 'everyone'
  const times: [string, number | null][] = [
    ['30s', 30],
    ['1 min', 60],
    ['5 min', 300],
    ['Until I unlock', null],
  ]
  return (
    <Sheet open={open} onClose={onClose} dark title={`Lock ${who}`}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {times.map(([l, s]) => (
            <button key={l} onClick={() => setSecs(s)} className={`brut-sm press font-display h-14 text-lg ${secs === s ? 'bg-hot text-ink' : 'bg-vault-card'}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {['Jail!', 'Go to Jail', 'Time out', 'Dinner time'].map((m) => (
            <button key={m} onClick={() => setMsg(m)} className={`brut-sm press h-11 px-3 text-sm font-semibold ${msg === m ? 'bg-sun text-ink' : 'bg-vault-card'}`}>
              {m}
            </button>
          ))}
        </div>
        <Field label="Message on their screen" value={msg} onChange={setMsg} maxLength={60} dark />
        <Button
          size="xl"
          variant="hot"
          block
          onClick={async () => (await admin('lock', { player: playerId, seconds: secs, message: msg.trim() || null }, `Locked ${who}`)) && onClose()}
        >
          🔒 Lock {who}
        </Button>
        <p className="text-[13px] text-paper/50">This only locks Monotony, not their phone. They can’t pay or request while locked.</p>
      </div>
    </Sheet>
  )
}

function PickSheet({
  open, title, hint, exclude = [], selected, onPick, onClose, extra, hold,
}: {
  open: boolean; title: string; hint?: string; exclude?: string[]; selected?: string | null; onPick: (p: Player) => void; onClose: () => void; extra?: ReactNode; hold?: boolean
}) {
  const { players } = useGame()
  const [chosen, setChosen] = useState<Player | null>(null)
  useEffect(() => setChosen(null), [open])
  const list = players.filter((p) => !exclude.includes(p.id) && !p.bankrupt)
  return (
    <Sheet open={open} onClose={onClose} dark title={title}>
      {hint && <p className="mb-3 text-paper/70">{hint}</p>}
      {list.length === 0 ? (
        <p className="text-paper/60">No other players yet.</p>
      ) : (
        <PlayerGrid players={list} selected={chosen ? [chosen.id] : selected ? [selected] : []} onPick={(p) => (hold ? setChosen(p) : onPick(p))} />
      )}
      {hold && chosen && (
        <div className="mt-4">
          <HoldButton variant="grape" onConfirm={() => onPick(chosen)}>
            Hold to hand over to {chosen.name}
          </HoldButton>
        </div>
      )}
      {extra && <div className="mt-4">{extra}</div>}
    </Sheet>
  )
}

function RulesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, admin } = useGame()
  const g = state.game
  const [rules, setRules] = useState<Rules>(g.rules)
  const [start, setStart] = useState(g.starting_balance)
  const [go, setGo] = useState(g.go_amount)
  useEffect(() => {
    if (open) {
      setRules(g.rules)
      setStart(g.starting_balance)
      setGo(g.go_amount)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const rule = (k: keyof Rules) => (v: boolean) => setRules((r) => ({ ...r, [k]: v }))
  return (
    <Sheet open={open} onClose={onClose} dark title="House rules">
      <div className="space-y-4">
        <NumberField label="Starting balance (for late joiners)" value={start} onChange={setStart} prefix={g.currency} step={100} dark />
        <NumberField label="Pass GO pays" value={go} onChange={setGo} prefix={g.currency} step={50} dark />
        <div className="divide-y-2 divide-vault-line">
          <Toggle dark label="Free Parking pot" checked={rules.free_parking} onChange={rule('free_parking')} />
          <Toggle dark label="Players see each other’s balances" checked={rules.show_balances} onChange={rule('show_balances')} />
          <Toggle dark label="Players can request money" checked={rules.allow_requests} onChange={rule('allow_requests')} />
          <Toggle dark label="Allow negative balances" checked={rules.allow_negative} onChange={rule('allow_negative')} />
          <Toggle dark label="Auto-approve Pass GO" checked={rules.auto_go} onChange={rule('auto_go')} />
        </div>
        <Button size="xl" variant="grape" block onClick={async () => (await admin('edit_rules', { rules, starting_balance: start, go_amount: go })) && onClose()}>
          Save rules
        </Button>
      </div>
    </Sheet>
  )
}

function HistorySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, byId, currency, admin, serverOffset } = useGame()
  const [confirm, setConfirm] = useState<string | null>(null)
  const nowMs = Date.now() + serverOffset
  return (
    <Sheet open={open} onClose={onClose} dark title="Game history">
      {state.transactions.length === 0 && <p className="text-paper/60">No transactions yet.</p>}
      <ul className="space-y-2">
        {state.transactions.map((t) => (
          <li key={t.id}>
            <TxRow
              as="div"
              tx={t}
              byId={byId}
              currency={currency}
              nowMs={nowMs}
              dark
              action={
                !t.reversed_by && t.type !== 'reversal' ? (
                  <button aria-label="Reverse" onClick={() => setConfirm(confirm === t.id ? null : t.id)} className="brut-sm press h-11 w-11 shrink-0 bg-vault text-lg">
                    ↩️
                  </button>
                ) : null
              }
            />
            {confirm === t.id && (
              <div className="mt-2">
                <HoldButton variant="sun" onConfirm={async () => (await admin('reverse', { transaction: t.id }, 'Reversed')) && setConfirm(null)}>
                  Hold to reverse {money(t.amount, currency)}
                </HoldButton>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Sheet>
  )
}
