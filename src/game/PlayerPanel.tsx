import { type ReactNode, useEffect, useRef, useState } from 'react'
import { PlayerStyle } from '../components/PlayerStyle'
import { Avatar, Button, Chip, Field, HoldButton, Kbd, Keypad, Sheet, SystemAvatar } from '../components/ui'
import { APP_VERSION } from '../lib/deviceInfo'
import { money, timeAgo } from '../lib/format'
import type { AdminLog, Player } from '../lib/types'
import { isTyping } from '../lib/useMedia'
import { describeLog } from './adminLog'
import type { PlayerMode, PlayerTab } from './bankTypes'
import { lockedFor, useGame } from './GameContext'
import { TxRow } from './History'

export function StatusChips({ p, center = true }: { p: Player; center?: boolean }) {
  const { state, serverOffset } = useGame()
  return (
    <div className={`flex flex-wrap gap-1 ${center ? 'justify-center' : ''}`}>
      {p.is_banker && <Chip tone="grape">Banker</Chip>}
      {state.game.deputy_player === p.id && <Chip tone="grape">Deputy</Chip>}
      {p.frozen && <Chip tone="sky">🧊 Frozen</Chip>}
      {lockedFor(p, serverOffset) !== null && <Chip tone="hot">🔒 Locked</Chip>}
      {p.bankrupt && <Chip tone="hot">💀 Bankrupt</Chip>}
      {p.online ? p.device?.visible === false ? <Chip tone="sun">💤 App in background</Chip> : null : <Chip tone="paper">Offline</Chip>}
      {typeof p.device?.battery === 'number' && p.device.battery <= 15 && !p.device.charging && <Chip tone="hot">🪫 {p.device.battery}%</Chip>}
    </div>
  )
}

/** Hook: run `fn` on Enter (when not typing in a field). */
function useEnter(fn: () => void, active: boolean) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !isTyping(e) && !e.defaultPrevented) {
        e.preventDefault()
        ref.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])
}

export function AmountEntry({
  value, onChange, label, children, onEnter,
}: { value: number; onChange: (v: number) => void; label: string; children: ReactNode; onEnter?: () => void }) {
  const { currency } = useGame()
  useEnter(() => value > 0 && onEnter?.(), !!onEnter)
  return (
    <div className="space-y-3">
      <div className="text-center">
        <p className="text-[13px] font-semibold tracking-wide text-paper/60 uppercase">{label}</p>
        <p className={`font-display tnum text-[56px] leading-none ${value ? '' : 'opacity-30'}`}>{money(value, currency)}</p>
        <p className="kbd-hint mt-1 w-full justify-center text-[12px] font-semibold text-paper/50">Type the amount · Enter to confirm</p>
      </div>
      <Keypad value={value} onChange={onChange} dark />
      {children}
    </div>
  )
}

export function PlayerGrid({
  players, onPick, selected, multi,
}: { players: Player[]; onPick: (p: Player) => void; selected?: string[]; multi?: boolean }) {
  const { currency } = useGame()
  return (
    <div className="grid grid-cols-3 gap-2 lg:grid-cols-4">
      {players.map((o) => {
        const on = selected?.includes(o.id)
        return (
          <button
            key={o.id}
            onClick={() => onPick(o)}
            aria-pressed={multi ? on : undefined}
            className={`brut-sm press relative flex flex-col items-center gap-1 p-2 ${on ? 'bg-grape' : 'bg-vault-card'} ${o.bankrupt ? 'opacity-50' : ''}`}
          >
            {multi && <span className="font-display absolute top-1 right-2">{on ? '✓' : ''}</span>}
            <Avatar avatar={o.avatar} colour={o.colour} size={48} dim={o.bankrupt} />
            <span className="font-display w-full truncate">{o.name}</span>
            <span className="tnum text-[13px] text-paper/60">{money(o.balance, currency)}</span>
          </button>
        )
      })}
    </div>
  )
}

const MODE_KEYS: Record<string, PlayerMode> = { p: 'pay', c: 'collect', m: 'transfer', s: 'set', t: 'message', n: 'rename' }

