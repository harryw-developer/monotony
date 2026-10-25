export const AVATARS = [
  { id: 'tophat', emoji: '🎩', label: 'Top hat' },
  { id: 'car', emoji: '🚗', label: 'Car' },
  { id: 'dog', emoji: '🐶', label: 'Dog' },
  { id: 'boat', emoji: '⛵', label: 'Boat' },
  { id: 'boot', emoji: '👢', label: 'Boot' },
  { id: 'cat', emoji: '🐱', label: 'Cat' },
  { id: 'duck', emoji: '🦆', label: 'Duck' },
  { id: 'dino', emoji: '🦖', label: 'Dinosaur' },
] as const

export const COLOURS = [
  { id: 'red', hex: '#FF4D4D' },
  { id: 'orange', hex: '#FF9F1C' },
  { id: 'yellow', hex: '#FFD23F' },
  { id: 'green', hex: '#2ECC71' },
  { id: 'teal', hex: '#1ABC9C' },
  { id: 'blue', hex: '#3DA5FF' },
  { id: 'purple', hex: '#8B5CF6' },
  { id: 'pink', hex: '#FF6FB5' },
] as const

export const emojiFor = (id: string) => AVATARS.find((a) => a.id === id)?.emoji ?? '🙂'
export const hexFor = (id: string) => COLOURS.find((c) => c.id === id)?.hex ?? '#FFD23F'

export const TONE_HEX: Record<string, string> = {
  money: '#00C26E',
  hot: '#FF3D7F',
  sun: '#FFD23F',
  sky: '#3DA5FF',
  grape: '#8B5CF6',
  ink: '#111111',
}
