import { useEffect, useState } from 'react'
export function ConnectionStatus() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online ? null : (
    <div role="alert" className="connection-notice">
      You’re offline. Keep this tab open to retain unsaved input. Saving and
      uploads resume only when connected; private content is never cached.
    </div>
  )
}
