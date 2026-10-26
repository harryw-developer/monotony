export type PlayerMode = 'menu' | 'pay' | 'collect' | 'transfer' | 'set' | 'rename' | 'restyle' | 'bankrupt' | 'message' | 'seat'
export type PlayerTab = 'controls' | 'details' | 'activity'

/** Which Bank sheet or panel is open. Also passed in router state to open one from elsewhere. */
export type BankSheet =
  | { kind: 'player'; id: string; tab?: PlayerTab; mode?: PlayerMode }
  | { kind: 'bulk'; action: 'payout' | 'collect' | 'go' | 'fine' }
  | { kind: 'broadcast' }
  | { kind: 'lock'; playerId: string | null }
  | { kind: 'parking' }
  | { kind: 'pot' }
  | { kind: 'rules' }
  | { kind: 'deputy' }
  | { kind: 'handover' }
  | { kind: 'history' }
  | { kind: 'log' }
  | { kind: 'restart' }
  | { kind: 'end' }
