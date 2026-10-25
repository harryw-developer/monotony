import { motion } from 'framer-motion'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PartyAvatar } from '../components/PartyAvatar'
import { AnimatedMoney, Avatar, Button, Chip } from '../components/ui'
import { api } from '../lib/api'
import { formatCode, money, timeAgo } from '../lib/format'
import { buzz, sfx } from '../lib/sound'
import { describe } from './describe'
import { useGame } from './GameContext'
import { BottomNav, MuteButton } from './GameScreen'

export default function Home() {
  const g = useGame()
  const { state, me, byId, currency } = g
  const nav = useNavigate()
  const [goBusy, setGoBusy] = useState(false)
  const rules = state.game.rules
  const mine = state.transactions.filter((t) => t.from_player === me.id || t.to_player === me.id)
  const myRequests = state.requests.filter((r) => r.kind === 'request' && r.from_player === me.id)
  const goPending = state.requests.some((r) => r.kind === 'go' && r.from_player === me.id)
  const paused = state.game.status === 'paused'
  const blocked = paused || me.frozen || me.bankrupt

  const claimGo = async () => {
    setGoBusy(true)
    const r = await g.claimGo()
    setGoBusy(false)
    if (r === 'pending') {
      sfx.notice()
      buzz(30)
    }
  }

  return (
    <div className="mx-auto max-w-[480px] px-4 pb-28">
      <header className="safe-top flex items-center gap-3 pb-3">
        <Avatar avatar={me.avatar} colour={me.colour} size={56} />
        <div className="min-w-0 flex-1">
          <p className="font-display truncate text-2xl leading-tight">{me.name}</p>
          <div className="mt-0.5 flex flex-wrap gap-1">
            {me.is_banker && <Chip tone="grape">Banker</Chip>}
            {state.game.deputy_player === me.id && <Chip tone="grape">Deputy</Chip>}
            <Chip tone="paper">Game {formatCode(state.game.code)}</Chip>
          </div>
        </div>
        <MuteButton />
      </header>

      {paused && <Banner tone="bg-sun">⏸ The Banker has paused the game</Banner>}
      {me.frozen && <Banner tone="bg-sky">🧊 Your account is frozen. You can look but not pay.</Banner>}
      {me.bankrupt && <Banner tone="bg-hot">💀 You’re bankrupt. Thanks for playing!</Banner>}

      <motion.section
        layout
        className="brut relative mt-1 overflow-hidden bg-white px-4 pt-4 pb-5 text-center"
        style={{ background: me.bankrupt ? '#e5e5e5' : undefined }}
      >
        <p className="text-[13px] font-semibold tracking-wide uppercase opacity-60">Your balance</p>
        <AnimatedMoney value={me.balance} currency={currency} className="font-display block text-[clamp(56px,21vw,96px)] leading-[1.05]" />
      </motion.section>

      <div className="mt-4 flex flex-col gap-3">
        <Button size="xl" variant="money" block disabled={blocked} onClick={() => nav('/game/pay')} className="h-[88px]! text-[32px]!">
          Pay
        </Button>
        <div className="grid grid-cols-2 gap-3">
          <Button size="xl" variant="sky" disabled={blocked || !rules.allow_requests} onClick={() => nav('/game/request')}>
            Request
          </Button>
          <Button size="xl" variant="sun" disabled={blocked || goBusy || goPending || state.game.go_amount <= 0} onClick={claimGo}>
            {goPending ? 'GO sent…' : 'Pass GO'}
          </Button>
        </div>
      </div>

      {(myRequests.length > 0 || goPending) && (
        <section className="mt-5 space-y-2">
          {goPending && (
            <div className="brut-sm flex items-center gap-3 bg-sun/60 px-3 py-2 font-semibold">
              <span className="text-2xl">⏳</span>
              <span className="flex-1">Pass GO ({money(state.game.go_amount, currency)}) waiting for the Banker</span>
            </div>
          )}
          {myRequests.map((r) => {
            const p = byId.get(r.to_player ?? '')
            return (
              <div key={r.id} className="brut-sm flex items-center gap-3 bg-sky/30 px-3 py-2">
                {p && <Avatar avatar={p.avatar} colour={p.colour} size={40} />}
                <span className="flex-1 font-semibold">
                  Asked {p?.name} for {money(r.amount, currency)}
                </span>
                <button
                  className="brut-sm press h-12 bg-white px-3 text-sm font-semibold"
                  onClick={async () => {
                    try {
                      await api.respond(state.game.id, r.id, false)
                    } finally {
                      g.refresh()
                    }
                  }}
                >
                  Cancel
                </button>
              </div>
            )
          })}
        </section>
      )}

      <section className="mt-6">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-display text-xl">Latest</h2>
          <Link to="/game/history" className="font-semibold text-ink/60 underline">
            See all
          </Link>
        </div>
        {mine.length === 0 && <p className="opacity-60">No money has moved yet.</p>}
        <ul className="space-y-2">
          {mine.slice(0, 3).map((t) => {
            const d = describe(t, byId, me.id)
            return (
              <li key={t.id} className="brut-sm flex items-center gap-3 bg-white px-3 py-2">
                <PartyAvatar party={d.other} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{d.title}</p>
                  <p className="truncate text-[13px] opacity-60">
                    {d.detail} · {timeAgo(t.created_at, Date.now() + g.serverOffset)}
                  </p>
                </div>
                <span className={`font-display tnum text-lg ${d.sign > 0 ? 'text-money' : 'text-hot'}`}>
                  {d.sign > 0 ? '+' : '−'}
                  {money(t.amount, currency)}
                </span>
              </li>
            )
          })}
        </ul>
      </section>
      <BottomNav />
    </div>
  )
}

function Banner({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <div className={`brut-sm mb-3 px-3 py-2.5 font-semibold ${tone}`}>{children}</div>
}
