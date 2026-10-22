import { createContext, useContext, useRef, useState, useEffect, type ReactNode } from 'react'
import { Button } from '@heroui/react'

export function MockIndicator() {
  return import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCKS === 'true'
    ? <aside className="mock-indicator" aria-label="Development environment">Development demo · Synthetic data · No emails are sent</aside> : null
}

export function StatePanel({ kind, title, description, action }: { kind: 'loading' | 'empty' | 'error' | 'success'; title: string; description?: string; action?: ReactNode }) {
  return <section className={`state-panel state-${kind}`} aria-busy={kind === 'loading'}>
    <div className="state-symbol" aria-hidden="true">{kind === 'loading' ? '⋯' : kind === 'success' ? '✓' : kind === 'error' ? '!' : '◇'}</div>
    <h2>{title}</h2>{description && <p>{description}</p>}{action && <div className="mt-6">{action}</div>}
  </section>
}
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div className={`notice ${error ? 'notice-error' : ''}`} role={error ? 'alert' : 'status'}>{children}</div>
}
const NotificationContext = createContext<(message: string) => void>(() => {})
export function Notifications({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('')
  return <NotificationContext.Provider value={setMessage}>{children}<div className="notification-region" aria-live="polite" aria-atomic="true">{message && <div className="notification">{message}<button aria-label="Dismiss notification" onClick={() => setMessage('')}>×</button></div>}</div></NotificationContext.Provider>
}
export const useNotify = () => useContext(NotificationContext)

export function ConfirmDialog({ open, title, description, confirmLabel, pending, onCancel, onConfirm }: { open: boolean; title: string; description: string; confirmLabel: string; pending?: boolean; onCancel: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { if (open && !dialog.current?.open) dialog.current?.showModal(); else if (!open) dialog.current?.close() }, [open])
  return <dialog ref={dialog} aria-labelledby="confirmation-title" aria-describedby="confirmation-description" onCancel={event => { event.preventDefault(); if (!pending) onCancel() }}>
    <h2 id="confirmation-title">{title}</h2><p id="confirmation-description">{description}</p>
    <div className="dialog-actions"><button className="secondary-button" disabled={pending} onClick={onCancel} autoFocus>Cancel</button><Button isDisabled={pending} onPress={onConfirm}>{pending ? 'Please wait…' : confirmLabel}</Button></div>
  </dialog>
}
