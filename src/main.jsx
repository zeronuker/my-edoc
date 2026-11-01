import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Service worker registration + update detection now lives in
// UpdatePrompt.jsx via vite-plugin-pwa's useRegisterSW hook, which is
// dev-mode-aware out of the box (no stale-cache-over-HMR issue to guard
// against by hand like the old sw.js needed).
