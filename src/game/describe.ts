import type { Player, Tx } from '../lib/types'

export type Party = { kind: 'player'; player: Player } | { kind: 'bank' } | { kind: 'parking' } | { kind: 'gone' }

export function party(account: Tx['from_account'], id: string | null, byId: Map<string, Player>): Party {
  if (account === 'bank') return { kind: 'bank' }
  if (account === 'parking') return { kind: 'parking' }
  const p = id ? byId.get(id) : undefined
  return p ? { kind: 'player', player: p } : { kind: 'gone' }
}

export const partyName = (p: Party, meId?: string) =>
  p.kind === 'bank' ? 'the Bank' : p.kind === 'parking' ? 'Free Parking' : p.kind === 'gone' ? 'a removed player' : p.player.id === meId ? 'you' : p.player.name

const TYPE_LABEL: Record<Tx['type'], string> = {
  pay: 'Payment',
  request: 'Request paid',
  go: 'Passed GO',
  deal: 'Starting money',
  admin_transfer: 'Banker',
  set_balance: 'Balance set',
  reversal: 'Reversal',
  bankrupt: 'Bankruptcy',
  parking: 'Free Parking',
}

/** One history row, from the point of view of `meId` (or neutral for the Bank view). */
export function describe(tx: Tx, byId: Map<string, Player>, meId?: string) {
  const from = party(tx.from_account, tx.from_player, byId)
  const to = party(tx.to_account, tx.to_player, byId)
  const incoming = !!meId && tx.to_player === meId
  const outgoing = !!meId && tx.from_player === meId
  const other = incoming ? from : outgoing ? to : null
  let title: string
  if (incoming) title = `From ${partyName(from)}`
  else if (outgoing) title = `To ${partyName(to)}`
  else title = `${capital(partyName(from))} → ${partyName(to)}`
  const detail = [TYPE_LABEL[tx.type], tx.note && tx.note !== TYPE_LABEL[tx.type] ? tx.note : null].filter(Boolean).join(' · ')
  return { from, to, other, incoming, outgoing, title, detail, sign: incoming ? 1 : outgoing ? -1 : 0 }
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function groupByTime(txs: Tx[], nowMs: number) {
  const groups: { label: string; items: Tx[] }[] = []
  const label = (iso: string) => {
    const age = nowMs - Date.parse(iso)
    if (age < 5 * 60_000) return 'Just now'
    if (age < 60 * 60_000) return 'This hour'
    return 'Earlier'
  }
  for (const t of txs) {
    const l = label(t.created_at)
    const g = groups[groups.length - 1]
    if (g && g.label === l) g.items.push(t)
    else groups.push({ label: l, items: [t] })
  }
  return groups
}
