import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { unlockAudio } from './lib/sound'
import './index.css'

registerSW({ immediate: true })

// Browsers only allow audio after a user gesture.
window.addEventListener('pointerdown', unlockAudio, { once: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
