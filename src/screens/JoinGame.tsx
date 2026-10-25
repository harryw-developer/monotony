import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { firstFree, PlayerStyle } from '../components/PlayerStyle'
import { useToast } from '../components/toast'
import { Avatar, Button, Field } from '../components/ui'
import { api } from '../lib/api'
import { AVATARS, COLOURS } from '../lib/avatars'
import { setSession } from '../lib/device'
import { cleanCode, formatCode } from '../lib/format'
import { buzz, sfx, unlockAudio } from '../lib/sound'
import { load, save } from '../lib/storage'
import { TopBar } from './common'

const QrScanner = lazy(() => import('../components/QrScanner').then((m) => ({ default: m.QrScanner })))

function CodeBoxes({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])
  return (
    <div className="relative" onClick={() => input.current?.focus()}>
      <input
        ref={input}
        value={value}
        onChange={(e) => onChange(cleanCode(e.target.value))}
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        inputMode="text"
        aria-label="Game code"
        className="absolute inset-0 z-10 h-full w-full opacity-0"
      />
      <div className="flex items-center justify-center gap-1.5">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="contents">
            {i === 3 && <span className="font-display text-3xl opacity-40">-</span>}
            <div
              className={`brut-sm font-display flex h-[68px] flex-1 items-center justify-center text-[36px] ${
                error ? 'bg-hot' : i === value.length ? 'bg-sun' : 'bg-white'
              }`}
              style={{ maxWidth: 60 }}
            >
              {value[i] ?? ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function JoinGame() {
  const nav = useNavigate()
  const toast = useToast()
  const params = useParams()
  const saved = load('me', { name: '', avatar: '', colour: '' })
  const [code, setCode] = useState(cleanCode(params.code ?? ''))
  const [step, setStep] = useState<'code' | 'you'>('code')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [scan, setScan] = useState(false)
  const [taken, setTaken] = useState<{ colours: string[]; avatars: string[] }>({ colours: [], avatars: [] })
  const [name, setName] = useState(saved.name)
  const [avatar, setAvatar] = useState(saved.avatar || 'car')
  const [colour, setColour] = useState(saved.colour || 'blue')
  const checked = useRef('')

  useEffect(() => {
    if (code.length !== 6 || checked.current === code) return
    checked.current = code
    setBusy(true)
    setError(null)
    api
      .findGame(code)
      .then(async (g) => {
        if (g.player_id) {
          // This device already has a seat: straight back in.
          await api.joinGame(code, saved.name || 'Player', saved.avatar || 'car', saved.colour || 'blue')
          setSession({ gameId: g.game_id, code, playerId: g.player_id })
          nav('/game', { replace: true })
          return
        }
        setTaken({ colours: g.taken_colours, avatars: g.taken_avatars })
        if (g.taken_avatars.includes(avatar)) setAvatar(firstFree(AVATARS, g.taken_avatars))
        if (g.taken_colours.includes(colour)) setColour(firstFree(COLOURS, g.taken_colours))
        sfx.notice()
        setStep('you')
      })
      .catch((e: Error) => {
        sfx.error()
        buzz([30, 30, 30])
        setError(e.message)
      })
      .finally(() => setBusy(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  const join = async () => {
    unlockAudio()
    setBusy(true)
    try {
      save('me', { name: name.trim(), avatar, colour })
      const r = await api.joinGame(code, name.trim(), avatar, colour)
      setSession({ gameId: r.game_id, code, playerId: r.player_id })
      nav('/game', { replace: true })
    } catch (e) {
      sfx.error()
      toast((e as Error).message, 'hot')
      setBusy(false)
    }
  }

  if (step === 'you')
    return (
      <div className="safe-bottom mx-auto flex min-h-dvh max-w-[480px] flex-col px-4">
        <TopBar title={`Join ${formatCode(code)}`} onBack={() => (setStep('code'), setCode(''), (checked.current = ''))} />
        <div className="flex flex-1 flex-col gap-5">
          <div className="flex justify-center py-1">
            <Avatar avatar={avatar} colour={colour} size={96} />
          </div>
          <Field label="Your name" value={name} onChange={setName} placeholder="e.g. Alex" autoFocus={!name} onEnter={() => name.trim() && join()} />
          <PlayerStyle avatar={avatar} colour={colour} onAvatar={setAvatar} onColour={setColour} takenAvatars={taken.avatars} takenColours={taken.colours} />
        </div>
        <div className="sticky bottom-0 bg-paper pt-4 pb-2">
          <Button size="xl" variant="money" block disabled={!name.trim() || busy} onClick={join}>
            {busy ? 'Joining…' : 'Join game'}
          </Button>
        </div>
      </div>
    )

  return (
    <div className="safe-bottom mx-auto flex min-h-dvh max-w-[480px] flex-col px-4">
      <TopBar title="Join a game" onBack={() => nav('/')} />
      <div className="flex flex-1 flex-col gap-5">
        <p className="font-display text-xl">Type the code on the Banker’s phone</p>
        <CodeBoxes value={code} onChange={(v) => (setError(null), setCode(v))} error={!!error} />
        <p className="min-h-6 text-center font-semibold" role="status">
          {busy ? 'Looking for the game…' : error ? <span className="text-hot">{error}</span> : ''}
        </p>
        <div className="flex items-center gap-3 opacity-60">
          <div className="h-[3px] flex-1 rounded bg-ink" />
          <span className="font-display">or</span>
          <div className="h-[3px] flex-1 rounded bg-ink" />
        </div>
        <Button size="xl" variant="sky" block onClick={() => (unlockAudio(), setScan(true))} icon={<span>📷</span>}>
          Scan QR code
        </Button>
      </div>
      {scan && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-ink" />}>
        <QrScanner
          onClose={() => setScan(false)}
          onCode={(c) => {
            setScan(false)
            checked.current = ''
            setCode(c)
          }}
        />
        </Suspense>
      )}
    </div>
  )
}
