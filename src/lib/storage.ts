// localStorage with a fallback, namespaced so `?seat=2` in the URL gives a
// second independent seat on the same device (handy for testing).
const memory = new Map<string, string>()
const seat = new URLSearchParams(window.location.search).get('seat')
const prefix = 'monotony' + (seat ? `.${seat.replace(/[^a-z0-9]/gi, '').slice(0, 8)}` : '') + '.'

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(prefix + key) ?? memory.get(prefix + key)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function save(key: string, value: unknown) {
  const raw = JSON.stringify(value)
  memory.set(prefix + key, raw)
  try {
    localStorage.setItem(prefix + key, raw)
  } catch {
    /* private mode: memory only */
  }
}

export function remove(key: string) {
  memory.delete(prefix + key)
  try {
    localStorage.removeItem(prefix + key)
  } catch {
    /* ignore */
  }
}
