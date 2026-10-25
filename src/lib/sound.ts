// Tiny synthesised sound kit (no audio files) plus haptics.
import { load, save } from './storage'

type Ctx = AudioContext
let ctx: Ctx | null = null
let muted = load('muted', false)
const listeners = new Set<(m: boolean) => void>()

function ac(): Ctx | null {
  try {
    if (!ctx) {
      const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ctx = new C()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** Browsers block audio until a tap; call on the first interaction. */
export function unlockAudio() {
  const c = ac()
  if (!c) return
  const b = c.createBuffer(1, 1, 22050)
  const s = c.createBufferSource()
  s.buffer = b
  s.connect(c.destination)
  s.start(0)
}

export const isMuted = () => muted
export function setMuted(m: boolean) {
  muted = m
  save('muted', m)
  listeners.forEach((l) => l(m))
}
export function onMuted(l: (m: boolean) => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

function tone(freq: number, at: number, dur: number, type: OscillatorType = 'sine', gain = 0.18, to?: number) {
  const c = ac()
  if (!c) return
  const t = c.currentTime + at
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(c.destination)
  o.start(t)
  o.stop(t + dur + 0.05)
}

function noise(at: number, dur: number, gain = 0.15, freq = 2000, to?: number) {
  const c = ac()
  if (!c) return
  const t = c.currentTime + at
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buf
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.setValueAtTime(freq, t)
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f).connect(g).connect(c.destination)
  src.start(t)
}

const play = (fn: () => void) => () => {
  if (!muted) fn()
}

export const sfx = {
  tap: play(() => tone(520, 0, 0.05, 'square', 0.04)),
  cash: play(() => {
    // "ka" drawer clunk, then the "ching" bell.
    noise(0, 0.06, 0.25, 900)
    tone(180, 0, 0.08, 'square', 0.08)
    tone(1318, 0.09, 0.7, 'sine', 0.2)
    tone(1760, 0.09, 0.6, 'sine', 0.12)
    tone(2637, 0.1, 0.4, 'sine', 0.06)
  }),
  send: play(() => {
    noise(0, 0.35, 0.18, 600, 4000)
    tone(300, 0, 0.3, 'triangle', 0.08, 900)
  }),
  lock: play(() => {
    tone(110, 0, 0.35, 'square', 0.2, 50)
    noise(0, 0.2, 0.3, 300)
    tone(220, 0.12, 0.1, 'square', 0.08)
  }),
  error: play(() => {
    tone(200, 0, 0.12, 'sawtooth', 0.1)
    tone(150, 0.13, 0.18, 'sawtooth', 0.1)
  }),
  notice: play(() => {
    tone(880, 0, 0.12, 'triangle', 0.1)
    tone(1175, 0.1, 0.18, 'triangle', 0.1)
  }),
  win: play(() => {
    ;[523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.35, 'triangle', 0.14))
  }),
}

/** Vibrate where supported (Android). iOS Safari has no Vibration API. */
export function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* unsupported */
  }
}
