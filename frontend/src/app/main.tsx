import { App } from '@/app/App'
import { env } from '@/config/env'
import '@/styles/globals.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

async function start() {
  if (env.production && 'serviceWorker' in navigator)
    void navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .catch(() => {})
  if (env.mocksEnabled) {
    const { worker } = await import('@/mocks/browser')
    await worker.start({
      quiet: true,
      onUnhandledRequest(request, print) {
        if (new URL(request.url).pathname.startsWith('/api/')) print.error()
      },
    })
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
void start().catch(() => {
  document.getElementById('root')!.textContent =
    'The application could not start. Check your connection and refresh.'
})
