import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../components/toast'
import { AnimatedMoney, Avatar, Button, Card, Chip, HoldButton, Keypad, Logo, SwipeToSend, SystemAvatar, Tile, Toggle } from '../components/ui'
import { AVATARS, COLOURS } from '../lib/avatars'
import { sfx } from '../lib/sound'
import { TopBar } from './common'

/** Phase 1 deliverable: every building block on one page. */
export default function Gallery() {
  const nav = useNavigate()
  const toast = useToast()
  const [amount, setAmount] = useState(200)
  const [bal, setBal] = useState(1500)
  const [on, setOn] = useState(true)
  return (
    <div className="mx-auto max-w-[480px] space-y-8 px-4 pb-16">
      <TopBar title="Gallery" onBack={() => nav('/')} />
      <Logo />
      <Section title="Colour">
        <div className="grid grid-cols-4 gap-2">
          {Object.entries({ ink: '#111111', paper: '#FFF8EC', money: '#00C26E', hot: '#FF3D7F', sun: '#FFD23F', sky: '#3DA5FF', grape: '#8B5CF6', vault: '#14121F' }).map(([t, hex]) => (
            <div key={t} className={`brut-sm flex h-16 items-end p-1.5 text-[13px] font-semibold ${t === 'ink' || t === 'vault' || t === 'grape' ? 'text-paper' : ''}`} style={{ background: hex }}>
              {t}
            </div>
          ))}
        </div>
      </Section>
      <Section title="Type">
        <p className="font-display tnum text-[96px] leading-none">M1,500</p>
        <p className="font-display text-[64px] leading-none">64 Display</p>
        <p className="font-display text-[32px]">32 Heading</p>
        <p className="text-xl font-semibold">20 Inter semibold</p>
        <p>16 Inter medium body</p>
        <p className="text-[13px]">13 caption</p>
      </Section>
      <Section title="Buttons">
        <Button size="xl" variant="money" block>Pay</Button>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="sky">Request</Button>
          <Button variant="sun">Pass GO</Button>
          <Button variant="hot">Decline</Button>
          <Button variant="grape">Bank</Button>
        </div>
        <HoldButton onConfirm={() => toast('Confirmed!', 'hot')}>Hold to confirm</HoldButton>
      </Section>
      <Section title="Avatars">
        <div className="flex flex-wrap gap-2">
          {AVATARS.map((a, i) => (
            <Avatar key={a.id} avatar={a.id} colour={COLOURS[i].id} size={56} />
          ))}
          <SystemAvatar kind="bank" />
          <SystemAvatar kind="parking" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Tile label="Alex" sub="M1,300"><Avatar avatar="car" colour="blue" size={64} /></Tile>
          <Tile label="Sam" sub="M900" selected><Avatar avatar="dog" colour="green" size={64} /></Tile>
          <Tile label="Bank"><SystemAvatar kind="bank" size={64} /></Tile>
        </div>
        <div className="flex flex-wrap gap-1">
          <Chip tone="grape">Banker</Chip><Chip tone="sky">🧊 Frozen</Chip><Chip tone="hot">🔒 Locked</Chip><Chip tone="hot">💀 Bankrupt</Chip>
        </div>
      </Section>
      <Section title="Balance">
        <Card className="p-4 text-center">
          <AnimatedMoney value={bal} currency="M" className="font-display block text-[64px] leading-none" />
        </Card>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="money" onClick={() => (setBal(bal + 200), sfx.cash())}>+200</Button>
          <Button variant="hot" onClick={() => (setBal(bal - 350), sfx.send())}>−350</Button>
        </div>
      </Section>
      <Section title="Keypad + swipe">
        <p className="font-display tnum text-center text-[56px]">M{amount.toLocaleString('en-GB')}</p>
        <Keypad value={amount} onChange={setAmount} />
        <SwipeToSend label={`Swipe to pay M${amount}`} onComplete={() => toast('Sent!', 'money')} />
      </Section>
      <Section title="Toggles + toasts">
        <Card className="px-4"><Toggle label="Free Parking pot" hint="Example toggle" checked={on} onChange={setOn} /></Card>
        <div className="grid grid-cols-3 gap-2">
          <Button size="sm" variant="money" onClick={() => toast('Alex paid you M200', 'money')}>Money</Button>
          <Button size="sm" variant="hot" onClick={() => toast('Not enough money', 'hot')}>Error</Button>
          <Button size="sm" variant="sky" onClick={() => toast('Sam wants M50', 'sky')}>Request</Button>
        </div>
      </Section>
      <div data-theme="vault" className="brut space-y-3 bg-vault p-4 text-paper">
        <p className="font-display text-2xl">Vault theme</p>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="vault">🧾 History</Button>
          <Button variant="money">💸 Pay out</Button>
        </div>
        <Keypad value={amount} onChange={setAmount} dark chips={false} />
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-2xl">{title}</h2>
      {children}
    </section>
  )
}
