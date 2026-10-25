import type { Party } from '../game/describe'
import { Avatar, SystemAvatar } from './ui'

export function PartyAvatar({ party, size = 44 }: { party: Party | null; size?: number }) {
  if (!party || party.kind === 'gone') return <SystemAvatar kind="bank" size={size} />
  if (party.kind === 'player') return <Avatar avatar={party.player.avatar} colour={party.player.colour} size={size} />
  return <SystemAvatar kind={party.kind} size={size} />
}
