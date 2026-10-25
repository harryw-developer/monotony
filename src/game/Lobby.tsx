import { AnimatePresence, motion } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import { useNavigate } from 'react-router-dom'
import { Avatar, Button, Chip, Logo } from '../components/ui'
import { clearSession } from '../lib/device'
import { formatCode, joinUrl, money } from '../lib/format'
import { useGame } from './GameContext'
import { MuteButton } from './GameScreen'

export default function Lobby() {
  const { state, players, me, currency, admin, byId } = useGame()
  const nav = useNavigate()
  const g = state.game
  const url = joinUrl(g.code)
  const banker = byId.get(g.banker_player ?? '')

  return (
    <div className="safe-bottom mx-auto flex min-h-dvh max-w-[480px] flex-col px-4">
      <div className="safe-top flex items-center justify-between pb-2">
        <div className="-ml-2 -rotate-3">
          <Logo size={0.55} />
        </div>
        <MuteButton />
      </div>

      {state.is_admin ? (
        <>
          <section className="brut bg-white p-4 text-center">
            <p className="text-[13px] font-semibold tracking-wide uppercase opacity-60">Game code</p>
            <p className="font-display tnum text-[clamp(48px,17vw,72px)] leading-none tracking-wider">{formatCode(g.code)}</p>
            <div className="mx-auto mt-4 w-fit rounded-2xl border-[3px] border-ink bg-white p-3">
              <QRCodeSVG value={url} size={200} level="M" bgColor="#FFFFFF" fgColor="#111111" />
            </div>
            <p className="mt-3 text-[13px] font-semibold opacity-60">Players scan this or type the code</p>
            {typeof navigator.share === 'function' && (
              <Button className="mt-3" size="sm" variant="sky" onClick={() => navigator.share({ title: 'Join my Monotony game', text: `Code ${formatCode(g.code)}`, url }).catch(() => {})}>
                Share link
              </Button>
            )}
          </section>
          <p className="mt-3 text-center text-[13px] font-semibold opacity-70">
            Start {money(g.starting_balance, currency)} · GO {money(g.go_amount, currency)}
            {g.rules.free_parking && ' · Free Parking'}
            {g.rules.allow_negative && ' · Debt allowed'}
          </p>
        </>
      ) : (
        <section className="brut bg-sun p-5 text-center">
          <motion.div animate={{ rotate: [0, -6, 6, 0] }} transition={{ repeat: Infinity, duration: 1.6 }} className="text-5xl">
            ⏳
          </motion.div>
          <p className="font-display mt-2 text-2xl">You’re in, {me.name}!</p>
          <p className="mt-1 font-semibold">Waiting for {banker?.name ?? 'the Banker'} to deal the money…</p>
          <p className="mt-3 text-[13px] font-semibold opacity-70">Game {formatCode(g.code)}</p>
        </section>
      )}

      <h2 className="font-display mt-6 mb-2 text-xl">
        Players <span className="opacity-50">({players.length})</span>
      </h2>
      <ul className="grid grid-cols-3 gap-3 pb-4">
        <AnimatePresence>
          {players.map((p) => (
            <motion.li
              key={p.id}
              layout
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 18 }}
              className="brut-sm flex flex-col items-center gap-1 bg-white p-2 text-center"
            >
              <Avatar avatar={p.avatar} colour={p.colour} size={56} />
              <span className="font-display w-full truncate">{p.name}</span>
              {p.is_banker && <Chip tone="grape">Banker</Chip>}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <div className="mt-auto pt-2 pb-2">
        {state.is_admin ? (
          <Button size="xl" variant="money" block onClick={() => admin('start')}>
            Deal money 💸
          </Button>
        ) : (
          <Button
            size="lg"
            variant="white"
            block
            onClick={() => {
              clearSession()
              nav('/', { replace: true })
            }}
          >
            Leave
          </Button>
        )}
      </div>
    </div>
  )
}
