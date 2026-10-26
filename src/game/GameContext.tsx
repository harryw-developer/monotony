import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '../components/toast'
import { type AdminResult, api } from '../lib/api'
import { collectDeviceInfo } from '../lib/deviceInfo'
import { clearSession, type Session } from '../lib/device'
import { buzz, sfx } from '../lib/sound'
import { load, save } from '../lib/storage'
import { supabase } from '../lib/supabase'
import type { Account, GameEvent, Player, State, Tone, Tx } from '../lib/types'

export type Celebration = { id: string; amount: number; from: Player | 'bank' | 'parking'; note: string | null }

type GameCtx = {
  session: Session
  state: State
  me: Player
  players: Player[]
  byId: Map<string, Player>
  currency: string
  serverOffset: number
  live: boolean
  refresh: () => void
  celebration: Celebration | null
  clearCelebration: () => void
  broadcast: GameEvent | null
  clearBroadcast: () => void
  pay: (to: Account, toPlayer: string | null, amount: number, note?: string) => Promise<boolean>
  request: (toPlayer: string, amount: number, note?: string) => Promise<boolean>
  respond: (requestId: string, accept: boolean) => Promise<boolean>
  claimGo: () => Promise<'paid' | 'pending' | null>
  admin: (action: string, payload?: Record<string, unknown>, success?: string) => Promise<AdminResult | null>
  toast: (text: string, tone?: Tone) => void
}

const Ctx = createContext<GameCtx | null>(null)

export function useGame() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useGame outside GameProvider')
  return c
}

const FATAL = /removed from this game|no longer exists|not in this game/i

