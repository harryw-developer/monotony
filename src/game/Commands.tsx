import { AnimatePresence, motion } from 'framer-motion'
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Kbd, Sheet } from '../components/ui'
import { formatCode } from '../lib/format'
import { isMuted, setMuted, sfx } from '../lib/sound'
import { isTyping } from '../lib/useMedia'
import type { BankSheet } from './bankTypes'
import { useGame } from './GameContext'

type Cmd = { id: string; label: string; group: string; icon: string; keys?: string; run: () => void }

const Ctx = createContext({ openPalette: () => {}, openHelp: () => {} })
export const useCommands = () => useContext(Ctx)

const mod = navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'

/** Global keyboard shortcuts, the ⌘K command palette and the shortcuts sheet. */
export function CommandsProvider({ children }: { children: ReactNode }) {
  const g = useGame()
  const nav = useNavigate()
  const loc = useLocation()
  const [palette, setPalette] = useState(false)
  const [help, setHelp] = useState(false)
  const { state, me, players } = g
  const admin = state.is_admin
  const active = state.game.status === 'active' && !me.frozen && !me.bankrupt

  const bank = (open: BankSheet) => nav('/game/bank', { state: { open, at: Date.now() } })
  const pay = (to?: string) => nav('/game/pay', { state: to ? { to } : null })

  const commands = useMemo<Cmd[]>(() => {
    const list: Cmd[] = [
      { id: 'home', group: 'Go to', icon: '🏠', label: 'Home', keys: 'H', run: () => nav('/game') },
      { id: 'history', group: 'Go to', icon: '🧾', label: 'History', keys: 'Y', run: () => nav('/game/history') },
      { id: 'leaders', group: 'Go to', icon: '🏆', label: 'Leaderboard', keys: 'L', run: () => nav('/game/leaders') },
    ]
    if (admin) list.push({ id: 'bank', group: 'Go to', icon: '🏦', label: 'The Bank', keys: 'B', run: () => nav('/game/bank') })
    if (active) {
      list.push(
        { id: 'pay', group: 'Money', icon: '💸', label: 'Pay someone', keys: 'P', run: () => pay() },
        { id: 'pay-bank', group: 'Money', icon: '🏦', label: 'Pay the Bank', run: () => pay('bank') },
        { id: 'go', group: 'Money', icon: '🏁', label: 'Pass GO', keys: 'G', run: () => void g.claimGo() },
      )
      if (state.game.rules.allow_requests) list.push({ id: 'request', group: 'Money', icon: '🙏', label: 'Request money', keys: 'R', run: () => nav('/game/request') })
      for (const p of players) {
        if (p.id !== me.id && !p.bankrupt) list.push({ id: `pay-${p.id}`, group: 'Money', icon: '💸', label: `Pay ${p.name}`, run: () => pay(p.id) })
      }
    }
    list.push({ id: 'mute', group: 'App', icon: '🔊', label: isMuted() ? 'Turn sound on' : 'Mute sound', keys: 'M', run: () => setMuted(!isMuted()) })
    list.push({ id: 'help', group: 'App', icon: '⌨️', label: 'Keyboard shortcuts', keys: '?', run: () => setHelp(true) })

    if (admin) {
      const paused = state.game.status === 'paused'
      const anyLocked = players.some((p) => p.locked_until)
      const anyFrozen = players.some((p) => p.frozen)
      const joining = state.game.rules.joining_open !== false
      list.push(
        { id: 'a-pause', group: 'Bank', icon: paused ? '▶️' : '⏸', label: paused ? 'Resume the game' : 'Pause the game', run: () => void g.admin('pause', { paused: !paused }) },
        { id: 'a-go', group: 'Bank', icon: '🏁', label: 'Pay GO to players…', run: () => bank({ kind: 'bulk', action: 'go' }) },
        { id: 'a-payout', group: 'Bank', icon: '💸', label: 'Pay out from the Bank…', run: () => bank({ kind: 'bulk', action: 'payout' }) },
        { id: 'a-collect', group: 'Bank', icon: '🧲', label: 'Collect to the Bank…', run: () => bank({ kind: 'bulk', action: 'collect' }) },
        { id: 'a-broadcast', group: 'Bank', icon: '📣', label: 'Broadcast a message…', run: () => bank({ kind: 'broadcast' }) },
        anyLocked
          ? { id: 'a-unlock', group: 'Bank', icon: '🔓', label: 'Unlock everyone', run: () => void g.admin('unlock', {}, 'Everyone unlocked') }
          : { id: 'a-lock', group: 'Bank', icon: '🔒', label: 'Lock everyone…', run: () => bank({ kind: 'lock', playerId: null }) },
        {
          id: 'a-freeze', group: 'Bank', icon: '🧊', label: anyFrozen ? 'Unfreeze everyone' : 'Freeze everyone',
          run: () => void g.admin('freeze_all', { frozen: !anyFrozen }),
        },
        { id: 'a-rules', group: 'Bank', icon: '⚙️', label: 'House rules…', run: () => bank({ kind: 'rules' }) },
        { id: 'a-history', group: 'Bank', icon: '🧾', label: 'All transactions (reverse)…', run: () => bank({ kind: 'history' }) },
        { id: 'a-log', group: 'Bank', icon: '📜', label: 'Banker activity log…', run: () => bank({ kind: 'log' }) },
        {
          id: 'a-joining', group: 'Bank', icon: joining ? '🚪' : '🔑', label: joining ? 'Close the game to new players' : 'Open the game to new players',
          run: () => void g.admin('edit_rules', { rules: { joining_open: !joining }, quiet: true }, joining ? 'Game closed to new players' : 'Game open to new players'),
        },
        {
          id: 'a-code', group: 'Bank', icon: '🔢', label: `New game code (now ${formatCode(state.game.code)})`,
          run: async () => {
            const r = await g.admin('new_code')
            if (r?.code) g.toast(`New game code: ${formatCode(r.code)}`, 'grape')
          },
        },
        { id: 'a-reload', group: 'Bank', icon: '🔄', label: 'Reload every player’s app', run: () => void g.admin('reload', {}, 'Reloading every phone') },
        { id: 'a-deputy', group: 'Bank', icon: '🫡', label: 'Choose a deputy…', run: () => bank({ kind: 'deputy' }) },
        { id: 'a-hand', group: 'Bank', icon: '🤝', label: 'Hand over the Bank…', run: () => bank({ kind: 'handover' }) },
        { id: 'a-restart', group: 'Bank', icon: '🔁', label: 'Restart the round…', run: () => bank({ kind: 'restart' }) },
        { id: 'a-end', group: 'Bank', icon: '🏁', label: 'End the game…', run: () => bank({ kind: 'end' }) },
      )
      if (state.game.rules.free_parking) {
        list.push(
          { id: 'a-fine', group: 'Bank', icon: '🅿️', label: 'Fine into Free Parking…', run: () => bank({ kind: 'bulk', action: 'fine' }) },
          { id: 'a-pot', group: 'Bank', icon: '🅿️', label: 'Set the Free Parking pot…', run: () => bank({ kind: 'pot' }) },
          { id: 'a-parking', group: 'Bank', icon: '🏆', label: 'Pay out the Free Parking pot…', run: () => bank({ kind: 'parking' }) },
        )
      }
      for (const p of players) {
        const P = (tab: 'controls' | 'details' | 'activity', mode?: 'pay' | 'collect' | 'message' | 'set' | 'seat') => () =>
          bank({ kind: 'player', id: p.id, tab, mode })
        list.push(
          { id: `p-${p.id}`, group: 'Players', icon: '🎛️', label: `${p.name}: controls`, run: P('controls') },
          { id: `p-d-${p.id}`, group: 'Players', icon: '📱', label: `${p.name}: device details`, run: P('details') },
          { id: `p-a-${p.id}`, group: 'Players', icon: '🧾', label: `${p.name}: activity`, run: P('activity') },
          { id: `p-pay-${p.id}`, group: 'Players', icon: '💸', label: `Bank pays ${p.name}…`, run: P('controls', 'pay') },
          { id: `p-col-${p.id}`, group: 'Players', icon: '🧲', label: `Collect from ${p.name}…`, run: P('controls', 'collect') },
          { id: `p-set-${p.id}`, group: 'Players', icon: '✏️', label: `Set ${p.name}’s balance…`, run: P('controls', 'set') },
          { id: `p-msg-${p.id}`, group: 'Players', icon: '💬', label: `Message ${p.name}…`, run: P('controls', 'message') },
          { id: `p-lock-${p.id}`, group: 'Players', icon: '🔒', label: `Lock ${p.name}…`, run: () => bank({ kind: 'lock', playerId: p.id }) },
          {
            id: `p-frz-${p.id}`, group: 'Players', icon: '🧊', label: `${p.frozen ? 'Unfreeze' : 'Freeze'} ${p.name}`,
            run: () => void g.admin('freeze', { player: p.id, frozen: !p.frozen }),
          },
          { id: `p-seat-${p.id}`, group: 'Players', icon: '📲', label: `Move ${p.name} to a new phone…`, run: P('controls', 'seat') },
        )
      }
    }
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, admin, active, players, me.id])

  // Global shortcuts. Page-level handlers (keypads, pickers) run first and
  // call preventDefault for keys they use.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((v) => !v)
        return
      }
      if (e.defaultPrevented || isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return
      if (palette || help || document.querySelector('[role=dialog],[role=alertdialog]')) return
      const k = e.key
      const go = (fn: () => void) => {
        e.preventDefault()
        fn()
      }
      if (k === '/' ) go(() => setPalette(true))
      else if (k === '?') go(() => setHelp(true))
      else if (k === 'h' || k === 'H') go(() => nav('/game'))
      else if (k === 'y' || k === 'Y') go(() => nav('/game/history'))
      else if (k === 'l' || k === 'L') go(() => nav('/game/leaders'))
      else if ((k === 'b' || k === 'B') && admin) go(() => nav('/game/bank'))
      else if ((k === 'p' || k === 'P') && active) go(() => pay())
      else if ((k === 'r' || k === 'R') && active && state.game.rules.allow_requests) go(() => nav('/game/request'))
      else if ((k === 'g' || k === 'G') && active) go(() => void g.claimGo())
      else if (k === 'm' || k === 'M') go(() => setMuted(!isMuted()))
      else if (k === 'Escape' && loc.pathname !== '/game') go(() => nav('/game'))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palette, help, admin, active, loc.pathname, state.game.rules.allow_requests])

  const value = useMemo(() => ({ openPalette: () => setPalette(true), openHelp: () => setHelp(true) }), [])
  return (
    <Ctx.Provider value={value}>
      {children}
      <Palette open={palette} onClose={() => setPalette(false)} commands={commands} />
      <HelpSheet open={help} onClose={() => setHelp(false)} admin={admin} />
    </Ctx.Provider>
  )
}