export function PlayerPanel({
  id, onClose, onLock, initialTab = 'controls', initialMode = 'menu',
}: { id: string; onClose: () => void; onLock: () => void; initialTab?: PlayerTab; initialMode?: PlayerMode }) {
  const g = useGame()
  const { byId, players, admin, currency, state, serverOffset } = g
  const p = byId.get(id)
  const [tab, setTab] = useState<PlayerTab>(initialTab)
  const [mode, setMode] = useState<PlayerMode>(initialMode)
  const [amount, setAmount] = useState(0)
  const [to, setTo] = useState<Player | null>(null)
  const [name, setName] = useState(p?.name ?? '')
  const [msg, setMsg] = useState('')
  const [avatar, setAvatar] = useState(p?.avatar ?? 'car')
  const [colour, setColour] = useState(p?.colour ?? 'blue')

  const back = () => {
    setMode('menu')
    setAmount(0)
    setTo(null)
  }
  const done = (ok: unknown) => {
    if (ok) back()
    return !!ok
  }
  const go = (m: PlayerMode) => {
    setTab('controls')
    if (m === 'rename') setName(p?.name ?? '')
    if (m === 'restyle') {
      setAvatar(p?.avatar ?? 'car')
      setColour(p?.colour ?? 'blue')
    }
    setMode(m)
  }

  // Panel keys: D details, A activity, O controls, plus action letters in Controls.
  const latest = useRef({ mode, p, go, onLock })
  latest.current = { mode, p, go, onLock }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return
      const L = latest.current
      if (!L.p || L.mode !== 'menu') return
      const k = e.key.toLowerCase()
      if (k === 'd') setTab('details')
      else if (k === 'a') setTab('activity')
      else if (k === 'o') setTab('controls')
      else if (k === 'f') void admin('freeze', { player: L.p.id, frozen: !L.p.frozen })
      else if (k === 'l') L.onLock()
      else if (MODE_KEYS[k]) L.go(MODE_KEYS[k])
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [admin])

  if (!p || p.kicked) return null
  const others = players.filter((x) => x.id !== p.id)
  const locked = lockedFor(p, serverOffset) !== null
  const isDeputy = state.game.deputy_player === p.id

  return (
    <Sheet
      open
      wide
      onClose={onClose}
      onEscape={() => {
        if (mode !== 'menu') {
          back()
          return true
        }
        return false
      }}
      dark
      title={
        <span className="flex items-center gap-3">
          {mode !== 'menu' && (
            <button onClick={back} aria-label="Back" title="Back (Esc)" className="brut-sm press flex h-12 w-12 shrink-0 items-center justify-center bg-vault-card text-xl">
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
        <div className="mb-4 grid grid-cols-3 gap-2" role="tablist">
          {(
            [
              ['controls', 'Controls', 'O'],
              ['details', 'Details', 'D'],
              ['activity', 'Activity', 'A'],
            ] as const
          ).map(([k, label, key]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`brut-sm press flex h-12 items-center justify-center gap-2 font-semibold ${tab === k ? 'bg-grape text-white' : 'bg-vault-card'}`}
            >
              {label} <Kbd>{key}</Kbd>
            </button>
          ))}
        </div>
      )}

      {tab === 'controls' && mode === 'menu' && (
        <div className="space-y-3">
          <StatusChips p={p} />
          <div className="grid grid-cols-2 gap-3">
            <Act variant="money" k="P" onClick={() => go('pay')}>💸 Pay out</Act>
            <Act variant="sun" k="C" onClick={() => go('collect')}>🧲 Collect</Act>
            <Act k="M" disabled={others.length === 0} onClick={() => go('transfer')}>↔️ Move</Act>
            <Act k="S" onClick={() => go('set')}>✏️ Set</Act>
            <Act variant={p.frozen ? 'sky' : 'vault'} k="F" onClick={() => admin('freeze', { player: p.id, frozen: !p.frozen })}>
              🧊 {p.frozen ? 'Unfreeze' : 'Freeze'}
            </Act>
            {locked ? (
              <Act variant="hot" k="L" onClick={() => admin('unlock', { player: p.id })}>🔓 Unlock</Act>
            ) : (
              <Act k="L" onClick={onLock}>🔒 Lock</Act>
            )}
            <Act k="T" onClick={() => go('message')}>💬 Message</Act>
            <Act k="N" onClick={() => go('rename')}>🏷️ Rename</Act>
            <Act onClick={() => go('restyle')}>🎨 Avatar</Act>
            <Act onClick={() => admin('reload', { player: p.id }, `Reloading ${p.name}’s app`)}>🔄 Reload</Act>
            <Act onClick={() => go('seat')}>📲 New phone</Act>
            {!p.is_banker && (
              <Act onClick={() => admin('set_deputy', { player: isDeputy ? null : p.id }, isDeputy ? 'Deputy removed' : `${p.name} is your deputy`)}>
                🫡 {isDeputy ? 'No deputy' : 'Deputy'}
              </Act>
            )}
          </div>
          {p.bankrupt ? (
            <Button variant="money" size="lg" block onClick={() => admin('unbankrupt', { player: p.id })}>
              Bring back into game
            </Button>
          ) : (
            <Button variant="hot" size="lg" block onClick={() => go('bankrupt')}>
              💀 Bankrupt…
            </Button>
          )}
          {!p.is_banker && (
            <div className="grid gap-3 lg:grid-cols-2">
              <HoldButton variant="grape" onConfirm={() => admin('hand_over', { player: p.id })}>
                Hold: make Banker
              </HoldButton>
              <HoldButton variant="hot" onConfirm={async () => (await admin('kick', { player: p.id }, `${p.name} removed`)) && onClose()}>
                Hold to kick
              </HoldButton>
            </div>
          )}
        </div>
      )}

      {tab === 'details' && mode === 'menu' && <Details p={p} />}
      {tab === 'activity' && mode === 'menu' && <Activity p={p} />}

      {(mode === 'pay' || mode === 'collect') && (
        <AmountEntry
          value={amount}
          onChange={setAmount}
          label={mode === 'pay' ? `Bank pays ${p.name}` : `Bank takes from ${p.name}`}
          onEnter={async () => done(await admin(mode === 'pay' ? 'payout' : 'collect', { players: [p.id], amount }, mode === 'pay' ? `Paid ${p.name}` : `Collected from ${p.name}`))}
        >
          <Button
            size="xl"
            variant={mode === 'pay' ? 'money' : 'sun'}
            block
            disabled={!amount}
            onClick={async () => done(await admin(mode === 'pay' ? 'payout' : 'collect', { players: [p.id], amount }, mode === 'pay' ? `Paid ${p.name}` : `Collected from ${p.name}`))}
          >
            {mode === 'pay' ? 'Pay' : 'Collect'} {money(amount, currency)} <Kbd>Enter</Kbd>
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
        <AmountEntry
          value={amount}
          onChange={setAmount}
          label={`${p.name} → ${to.name}`}
          onEnter={async () => done(await admin('transfer', { from: p.id, to: to.id, amount }, `Moved to ${to.name}`))}
        >
          <Button size="xl" variant="grape" block disabled={!amount} onClick={async () => done(await admin('transfer', { from: p.id, to: to.id, amount }, `Moved to ${to.name}`))}>
            Move {money(amount, currency)} <Kbd>Enter</Kbd>
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
          <Field label="New name" value={name} onChange={setName} dark autoFocus onEnter={async () => name.trim() && done(await admin('rename', { player: p.id, name: name.trim() }, 'Renamed'))} />
          <Button size="xl" variant="grape" block disabled={!name.trim()} onClick={async () => done(await admin('rename', { player: p.id, name: name.trim() }, 'Renamed'))}>
            Rename
          </Button>
        </div>
      )}

      {mode === 'message' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {['Your turn!', 'Pay up 😤', 'Check your balance', 'Come back to the table'].map((m) => (
              <button key={m} onClick={() => setMsg(m)} className="brut-sm press h-11 bg-vault-card px-3 text-sm font-semibold">
                {m}
              </button>
            ))}
          </div>
          <Field
            label={`Full-screen message to ${p.name} only`}
            value={msg}
            onChange={setMsg}
            maxLength={120}
            dark
            autoFocus
            onEnter={async () => msg.trim() && done(await admin('message', { player: p.id, message: msg.trim() }, `Sent to ${p.name}`)) && setMsg('')}
          />
          <Button size="xl" variant="grape" block disabled={!msg.trim()} onClick={async () => done(await admin('message', { player: p.id, message: msg.trim() }, `Sent to ${p.name}`)) && setMsg('')}>
            Send to {p.name}
          </Button>
        </div>
      )}

      {mode === 'seat' && <SeatCode p={p} />}

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
          <div className="grid grid-cols-3 gap-2 lg:grid-cols-4">
            <button onClick={() => setTo(null)} className={`brut-sm press flex flex-col items-center gap-1 p-2 ${!to ? 'bg-grape' : 'bg-vault-card'}`}>
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
          <HoldButton onConfirm={async () => done(await admin('bankrupt', { player: p.id, to: to?.id ?? null }))}>Hold to bankrupt {p.name}</HoldButton>
        </div>
      )}
      {g.state.game.status === 'paused' && mode === 'menu' && tab === 'controls' && (
        <p className="mt-3 text-center text-[13px] text-paper/50">Game is paused: players can’t pay, but Bank controls still work.</p>
      )}
    </Sheet>
  )
}

