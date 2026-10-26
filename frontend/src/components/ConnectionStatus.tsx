import { useEffect, useState } from 'react'
import { WifiOff, Smartphone, X } from 'lucide-react'
type InstallEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: string }>
}
export function ConnectionStatus() {
  const [online, setOnline] = useState(navigator.onLine),
    [install, setInstall] = useState<InstallEvent | null>(null)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine),
      available = (e: Event) => {
        e.preventDefault()
        setInstall(e as InstallEvent)
      }
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    window.addEventListener('beforeinstallprompt', available)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
      window.removeEventListener('beforeinstallprompt', available)
    }
  }, [])
  return (
    <>
      {!online && (
        <div role="alert" className="connection-notice">
          <WifiOff size={24} />
          <div>
            <strong>You’re offline — saves are paused</strong>
            <p>
              You can keep working in this tab. Changes cannot be sent until
              you’re back online.
            </p>
          </div>
          <button
            className="secondary-button"
            onClick={() => setOnline(navigator.onLine)}
          >
            Retry connection
          </button>
        </div>
      )}
      {install && (
        <aside className="install-prompt" aria-label="Install application">
          <Smartphone />
          <div>
            <strong>Install Content Collector</strong>
            <p>
              Get quick access from your device. Private content still requires
              a connection.
            </p>
          </div>
          <button
            className="primary-button"
            onClick={() =>
              void (async () => {
                await install.prompt()
                await install.userChoice
                setInstall(null)
              })()
            }
          >
            Install app
          </button>
          <button
            className="icon-button"
            aria-label="Not now"
            onClick={() => setInstall(null)}
          >
            <X size={16} />
          </button>
        </aside>
      )}
    </>
  )
}
