import { AnimatePresence, motion } from 'framer-motion'
import { createContext, type ReactNode, useCallback, useContext, useState } from 'react'
import { TONE_HEX } from '../lib/avatars'
import type { Tone } from '../lib/types'

type Toast = { id: number; text: string; tone: Tone }
const Ctx = createContext<(text: string, tone?: Tone) => void>(() => {})

let next = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((text: string, tone: Tone = 'ink') => {
    const id = next++
    setToasts((t) => [...t.slice(-2), { id, text, tone }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000)
  }, [])
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="safe-top pointer-events-none fixed inset-x-0 top-0 z-[70] flex flex-col items-center gap-2 px-4">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ y: -80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -80, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 28 }}
              role="status"
              className="brut pointer-events-auto w-full max-w-[480px] px-4 py-3 font-semibold"
              style={{
                background: TONE_HEX[t.tone],
                color: t.tone === 'ink' || t.tone === 'grape' ? '#FFF8EC' : '#111',
                ['--edge' as string]: '#111',
                ['--shade' as string]: '#111',
              }}
            >
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