function Act({
  children, onClick, k, variant = 'vault', disabled,
}: { children: ReactNode; onClick: () => void; k?: string; variant?: 'vault' | 'money' | 'sun' | 'sky' | 'hot'; disabled?: boolean }) {
  return (
    <Button variant={variant} size="lg" disabled={disabled} onClick={onClick} className="justify-between! px-3! text-[16px]! lg:text-[17px]!">
      <span className="truncate">{children}</span>
      {k && <Kbd>{k}</Kbd>}
    </Button>
  )
}

function SeatCode({ p }: { p: Player }) {
  const { admin, serverOffset } = useGame()
  const [, tick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [])
  const left = p.claim_expires ? Math.max(0, Math.round((Date.parse(p.claim_expires) - (Date.now() + serverOffset)) / 1000)) : 0
  const code = left > 0 ? p.claim_code : null
  return (
    <div className="space-y-4">
      <p className="text-paper/80">
        Lost phone, flat battery or swapped browser? Give {p.name} a one-time code. On the new phone they open <b>Join a game</b>, type the game code, then tap{' '}
        <b>Use a seat code</b>. Their balance and history come with them.
      </p>
      {code ? (
        <div className="brut bg-sun p-5 text-center text-ink" style={{ ['--edge' as string]: '#111', ['--shade' as string]: '#111' }}>
          <p className="text-[13px] font-semibold tracking-wide uppercase opacity-60">Seat code for {p.name}</p>
          <p className="font-display tnum text-[64px] leading-none tracking-[0.15em]">
            {code.slice(0, 3)} {code.slice(3)}
          </p>
          <p className="mt-2 font-semibold">
            Works once · expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
          </p>
        </div>
      ) : null}
      <Button size="xl" variant="grape" block onClick={() => admin('seat_code', { player: p.id })}>
        {code ? 'Make a fresh code' : 'Make a seat code'}
      </Button>
      <p className="text-[13px] text-paper/50">The old phone stops working for this seat as soon as the code is used.</p>
    </div>
  )
}

