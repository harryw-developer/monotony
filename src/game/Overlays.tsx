import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { hexFor } from '../lib/avatars'
import { money } from '../lib/format'
import { Avatar, Button, SystemAvatar } from '../components/ui'
import { lockedFor, useGame } from './GameContext'

/** A banknote shape, used for confetti and the "sent" fly-away. */
export function Note({ colour, amount, currency, w = 120 }: { colour: string; amount?: number; currency: string; w?: number }) {
  return (
    <div
      className="font-display flex items-center justify-center rounded-[8px] border-[3px] border-ink text-ink"
      style={{ width: w, height: w * 0.52, background: colour, boxShadow: '3px 3px 0 #111', fontSize: w * 0.2 }}
    >
      <span className="flex h-[70%] w-[86%] items-center justify-center rounded-[4px] border-2 border-ink/40">
        {amount != null ? money(amount, currency) : currency}
      </span>
    </div>
  )
}

function Confetti({ colour, currency }: { colour: string; currency: string }) {
  const notes = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 0.6,
        dur: 1.6 + Math.random() * 1.2,
        rot: (Math.random() - 0.5) * 720,
        size: 44 + Math.random() * 30,
        tint: i % 3 === 0 ? '#FFD23F' : colour,
      })),
    [colour],
  )
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {notes.map((n) => (
        <motion.div
          key={n.id}
          className="absolute top-0"
          style={{ left: `${n.x}%` }}
          initial={{ y: '-15vh', rotate: 0, x: '-50%' }}
          animate={{ y: '115vh', rotate: n.rot }}
          transition={{ duration: n.dur, delay: n.delay, ease: 'easeIn' }}
        >
          <Note colour={n.tint} currency={currency} w={n.size} />
        </motion.div>
      ))}
    </div>
  )
}

export function CelebrationOverlay() {
  const { celebration, clearCelebration, currency } = useGame()
  const reduce = useReducedMotion()
  useEffect(() => {
    if (!celebration) return
    const t = window.setTimeout(clearCelebration, 3200)
    return () => window.clearTimeout(t)
  }, [celebration, clearCelebration])
  const c = celebration
  const colour = !c ? '#00C26E' : c.from === 'bank' ? '#8B5CF6' : c.from === 'parking' ? '#FFD23F' : hexFor(c.from.colour)
  return (
    <AnimatePresence>
      {c && (
        <motion.div
          key={c.id}
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-money px-6 text-ink"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={clearCelebration}
        >
          {!reduce && <Confetti colour={colour} currency={currency} />}
          <motion.div
            className="relative flex flex-col items-center text-center"
            initial={{ scale: 0.4, rotate: -8 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 14 }}
          >
            {c.from === 'bank' || c.from === 'parking' ? (
              <SystemAvatar kind={c.from} size={120} />
            ) : (
              <Avatar avatar={c.from.avatar} colour={c.from.colour} size={120} />
            )}
            <p className="font-display mt-5 text-2xl">
              {c.from === 'bank' ? 'The Bank' : c.from === 'parking' ? 'Free Parking' : c.from.name} paid you
            </p>
            <p className="font-display tnum mt-1 text-[64px] leading-none sm:text-[96px]">+{money(c.amount, currency)}</p>
            {c.note && <p className="brut mt-5 bg-white px-4 py-2 text-lg font-semibold">{c.note}</p>}
            <p className="mt-8 text-sm font-semibold opacity-60">Tap to close</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function useTick(ms = 250) {
  const [, set] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => set((n) => n + 1), ms)
    return () => window.clearInterval(id)
  }, [ms])
}

function JailBars() {
  return (
    <div className="pointer-events-none absolute inset-0 flex justify-around px-4 opacity-90">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-full w-4 rounded-full border-x-[3px] border-ink bg-[#6b6b6b]" />
      ))}
      <div className="absolute inset-x-0 top-[18%] h-4 border-y-[3px] border-ink bg-[#6b6b6b]" />
      <div className="absolute inset-x-0 bottom-[18%] h-4 border-y-[3px] border-ink bg-[#6b6b6b]" />
    </div>
  )
}

