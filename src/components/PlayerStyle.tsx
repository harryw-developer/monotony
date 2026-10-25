import { AVATARS, COLOURS } from '../lib/avatars'
import { sfx } from '../lib/sound'
import { Avatar } from './ui'

/** Avatar grid + colour row used when joining and by the Banker's restyle control. */
export function PlayerStyle({
  avatar, colour, onAvatar, onColour, takenColours = [], takenAvatars = [], dark,
}: {
  avatar: string; colour: string; onAvatar: (a: string) => void; onColour: (c: string) => void
  takenColours?: string[]; takenAvatars?: string[]; dark?: boolean
}) {
  return (
    <div className="space-y-4">
      <div>
        <span className="mb-1.5 block text-[13px] font-semibold tracking-wide uppercase opacity-70">Avatar</span>
        <div className="grid grid-cols-4 gap-2.5">
          {AVATARS.map((a) => (
            <button
              key={a.id}
              type="button"
              aria-label={a.label}
              aria-pressed={avatar === a.id}
              onClick={() => {
                sfx.tap()
                onAvatar(a.id)
              }}
              className={`brut-sm press relative flex aspect-square items-center justify-center ${avatar === a.id ? 'bg-sun' : dark ? 'bg-vault-card' : 'bg-white'}`}
            >
              <Avatar avatar={a.id} colour={colour} size={52} dim={takenAvatars.includes(a.id) && avatar !== a.id} />
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="mb-1.5 block text-[13px] font-semibold tracking-wide uppercase opacity-70">Colour</span>
        <div className="grid grid-cols-4 gap-2.5">
          {COLOURS.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-label={c.id}
              aria-pressed={colour === c.id}
              onClick={() => {
                sfx.tap()
                onColour(c.id)
              }}
              className="press relative h-14 rounded-full border-[3px]"
              style={{
                background: c.hex,
                borderColor: 'var(--edge)',
                boxShadow: colour === c.id ? '0 0 0 3px var(--color-paper), 0 0 0 6px var(--edge)' : '2px 2px 0 var(--shade)',
                opacity: takenColours.includes(c.id) && colour !== c.id ? 0.35 : 1,
              }}
            >
              {colour === c.id && <span className="font-display text-lg text-ink">✓</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function firstFree<T extends { id: string }>(list: readonly T[], taken: string[]) {
  return (list.find((x) => !taken.includes(x.id)) ?? list[Math.floor(Math.random() * list.length)]).id
}