function Row({ icon, label, value, warn }: { icon: string; label: string; value: ReactNode; warn?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <span className="w-6 text-center text-lg">{icon}</span>
      <span className="flex-1 text-paper/70">{label}</span>
      <span className={`text-right font-semibold ${warn ? 'text-hot' : ''}`}>{value}</span>
    </div>
  )
}

function Details({ p }: { p: Player }) {
  const { state, currency, admin, serverOffset } = useGame()
  const nowMs = Date.now() + serverOffset
  const d = p.device ?? {}
  const has = Object.keys(d).length > 0
  const txs = state.transactions.filter((t) => t.from_player === p.id || t.to_player === p.id)
  const moneyIn = txs.filter((t) => t.to_player === p.id && t.type !== 'deal').reduce((s, t) => s + t.amount, 0)
  const moneyOut = txs.filter((t) => t.from_player === p.id).reduce((s, t) => s + t.amount, 0)
  const biggest = txs.filter((t) => t.from_player === p.id && t.type === 'pay').reduce((m, t) => Math.max(m, t.amount), 0)
  const gos = txs.filter((t) => t.to_player === p.id && t.type === 'go').length
  const stale = has && d.app_version && d.app_version !== APP_VERSION
  const yesNo = (v: unknown) => (v == null ? 'Unknown' : v ? 'Yes' : 'No')
  const deviceName = [d.model, d.type].filter(Boolean).join(' · ') || 'Unknown'
  return (
    <div className="space-y-5">
      <section>
        <h3 className="font-display mb-2 text-lg">Right now</h3>
        <div className="brut divide-y-2 divide-vault-line bg-vault-card">
          <Row icon={p.online ? '🟢' : '⚪️'} label="Connection" value={p.online ? 'Online' : `Offline · seen ${p.last_seen ? timeAgo(p.last_seen, nowMs) : '—'}`} />
          <Row icon="👀" label="Monotony on screen" value={!has ? 'Unknown' : d.visible ? 'Yes' : 'In background'} warn={has && !d.visible} />
          <Row
            icon={d.charging ? '🔌' : '🔋'}
            label="Battery"
            value={typeof d.battery === 'number' ? `${d.battery}%${d.charging ? ' · charging' : ''}` : 'Not shared by this browser'}
            warn={typeof d.battery === 'number' && d.battery <= 15 && !d.charging}
          />
          <Row icon="📶" label="Network" value={d.online === false ? 'No internet' : d.connection ? `${String(d.connection).toUpperCase()}${d.downlink_mbps ? ` · ${d.downlink_mbps} Mb/s` : ''}` : 'Unknown'} />
          <Row icon="🔊" label="Sound" value={d.sound_on == null ? 'Unknown' : d.sound_on ? 'On' : 'Muted'} />
          <Row icon="🔒" label="Status" value={<StatusChips p={p} center={false} />} />
        </div>
      </section>

      <section>
        <h3 className="font-display mb-2 text-lg">Device</h3>
        {!has && <p className="mb-2 text-[13px] text-paper/60">This phone hasn’t reported yet. Details appear a few seconds after it opens the app.</p>}
        <div className="brut divide-y-2 divide-vault-line bg-vault-card">
          <Row icon="📱" label="Device" value={deviceName} />
          <Row icon="⚙️" label="System" value={String(d.os ?? 'Unknown')} />
          <Row icon="🌐" label="Browser" value={String(d.browser ?? 'Unknown')} />
          <Row icon="📲" label="Installed as app" value={yesNo(d.installed)} />
          <Row icon="🖥️" label="Screen" value={d.screen ? `${d.screen} @${d.pixel_ratio}x` : 'Unknown'} />
          <Row icon="🔲" label="Window" value={String(d.viewport ?? 'Unknown')} />
          <Row icon="🔄" label="Orientation" value={String(d.orientation ?? 'Unknown')} />
          <Row icon="👆" label="Touch screen" value={d.touch_points == null ? 'Unknown' : Number(d.touch_points) > 0 ? `Yes (${d.touch_points} points)` : 'No'} />
          <Row icon="🧠" label="Memory · CPU" value={`${d.memory_gb ? `${d.memory_gb} GB` : '?'} · ${d.cpu_cores ? `${d.cpu_cores} cores` : '?'}`} />
          <Row icon="🗣️" label="Language" value={String(d.language ?? 'Unknown')} />
          <Row icon="🕒" label="Time zone" value={String(d.timezone ?? 'Unknown')} />
          <Row icon="🌙" label="Dark mode · Reduced motion" value={`${yesNo(d.dark_mode)} · ${yesNo(d.reduced_motion)}`} />
          <Row icon="🆕" label="App version" value={d.app_version ? `${d.app_version}${stale ? ' (out of date)' : ''}` : 'Unknown'} warn={!!stale} />
          <Row icon="📡" label="Last report" value={d.reported_at ? timeAgo(String(d.reported_at), nowMs) : '—'} />
        </div>
        {stale && (
          <Button className="mt-3" variant="sun" block onClick={() => admin('reload', { player: p.id }, `Updating ${p.name}’s app`)}>
            🔄 Update their app now
          </Button>
        )}
      </section>

      <section>
        <h3 className="font-display mb-2 text-lg">In this game</h3>
        <div className="brut divide-y-2 divide-vault-line bg-vault-card">
          <Row icon="💰" label="Balance" value={money(p.balance, currency)} warn={(p.balance ?? 0) < 0} />
          <Row icon="📈" label="Since the start" value={p.balance == null ? '—' : `${(p.balance ?? 0) - state.game.starting_balance >= 0 ? '+' : ''}${money((p.balance ?? 0) - state.game.starting_balance, currency)}`} />
          <Row icon="⬇️" label="Money in (excl. starting money)" value={money(moneyIn, currency)} />
          <Row icon="⬆️" label="Money out" value={money(moneyOut, currency)} />
          <Row icon="🧾" label="Transactions" value={txs.length} />
          <Row icon="🏷️" label="Biggest payment" value={biggest ? money(biggest, currency) : '—'} />
          <Row icon="🏁" label="Passed GO" value={`${gos}×`} />
          <Row icon="🚪" label="Joined" value={timeAgo(p.joined_at, nowMs)} />
          <Row icon="🔁" label="Times opened the app" value={p.visits ?? 1} />
        </div>
      </section>
      <p className="text-[13px] text-paper/50">Players are told the Banker can see their device type, browser and battery. Nothing here identifies a person.</p>
    </div>
  )
}

