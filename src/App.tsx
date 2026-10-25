import { MotionConfig } from 'framer-motion'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ToastProvider } from './components/toast'
import GameRoute from './game/GameScreen'
import Gallery from './screens/Gallery'
import JoinGame from './screens/JoinGame'
import StartGame from './screens/StartGame'
import Welcome from './screens/Welcome'

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <HashRouter>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<Welcome />} />
            <Route path="/start" element={<StartGame />} />
            <Route path="/join" element={<JoinGame />} />
            <Route path="/join/:code" element={<JoinGame />} />
            <Route path="/game/*" element={<GameRoute />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </HashRouter>
    </MotionConfig>
  )
}
