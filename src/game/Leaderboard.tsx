import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Avatar, Chip, HoldButton } from '../components/ui'
import { clearSession } from '../lib/device'
import { money } from '../lib/format'
import type { Player } from '../lib/types'
import { TopBar } from '../screens/common'
import { useGame } from './GameContext'
import { Page } from './Frame'

export function ranked(players: Player[]) {
  return [...players].sort((a, b) => Number(a.bankrupt) - Number(b.bankrupt) || (b.balance ?? -Infinity) - (a.balance ?? -Infinity))
}

const MEDAL = ['🥇', '🥈', '🥉']

export default function Leaderboard() {
  const { state, players, me, currency } = useGame()
  const nav = useNavigate()
  const visible = state.game.rules.show_balances || state.is_admin
  return (
    <Page>
      <TopBar title="Leaderboard" />
      {!visible && <p className="brut-sm mb-4 bg-sun px-3 py-2.5 font-semibold">🙈 The Banker has hidden everyone’s balances. Only yours is shown.</p>}
      <ul className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
        {(visible ? ranked(players) : players).map((p, i) => (
          <motion.li
            layout
            key={p.id}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className={`brut flex items-center gap-3 px-3 py-3 ${p.id === me.id ? 'bg-sun' : 'bg-white'} ${p.bankrupt ? 'opacity-50 grayscale' : ''}`}
          >
            <span className="font-display w-9 text-center text-2xl">{visible ? (p.bankrupt ? '💀' : (MEDAL[i] ?? i + 1)) : ''}</span>
            <Avatar avatar={p.avatar} colour={p.colour} size={52} dim={p.bankrupt} />
            <div className="min-w-0 flex-1">
              <p className="font-display truncate text-xl">
                {p.name}
                {p.id === me.id && ' (you)'}
              </p>
              <div className="flex gap-1">
                {p.is_banker && <Chip tone="grape">Banker</Chip>}
                {p.bankrupt && <Chip tone="hot">Bankrupt</Chip>}
              </div>
            </div>
            <span className={`font-display tnum text-2xl ${p.balance != null && p.balance < 0 ? 'text-hot' : ''}`}>
              {p.balance != null ? money(p.balance, currency) : '•••'}
            </span>
          </motion.li>
        ))}
      </ul>
      {!me.is_banker && (
        <div className="mt-10 lg:max-w-[420px]">
          <HoldButton
            variant="white"
            onConfirm={() => {
              clearSession()
              nav('/', { replace: true })
            }}
          >
            Hold to leave this phone’s seat
          </HoldButton>
          <p className="mt-2 text-center text-[13px] opacity-60">Your money stays in the game. Rejoin with the same code to get it back.</p>
        </div>
      )}
    </Page>
  )
}
