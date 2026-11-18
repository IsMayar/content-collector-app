import { env } from '@/config/env'
import { Button } from '@heroui/react'
import {
  CircleCheck,
  FolderOpen,
  LoaderCircle,
  TriangleAlert,
} from 'lucide-react'
import type { ReactNode } from 'react'
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'

export function MockIndicator() {
  return env.mocksEnabled ? (
    <aside className="mock-indicator" aria-label="Development environment">
      Development demo · Synthetic data · No emails are sent
    </aside>
  ) : null
}
export function StatePanel({
  kind,
  title,
  description,
  action,
}: {
  kind: 'loading' | 'empty' | 'error' | 'success'
  title: string
  description?: string
  action?: ReactNode
}) {
  const tone =
    kind === 'error'
      ? 'bg-amber-50 text-amber-700'
      : kind === 'success'
        ? 'bg-emerald-50 text-emerald-700'
        : 'bg-blue-50 text-blue-600'

  return (
    <section
      className="mx-auto my-8 w-full max-w-xl rounded-2xl border border-slate-200 bg-white px-5 py-9 text-center shadow-sm sm:px-9 sm:py-11"
      aria-busy={kind === 'loading'}
      role={kind === 'error' ? 'alert' : 'status'}
    >
      <div
        className={
          'mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl ' +
          tone
        }
        aria-hidden="true"
      >
        {kind === 'loading' ? (
          <LoaderCircle className="animate-spin" size={27} />
        ) : kind === 'success' ? (
          <CircleCheck size={27} />
        ) : kind === 'error' ? (
          <TriangleAlert size={27} />
        ) : (
          <FolderOpen size={27} />
        )}
      </div>
      <h2 className="text-xl font-semibold tracking-tight text-[#0A1A2F]">
        {title}
      </h2>
      {description && (
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
          {description}
        </p>
      )}
      {kind === 'loading' && (
        <div
          className="mx-auto mt-6 flex max-w-xs flex-col gap-2"
          aria-hidden="true"
        >
          <span className="h-2 animate-pulse rounded-full bg-slate-100" />
          <span className="mx-auto h-2 w-2/3 animate-pulse rounded-full bg-slate-100" />
        </div>
      )}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </section>
  )
}

export function Notice({
  children,
  error = false,
}: {
  children: ReactNode
  error?: boolean
}) {
  return (
    <div
      className={`notice ${error ? 'notice-error' : ''}`}
      role={error ? 'alert' : 'status'}
    >
      {children}
    </div>
  )
}
const NotificationContext = createContext<(message: string) => void>(() => {})
export function Notifications({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(''), 6000)
    return () => clearTimeout(timer)
  }, [message])
  return (
    <NotificationContext.Provider value={setMessage}>
      {children}
      <div
        className="notification-region"
        aria-live="polite"
        aria-atomic="true"
      >
        {message && (
          <div className="notification">
            <span>{message}</span>
            <button
              aria-label="Dismiss notification"
              onClick={() => setMessage('')}
            >
              ×
            </button>
          </div>
        )}
      </div>
    </NotificationContext.Provider>
  )
}
export const useNotify = () => useContext(NotificationContext)
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  pending,
  onCancel,
  onConfirm,
}: {
  open: boolean
  title: string
  description: ReactNode
  confirmLabel: string
  pending?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId(),
    descriptionId = useId()
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal()
    else if (!open) dialog.current?.close()
  }, [open])
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault()
        if (!pending) onCancel()
      }}
    >
      <h2 id={titleId}>{title}</h2>
      <div id={descriptionId}>{description}</div>
      <div className="dialog-actions">
        <button
          className="secondary-button"
          disabled={pending}
          onClick={onCancel}
          autoFocus
        >
          Cancel
        </button>
        <Button isDisabled={pending} onPress={onConfirm}>
          {pending ? 'Please wait…' : confirmLabel}
        </Button>
      </div>
    </dialog>
  )
}