function Activity({ p }: { p: Player }) {
  const { state, byId, currency, admin, serverOffset } = useGame()
  const [confirm, setConfirm] = useState<string | null>(null)
  const nowMs = Date.now() + serverOffset
  const txs = state.transactions.filter((t) => t.from_player === p.id || t.to_player === p.id)
  const logs = state.admin_log.filter((l) => l.target === p.id || (Array.isArray(l.payload.players) && (l.payload.players as string[]).includes(p.id)))
  return (
    <div className="space-y-5">
      <section>
        <h3 className="font-display mb-2 text-lg">Money</h3>
        {txs.length === 0 && <p className="text-paper/60">No transactions yet.</p>}
        <ul className="space-y-2">
          {txs.map((t) => (
            <li key={t.id}>
              <TxRow
                as="div"
                tx={t}
                byId={byId}
                meId={p.id}
                currency={currency}
                nowMs={nowMs}
                dark
                action={
                  !t.reversed_by && t.type !== 'reversal' ? (
                    <button aria-label="Reverse" title="Reverse" onClick={() => setConfirm(confirm === t.id ? null : t.id)} className="brut-sm press h-11 w-11 shrink-0 bg-vault text-lg">
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
      </section>
      <section>
        <h3 className="font-display mb-2 text-lg">Banker actions</h3>
        {logs.length === 0 && <p className="text-paper/60">The Banker hasn’t done anything to {p.name} yet.</p>}
        <LogList logs={logs} />
      </section>
    </div>
  )
}

export function LogList({ logs, compact }: { logs: AdminLog[]; compact?: boolean }) {
  const { byId, currency, state, serverOffset } = useGame()
  const nowMs = Date.now() + serverOffset
  return (
    <ul className="space-y-2">
      {logs.map((l) => {
        const d = describeLog(l, byId, currency, state.game.banker_player)
        return (
          <li key={l.id} className={`brut-sm flex items-start gap-3 bg-vault-card px-3 ${compact ? 'py-1.5' : 'py-2'}`}>
            <span className="mt-0.5 w-6 shrink-0 text-center text-lg">{d.icon}</span>
            <span className="min-w-0 flex-1 text-[15px] leading-snug font-semibold break-words">{d.text}</span>
            <span className="shrink-0 pt-0.5 text-[12px] whitespace-nowrap text-paper/50">{timeAgo(l.created_at, nowMs)}</span>
          </li>
        )
      })}
    </ul>
  )
}
