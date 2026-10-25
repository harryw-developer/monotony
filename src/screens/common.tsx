import type { ReactNode } from 'react'

export function TopBar({ title, onBack, right, dark }: { title: ReactNode; onBack?: () => void; right?: ReactNode; dark?: boolean }) {
  return (
    <div className="safe-top flex items-center gap-3 pb-4">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className={`brut-sm press font-display flex h-14 w-14 shrink-0 items-center justify-center text-2xl ${dark ? 'bg-vault-card text-paper' : 'bg-white'}`}
        >
          ←
        </button>
      )}
      <h1 className="font-display min-w-0 flex-1 truncate text-[32px] leading-none">{title}</h1>
      {right}
    </div>
  )
}
