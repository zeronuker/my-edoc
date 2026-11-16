import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './oxygen.css' // after App so it loads after App.css
import { installKeyboardArea } from './keyboardArea'
import { installRipple } from './ripple.js'

installKeyboardArea()
installRipple()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Service worker registration + update detection now lives in
// UpdatePrompt.jsx via vite-plugin-pwa's useRegisterSW hook, which is
// dev-mode-aware out of the box (no stale-cache-over-HMR issue to guard
// against by hand like the old sw.js needed).
