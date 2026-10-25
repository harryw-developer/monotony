import { AnimatePresence, motion, useAnimationControls, useMotionValue, useReducedMotion, useTransform } from 'framer-motion'
import { type ButtonHTMLAttributes, type ReactNode, useEffect, useRef, useState } from 'react'
import { emojiFor, hexFor, TONE_HEX } from '../lib/avatars'
import { money } from '../lib/format'
import { buzz, sfx } from '../lib/sound'
import type { Tone } from '../lib/types'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

const VARIANT: Record<string, string> = {
  money: 'bg-money text-ink',
  hot: 'bg-hot text-ink',
  sun: 'bg-sun text-ink',
  sky: 'bg-sky text-ink',
  grape: 'bg-grape text-white',
  paper: 'bg-paper text-ink',
  white: 'bg-white text-ink',
  ink: 'bg-ink text-paper',
  vault: 'bg-vault-card text-paper',
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANT
  size?: 'xl' | 'lg' | 'md' | 'sm'
  block?: boolean
  icon?: ReactNode
}

export function Button({ variant = 'paper', size = 'md', block, icon, className, children, onClick, ...rest }: BtnProps) {
  const sizes = {
    xl: 'h-[72px] px-6 text-2xl gap-3',
    lg: 'h-16 px-5 text-xl gap-3',
    md: 'h-14 px-4 text-lg gap-2',
    sm: 'h-12 px-3 text-base gap-2',
  }
  return (
    <button
      {...rest}
      onClick={(e) => {
        sfx.tap()
        onClick?.(e)
      }}
      className={cx(
        'brut press font-display inline-flex items-center justify-center whitespace-nowrap',
        VARIANT[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
    >
      {icon}
      {children}
    </button>
  )
}

export function Card({ className, children, tone }: { className?: string; children: ReactNode; tone?: keyof typeof VARIANT }) {
  return <div className={cx('brut', VARIANT[tone ?? 'white'], className)}>{children}</div>
}

export function Avatar({
  avatar, colour, size = 56, dim, ring,
}: { avatar: string; colour: string; size?: number; dim?: boolean; ring?: boolean }) {
  return (
    <span
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full', dim && 'grayscale opacity-50')}
      style={{
        width: size,
        height: size,
        background: hexFor(colour),
        border: `${size > 80 ? 4 : 3}px solid var(--edge)`,
        boxShadow: ring ? `0 0 0 4px var(--color-paper), 0 0 0 7px var(--edge)` : undefined,
        fontSize: size * 0.52,
        lineHeight: 1,
      }}
      aria-hidden
    >
      {emojiFor(avatar)}
    </span>
  )
}

/** Fixed system "accounts" shown alongside players in pickers. */
export function SystemAvatar({ kind, size = 56 }: { kind: 'bank' | 'parking'; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: kind === 'bank' ? 'var(--color-grape)' : 'var(--color-sun)',
        border: `${size > 80 ? 4 : 3}px solid var(--edge)`,
        fontSize: size * 0.5,
      }}
      aria-hidden
    >
      {kind === 'bank' ? '🏦' : '🅿️'}
    </span>
  )
}

export function Tile({
  children, label, sub, selected, disabled, onClick, dark,
}: {
  children: ReactNode; label: string; sub?: ReactNode; selected?: boolean; disabled?: boolean; onClick?: () => void; dark?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        sfx.tap()
        onClick?.()
      }}
      className={cx(
        'brut press flex min-h-[120px] flex-col items-center justify-center gap-2 p-3 text-center',
        dark ? 'bg-vault-card text-paper' : 'bg-white',
        selected && (dark ? 'bg-grape!' : 'bg-sun!'),
      )}
    >
      {children}
      <span className="font-display w-full truncate text-lg leading-tight">{label}</span>
      {sub && <span className="tnum -mt-1 text-sm opacity-70">{sub}</span>}
    </button>
  )
}

