// What a phone tells the Banker about itself. Nothing here identifies a person;
// it helps the Banker spot a flat battery, a stale app or a wrong browser.
import { isMuted } from './sound'

export const APP_VERSION: string = __APP_VERSION__

type Nav = Navigator & {
  standalone?: boolean
  deviceMemory?: number
  connection?: { effectiveType?: string; downlink?: number; saveData?: boolean }
  getBattery?: () => Promise<{ level: number; charging: boolean }>
  userAgentData?: { mobile?: boolean; getHighEntropyValues?: (h: string[]) => Promise<{ model?: string; platformVersion?: string; platform?: string }> }
}

function parse(ua: string, touch: number) {
  let os = 'Unknown'
  let m: RegExpMatchArray | null
  const iPadOS = /Macintosh/.test(ua) && touch > 1
  if ((m = ua.match(/(iPhone|iPad|iPod).*? OS (\d+)[_.](\d+)/))) os = `${m[1] === 'iPad' ? 'iPadOS' : 'iOS'} ${m[2]}.${m[3]}`
  else if (iPadOS) os = 'iPadOS'
  else if ((m = ua.match(/Android (\d+(?:\.\d+)?)/))) os = `Android ${m[1]}`
  else if (/Windows NT 10/.test(ua)) os = 'Windows 10/11'
  else if (/Windows/.test(ua)) os = 'Windows'
  else if ((m = ua.match(/Mac OS X (\d+)[_.](\d+)/))) os = `macOS ${m[1]}.${m[2]}`
  else if (/CrOS/.test(ua)) os = 'ChromeOS'
  else if (/Linux/.test(ua)) os = 'Linux'

  let browser = 'Unknown'
  const b: [RegExp, string][] = [
    [/EdgA?\/(\d+)/, 'Edge'],
    [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
    [/OPR\/(\d+)/, 'Opera'],
    [/(?:Firefox|FxiOS)\/(\d+)/, 'Firefox'],
    [/CriOS\/(\d+)/, 'Chrome'],
    [/Chrome\/(\d+)/, 'Chrome'],
    [/Version\/(\d+(?:\.\d+)?).*Safari/, 'Safari'],
  ]
  for (const [re, name] of b) {
    if ((m = ua.match(re))) {
      browser = `${name} ${m[1]}`
      break
    }
  }

  const tablet = iPadOS || /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))
  const type = tablet ? 'Tablet' : /Mobi|iPhone|iPod|Android/.test(ua) ? 'Phone' : 'Computer'
  let model = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) || iPadOS ? 'iPad' : /Macintosh/.test(ua) ? 'Mac' : ''
  if ((m = ua.match(/Android [\d.]+; ([^;)]+?)(?: Build|\))/)) && m[1] !== 'K') model = m[1].trim()
  return { os, browser, type, model }
}

export async function collectDeviceInfo(): Promise<Record<string, string | number | boolean | null>> {
  const n = navigator as Nav
  const base = parse(n.userAgent, n.maxTouchPoints || 0)
  let model = base.model
  try {
    const hi = await n.userAgentData?.getHighEntropyValues?.(['model'])
    if (hi?.model) model = hi.model
  } catch {
    /* not offered */
  }
  let battery: number | null = null
  let charging: boolean | null = null
  try {
    const bat = await n.getBattery?.()
    if (bat) {
      battery = Math.round(bat.level * 100)
      charging = bat.charging
    }
  } catch {
    /* not offered (Safari, Firefox) */
  }
  const mq = (q: string) => window.matchMedia(q).matches
  return {
    type: base.type,
    model: model || null,
    os: base.os,
    browser: base.browser,
    screen: `${window.screen.width}×${window.screen.height}`,
    pixel_ratio: Math.round(window.devicePixelRatio * 100) / 100,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    orientation: window.screen.orientation?.type?.replace('-primary', '').replace('-secondary', '') ?? null,
    touch_points: n.maxTouchPoints || 0,
    language: n.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    installed: mq('(display-mode: standalone)') || n.standalone === true,
    visible: document.visibilityState === 'visible',
    online: n.onLine,
    connection: n.connection?.effectiveType ?? null,
    downlink_mbps: n.connection?.downlink ?? null,
    save_data: n.connection?.saveData ?? null,
    battery,
    charging,
    memory_gb: n.deviceMemory ?? null,
    cpu_cores: n.hardwareConcurrency || null,
    dark_mode: mq('(prefers-color-scheme: dark)'),
    reduced_motion: mq('(prefers-reduced-motion: reduce)'),
    sound_on: !isMuted(),
    app_version: APP_VERSION,
  }
}
