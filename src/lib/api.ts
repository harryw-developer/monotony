import { supabase } from './supabase'
import { deviceSecret } from './device'
import type { Account, Settings, State } from './types'

function friendly(message: string) {
  if (/failed to fetch|network|load failed/i.test(message)) return 'No connection. Check your internet and try again.'
  return message.replace(/^.*?ERROR:\s*/, '')
}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  let res
  try {
    res = await supabase.rpc(fn, { p_secret: deviceSecret(), ...args })
  } catch (e) {
    throw new Error(friendly(String((e as Error).message)))
  }
  if (res.error) throw new Error(friendly(res.error.message))
  return res.data as T
}

export const api = {
  createGame: (name: string, avatar: string, colour: string, settings: Settings) =>
    call<{ game_id: string; code: string; player_id: string }>('create_game', {
      p_name: name, p_avatar: avatar, p_colour: colour, p_settings: settings,
    }),
  findGame: (code: string) =>
    call<{ game_id: string; status: string; player_id: string | null; taken_colours: string[]; taken_avatars: string[] }>(
      'find_game', { p_code: code }),
  joinGame: (code: string, name: string, avatar: string, colour: string) =>
    call<{ game_id: string; player_id: string; rejoined: boolean }>('join_game', {
      p_code: code, p_name: name, p_avatar: avatar, p_colour: colour,
    }),
  getState: (gameId: string) => call<State>('get_state', { p_game_id: gameId }),
  pay: (gameId: string, toAccount: Account, toPlayer: string | null, amount: number, note?: string) =>
    call<string>('pay', { p_game_id: gameId, p_to_account: toAccount, p_to_player: toPlayer, p_amount: amount, p_note: note ?? null }),
  request: (gameId: string, toPlayer: string, amount: number, note?: string) =>
    call<string>('request_money', { p_game_id: gameId, p_to_player: toPlayer, p_amount: amount, p_note: note ?? null }),
  respond: (gameId: string, requestId: string, accept: boolean) =>
    call<null>('respond_request', { p_game_id: gameId, p_request_id: requestId, p_accept: accept }),
  claimGo: (gameId: string) => call<{ status: 'paid' | 'pending' }>('claim_go', { p_game_id: gameId }),
  admin: (gameId: string, action: string, payload: Record<string, unknown> = {}) =>
    call<{ ok: boolean; count: number }>('admin_action', { p_game_id: gameId, p_action: action, p_payload: payload }),
}
