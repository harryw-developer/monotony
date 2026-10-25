import { motion } from 'framer-motion'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar, Button } from '../components/ui'
import { clearSession } from '../lib/device'
import { money } from '../lib/format'
import { sfx } from '../lib/sound'
import { useGame } from './GameContext'
import { ranked } from './Leaderboard'

// In on-screen order: 2nd, 1st, 3rd.
const PODIUM = [
  { h: 110, bg: 'bg-white', delay: 0.3 },
  { h: 150, bg: 'bg-sun', delay: 0.6 },
  { h: 80, bg: 'bg-[#FF9F1C]', delay: 0 },
]

export default function GameOver() {
  const { players, me, currency } = useGame()
  const nav = useNavigate()
  const order = ranked(players)
  useEffect(() => sfx.win(), [])
  const winner = order[0]
  const leave = (to: string) => {
    clearSession()
    nav(to, { replace: true })
  }
  // Podium order on screen: 2nd, 1st, 3rd.
  const slots = [order[1], order[0], order[2]]
  return (
    <div className="paper-grid safe-top safe-bottom mx-auto flex min-h-dvh max-w-[480px] flex-col px-4">
      <p className="font-display mt-4 text-center text-[32px] leading-tight">
        {winner ? (winner.id === me.id ? 'You win! 🎉' : `${winner.name} wins!`) : 'Game over'}
      </p>
      <div className="mt-6 flex items-end justify-center gap-2">
        {slots.map((p, i) =>
          p ? (
            <div key={p.id} className="flex w-1/3 max-w-[130px] flex-col items-center">
              <motion.div initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: PODIUM[i].delay + 0.3, type: 'spring' }}>
                <Avatar avatar={p.avatar} colour={p.colour} size={i === 1 ? 80 : 60} />
              </motion.div>
              <p className="font-display mt-1 w-full truncate text-center">{p.name}</p>
              <p className="tnum text-sm font-semibold">{money(p.balance, currency)}</p>
              <motion.div
                className={`brut mt-1 flex w-full items-start justify-center pt-2 ${PODIUM[i].bg}`}
                initial={{ height: 0 }}
                animate={{ height: PODIUM[i].h }}
                transition={{ delay: PODIUM[i].delay, type: 'spring', stiffness: 120, damping: 14 }}
              >
                <span className="font-display text-4xl">{i === 1 ? 1 : i === 0 ? 2 : 3}</span>
              </motion.div>
            </div>
          ) : (
            <div key={i} className="w-1/3" />
          ),
        )}
      </div>
      <ul className="mt-6 space-y-2">
        {order.map((p, i) => (
          <li key={p.id} className={`brut-sm flex items-center gap-3 px-3 py-2 ${p.id === me.id ? 'bg-sun' : 'bg-white'} ${p.bankrupt ? 'opacity-50' : ''}`}>
            <span className="font-display w-6 text-center">{i + 1}</span>
            <Avatar avatar={p.avatar} colour={p.colour} size={40} dim={p.bankrupt} />
            <span className="font-display flex-1 truncate text-lg">{p.name}</span>
            <span className="font-display tnum text-lg">{money(p.balance, currency)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto flex flex-col gap-3 pt-6 pb-2">
        <Button size="xl" variant="money" block onClick={() => leave('/start')}>
          Play again
        </Button>
        <Button size="lg" variant="white" block onClick={() => leave('/')}>
          Done
        </Button>
      </div>
    </div>
  )
}
