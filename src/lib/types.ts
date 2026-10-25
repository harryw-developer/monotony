export type Account = 'player' | 'bank' | 'parking'
export type Tone = 'money' | 'hot' | 'sun' | 'sky' | 'grape' | 'ink'

export type Rules = {
  free_parking: boolean
  show_balances: boolean
  allow_requests: boolean
  allow_negative: boolean
  auto_go: boolean
}

export type Game = {
  id: string
  code: string
  status: 'lobby' | 'active' | 'paused' | 'ended'
  banker_player: string | null
  deputy_player: string | null
  starting_balance: number
  go_amount: number
  currency: string
  rules: Rules
  free_parking: number
  created_at: string
}

export type Player = {
  id: string
  name: string
  avatar: string
  colour: string
  balance: number | null
  is_banker: boolean
  frozen: boolean
  locked_until: string | null
  lock_message: string | null
  bankrupt: boolean
  kicked: boolean
  joined_at: string
  online: boolean
}

export type Tx = {
  id: string
  seq: number
  from_account: Account
  from_player: string | null
  to_account: Account
  to_player: string | null
  amount: number
  type: 'pay' | 'request' | 'go' | 'deal' | 'admin_transfer' | 'set_balance' | 'reversal' | 'bankrupt' | 'parking'
  note: string | null
  created_by: string | null
  reversed_by: string | null
  reverses: string | null
  created_at: string
}

export type Req = {
  id: string
  kind: 'request' | 'go'
  from_player: string
  to_player: string | null
  amount: number
  note: string | null
  status: 'pending' | 'paid' | 'declined' | 'cancelled'
  created_at: string
}

export type GameEvent = {
  id: string
  target_player: string | null
  kind: 'lock' | 'broadcast' | 'notice' | 'ended'
  payload: { text?: string; tone?: Tone; message?: string; from?: string; until?: string }
  created_at: string
}

export type State = {
  now: string
  is_admin: boolean
  me: string
  game: Game
  players: Player[]
  transactions: Tx[]
  requests: Req[]
  events: GameEvent[]
}

export type Settings = {
  starting_balance: number
  go_amount: number
  currency: string
  rules: Rules
}