export function Chip({ children, tone = 'paper', className }: { children: ReactNode; tone?: string; className?: string }) {
  return (
    <span
      className={cx('inline-flex items-center gap-1 rounded-full border-2 px-2 py-0.5 text-[13px] font-semibold', className)}
      style={{ background: TONE_HEX[tone] ?? '#FFF8EC', borderColor: 'var(--edge)', color: tone === 'grape' || tone === 'ink' ? '#fff' : '#111' }}
    >
      {children}
    </span>
  )
}

export function Toggle({
  checked, onChange, label, hint, dark,
}: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; dark?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => {
        sfx.tap()
        onChange(!checked)
      }}
      className="flex min-h-14 w-full items-center gap-3 py-2 text-left"
    >
      <span className="flex-1">
        <span className="block font-semibold">{label}</span>
        {hint && <span className={cx('block text-[13px]', dark ? 'text-paper/60' : 'text-ink/60')}>{hint}</span>}
      </span>
      <span
        className={cx('relative h-9 w-16 shrink-0 rounded-full border-[3px] transition-colors', checked ? 'bg-money' : dark ? 'bg-vault-line' : 'bg-paper')}
        style={{ borderColor: 'var(--edge)' }}
      >
        <span
          className="absolute top-[3px] h-6 w-6 rounded-full border-[3px] bg-white transition-all"
          style={{ left: checked ? 30 : 3, borderColor: 'var(--edge)' }}
        />
      </span>
    </button>
  )
}

/** Count up/down to the new value over 600ms, using tabular figures. */
export function AnimatedMoney({ value, currency, className }: { value: number | null; currency: string; className?: string }) {
  const [shown, setShown] = useState(value ?? 0)
  const from = useRef(value ?? 0)
  const reduce = useReducedMotion()
  useEffect(() => {
    if (value == null) return
    if (reduce) {
      setShown(value)
      from.current = value
      return
    }
    const start = performance.now()
    const a = from.current
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 600)
      const eased = 1 - Math.pow(1 - k, 3)
      setShown(Math.round(a + (value - a) * eased))
      if (k < 1) raf = requestAnimationFrame(step)
      else from.current = value
    }
    raf = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(raf)
      from.current = value
    }
  }, [value, reduce])
  if (value == null) return <span className={className}>—</span>
  return <span className={cx('tnum', shown < 0 && 'text-hot', className)}>{money(shown, currency)}</span>
}

