import { motion } from 'framer-motion'
import { useEffect } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button, Kbd, Logo } from '../components/ui'
import { getSession } from '../lib/device'
import { formatCode } from '../lib/format'
import { unlockAudio } from '../lib/sound'

// Reopening the app (e.g. from the home screen icon) goes straight back to your seat.
const openedAtRoot = ['', '#', '#/'].includes(window.location.hash)
let resumed = false

export default function Welcome() {
  const nav = useNavigate()
  const loc = useLocation()
  const session = getSession()
  const notice = (loc.state as { notice?: string } | null)?.notice
  const resume = openedAtRoot && !resumed && !!session && !notice
  useEffect(() => {
    resumed = true
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      const to = k === 'j' ? '/join' : k === 's' ? '/start' : k === 'enter' && session ? '/game' : null
      if (!to) return
      // Stop the key landing in the next screen's text field.
      e.preventDefault()
      unlockAudio()
      nav(to)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav, session])
  if (resume) return <Navigate to="/game" replace />
  return (
    <div className="paper-grid safe-top safe-bottom mx-auto flex min-h-dvh max-w-[480px] flex-col px-4 lg:justify-center">
      <div className="flex flex-1 flex-col items-center justify-center py-8 lg:flex-none lg:pb-12">
        <motion.div initial={{ scale: 0.6, rotate: -6 }} animate={{ scale: 1, rotate: -3 }} transition={{ type: 'spring', stiffness: 260, damping: 12 }}>
          <Logo />
        </motion.div>
        <p className="font-display mt-6 max-w-[300px] text-center text-xl">Monopoly money on everyone’s phone. No paper, no maths.</p>
      </div>
      {notice && <p className="brut mb-4 bg-hot px-4 py-3 font-semibold">{notice}</p>}
      <div className="flex flex-col gap-4 pb-4">
        {session && (
          <Button size="xl" variant="sun" block onClick={() => (unlockAudio(), nav('/game'))}>
            Back to game {formatCode(session.code)} <Kbd>Enter</Kbd>
          </Button>
        )}
        <Button size="xl" variant="money" block onClick={() => (unlockAudio(), nav('/join'))}>
          Join a game <Kbd>J</Kbd>
        </Button>
        <Button size="xl" variant="white" block onClick={() => (unlockAudio(), nav('/start'))}>
          Start a game <Kbd>S</Kbd>
        </Button>
        <Link to="/gallery" className="mt-1 self-center py-2 text-[13px] font-semibold underline opacity-50">
          Component gallery
        </Link>
      </div>
    </div>
  )
}
