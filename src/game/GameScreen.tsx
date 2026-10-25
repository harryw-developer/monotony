import { useEffect, useState } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Button, Spinner } from '../components/ui'
import { clearSession, getSession } from '../lib/device'
import { isMuted, onMuted, setMuted } from '../lib/sound'
import Bank from './Bank'
import { GameProvider, useGame } from './GameContext'
import GameOver from './GameOver'
import History from './History'
import Home from './Home'
import Leaderboard from './Leaderboard'
import Lobby from './Lobby'
import { BroadcastOverlay, CelebrationOverlay, IncomingRequestOverlay, LockOverlay } from './Overlays'
import PayFlow from './PayFlow'

export default function GameRoute() {
  const nav = useNavigate()
  const session = getSession()
  if (!session) return <Navigate to="/" replace />
  return (
    <GameProvider
      key={session.gameId}
      session={session}
      onFatal={(msg) => nav('/', { replace: true, state: { notice: msg } })}
      fallback={(error) => (
        <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col justify-center px-4">
          <Spinner label={error ? 'Reconnecting…' : 'Opening your wallet…'} />
          {error && (
            <>
              <p className="brut mb-4 bg-white px-4 py-3 text-center font-semibold">{error}</p>
              <Button
                size="lg"
                variant="white"
                block
                onClick={() => {
                  clearSession()
                  nav('/', { replace: true })
                }}
              >
                Leave this game
              </Button>
            </>
          )}
        </div>
      )}
    >
      <Shell />
    </GameProvider>
  )
}

function Shell() {
  const { state } = useGame()
  const status = state.game.status
  if (status === 'lobby')
    return (
      <>
        <Lobby />
        <BroadcastOverlay />
      </>
    )
  if (status === 'ended') return <GameOver />
  return (
    <>
      <Routes>
        <Route index element={<Home />} />
        <Route path="pay" element={<PayFlow mode="pay" />} />
        <Route path="request" element={<PayFlow mode="request" />} />
        <Route path="history" element={<History />} />
        <Route path="leaders" element={<Leaderboard />} />
        <Route path="bank" element={state.is_admin ? <Bank /> : <Navigate to="/game" replace />} />
        <Route path="*" element={<Navigate to="/game" replace />} />
      </Routes>
      <CelebrationOverlay />
      <IncomingRequestOverlay />
      <BroadcastOverlay />
      <LockOverlay />
    </>
  )
}

export function BottomNav() {
  const { state } = useGame()
  const loc = useLocation()
  const vault = loc.pathname.endsWith('/bank')
  const pendingGo = state.is_admin ? state.requests.filter((r) => r.kind === 'go').length : 0
  const tabs = [
    { to: '/game', label: 'Home', icon: '🏠', end: true },
    { to: '/game/history', label: 'History', icon: '🧾' },
    { to: '/game/leaders', label: 'Leaders', icon: '🏆' },
    ...(state.is_admin ? [{ to: '/game/bank', label: 'Bank', icon: '🏦', badge: pendingGo }] : []),
  ]
  return (
    <nav
      className={`safe-bottom fixed inset-x-0 bottom-0 z-30 border-t-[3px] px-2 pt-2 ${vault ? 'border-grape bg-vault' : 'border-ink bg-paper'}`}
    >
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
            {'badge' in t && !!t.badge && (
              <span className="font-display absolute -top-2 -right-1 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-ink bg-hot px-1 text-[13px] text-ink">
                {t.badge}
              </span>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

export function MuteButton({ dark }: { dark?: boolean }) {
  const [muted, set] = useState(isMuted())
  useEffect(() => {
    const off = onMuted(set)
    return () => {
      off()
    }
  }, [])
  return (
    <button
      type="button"
      aria-label={muted ? 'Turn sound on' : 'Mute sound'}
      onClick={() => setMuted(!muted)}
      className={`brut-sm press flex h-14 w-14 shrink-0 items-center justify-center text-2xl ${dark ? 'bg-vault-card' : 'bg-white'}`}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  )
}
