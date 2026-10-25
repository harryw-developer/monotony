import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlayerStyle } from '../components/PlayerStyle'
import { useToast } from '../components/toast'
import { Avatar, Button, Card, Field, NumberField, Toggle } from '../components/ui'
import { api } from '../lib/api'
import { setSession } from '../lib/device'
import { load, save } from '../lib/storage'
import { sfx, unlockAudio } from '../lib/sound'
import type { Rules } from '../lib/types'
import { TopBar } from './common'

const DEFAULT_RULES: Rules = { free_parking: false, show_balances: true, allow_requests: true, allow_negative: false, auto_go: false }

export default function StartGame() {
  const nav = useNavigate()
  const toast = useToast()
  const saved = load('me', { name: '', avatar: 'tophat', colour: 'red' })
  const [step, setStep] = useState<'you' | 'rules'>('you')
  const [name, setName] = useState(saved.name)
  const [avatar, setAvatar] = useState(saved.avatar)
  const [colour, setColour] = useState(saved.colour)
  const [start, setStart] = useState(1500)
  const [go, setGo] = useState(200)
  const [currency, setCurrency] = useState('M')
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES)
  const [busy, setBusy] = useState(false)
  const rule = (k: keyof Rules) => (v: boolean) => setRules((r) => ({ ...r, [k]: v }))

  const create = async () => {
    unlockAudio()
    setBusy(true)
    try {
      save('me', { name: name.trim(), avatar, colour })
      const g = await api.createGame(name.trim(), avatar, colour, { starting_balance: start, go_amount: go, currency: currency.trim() || 'M', rules })
      setSession({ gameId: g.game_id, code: g.code, playerId: g.player_id })
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
        <TopBar title="You’re the Banker" onBack={() => nav('/')} />
        <div className="flex flex-1 flex-col gap-5">
          <div className="flex justify-center py-1">
            <Avatar avatar={avatar} colour={colour} size={96} />
          </div>
          <Field label="Your name" value={name} onChange={setName} placeholder="e.g. Sam" autoFocus onEnter={() => name.trim() && setStep('rules')} />
          <PlayerStyle avatar={avatar} colour={colour} onAvatar={setAvatar} onColour={setColour} />
        </div>
        <div className="sticky bottom-0 bg-paper pt-4 pb-2">
          <Button size="xl" variant="money" block disabled={!name.trim()} onClick={() => setStep('rules')}>
            Next: house rules
          </Button>
        </div>
      </div>
    )

  return (
    <div className="safe-bottom mx-auto flex min-h-dvh max-w-[480px] flex-col px-4">
      <TopBar title="House rules" onBack={() => setStep('you')} />
      <div className="flex flex-1 flex-col gap-4">
        <Card className="space-y-4 p-4">
          <NumberField label="Starting balance" value={start} onChange={setStart} prefix={currency} step={100} />
          <NumberField label="Pass GO pays" value={go} onChange={setGo} prefix={currency} step={50} />
          <div>
            <span className="mb-1.5 block text-[13px] font-semibold tracking-wide uppercase opacity-70">Currency symbol</span>
            <div className="flex gap-2">
              {['M', '$', '£', '€', '₩'].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCurrency(c)}
                  className={`brut-sm press font-display h-14 flex-1 text-2xl ${currency === c ? 'bg-sun' : 'bg-white'}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </Card>
        <Card className="divide-y-2 divide-ink/10 px-4 py-1">
          <Toggle label="Free Parking pot" hint="Taxes and fines go in a pot someone can win" checked={rules.free_parking} onChange={rule('free_parking')} />
          <Toggle label="Players see each other’s balances" hint="Shows the live leaderboard" checked={rules.show_balances} onChange={rule('show_balances')} />
          <Toggle label="Players can request money" hint="Ask for rent with a Pay / Decline prompt" checked={rules.allow_requests} onChange={rule('allow_requests')} />
          <Toggle label="Allow negative balances" hint="Let players go into debt" checked={rules.allow_negative} onChange={rule('allow_negative')} />
          <Toggle label="Auto-approve Pass GO" hint="No need for the Banker to tap approve" checked={rules.auto_go} onChange={rule('auto_go')} />
        </Card>
        <p className="px-1 text-[13px] opacity-60">You can change all of this later from the Bank tab.</p>
      </div>
      <div className="sticky bottom-0 bg-paper pt-4 pb-2">
        <Button size="xl" variant="money" block disabled={busy} onClick={create}>
          {busy ? 'Opening the Bank…' : 'Create game'}
        </Button>
      </div>
    </div>
  )
}