export function Sheet({
  open, onClose, children, dark, title,
}: { open: boolean; onClose: () => void; children: ReactNode; dark?: boolean; title?: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-40 flex items-end justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-ink/60" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal
            data-theme={dark ? 'vault' : undefined}
            className={cx(
              'safe-bottom relative max-h-[92dvh] w-full max-w-[520px] overflow-y-auto rounded-t-[24px] border-[3px] border-b-0 px-4 pt-3',
              dark ? 'bg-vault text-paper' : 'bg-paper text-ink',
            )}
            style={{ borderColor: dark ? 'var(--color-grape)' : 'var(--edge)' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-current opacity-30" />
            <div className="mb-3 flex items-center gap-3">
              <div className="font-display min-w-0 flex-1 text-2xl">{title}</div>
              <button
                onClick={onClose}
                className="brut-sm press flex h-12 w-12 items-center justify-center bg-white text-xl text-ink"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            {children}
            <div className="h-4" />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Destructive actions: hold for 1.2s to confirm. */
export function HoldButton({
  children, onConfirm, variant = 'hot', block = true, disabled,
}: { children: ReactNode; onConfirm: () => void; variant?: keyof typeof VARIANT; block?: boolean; disabled?: boolean }) {
  const [holding, setHolding] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const start = () => {
    if (disabled) return
    setHolding(true)
    buzz(15)
    timer.current = window.setTimeout(() => {
      setHolding(false)
      buzz([30, 40, 30])
      onConfirm()
    }, 1200)
  }
  const stop = () => {
    setHolding(false)
    window.clearTimeout(timer.current)
  }
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return (
    <button
      type="button"
      disabled={disabled}
      data-pressed={holding}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => e.key === 'Enter' && !e.repeat && start()}
      onKeyUp={(e) => e.key === 'Enter' && stop()}
      className={cx('brut press font-display relative h-16 overflow-hidden px-4 text-xl', VARIANT[variant], block && 'w-full')}
    >
      <span
        className="absolute inset-y-0 left-0 bg-ink/25"
        style={{ width: holding ? '100%' : '0%', transition: holding ? 'width 1.2s linear' : 'width 0.15s' }}
      />
      <span className="relative">{holding ? 'Keep holding…' : children}</span>
    </button>
  )
}

const CHIPS = [10, 50, 100, 200, 500]

/** 3×4 keypad with quick-add chips. Value is a whole number, max 9,999,999. */
export function Keypad({ value, onChange, dark, chips = true }: { value: number; onChange: (v: number) => void; dark?: boolean; chips?: boolean }) {
  const set = (v: number) => onChange(Math.max(0, Math.min(9999999, v)))
  const press = (k: string) => {
    sfx.tap()
    buzz(8)
    if (k === '⌫') set(Math.floor(value / 10))
    else if (k === 'C') set(0)
    else {
      const next = Number(String(value === 0 ? '' : value) + k)
      if (next <= 9999999) set(next)
    }
  }
  const key = dark ? 'bg-vault-card text-paper' : 'bg-white'
  return (
    <div className="flex flex-col gap-2.5">
      {chips && (
        <div className="grid grid-cols-5 gap-2">
          {CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                sfx.tap()
                set(value + c)
              }}
              className="brut-sm press font-display tnum h-12 bg-sun text-base text-ink"
            >
              +{c}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2.5">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
          <button
            key={k}
            type="button"
            aria-label={k === '⌫' ? 'Backspace' : k === 'C' ? 'Clear' : k}
            onClick={() => press(k)}
            className={cx('brut-sm press font-display h-16 text-3xl', key, (k === 'C' || k === '⌫') && 'text-2xl')}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Drag the knob all the way right to confirm. */
export function SwipeToSend({
  label, onComplete, disabled, tone = 'money',
}: { label: string; onComplete: () => void; disabled?: boolean; tone?: Tone }) {
  const track = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const controls = useAnimationControls()
  const [max, setMax] = useState(240)
  const fade = useTransform(x, [0, max * 0.6], [1, 0])
  useEffect(() => {
    const measure = () => track.current && setMax(track.current.offsetWidth - 64 - 12)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  useEffect(() => {
    if (!disabled) void controls.start({ x: 0 })
  }, [disabled, controls])
  const finish = () => {
    buzz(40)
    void controls.start({ x: max, transition: { duration: 0.12 } })
    onComplete()
  }
  return (
    <div
      ref={track}
      className={cx('brut relative h-[72px] overflow-hidden', disabled && 'opacity-45')}
      style={{ background: TONE_HEX[tone] }}
    >
      <motion.span style={{ opacity: fade }} className="font-display pointer-events-none absolute inset-0 flex items-center justify-center pl-14 text-xl text-ink">
        {label} »
      </motion.span>
      <motion.button
        type="button"
        aria-label={label}
        disabled={disabled}
        drag={disabled ? false : 'x'}
        dragConstraints={{ left: 0, right: max }}
        dragElastic={0}
        dragMomentum={false}
        animate={controls}
        onDragEnd={() => {
          if (x.get() > max * 0.85) finish()
          else void controls.start({ x: 0, transition: { type: 'spring', stiffness: 500, damping: 30 } })
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !disabled) finish()
        }}
        className="absolute top-[3px] left-[3px] flex h-[60px] w-16 cursor-grab touch-none items-center justify-center rounded-[12px] border-[3px] bg-white text-3xl active:cursor-grabbing"
        style={{ x, borderColor: 'var(--edge)' }}
      >
        →
      </motion.button>
    </div>
  )
}

export function Coin({ size = 40 }: { size?: number }) {
  return (
    <span
      className="font-display inline-flex items-center justify-center rounded-full bg-money align-middle text-ink"
      style={{ width: size, height: size, border: `${Math.max(3, size / 14)}px solid #111`, fontSize: size * 0.5, lineHeight: 1 }}
    >
      M
    </span>
  )
}

function starburst(points: number, outer: number, inner: number, cx0: number, cy0: number, sx = 1) {
  const pts: string[] = []
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer
    const a = (Math.PI * i) / points - Math.PI / 2
    pts.push(`${(cx0 + Math.cos(a) * r * sx).toFixed(1)},${(cy0 + Math.sin(a) * r).toFixed(1)}`)
  }
  return pts.join(' ')
}

/** "MONOTONY" with the first two O's as coins, on a sun sticker. */
export function Logo({ size = 1 }: { size?: number }) {
  const w = 340 * size
  const h = 170 * size
  return (
    <div className="relative mx-auto" style={{ width: w, height: h }}>
      <svg viewBox="0 0 340 170" className="absolute inset-0 h-full w-full" aria-hidden>
        <polygon points={starburst(18, 82, 70, 176, 91, 1.95)} fill="#111" />
        <polygon points={starburst(18, 82, 70, 168, 83, 1.95)} fill="#FFD23F" stroke="#111" strokeWidth="4" strokeLinejoin="round" />
      </svg>
      <h1
        className="font-display absolute inset-0 flex items-center justify-center gap-[0.04em] text-ink"
        style={{ fontSize: 46 * size, letterSpacing: '-0.03em', paddingRight: 8 * size, paddingBottom: 8 * size }}
        aria-label="Monotony"
      >
        <span>M</span>
        <Coin size={38 * size} />
        <span>N</span>
        <Coin size={38 * size} />
        <span>TONY</span>
      </h1>
    </div>
  )
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20">
      <motion.div animate={{ rotateY: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}>
        <Coin size={64} />
      </motion.div>
      <p className="font-display text-xl">{label}</p>
    </div>
  )
}

export function Field({
  label, value, onChange, placeholder, maxLength = 16, autoFocus, dark, inputMode, onEnter,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number; autoFocus?: boolean; dark?: boolean
  inputMode?: 'text' | 'numeric'; onEnter?: () => void
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold tracking-wide uppercase opacity-70">{label}</span>
      <input
        value={value}
        autoFocus={autoFocus}
        maxLength={maxLength}
        placeholder={placeholder}
        inputMode={inputMode}
        enterKeyHint="done"
        onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
        onChange={(e) => onChange(e.target.value)}
        className={cx('brut font-display h-16 w-full px-4 text-2xl outline-none focus:bg-sun/30', dark ? 'bg-vault-card text-paper placeholder:text-paper/30' : 'bg-white placeholder:text-ink/30')}
      />
    </label>
  )
}

export function NumberField({
  label, value, onChange, prefix, dark, step = 50,
}: { label: string; value: number; onChange: (v: number) => void; prefix?: string; dark?: boolean; step?: number }) {
  const clamp = (v: number) => Math.max(0, Math.min(9999999, Math.round(v || 0)))
  return (
    <div>
      <span className="mb-1.5 block text-[13px] font-semibold tracking-wide uppercase opacity-70">{label}</span>
      <div className="flex gap-2">
        <button type="button" aria-label={`Less ${label}`} onClick={() => onChange(clamp(value - step))} className={cx('brut-sm press font-display h-14 w-14 text-2xl', dark ? 'bg-vault-card' : 'bg-white')}>
          −
        </button>
        <div className={cx('brut-sm flex h-14 flex-1 items-center px-3', dark ? 'bg-vault-card' : 'bg-white')}>
          {prefix && <span className="font-display mr-1 text-xl opacity-50">{prefix}</span>}
          <input
            inputMode="numeric"
            value={value}
            onChange={(e) => onChange(clamp(Number(e.target.value.replace(/\D/g, ''))))}
            className="font-display tnum w-full bg-transparent text-2xl outline-none"
          />
        </div>
        <button type="button" aria-label={`More ${label}`} onClick={() => onChange(clamp(value + step))} className={cx('brut-sm press font-display h-14 w-14 text-2xl', dark ? 'bg-vault-card' : 'bg-white')}>
          +
        </button>
      </div>
    </div>
  )
}
