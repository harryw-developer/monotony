import { money } from '../lib/format'
import type { AdminLog, Player } from '../lib/types'

const ICON: Record<string, string> = {
  start: '💸', payout: '💸', collect: '🧲', fine: '🅿️', transfer: '↔️', set_balance: '✏️', set_parking: '🅿️',
  reverse: '↩️', rename: '🏷️', restyle: '🎨', freeze: '🧊', freeze_all: '🧊', lock: '🔒', unlock: '🔓',
  bankrupt: '💀', unbankrupt: '❤️', kick: '🚪', restore: '🚪', pause: '⏸', restart: '🔁', hand_over: '🤝',
  set_deputy: '🫡', edit_rules: '⚙️', new_code: '🔢', go_decision: '🏁', cancel_request: '✖️',
  parking_payout: '🏆', broadcast: '📣', message: '💬', reload: '🔄', seat_code: '📲', seat_moved: '📲', end_game: '🏁',
}

const secs = (s: unknown) => {
  const n = Number(s)
  return n >= 60 ? `${Math.round(n / 60)} min` : `${n}s`
}

/** Human sentence for one Banker action, e.g. "Locked Alex for 30s: “Jail!”". */
export function describeLog(l: AdminLog, byId: Map<string, Player>, currency: string, bankerId?: string | null) {
  const p = l.payload as Record<string, unknown>
  const name = (id: unknown) => (typeof id === 'string' ? byId.get(id)?.name ?? 'a removed player' : 'someone')
  const t = name(l.target)
  const amt = money(Number(p.amount ?? 0), currency)
  const names = Array.isArray(p.players) ? (p.players as string[]).map(name).join(', ') : t
  const on = (k: string, yes: string, no: string) => (p[k] === false ? no : yes)
  let text: string
  switch (l.action) {
    case 'start': text = 'Dealt the starting money'; break
    case 'payout': text = `Paid ${names} ${amt}${Array.isArray(p.players) && p.players.length > 1 ? ' each' : ''}`; break
    case 'collect': text = `Collected ${amt} from ${names}`; break
    case 'fine': text = `Fined ${names} ${amt} into Free Parking`; break
    case 'transfer': text = `Moved ${amt} from ${name(p.from)} to ${name(p.to)}`; break
    case 'set_balance': text = `Set ${t}’s balance to ${amt}`; break
    case 'set_parking': text = `Set the Free Parking pot to ${amt}`; break
    case 'reverse': text = 'Reversed a transaction'; break
    case 'rename': text = `Renamed a player to ${String(p.name ?? t)}`; break
    case 'restyle': text = `Changed ${t}’s avatar`; break
    case 'freeze': text = `${on('frozen', 'Froze', 'Unfroze')} ${t}`; break
    case 'freeze_all': text = `${on('frozen', 'Froze', 'Unfroze')} everyone`; break
    case 'lock':
      text = `Locked ${l.target ? t : 'everyone'} ${p.seconds == null ? 'until unlocked' : `for ${secs(p.seconds)}`}${p.message ? `: “${p.message}”` : ''}`
      break
    case 'unlock': text = `Unlocked ${l.target ? t : 'everyone'}`; break
    case 'bankrupt': text = `Made ${t} bankrupt`; break
    case 'unbankrupt': text = `Brought ${t} back into the game`; break
    case 'kick': text = `Removed ${t}`; break
    case 'restore': text = `Let ${t} back in`; break
    case 'pause': text = on('paused', 'Paused the game', 'Resumed the game'); break
    case 'restart': text = 'Restarted the round'; break
    case 'hand_over': text = `Handed the Bank to ${t}`; break
    case 'set_deputy': text = l.target ? `Made ${t} deputy` : 'Removed the deputy'; break
    case 'edit_rules': {
      const r = (p.rules ?? {}) as Record<string, unknown>
      text = Object.keys(r).length === 1 && 'joining_open' in r ? (r.joining_open ? 'Opened the game to new players' : 'Closed the game to new players') : 'Changed the house rules'
      break
    }
    case 'new_code': text = 'Made a new game code'; break
    case 'go_decision': text = p.approve ? 'Approved a Pass GO claim' : 'Declined a Pass GO claim'; break
    case 'cancel_request': text = 'Cancelled a money request'; break
    case 'parking_payout': text = `Paid the Free Parking pot to ${t}`; break
    case 'broadcast': text = `Broadcast “${String(p.message ?? '')}”`; break
    case 'message': text = `Messaged ${t}: “${String(p.message ?? '')}”`; break
    case 'reload': text = l.target ? `Reloaded ${t}’s app` : 'Reloaded every app'; break
    case 'seat_code': text = `Made a new-phone code for ${t}`; break
    case 'seat_moved': text = `${t} moved to a new phone`; break
    case 'end_game': text = 'Ended the game'; break
    default: text = l.action.replace(/_/g, ' ')
  }
  // Actions by a deputy (or a previous Banker) are labelled with who did them.
  const by = l.actor && l.actor !== bankerId && l.action !== 'seat_moved' ? `${name(l.actor)}: ` : ''
  return { icon: ICON[l.action] ?? '•', text: by + text }
}
