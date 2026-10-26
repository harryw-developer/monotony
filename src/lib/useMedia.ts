import { useEffect, useState } from 'react'

export function useMedia(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const m = window.matchMedia(query)
    const on = () => setMatch(m.matches)
    on()
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [query])
  return match
}

/** Laptop/desktop layout: wide screen. */
export const useWide = () => useMedia('(min-width: 1024px)')

/** True when typing should not trigger shortcuts. */
export function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null
  return !!t?.closest?.('input, textarea, select, [contenteditable="true"]')
}
