import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { Button, Spinner } from '../components/ui'
import { clearSession, getSession } from '../lib/device'
import Bank from './Bank'
import { CommandsProvider } from './Commands'
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
      onFatal={(msg) =>
        nav('/', {
          replace: true,
          state: { notice: /not in this game/i.test(msg) ? 'This phone isn’t in that game any more. The Banker may have moved your seat to another phone.' : msg },
        })
      }
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
    <CommandsProvider>
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
    </CommandsProvider>
  )
}
