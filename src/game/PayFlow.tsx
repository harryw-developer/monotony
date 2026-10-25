import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar, Button, Keypad, SwipeToSend, SystemAvatar, Tile } from '../components/ui'
import { hexFor } from '../lib/avatars'
import { money } from '../lib/format'
import { buzz, sfx } from '../lib/sound'
import type { Account, Player } from '../lib/types'
import { TopBar } from '../screens/common'
import { useGame } from './GameContext'
import { Note } from './Overlays'

type Target = { account: Account; player: Player | null }

const NOTES = ['Rent', 'Trade', 'Fine', 'Deal']

export default function PayFlow({ mode }: { mode: 'pay' | 'request' }) {
  const g = useGame()
  const { state, me, players, currency } = g
  const nav = useNavigate()
  const [target, setTarget] = useState<Target | null>(null)
  const [amount, setAmount] = useState(0)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const rules = state.game.rules
  const others = players.filter((p) => p.id !== me.id)
  const tooMuch = mode === 'pay' && !rules.allow_negative && me.balance != null && amount > me.balance

  const targetName = target ? (target.account === 'bank' ? 'the Bank' : target.account === 'parking' ? 'Free Parking' : target.player!.name) : ''
  const targetColour = target?.player ? hexFor(target.player.colour) : target?.account === 'parking' ? '#FFD23F' : '#8B5CF6'

  const send = async () => {
    if (!target || amount <= 0) return
    setBusy(true)
    const ok =
      mode === 'pay'
        ? await g.pay(target.account, target.player?.id ?? null, amount, note ?? undefined)
        : await g.request(target.player!.id, amount, note ?? undefined)
    if (ok) {
      setSent(true)
      sfx.send()
      buzz(50)
      window.setTimeout(() => nav('/game', { replace: true }), 1100)
    } else setBusy(false)
  }

  if (sent)
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden px-6 text-center" style={{ background: mode === 'pay' ? '#00C26E' : '#3DA5FF' }}>
        <motion.div
          initial={{ y: 0, scale: 1, rotate: 0 }}
          animate={{ y: '-120vh', scale: 0.8, rotate: -12 }}
          transition={{ delay: 0.25, duration: 0.6, ease: [0.5, 0, 0.75, 0] }}
        >
          <Note colour={targetColour} amount={amount} currency={currency} w={220} />
        </motion.div>
        <motion.p className="font-display mt-8 text-[32px]" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          {mode === 'pay' ? `Sent to ${targetName}!` : `Asked ${targetName}`}
        </motion.p>
      </div>
    )

  if (!target)
    return (
      <div className="mx-auto max-w-[480px] px-4 pb-8">
        <TopBar title={mode === 'pay' ? 'Pay who?' : 'Request from?'} onBack={() => nav('/game')} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {others.map((p) => (
            <Tile
              key={p.id}
              label={p.name}
              sub={p.bankrupt ? 'Bankrupt' : p.balance != null ? money(p.balance, currency) : undefined}
              disabled={p.bankrupt}
              onClick={() => setTarget({ account: 'player', player: p })}
            >
              <Avatar avatar={p.avatar} colour={p.colour} size={72} dim={p.bankrupt} />
            </Tile>
          ))}
          {mode === 'pay' && (
            <Tile label="Bank" sub="Buy, tax, fees" onClick={() => setTarget({ account: 'bank', player: null })}>
              <SystemAvatar kind="bank" size={72} />
            </Tile>
          )}
          {mode === 'pay' && rules.free_parking && (
            <Tile label="Free Parking" sub={`Pot ${money(state.game.free_parking, currency)}`} onClick={() => setTarget({ account: 'parking', player: null })}>
              <SystemAvatar kind="parking" size={72} />
            </Tile>
          )}
        </div>
        {others.length === 0 && mode === 'request' && <p className="mt-6 text-center opacity-60">Nobody else has joined yet.</p>}
      </div>
    )

  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col px-4 pb-4">
      <TopBar
        title={mode === 'pay' ? `Pay ${targetName}` : `Ask ${targetName}`}
        onBack={() => {
          setTarget(null)
          setAmount(0)
        }}
      />
      <div className="flex items-center gap-4">
        <AnimatePresence>
          <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 15 }}>
            {target.player ? (
              <Avatar avatar={target.player.avatar} colour={target.player.colour} size={88} />
            ) : (
              <SystemAvatar kind={target.account as 'bank' | 'parking'} size={88} />
            )}
          </motion.div>
        </AnimatePresence>
        <div className="min-w-0 flex-1 text-right">
          <p className={`font-display tnum text-[clamp(44px,15vw,64px)] leading-none ${amount ? '' : 'opacity-30'} ${tooMuch ? 'text-hot' : ''}`}>
            {money(amount, currency)}
          </p>
          <p className="mt-1 text-[13px] font-semibold opacity-60">
            {tooMuch ? `You only have ${money(me.balance, currency)}` : `You have ${money(me.balance, currency)}`}
          </p>
        </div>
      </div>

      {mode === 'request' && (
        <div className="mt-4 flex gap-2 overflow-x-auto no-scrollbar">
          {NOTES.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                sfx.tap()
                setNote(note === n ? null : n)
              }}
              className={`brut-sm press h-12 shrink-0 px-4 font-semibold ${note === n ? 'bg-sky' : 'bg-white'}`}
            >
              {n}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 flex-1">
        <Keypad value={amount} onChange={setAmount} />
      </div>
      <div className="mt-4">
        {mode === 'pay' ? (
          <SwipeToSend
            key={busy ? 'busy' : 'ready'}
            label={amount ? `Swipe to pay ${money(amount, currency)}` : 'Enter an amount'}
            disabled={busy || amount <= 0 || tooMuch}
            onComplete={send}
          />
        ) : (
          <Button size="xl" variant="sky" block disabled={busy || amount <= 0} onClick={send}>
            {busy ? 'Sending…' : `Request ${money(amount, currency)}`}
          </Button>
        )}
      </div>
    </div>
  )
}
