import { PartyAvatar } from '../components/PartyAvatar'
import { money, timeAgo } from '../lib/format'
import type { Player, Tx } from '../lib/types'
import { TopBar } from '../screens/common'
import { describe, groupByTime } from './describe'
import { useGame } from './GameContext'
import { BottomNav } from './GameScreen'

export function TxRow({
  tx, byId, meId, currency, nowMs, dark, action, as: Tag = 'li',
}: { tx: Tx; byId: Map<string, Player>; meId?: string; currency: string; nowMs: number; dark?: boolean; action?: React.ReactNode; as?: 'li' | 'div' }) {
  const d = describe(tx, byId, meId)
  const reversed = !!tx.reversed_by
  return (
    <Tag className={`brut-sm flex items-center gap-3 px-3 py-2 ${dark ? 'bg-vault-card' : 'bg-white'} ${reversed ? 'opacity-50' : ''}`}>
      {meId ? (
        <PartyAvatar party={d.other} size={44} />
      ) : (
        <span className="flex shrink-0 items-center">
          <PartyAvatar party={d.from} size={36} />
          <span className="-ml-2">
            <PartyAvatar party={d.to} size={36} />
          </span>
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className={`truncate font-semibold ${reversed ? 'line-through' : ''}`}>{d.title}</p>
        <p className="truncate text-[13px] opacity-60">
          {d.detail} · {timeAgo(tx.created_at, nowMs)}
          {reversed && ' · reversed'}
        </p>
      </div>
      <span className={`font-display tnum shrink-0 text-lg ${d.sign > 0 ? 'text-money' : d.sign < 0 ? 'text-hot' : ''}`}>
        {d.sign > 0 ? '+' : d.sign < 0 ? '−' : ''}
        {money(tx.amount, currency)}
      </span>
      {action}
    </Tag>
  )
}

export default function History() {
  const { state, me, byId, currency, serverOffset } = useGame()
  const nowMs = Date.now() + serverOffset
  const mine = state.transactions.filter((t) => t.from_player === me.id || t.to_player === me.id)
  const totalIn = mine.filter((t) => t.to_player === me.id).reduce((s, t) => s + t.amount, 0)
  const totalOut = mine.filter((t) => t.from_player === me.id).reduce((s, t) => s + t.amount, 0)
  return (
    <div className="mx-auto max-w-[480px] px-4 pb-28">
      <TopBar title="History" />
      <div className="mb-5 grid grid-cols-2 gap-3">
        <div className="brut bg-money px-3 py-2">
          <p className="text-[13px] font-semibold uppercase opacity-70">Money in</p>
          <p className="font-display tnum text-2xl">{money(totalIn, currency)}</p>
        </div>
        <div className="brut bg-hot px-3 py-2">
          <p className="text-[13px] font-semibold uppercase opacity-70">Money out</p>
          <p className="font-display tnum text-2xl">{money(totalOut, currency)}</p>
        </div>
      </div>
      {mine.length === 0 && <p className="opacity-60">Nothing yet. Payments you send and receive show up here.</p>}
      {groupByTime(mine, nowMs).map((g) => (
        <section key={g.label} className="mb-5">
          <h2 className="font-display mb-2 text-xl">{g.label}</h2>
          <ul className="space-y-2">
            {g.items.map((t) => (
              <TxRow key={t.id} tx={t} byId={byId} meId={me.id} currency={currency} nowMs={nowMs} />
            ))}
          </ul>
        </section>
      ))}
      <BottomNav />
    </div>
  )
}
