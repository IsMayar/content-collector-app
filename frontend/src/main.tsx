import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppProviders } from '@/app/providers'
import '@/styles/index.css'
import '@/styles/refresh.css'
import '@/styles/reference.css'

async function start() {
  if (import.meta.env.PROD && 'serviceWorker' in navigator)
    void navigator.serviceWorker.register('/sw.js').catch(() => {})
  if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCKS === 'true') {
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
      <AppProviders />
    </StrictMode>,
  )
}
void start().catch(() => {
  document.getElementById('root')!.textContent =
    'The application could not start. Check your connection and refresh.'
})
import '@/styles/collection.css'
