import { AnimatePresence, motion } from 'framer-motion'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Avatar, Button, Field, HoldButton, Kbd, NumberField, Sheet, SystemAvatar, Toggle } from '../components/ui'
import { formatCode, money } from '../lib/format'
import type { Player, Rules } from '../lib/types'
import { isTyping } from '../lib/useMedia'
import type { BankSheet } from './bankTypes'
import { MuteButton, Page } from './Frame'
import { lockedFor, useGame } from './GameContext'
import { TxRow } from './History'
import { AmountEntry, LogList, PlayerGrid, PlayerPanel, StatusChips } from './PlayerPanel'

export default function Bank() {
  const { state, players, currency, admin, byId, serverOffset, toast } = useGame()
  const [sheet, setSheet] = useState<BankSheet | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null)
  const loc = useLocation()
  const nav = useNavigate()
  const close = () => setSheet(null)
  const g = state.game
  const goClaims = state.requests.filter((r) => r.kind === 'go')
  const playerRequests = state.requests.filter((r) => r.kind === 'request')
  const anyLocked = players.some((p) => lockedFor(p, serverOffset) !== null)
  const anyFrozen = players.some((p) => p.frozen)
  const joining = g.rules.joining_open !== false
  const removed = state.players.filter((p) => p.kicked)

  useEffect(() => {
    document.body.classList.add('vault')
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', '#14121F')
    return () => {
      document.body.classList.remove('vault')
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', '#FFF8EC')
    }
  }, [])

  // Opened from the command palette or another screen.
  const incoming = (loc.state as { open?: BankSheet; at?: number } | null) ?? null
  useEffect(() => {
    if (incoming?.open) {
      setSheet(incoming.open)
      nav('/game/bank', { replace: true, state: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming?.at])

  // 1–9 opens that player's panel.
  const latest = useRef({ players, sheet })
  latest.current = { players, sheet }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return
      if (latest.current.sheet || document.querySelector('[role=dialog],[role=alertdialog]')) return
      if (/^[1-9]$/.test(e.key)) {
        const p = latest.current.players[Number(e.key) - 1]
        if (p) {
          e.preventDefault()
          setSheet({ kind: 'player', id: p.id })
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <Page vault>
      <header className="safe-top flex items-center gap-3 pb-4 lg:pt-0">
        <SystemAvatar kind="bank" size={56} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-[32px] leading-none">The Bank</p>
          <p className="text-[13px] font-semibold text-paper/60">
            Unlimited funds · Game {formatCode(g.code)}
            {g.status === 'paused' && ' · PAUSED'}
            {!joining && ' · Closed to new players'}
          </p>
        </div>
        <div className="lg:hidden">
          <MuteButton dark />
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-8">
        <div>
          <div className="grid grid-cols-3 gap-2.5 lg:grid-cols-5 lg:gap-3">
            <Control icon="🏁" label={`Pay GO ${money(g.go_amount, currency)}`} tone="bg-sun text-ink" onClick={() => setSheet({ kind: 'bulk', action: 'go' })} />
            <Control
              icon={g.status === 'paused' ? '▶️' : '⏸'}
              label={g.status === 'paused' ? 'Resume' : 'Pause'}
              tone={g.status === 'paused' ? 'bg-money text-ink' : undefined}
              onClick={() => admin('pause', { paused: g.status !== 'paused' })}
            />
            <Control icon="📣" label="Broadcast" onClick={() => setSheet({ kind: 'broadcast' })} />
            {anyLocked ? (
              <Control icon="🔓" label="Unlock all" tone="bg-hot text-ink" onClick={() => admin('unlock', {}, 'Everyone unlocked')} />
            ) : (
              <Control icon="🔒" label="Lock all" onClick={() => setSheet({ kind: 'lock', playerId: null })} />
            )}
            <Control
              icon="🧊"
              label={anyFrozen ? 'Unfreeze all' : 'Freeze all'}
              tone={anyFrozen ? 'bg-sky text-ink' : undefined}
              onClick={() => admin('freeze_all', { frozen: !anyFrozen })}
            />
            <Control icon="💸" label="Pay out" onClick={() => setSheet({ kind: 'bulk', action: 'payout' })} />
            <Control icon="🧲" label="Collect" onClick={() => setSheet({ kind: 'bulk', action: 'collect' })} />
            {g.rules.free_parking && (
              <>
                <Control icon="🚨" label="Fine to pot" onClick={() => setSheet({ kind: 'bulk', action: 'fine' })} />
                <Control icon="🅿️" label={`Pot ${money(g.free_parking, currency)}`} tone="bg-sun text-ink" onClick={() => setSheet({ kind: 'parking' })} />
              </>
            )}
            <Control
              icon={joining ? '🚪' : '🔑'}
              label={joining ? 'Close joining' : 'Open joining'}
              tone={joining ? undefined : 'bg-hot text-ink'}
              onClick={() => admin('edit_rules', { rules: { joining_open: !joining }, quiet: true }, joining ? 'No new players can join' : 'New players can join again')}
            />
          </div>

          {(goClaims.length > 0 || !g.rules.auto_go) && (
            <section className="brut mt-5 bg-vault-card p-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-xl">Pass GO claims</h2>
                <button
                  className={`brut-sm press h-11 px-3 text-[13px] font-semibold ${g.rules.auto_go ? 'bg-money text-ink' : 'bg-vault'}`}
                  onClick={() => admin('edit_rules', { rules: { auto_go: !g.rules.auto_go }, quiet: true })}
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
                      <Button size="sm" variant="vault" aria-label="Decline" onClick={() => admin('go_decision', { request: r.id, approve: false })}>
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

          {playerRequests.length > 0 && (
            <section className="brut mt-4 bg-vault-card p-3">
              <h2 className="font-display text-xl">Requests between players</h2>
              <ul className="mt-2 space-y-2">
                {playerRequests.map((r) => {
                  const a = byId.get(r.from_player)
                  const b = byId.get(r.to_player ?? '')
                  return (
                    <li key={r.id} className="flex items-center gap-2">
                      {a && <Avatar avatar={a.avatar} colour={a.colour} size={36} />}
                      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                        {a?.name} asked {b?.name} for {money(r.amount, currency)}
                        {r.note && <span className="text-paper/60"> · {r.note}</span>}
                      </span>
                      <Button size="sm" variant="vault" onClick={() => admin('cancel_request', { request: r.id }, 'Request cancelled')}>
                        Cancel
                      </Button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          <div className="mt-6 mb-2 flex items-baseline justify-between">
            <h2 className="font-display text-xl">Players</h2>
            <span className="kbd-hint text-[13px] font-semibold text-paper/50">Press 1–9 to open · right-click for quick actions</span>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
            {players.map((p, i) => (
              <PlayerCard
                key={p.id}
                p={p}
                n={i + 1}
                onClick={() => setSheet({ kind: 'player', id: p.id })}
                onMenu={(x, y) => setMenu({ x, y, id: p.id })}
              />
            ))}
          </div>

          {removed.length > 0 && (
            <section className="mt-6">
              <h2 className="font-display mb-2 text-xl">Removed players</h2>
              <ul className="space-y-2">
                {removed.map((p) => (
                  <li key={p.id} className="brut-sm flex items-center gap-3 bg-vault-card px-3 py-2">
                    <Avatar avatar={p.avatar} colour={p.colour} size={36} dim />
                    <span className="flex-1 truncate font-semibold">{p.name}</span>
                    <Button size="sm" variant="money" onClick={() => admin('restore', { kicked_player: p.id }, `${p.name} can play again`)}>
                      Let back in
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <h2 className="font-display mt-6 mb-2 text-xl">Game</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Button variant="vault" onClick={() => setSheet({ kind: 'history' })}>🧾 Transactions</Button>
            <Button variant="vault" onClick={() => setSheet({ kind: 'log' })}>📜 Banker log</Button>
            <Button variant="vault" onClick={() => setSheet({ kind: 'rules' })}>⚙️ Rules</Button>
            <Button variant="vault" onClick={() => setSheet({ kind: 'deputy' })} className="truncate">
              🫡 {byId.get(g.deputy_player ?? '') ? `Deputy: ${byId.get(g.deputy_player ?? '')!.name}` : 'Deputy'}
            </Button>
            <Button variant="vault" onClick={() => setSheet({ kind: 'handover' })}>🤝 Hand over</Button>
            <Button
              variant="vault"
              onClick={async () => {
                const r = await admin('new_code')
                if (r?.code) toast(`New game code: ${formatCode(r.code)}`, 'grape')
              }}
            >
              🔢 New code
            </Button>
            <Button variant="vault" onClick={() => admin('reload', {}, 'Reloading every phone')}>🔄 Reload all apps</Button>
            <Button variant="sun" onClick={() => setSheet({ kind: 'restart' })}>🔁 Restart round</Button>
            <Button variant="hot" onClick={() => setSheet({ kind: 'end' })}>🏁 End game</Button>
          </div>
        </div>

        <ActivityFeed />
      </div>

      {menu && <QuickMenu at={menu} onClose={() => setMenu(null)} open={setSheet} />}

      {sheet?.kind === 'player' && (
        <PlayerPanel
          key={`${sheet.id}-${sheet.tab}-${sheet.mode}`}
          id={sheet.id}
          initialTab={sheet.tab}
          initialMode={sheet.mode}
          onClose={close}
          onLock={() => setSheet({ kind: 'lock', playerId: sheet.id })}
        />
      )}
      <BulkSheet open={sheet?.kind === 'bulk'} action={sheet?.kind === 'bulk' ? sheet.action : 'payout'} onClose={close} />
      <BroadcastSheet open={sheet?.kind === 'broadcast'} onClose={close} />
      <LockSheet open={sheet?.kind === 'lock'} playerId={sheet?.kind === 'lock' ? sheet.playerId : null} onClose={close} />
      <ParkingSheet open={sheet?.kind === 'parking' || sheet?.kind === 'pot'} setAmount={sheet?.kind === 'pot'} onClose={close} />
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
      <Sheet open={sheet?.kind === 'log'} onClose={close} dark wide title="Banker log">
        {state.admin_log.length === 0 ? <p className="text-paper/60">Nothing yet. Every Bank action you take is listed here.</p> : <LogList logs={state.admin_log} />}
      </Sheet>
      <Sheet open={sheet?.kind === 'restart'} onClose={close} dark title="Restart the round?">
        <p className="mb-4 text-paper/70">
          Everyone goes back to {money(g.starting_balance, currency)}, bankruptcies, freezes and locks are cleared, and the Free Parking pot returns to the Bank. Players stay in the game.
        </p>
        <HoldButton variant="sun" onConfirm={async () => (await admin('restart', {}, 'New round started')) && close()}>
          Hold to restart
        </HoldButton>
      </Sheet>
      <Sheet open={sheet?.kind === 'end'} onClose={close} dark title="End the game?">
        <p className="mb-4 text-paper/70">Everyone sees the final standings and the winner. The game code stops working.</p>
        <HoldButton onConfirm={async () => (await admin('end_game')) && close()}>Hold to end game</HoldButton>
      </Sheet>
    </Page>
  )
}

function Control({ icon, label, onClick, tone = 'bg-vault-card' }: { icon: string; label: string; onClick: () => void; tone?: string }) {
  return (
    <button onClick={onClick} title={label} className={`brut press flex min-h-[88px] flex-col items-center justify-center gap-1 px-1 py-2 text-center ${tone}`}>
      <span className="text-3xl leading-none">{icon}</span>
      <span className="font-display text-[15px] leading-tight">{label}</span>
    </button>
  )
}

function PlayerCard({ p, n, onClick, onMenu }: { p: Player; n: number; onClick: () => void; onMenu: (x: number, y: number) => void }) {
  const { currency } = useGame()
  const d = p.device ?? {}
  return (
    <button
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault()
        onMenu(e.clientX, e.clientY)
      }}
      className={`brut press relative flex flex-col items-center gap-1.5 bg-vault-card p-3 text-center ${p.bankrupt ? 'opacity-50' : ''}`}
    >
      {n <= 9 && <Kbd className="absolute top-2 left-2">{n}</Kbd>}
      <span className={`absolute top-2.5 right-2.5 h-3 w-3 rounded-full border-2 border-ink ${p.online ? (d.visible === false ? 'bg-sun' : 'bg-money') : 'bg-[#666]'}`} title={p.online ? 'Online' : 'Offline'} />
      <Avatar avatar={p.avatar} colour={p.colour} size={56} dim={p.bankrupt} />
      <span className="font-display w-full truncate text-lg leading-tight">{p.name}</span>
      <span className={`font-display tnum text-2xl leading-none ${p.balance != null && p.balance < 0 ? 'text-hot' : ''}`}>{money(p.balance, currency)}</span>
      <StatusChips p={p} />
      {(d.model || d.type) && (
        <span className="hidden truncate text-[12px] text-paper/50 lg:block">
          {[d.model || d.type, String(d.browser ?? '').split(' ')[0], typeof d.battery === 'number' ? `🔋${d.battery}%` : null].filter(Boolean).join(' · ')}
        </span>
      )}
    </button>
  )
}

function QuickMenu({ at, onClose, open }: { at: { x: number; y: number; id: string }; onClose: () => void; open: (s: BankSheet) => void }) {
  const { byId, admin } = useGame()
  const p = byId.get(at.id)
  useEffect(() => {
    const off = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return
      onClose()
    }
    window.addEventListener('keydown', off)
    window.addEventListener('scroll', off, true)
    window.addEventListener('resize', off)
    return () => {
      window.removeEventListener('keydown', off)
      window.removeEventListener('scroll', off, true)
      window.removeEventListener('resize', off)
    }
  }, [onClose])
  if (!p) return null
  const items: [string, () => void][] = [
    ['🎛️ Controls', () => open({ kind: 'player', id: p.id })],
    ['📱 Device details', () => open({ kind: 'player', id: p.id, tab: 'details' })],
    ['🧾 Activity', () => open({ kind: 'player', id: p.id, tab: 'activity' })],
    ['💸 Pay from Bank…', () => open({ kind: 'player', id: p.id, mode: 'pay' })],
    ['🧲 Collect…', () => open({ kind: 'player', id: p.id, mode: 'collect' })],
    ['💬 Message…', () => open({ kind: 'player', id: p.id, mode: 'message' })],
    ['🔒 Lock…', () => open({ kind: 'lock', playerId: p.id })],
    [p.frozen ? '🧊 Unfreeze' : '🧊 Freeze', () => void admin('freeze', { player: p.id, frozen: !p.frozen })],
    ['🔄 Reload app', () => void admin('reload', { player: p.id }, `Reloading ${p.name}’s app`)],
  ]
  const x = Math.min(at.x, window.innerWidth - 240)
  const y = Math.min(at.y, window.innerHeight - items.length * 44 - 24)
  return (
    <div className="fixed inset-0 z-50" onClick={onClose} onContextMenu={(e) => (e.preventDefault(), onClose())}>
      <div
        role="menu"
        className="brut absolute w-[224px] overflow-hidden bg-vault-card p-1.5 text-paper"
        style={{ left: x, top: y, ['--shade' as string]: '#8B5CF6' }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-display truncate px-2 pt-1 pb-1.5 text-sm text-paper/60">{p.name}</p>
        {items.map(([label, fn]) => (
          <button
            key={label}
            role="menuitem"
            onClick={() => {
              onClose()
              fn()
            }}
            className="flex h-10 w-full items-center rounded-lg px-2 text-left text-[15px] font-semibold hover:bg-grape focus-visible:bg-grape"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Laptop: a live feed beside the controls. */
function ActivityFeed() {
  const { state, byId, currency, serverOffset } = useGame()
  const [tab, setTab] = useState<'money' | 'log'>('money')
  const nowMs = Date.now() + serverOffset
  return (
    <aside className="sticky top-6 hidden max-h-[calc(100dvh-48px)] flex-col lg:flex">
      <div className="mb-3 grid grid-cols-2 gap-2">
        {(
          [
            ['money', '🧾 Money'],
            ['log', '📜 Banker log'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`brut-sm press h-12 font-semibold ${tab === k ? 'bg-grape text-white' : 'bg-vault-card'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="scroll-thin -mr-2 flex-1 overflow-y-auto pr-2 pb-2">
        <AnimatePresence initial={false}>
          {tab === 'money' ? (
            state.transactions.length === 0 ? (
              <p className="text-paper/60">No money has moved yet.</p>
            ) : (
              <ul className="space-y-2">
                {state.transactions.slice(0, 80).map((t) => (
                  <TxRow key={t.id} tx={t} byId={byId} currency={currency} nowMs={nowMs} dark />
                ))}
              </ul>
            )
          ) : state.admin_log.length === 0 ? (
            <p className="text-paper/60">Your Bank actions appear here.</p>
          ) : (
            <LogList logs={state.admin_log} compact />
          )}
        </AnimatePresence>
      </div>
    </aside>
  )
}

function BulkSheet({ open, action, onClose }: { open: boolean; action: 'payout' | 'collect' | 'go' | 'fine'; onClose: () => void }) {
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
  const title = { go: 'Pay GO to', payout: 'Pay out from Bank', collect: 'Collect to Bank', fine: 'Fine into Free Parking' }[action]
  const go = async () => {
    if (!ids.length || !amount) return
    const verb = action === 'collect' ? 'Collected' : action === 'fine' ? 'Fined' : 'Paid'
    const ok = await admin(action === 'go' ? 'payout' : action, { players: ids, amount, note: action === 'go' ? 'Passed GO' : undefined }, `${verb} ${money(amount, currency)} × ${ids.length}`)
    if (ok) onClose()
  }
  return (
    <Sheet open={open} onClose={onClose} dark wide title={title}>
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
          <AmountEntry value={amount} onChange={setAmount} label="Amount each" onEnter={go}>
            <Button size="xl" variant={action === 'payout' ? 'money' : action === 'fine' ? 'hot' : 'sun'} block disabled={!ids.length || !amount} onClick={go}>
              {action === 'payout' ? 'Pay' : action === 'fine' ? 'Fine' : 'Collect'} {money(amount, currency)} each <Kbd>Enter</Kbd>
            </Button>
          </AmountEntry>
        )}
      </div>
    </Sheet>
  )
}

function ParkingSheet({ open, setAmount: startOnAmount, onClose }: { open: boolean; setAmount: boolean; onClose: () => void }) {
  const { state, admin, currency, players } = useGame()
  const [mode, setMode] = useState<'win' | 'set'>('win')
  const [amount, setAmount] = useState(0)
  useEffect(() => {
    if (open) {
      setMode(startOnAmount ? 'set' : 'win')
      setAmount(state.game.free_parking)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const save = async () => (await admin('set_parking', { amount }, `Pot set to ${money(amount, currency)}`)) && onClose()
  return (
    <Sheet open={open} onClose={onClose} dark title={`Free Parking · ${money(state.game.free_parking, currency)}`}>
      <div className="mb-4 grid grid-cols-2 gap-2">
        <button onClick={() => setMode('win')} className={`brut-sm press h-12 font-semibold ${mode === 'win' ? 'bg-grape text-white' : 'bg-vault-card'}`}>
          🏆 Pay out the pot
        </button>
        <button onClick={() => setMode('set')} className={`brut-sm press h-12 font-semibold ${mode === 'set' ? 'bg-grape text-white' : 'bg-vault-card'}`}>
          ✏️ Set the pot
        </button>
      </div>
      {mode === 'win' ? (
        state.game.free_parking > 0 ? (
          <>
            <p className="mb-3 font-semibold text-paper/70">Who landed on Free Parking?</p>
            <PlayerGrid players={players.filter((p) => !p.bankrupt)} onPick={async (p) => (await admin('parking_payout', { player: p.id })) && onClose()} />
          </>
        ) : (
          <p className="text-paper/60">The pot is empty. Fine players into it, or set it yourself.</p>
        )
      ) : (
        <AmountEntry value={amount} onChange={setAmount} label="Pot amount" onEnter={save}>
          <Button size="xl" variant="sun" block onClick={save}>
            Set pot to {money(amount, currency)} <Kbd>Enter</Kbd>
          </Button>
        </AmountEntry>
      )}
    </Sheet>
  )
}

function BroadcastSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { admin } = useGame()
  const [msg, setMsg] = useState('')
  const presets = ['Snack break! 🍕', 'Last round!', 'Auction time 🔨', 'Check your balance']
  const send = async () => msg.trim() && (await admin('broadcast', { message: msg.trim() })) && (setMsg(''), onClose())
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
        <Field label="Message to everyone" value={msg} onChange={setMsg} maxLength={120} dark placeholder="Type a message" autoFocus onEnter={send} />
        <Button size="xl" variant="grape" block disabled={!msg.trim()} onClick={send}>
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
  const lock = async () => (await admin('lock', { player: playerId, seconds: secs, message: msg.trim() || null }, `Locked ${who}`)) && onClose()
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
        <Field label="Message on their screen" value={msg} onChange={setMsg} maxLength={60} dark onEnter={lock} />
        <Button size="xl" variant="hot" block onClick={lock}>
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
  const [currency, setCurrency] = useState(g.currency)
  useEffect(() => {
    if (open) {
      setRules(g.rules)
      setStart(g.starting_balance)
      setGo(g.go_amount)
      setCurrency(g.currency)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const rule = (k: keyof Rules) => (v: boolean) => setRules((r) => ({ ...r, [k]: v }))
  return (
    <Sheet open={open} onClose={onClose} dark title="House rules">
      <div className="space-y-4">
        <NumberField label="Starting balance (late joiners and restarts)" value={start} onChange={setStart} prefix={currency} step={100} dark />
        <NumberField label="Pass GO pays" value={go} onChange={setGo} prefix={currency} step={50} dark />
        <div>
          <span className="mb-1.5 block text-[13px] font-semibold tracking-wide uppercase opacity-70">Currency symbol</span>
          <div className="flex gap-2">
            {['M', '$', '£', '€', '₩'].map((c) => (
              <button key={c} type="button" onClick={() => setCurrency(c)} className={`brut-sm press font-display h-14 flex-1 text-2xl ${currency === c ? 'bg-sun text-ink' : 'bg-vault-card'}`}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="divide-y-2 divide-vault-line">
          <Toggle dark label="Free Parking pot" checked={rules.free_parking} onChange={rule('free_parking')} />
          <Toggle dark label="Players see each other’s balances" checked={rules.show_balances} onChange={rule('show_balances')} />
          <Toggle dark label="Players can request money" checked={rules.allow_requests} onChange={rule('allow_requests')} />
          <Toggle dark label="Allow negative balances" checked={rules.allow_negative} onChange={rule('allow_negative')} />
          <Toggle dark label="Auto-approve Pass GO" checked={rules.auto_go} onChange={rule('auto_go')} />
          <Toggle dark label="New players can join" hint="Players already in can always rejoin" checked={rules.joining_open !== false} onChange={rule('joining_open')} />
        </div>
        <Button size="xl" variant="grape" block onClick={async () => (await admin('edit_rules', { rules, starting_balance: start, go_amount: go, currency })) && onClose()}>
          Save rules
        </Button>
      </div>
    </Sheet>
  )
}

function HistorySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, byId, currency, admin, serverOffset, players } = useGame()
  const [confirm, setConfirm] = useState<string | null>(null)
  const [who, setWho] = useState<string | null>(null)
  const nowMs = Date.now() + serverOffset
  const list = who ? state.transactions.filter((t) => t.from_player === who || t.to_player === who) : state.transactions
  return (
    <Sheet open={open} onClose={onClose} dark wide title="All transactions">
      <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto">
        <button onClick={() => setWho(null)} className={`brut-sm press h-11 shrink-0 px-3 font-semibold ${!who ? 'bg-grape text-white' : 'bg-vault-card'}`}>
          Everyone
        </button>
        {players.map((p) => (
          <button key={p.id} onClick={() => setWho(p.id)} className={`brut-sm press flex h-11 shrink-0 items-center gap-2 px-2 font-semibold ${who === p.id ? 'bg-grape text-white' : 'bg-vault-card'}`}>
            <Avatar avatar={p.avatar} colour={p.colour} size={26} />
            {p.name}
          </button>
        ))}
      </div>
      {list.length === 0 && <p className="text-paper/60">No transactions yet.</p>}
      <ul className="space-y-2">
        {list.map((t) => (
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
    </Sheet>
  )
}