export function LockOverlay() {
  const { me, serverOffset, refresh } = useGame()
  useTick()
  const left = lockedFor(me, serverOffset)
  const locked = left !== null
  useEffect(() => {
    if (locked && left !== Infinity && left! < 300) refresh()
  }, [locked, left, refresh])
  const jail = /jail/i.test(me.lock_message ?? '')
  const secs = left === null || left === Infinity ? 0 : Math.ceil(left / 1000)
  return (
    <AnimatePresence>
      {locked && (
        <motion.div
          className="fixed inset-0 z-[55] flex flex-col items-center justify-center overflow-hidden bg-hot px-6 text-center text-ink"
          initial={{ y: '-100%' }}
          animate={{ y: 0 }}
          exit={{ y: '-100%' }}
          transition={{ type: 'spring', stiffness: 380, damping: 18, mass: 1.1 }}
          role="alertdialog"
          aria-label="Locked by the Banker"
        >
          {jail && <JailBars />}
          <div className="brut relative bg-paper px-6 py-8" style={{ ['--edge' as string]: '#111', ['--shade' as string]: '#111' }}>
            <div className="text-6xl">{jail ? '🚔' : '🔒'}</div>
            <p className="font-display mt-3 text-[32px] leading-tight">{me.lock_message || 'Locked by the Banker'}</p>
            <p className="font-display tnum mt-4 text-[64px] leading-none">
              {left === Infinity ? '∞' : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`}
            </p>
            <p className="mt-3 font-semibold opacity-70">
              {left === Infinity ? 'Wait for the Banker to unlock you' : 'You can play again when the timer runs out'}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function IncomingRequestOverlay() {
  const { state, me, byId, currency, respond, serverOffset } = useGame()
  const [busy, setBusy] = useState(false)
  const req = state.requests.find((r) => r.kind === 'request' && r.to_player === me.id)
  const from = req ? byId.get(req.from_player) : undefined
  const locked = lockedFor(me, serverOffset) !== null
  return (
    <AnimatePresence>
      {req && from && !locked && (
        <motion.div
          key={req.id}
          className="fixed inset-0 z-50 flex flex-col bg-sky px-5 text-ink"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          style={{ ['--edge' as string]: '#111', ['--shade' as string]: '#111' }}
        >
          <div className="safe-top" />
          <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col items-center justify-center text-center">
            <Avatar avatar={from.avatar} colour={from.colour} size={128} />
            <p className="font-display mt-5 text-[32px] leading-tight">{from.name} wants</p>
            <p className="font-display tnum text-[64px] leading-none sm:text-[96px]">{money(req.amount, currency)}</p>
            {req.note && <p className="brut mt-4 bg-white px-5 py-2 text-xl font-semibold">“{req.note}”</p>}
            <p className="mt-4 font-semibold">You have {money(me.balance, currency)}</p>
          </div>
          <div className="safe-bottom mx-auto grid w-full max-w-[480px] grid-cols-2 gap-3 pb-4">
            <Button
              size="xl"
              variant="white"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                await respond(req.id, false)
                setBusy(false)
              }}
            >
              Decline
            </Button>
            <Button
              size="xl"
              variant="money"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                await respond(req.id, true)
                setBusy(false)
              }}
            >
              Pay
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function BroadcastOverlay() {
  const { broadcast, clearBroadcast } = useGame()
  return (
    <AnimatePresence>
      {broadcast && (
        <motion.div
          className="fixed inset-0 z-[58] flex flex-col items-center justify-center bg-grape px-6 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ ['--edge' as string]: '#111', ['--shade' as string]: '#111' }}
        >
          <motion.div
            className="brut w-full max-w-[440px] bg-paper px-6 py-8 text-ink"
            initial={{ scale: 0.6, rotate: 4 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 15 }}
          >
            <div className="text-5xl">📣</div>
            <p className="mt-2 text-sm font-semibold tracking-wide uppercase opacity-60">From the Banker</p>
            <p className="font-display mt-3 text-[32px] leading-tight break-words">{broadcast.payload.message}</p>
            <Button className="mt-6" size="lg" variant="sun" block onClick={clearBroadcast}>
              Got it
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
