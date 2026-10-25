import { load, remove, save } from './storage'

export function deviceSecret(): string {
  let s = load<string | null>('device', null)
  if (!s) {
    const bytes = new Uint8Array(32)
    crypto.getRandomValues(bytes)
    s = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    save('device', s)
  }
  return s
}

export type Session = { gameId: string; code: string; playerId: string }

export const getSession = () => load<Session | null>('session', null)
export const setSession = (s: Session) => save('session', s)
export const clearSession = () => remove('session')
