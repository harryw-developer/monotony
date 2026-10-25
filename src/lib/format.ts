export function money(n: number | null | undefined, currency = 'M') {
  if (n == null) return '—'
  return (n < 0 ? '−' : '') + currency + Math.abs(Math.round(n)).toLocaleString('en-GB')
}

export function formatCode(code: string) {
  const c = code.toUpperCase()
  return c.length === 6 ? `${c.slice(0, 3)}-${c.slice(3)}` : c
}

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function cleanCode(raw: string) {
  return raw
    .toUpperCase()
    .split('')
    .filter((c) => CODE_ALPHABET.includes(c))
    .join('')
    .slice(0, 6)
}

export function timeAgo(iso: string, nowMs = Date.now()) {
  const s = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 1000))
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function joinUrl(code: string) {
  return `${window.location.origin}${window.location.pathname}#/join/${code}`
}
