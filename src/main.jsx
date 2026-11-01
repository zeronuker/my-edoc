import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import SendPage from './SendPage.jsx'

// ?send is the PC's half of Receive from PC (see SendPage.jsx); a query
// rather than a path, so no host rewrite rule is needed for it.
const isSendPage = new URLSearchParams(location.search).has('send')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isSendPage ? <SendPage /> : <App />}
  </StrictMode>,
)

// Service worker registration + update detection now lives in
// UpdatePrompt.jsx via vite-plugin-pwa's useRegisterSW hook, which is
// dev-mode-aware out of the box (no stale-cache-over-HMR issue to guard
// against by hand like the old sw.js needed).