export function GameProvider({
  session, children, fallback, onFatal,
}: { session: Session; children: ReactNode; fallback: (error: string | null) => ReactNode; onFatal: (msg: string) => void }) {
  const toast = useToast()
  const [state, setState] = useState<State | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [live, setLive] = useState(false)
  const [serverOffset, setServerOffset] = useState(0)
  const [celebration, setCelebration] = useState<Celebration | null>(null)
  const [broadcast, setBroadcast] = useState<GameEvent | null>(null)

  const seenSeq = useRef<number>(load(`seq.${session.gameId}`, -1))
  const seenEvent = useRef<string>(load(`ev.${session.gameId}`, ''))
  const seenGo = useRef<Set<string> | null>(null)
  const inflight = useRef(false)
  const again = useRef(false)

  const digest = useCallback(
    (s: State) => {
      const me = s.me
      const byId = new Map(s.players.map((p) => [p.id, p]))

      // Money received since we last looked: celebrate once, with the sender's colour.
      const maxSeq = s.transactions.reduce((m, t) => Math.max(m, t.seq), 0)
      if (seenSeq.current < 0) {
        seenSeq.current = maxSeq
      } else {
        const incoming = s.transactions
          .filter((t: Tx) => t.seq > seenSeq.current && t.to_player === me && t.from_player !== me)
          .sort((a, b) => a.seq - b.seq)
        if (incoming.length) {
          const last = incoming[incoming.length - 1]
          const from = last.from_account === 'player' ? byId.get(last.from_player ?? '') : undefined
          setCelebration({
            id: last.id,
            amount: incoming.reduce((sum, t) => sum + t.amount, 0),
            from: from ?? (last.from_account === 'parking' ? 'parking' : 'bank'),
            note: incoming.length > 1 ? `${incoming.length} payments` : last.note,
          })
          sfx.cash()
          buzz([60, 40, 120])
        }
        seenSeq.current = Math.max(seenSeq.current, maxSeq)
      }
      save(`seq.${session.gameId}`, seenSeq.current)

      // Notices, broadcasts and lock slams, oldest first.
      const latest = s.events[0]?.created_at ?? ''
      if (!seenEvent.current) {
        seenEvent.current = latest || new Date(0).toISOString()
      } else {
        const fresh = s.events.filter((e) => e.created_at > seenEvent.current).reverse()
        for (const e of fresh) {
          if (e.kind === 'notice' && e.payload.text) {
            toast(e.payload.text, e.payload.tone ?? 'ink')
            if (e.payload.tone !== 'money') sfx.notice()
          } else if (e.kind === 'broadcast' && s.is_admin) {
            toast(`Broadcast sent: ${e.payload.message}`, 'grape')
          } else if (e.kind === 'broadcast') {
            setBroadcast(e)
            sfx.notice()
            buzz([80, 60, 80])
          } else if (e.kind === 'lock') {
            sfx.lock()
            buzz([200, 80, 200])
          } else if (e.kind === 'reload') {
            toast('The Banker is refreshing your app…', 'grape')
            window.setTimeout(() => window.location.reload(), 900)
          }
        }
        if (latest > seenEvent.current) seenEvent.current = latest
      }
      save(`ev.${session.gameId}`, seenEvent.current)

      // Banker: ping when a new Pass GO claim arrives.
      if (s.is_admin) {
        const goIds = s.requests.filter((r) => r.kind === 'go').map((r) => r.id)
        if (seenGo.current) {
          for (const id of goIds) {
            if (!seenGo.current.has(id)) {
              const r = s.requests.find((x) => x.id === id)!
              toast(`${byId.get(r.from_player)?.name ?? 'Someone'} passed GO. Approve it in the Bank.`, 'sun')
              sfx.notice()
            }
          }
        }
        seenGo.current = new Set(goIds)
      }
    },
    [session.gameId, toast],
  )

  const refresh = useCallback(async () => {
    if (inflight.current) {
      again.current = true
      return
    }
    inflight.current = true
    try {
      const s = await api.getState(session.gameId)
      setServerOffset(Date.parse(s.now) - Date.now())
      digest(s)
      setState(s)
      setError(null)
    } catch (e) {
      const msg = (e as Error).message
      if (FATAL.test(msg)) {
        clearSession()
        onFatal(msg)
      } else setError(msg)
    } finally {
      inflight.current = false
      if (again.current) {
        again.current = false
        void refresh()
      }
    }
  }, [session.gameId, digest, onFatal])

  // Realtime pings from Postgres trigger a refetch; polling is the safety net.
  useEffect(() => {
    void refresh()
    const channel = supabase
      .channel(`game-${session.gameId}`, { config: { private: false } })
      .on('broadcast', { event: 'changed' }, () => void refresh())
      .subscribe((status) => {
        setLive(status === 'SUBSCRIBED')
        if (status === 'SUBSCRIBED') void refresh()
      })
    const onVisible = () => document.visibilityState === 'visible' && void refresh()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    return () => {
      void supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
    }
  }, [session.gameId, refresh])

  useEffect(() => {
    const id = window.setInterval(() => document.visibilityState === 'visible' && void refresh(), live ? 10000 : 2500)
    return () => window.clearInterval(id)
  }, [live, refresh])

  // Tell the Banker about this device: on open, when it comes back to the
  // foreground or goes away, and once a minute while open.
  useEffect(() => {
    let last = ''
    const report = async () => {
      try {
        const info = await collectDeviceInfo()
        const key = JSON.stringify({ ...info, viewport: null })
        if (key === last && document.visibilityState === 'visible') return
        last = key
        await api.reportDevice(session.gameId, info)
      } catch {
        /* best effort */
      }
    }
    void report()
    const id = window.setInterval(() => {
      last = ''
      void report()
    }, 60000)
    const onChange = () => void report()
    document.addEventListener('visibilitychange', onChange)
    window.addEventListener('online', onChange)
    window.addEventListener('offline', onChange)
    screen.orientation?.addEventListener?.('change', onChange)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onChange)
      window.removeEventListener('online', onChange)
      window.removeEventListener('offline', onChange)
      screen.orientation?.removeEventListener?.('change', onChange)
    }
  }, [session.gameId])

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, success?: string): Promise<T | null> => {
      try {
        const r = await fn()
        if (success) toast(success, 'money')
        void refresh()
        return r
      } catch (e) {
        sfx.error()
        buzz([30, 30, 30])
        toast((e as Error).message, 'hot')
        void refresh()
        return null
      }
    },
    [refresh, toast],
  )

  const value = useMemo<GameCtx | null>(() => {
    if (!state) return null
    const byId = new Map(state.players.map((p) => [p.id, p]))
    const me = byId.get(state.me)!
    const g = session.gameId
    return {
      session,
      state,
      me,
      players: state.players.filter((p) => !p.kicked),
      byId,
      currency: state.game.currency,
      serverOffset,
      live,
      refresh: () => void refresh(),
      celebration,
      clearCelebration: () => setCelebration(null),
      broadcast,
      clearBroadcast: () => setBroadcast(null),
      pay: async (to, toPlayer, amount, note) => (await run(() => api.pay(g, to, toPlayer, amount, note))) !== null,
      request: async (toPlayer, amount, note) => (await run(() => api.request(g, toPlayer, amount, note))) !== null,
      respond: async (id, accept) => (await run(() => api.respond(g, id, accept))) !== null,
      claimGo: async () => (await run(() => api.claimGo(g)))?.status ?? null,
      admin: (action, payload = {}, success) => run(() => api.admin(g, action, payload), success),
      toast,
    }
  }, [state, session, serverOffset, live, refresh, celebration, broadcast, run, toast])

  if (!value) return <>{fallback(error)}</>
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** Is this player locked right now (by server clock)? */
export function lockedFor(p: Player, offset: number): number | null {
  if (!p.locked_until) return null
  if (p.locked_until === 'infinity') return Infinity
  const left = Date.parse(p.locked_until) - (Date.now() + offset)
  return left > 0 ? left : null
}
