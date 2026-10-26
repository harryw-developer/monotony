import { type ReactNode, useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { AnimatedMoney, Avatar, Chip, Kbd, Logo } from '../components/ui'
import { formatCode } from '../lib/format'
import { isMuted, onMuted, setMuted } from '../lib/sound'
import { useCommands } from './Commands'
import { useGame } from './GameContext'

/**
 * Page shell for the in-game tabs. Phones get the bottom tab bar exactly as
 * before; laptops get a fixed sidebar and a wide content area.
 */
export function Page({ children, vault }: { children: ReactNode; vault?: boolean }) {
  return (
    <div data-theme={vault ? 'vault' : undefined} className={vault ? 'min-h-dvh bg-vault text-paper' : undefined}>
      <div className="px-4 pb-28 lg:pt-6 lg:pr-10 lg:pb-12 lg:pl-[calc(260px+40px)]">
        <div className={`mx-auto max-w-[480px] ${vault ? 'lg:max-w-[1400px]' : 'lg:max-w-[1180px]'}`}>{children}</div>
      </div>
      <BottomNav />
      <Sidebar />
    </div>
  )
}

function useTabs() {
  const { state } = useGame()
  const pendingGo = state.is_admin ? state.requests.filter((r) => r.kind === 'go').length : 0
  return [
    { to: '/game', label: 'Home', icon: '🏠', end: true, key: 'H' },
    { to: '/game/history', label: 'History', icon: '🧾', key: 'Y' },
    { to: '/game/leaders', label: 'Leaders', icon: '🏆', key: 'L' },
    ...(state.is_admin ? [{ to: '/game/bank', label: 'Bank', icon: '🏦', key: 'B', badge: pendingGo }] : []),
  ] as { to: string; label: string; icon: string; end?: boolean; key: string; badge?: number }[]
}

function Badge({ n }: { n?: number }) {
  if (!n) return null
  return (
    <span className="font-display absolute -top-2 -right-1 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-ink bg-hot px-1 text-[13px] text-ink">
      {n}
    </span>
  )
}

function BottomNav() {
  const tabs = useTabs()
  const vault = useLocation().pathname.endsWith('/bank')
  return (
    <nav className={`safe-bottom fixed inset-x-0 bottom-0 z-30 border-t-[3px] px-2 pt-2 lg:hidden ${vault ? 'border-grape bg-vault' : 'border-ink bg-paper'}`}>
      <div className="mx-auto flex max-w-[520px] gap-2">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `brut-sm press relative flex h-14 flex-1 flex-col items-center justify-center text-[13px] font-semibold ${
                isActive ? (t.label === 'Bank' ? 'bg-grape text-white' : 'bg-sun text-ink') : vault ? 'bg-vault-card text-paper' : 'bg-white text-ink'
              }`
            }
          >
            <span className="text-xl leading-none">{t.icon}</span>
            {t.label}
            <Badge n={t.badge} />
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

function Sidebar() {
  const { state, me, currency } = useGame()
  const tabs = useTabs()
  const nav = useNavigate()
  const { openPalette, openHelp } = useCommands()
  const vault = useLocation().pathname.endsWith('/bank')
  const blocked = state.game.status !== 'active' || me.frozen || me.bankrupt
  const side = vault ? 'bg-vault-card text-paper' : 'bg-white text-ink'
  return (
    <aside
      data-theme={vault ? 'vault' : undefined}
      className={`scroll-thin fixed inset-y-0 left-0 z-30 hidden w-[260px] flex-col gap-4 overflow-y-auto border-r-[3px] p-5 lg:flex ${
        vault ? 'border-grape bg-vault text-paper' : 'border-ink bg-paper text-ink'
      }`}
    >
      <button onClick={() => nav('/game')} className="-mx-2 -mt-1 -rotate-3 self-start" aria-label="Home">
        <Logo size={0.62} />
      </button>

      <div className={`brut p-3 ${side}`}>
        <div className="flex items-center gap-3">
          <Avatar avatar={me.avatar} colour={me.colour} size={48} />
          <div className="min-w-0">
            <p className="font-display truncate text-lg leading-tight">{me.name}</p>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {me.is_banker && <Chip tone="grape">Banker</Chip>}
              <Chip tone="paper">{formatCode(state.game.code)}</Chip>
            </div>
          </div>
        </div>
        <AnimatedMoney value={me.balance} currency={currency} className="font-display mt-2 block text-[32px] leading-none" />
      </div>

      <nav className="flex flex-col gap-2" aria-label="Main">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `brut-sm press relative flex h-12 items-center gap-3 px-3 font-semibold ${
                isActive ? (t.label === 'Bank' ? 'bg-grape text-white' : 'bg-sun text-ink') : side
              }`
            }
          >
            <span className="text-xl">{t.icon}</span>
            <span className="flex-1">{t.label}</span>
            <Kbd>{t.key}</Kbd>
            <Badge n={t.badge} />
          </NavLink>
        ))}
      </nav>

      <div className="grid grid-cols-2 gap-2">
        <button disabled={blocked} onClick={() => nav('/game/pay')} className="brut-sm press font-display flex h-12 items-center justify-center gap-2 bg-money text-ink">
          Pay <Kbd>P</Kbd>
        </button>
        <button
          disabled={blocked || !state.game.rules.allow_requests}
          onClick={() => nav('/game/request')}
          className="brut-sm press font-display flex h-12 items-center justify-center gap-2 bg-sky text-ink"
        >
          Ask <Kbd>R</Kbd>
        </button>
      </div>

      <div className="mt-auto flex flex-col gap-2">
        <button onClick={openPalette} className={`brut-sm press flex h-12 items-center gap-3 px-3 font-semibold ${side}`}>
          <span className="text-lg">⌘</span>
          <span className="flex-1 text-left">Commands</span>
          <Kbd>{navigator.platform.includes('Mac') ? '⌘K' : 'Ctrl K'}</Kbd>
        </button>
        <button onClick={openHelp} className={`brut-sm press flex h-12 items-center gap-3 px-3 font-semibold ${side}`}>
          <span className="text-lg">⌨️</span>
          <span className="flex-1 text-left">Shortcuts</span>
          <Kbd>?</Kbd>
        </button>
        <MuteRow className={side} />
      </div>
    </aside>
  )
}

function useMuted() {
  const [muted, set] = useState(isMuted())
  useEffect(() => {
    const off = onMuted(set)
    return () => {
      off()
    }
  }, [])
  return muted
}

function MuteRow({ className }: { className: string }) {
  const muted = useMuted()
  return (
    <button onClick={() => setMuted(!muted)} className={`brut-sm press flex h-12 items-center gap-3 px-3 font-semibold ${className}`}>
      <span className="text-lg">{muted ? '🔇' : '🔊'}</span>
      <span className="flex-1 text-left">{muted ? 'Sound off' : 'Sound on'}</span>
      <Kbd>M</Kbd>
    </button>
  )
}

export function MuteButton({ dark }: { dark?: boolean }) {
  const muted = useMuted()
  return (
    <button
      type="button"
      aria-label={muted ? 'Turn sound on' : 'Mute sound'}
      title={muted ? 'Turn sound on (M)' : 'Mute (M)'}
      onClick={() => setMuted(!muted)}
      className={`brut-sm press flex h-14 w-14 shrink-0 items-center justify-center text-2xl ${dark ? 'bg-vault-card' : 'bg-white'}`}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  )
}
