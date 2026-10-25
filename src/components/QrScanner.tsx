import { Html5Qrcode } from 'html5-qrcode'
import { useEffect, useId, useState } from 'react'
import { cleanCode } from '../lib/format'
import { Button } from './ui'

/** Full-screen camera that looks for a Monotony join link (or a bare code). */
export function QrScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const id = 'qr-' + useId().replace(/:/g, '')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const scanner = new Html5Qrcode(id, { verbose: false })
    let done = false
    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 230, height: 230 } },
        (text) => {
          const m = text.match(/join\/([A-Za-z0-9-]{6,7})/) ?? text.match(/^([A-Za-z0-9-]{6,7})$/)
          const code = m ? cleanCode(m[1]) : ''
          if (code.length === 6 && !done) {
            done = true
            onCode(code)
          }
        },
        () => {},
      )
      .catch(() => setError('Camera not available. Allow camera access, or type the code instead.'))
    return () => {
      if (scanner.isScanning) void scanner.stop().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="safe-top safe-bottom fixed inset-0 z-50 flex flex-col bg-ink px-4 text-paper">
      <p className="font-display py-4 text-center text-2xl">Point at the Banker’s QR code</p>
      <div className="brut flex-1 overflow-hidden bg-black" style={{ ['--edge' as string]: '#FFD23F' }}>
        <div id={id} className="h-full w-full [&_video]:h-full! [&_video]:object-cover" />
      </div>
      {error && <p className="brut mt-4 bg-hot px-4 py-3 font-semibold text-ink">{error}</p>}
      <Button className="mt-4" size="xl" variant="white" block onClick={onClose}>
        Type the code instead
      </Button>
    </div>
  )
}