function Palette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: Cmd[] }) {
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open) {
      setQ('')
      setI(0)
    }
  }, [open])
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const shown = commands.filter((c) => words.every((w) => `${c.label} ${c.group}`.toLowerCase().includes(w))).slice(0, 60)
  useEffect(() => setI(0), [q])
  useEffect(() => {
    list.current?.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [i])
  const run = (c?: Cmd) => {
    if (!c) return
    sfx.tap()
    onClose()
    c.run()
  }
  let lastGroup = ''
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[10vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-ink/60" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal
            aria-label="Command palette"
            className="brut relative flex max-h-[70vh] w-full max-w-[620px] flex-col overflow-hidden bg-paper text-ink"
            style={{ ['--edge' as string]: '#111', ['--shade' as string]: '#111' }}
            initial={{ y: -20, scale: 0.97 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: -20, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 500, damping: 32 }}
          >
            <div className="flex items-center gap-3 border-b-[3px] border-ink px-4">
              <span className="text-xl">⌘</span>
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setI((n) => Math.min(shown.length - 1, n + 1))
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setI((n) => Math.max(0, n - 1))
                  } else if (e.key === 'Enter') {
                    e.preventDefault()
                    run(shown[i])
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    onClose()
                  }
                }}
                placeholder="Type a command or a player’s name…"
                aria-label="Search commands"
                className="font-display h-16 flex-1 bg-transparent text-xl outline-none placeholder:text-ink/35"
              />
              <Kbd className="!inline-flex">Esc</Kbd>
            </div>
            <div ref={list} className="scroll-thin overflow-y-auto p-2" role="listbox">
              {shown.length === 0 && <p className="px-3 py-6 text-center opacity-60">Nothing matches “{q}”</p>}
              {shown.map((c, n) => {
                const head = c.group !== lastGroup
                lastGroup = c.group
                return (
                  <div key={c.id}>
                    {head && <p className="px-3 pt-3 pb-1 text-[12px] font-bold tracking-wide uppercase opacity-50">{c.group}</p>}
                    <button
                      data-i={n}
                      role="option"
                      aria-selected={n === i}
                      onMouseMove={() => setI(n)}
                      onClick={() => run(c)}
                      className={`flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left font-semibold ${n === i ? 'bg-sun' : ''}`}
                    >
                      <span className="w-6 text-center text-lg">{c.icon}</span>
                      <span className="flex-1 truncate">{c.label}</span>
                      {c.keys && <Kbd className="!inline-flex">{c.keys}</Kbd>}
                    </button>
                  </div>
                )
              })}
            </div>
            <div className="flex gap-4 border-t-[3px] border-ink px-4 py-2 text-[12px] font-semibold opacity-60">
              <span>↑↓ choose</span>
              <span>↵ run</span>
              <span>Esc close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function HelpSheet({ open, onClose, admin }: { open: boolean; onClose: () => void; admin: boolean }) {
  const groups: [string, [string, string][]][] = [
    [
      'Anywhere',
      [
        [`${mod} K  or  /`, 'Command palette'],
        ['H · Y · L' + (admin ? ' · B' : ''), 'Home · History · Leaders' + (admin ? ' · Bank' : '')],
        ['P', 'Pay'],
        ['R', 'Request money'],
        ['G', 'Pass GO'],
        ['M', 'Sound on/off'],
        ['Esc', 'Back / close'],
        ['?', 'This list'],
      ],
    ],
    [
      'Paying',
      [
        ['1 – 9', 'Pick a recipient'],
        ['0 – 9, ⌫, Del', 'Type the amount'],
        ['Enter, Enter', 'Send (press twice to confirm)'],
      ],
    ],
    [
      'Pop-ups',
      [
        ['Enter / P', 'Pay a request'],
        ['Esc / D', 'Decline a request'],
        ['Enter / Esc', 'Close a message or celebration'],
      ],
    ],
  ]
  if (admin)
    groups.push([
      'The Bank',
      [
        ['1 – 9', 'Open that player’s panel'],
        ['In a player panel', 'O Controls · D Details · A Activity'],
        ['In Controls', 'P pay · C collect · M move · S set · F freeze · L lock · T message · N rename'],
        ['Right-click a player', 'Quick menu'],
      ],
    ])
  return (
    <Sheet open={open} onClose={onClose} title="Keyboard shortcuts">
      <div className="space-y-5">
        {groups.map(([title, rows]) => (
          <section key={title}>
            <h3 className="font-display mb-2 text-lg">{title}</h3>
            <div className="brut divide-y-2 divide-ink/10 bg-white">
              {rows.map(([k, label]) => (
                <div key={k} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="flex-1 font-semibold">{label}</span>
                  <kbd className="rounded-md border-2 border-ink bg-paper px-2 py-0.5 text-[13px] font-bold whitespace-nowrap">{k}</kbd>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Sheet>
  )
}
