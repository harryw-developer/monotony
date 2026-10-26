import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Avatar, Button, Kbd, Keypad, SwipeToSend, SystemAvatar, Tile } from '../components/ui'
import { hexFor } from '../lib/avatars'
import { money } from '../lib/format'
import { buzz, sfx } from '../lib/sound'
import type { Account, Player } from '../lib/types'
import { isTyping } from '../lib/useMedia'
import { TopBar } from '../screens/common'
import { useGame } from './GameContext'
import { Note } from './Overlays'

type Target = { account: Account; player: Player | null }

const NOTES = ['Rent', 'Trade', 'Fine', 'Deal']

export default function PayFlow({ mode }: { mode: 'pay' | 'request' }) {
  const g = useGame()
  const { state, me, players, currency, byId } = g
  const nav = useNavigate()
  const loc = useLocation()
  const rules = state.game.rules
  const others = players.filter((p) => p.id !== me.id)

  // Arriving from the command palette ("Pay Alex") skips the picker.
  const preset = (loc.state as { to?: string } | null)?.to
  const initial: Target | null =
    preset === 'bank' ? { account: 'bank', player: null } : preset === 'parking' ? { account: 'parking', player: null } : preset && byId.get(preset) ? { account: 'player', player: byId.get(preset)! } : null

  const [target, setTarget] = useState<Target | null>(initial)
  const [amount, setAmount] = useState(0)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [armed, setArmed] = useState(false)
  const tooMuch = mode === 'pay' && !rules.allow_negative && me.balance != null && amount > me.balance

  const options: Target[] = [
    ...others.filter((p) => !p.bankrupt).map((p) => ({ account: 'player' as const, player: p })),
    ...(mode === 'pay' ? [{ account: 'bank' as const, player: null }] : []),
    ...(mode === 'pay' && rules.free_parking ? [{ account: 'parking' as const, player: null }] : []),
  ]

  const targetName = target ? (target.account === 'bank' ? 'the Bank' : target.account === 'parking' ? 'Free Parking' : target.player!.name) : ''
  const targetColour = target?.player ? hexFor(target.player.colour) : target?.account === 'parking' ? '#FFD23F' : '#8B5CF6'

  const send = async () => {
    if (!target || amount <= 0 || busy) return
    setBusy(true)
    setArmed(false)
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

  useEffect(() => setArmed(false), [amount, target])

  // Keyboard: 1–9 picks a recipient, Esc goes back, Enter twice sends.
  const latest = useRef({ target, options, amount, armed, tooMuch, send })
  latest.current = { target, options, amount, armed, tooMuch, send }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return
      if (document.querySelector('[role=dialog],[role=alertdialog]')) return
      const L = latest.current
      if (e.key === 'Escape') {
        e.preventDefault()
        if (L.target) {
          setTarget(null)
          setAmount(0)
        } else nav('/game')
        return
      }
      if (!L.target && /^[1-9]$/.test(e.key)) {
        const t = L.options[Number(e.key) - 1]
        if (t) {
          e.preventDefault()
          sfx.tap()
          setTarget(t)
        }
        return
      }
      if (L.target && e.key === 'Enter') {
        e.preventDefault()
        if (L.amount <= 0 || L.tooMuch) {
          sfx.error()
          return
        }
        if (mode === 'request' || L.armed) void L.send()
        else {
          setArmed(true)
          sfx.notice()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, nav])

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
      <div className="mx-auto max-w-[480px] px-4 pb-8 lg:max-w-[960px] lg:pt-6">
        <TopBar title={mode === 'pay' ? 'Pay who?' : 'Request from?'} onBack={() => nav('/game')} right={<Kbd>Esc</Kbd>} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
          {options.map((o, i) => (
            <div key={o.player?.id ?? o.account} className="relative">
              {o.player ? (
                <Tile label={o.player.name} sub={o.player.balance != null ? money(o.player.balance, currency) : undefined} onClick={() => setTarget(o)}>
                  <Avatar avatar={o.player.avatar} colour={o.player.colour} size={72} />
                </Tile>
              ) : o.account === 'bank' ? (
                <Tile label="Bank" sub="Buy, tax, fees" onClick={() => setTarget(o)}>
                  <SystemAvatar kind="bank" size={72} />
                </Tile>
              ) : (
                <Tile label="Free Parking" sub={`Pot ${money(state.game.free_parking, currency)}`} onClick={() => setTarget(o)}>
                  <SystemAvatar kind="parking" size={72} />
                </Tile>
              )}
              {i < 9 && <Kbd className="pointer-events-none absolute top-2 left-2">{i + 1}</Kbd>}
            </div>
          ))}
          {others
            .filter((p) => p.bankrupt)
            .map((p) => (
              <Tile key={p.id} label={p.name} sub="Bankrupt" disabled>
                <Avatar avatar={p.avatar} colour={p.colour} size={72} dim />
              </Tile>
            ))}
        </div>
        {others.length === 0 && mode === 'request' && <p className="mt-6 text-center opacity-60">Nobody else has joined yet.</p>}
      </div>
    )

  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col px-4 pb-4 lg:max-w-[960px] lg:pt-6">
      <TopBar
        title={mode === 'pay' ? `Pay ${targetName}` : `Ask ${targetName}`}
        right={<Kbd>Esc</Kbd>}
        onBack={() => {
          setTarget(null)
          setAmount(0)
        }}
      />
      <div className="flex flex-1 flex-col lg:grid lg:flex-none lg:grid-cols-2 lg:items-start lg:gap-10">
        {/* On phones these children flow straight into the column (swipe last, under the keypad). */}
        <div className="contents lg:flex lg:flex-col lg:gap-6 lg:rounded-2xl lg:border-[3px] lg:border-[var(--edge)] lg:bg-white lg:p-6 lg:shadow-[4px_4px_0_var(--shade)]">
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
              <p className={`font-display tnum text-[clamp(44px,15vw,64px)] leading-none lg:text-[72px] ${amount ? '' : 'opacity-30'} ${tooMuch ? 'text-hot' : ''}`}>
                {money(amount, currency)}
              </p>
              <p className="mt-1 text-[13px] font-semibold opacity-60">
                {tooMuch ? `You only have ${money(me.balance, currency)}` : `You have ${money(me.balance, currency)}`}
              </p>
            </div>
          </div>

          {mode === 'request' && (
            <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto lg:mt-0 lg:flex-wrap">
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

          <div className="order-last mt-4 lg:order-none lg:mt-0">
            {mode === 'pay' ? (
              <SwipeToSend
                key={busy ? 'busy' : 'ready'}
                label={amount ? `Swipe to pay ${money(amount, currency)}` : 'Enter an amount'}
                disabled={busy || amount <= 0 || tooMuch}
                onComplete={send}
              />
            ) : (
              <Button size="xl" variant="sky" block disabled={busy || amount <= 0} onClick={send}>
                {busy ? 'Sending…' : `Request ${money(amount, currency)}`} <Kbd>Enter</Kbd>
              </Button>
            )}
            {mode === 'pay' && (
              <p className={`kbd-hint mt-3 w-full justify-center text-[13px] font-semibold ${armed ? 'text-hot' : 'opacity-60'}`} role="status">
                {armed ? `Press Enter again to send ${money(amount, currency)} to ${targetName}` : 'Type the amount, then press Enter twice to send'}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 flex-1 lg:mt-0">
          <Keypad value={amount} onChange={setAmount} />
        </div>
      </div>
    </div>
  )
}
