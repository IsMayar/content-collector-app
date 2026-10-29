import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'

export function Modal({
  title,
  children,
  onClose,
  drawer = false,
  pending = false,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  drawer?: boolean
  pending?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const el = ref.current
    const previous = document.activeElement as HTMLElement | null
    el?.showModal()
    return () => {
      el?.close()
      previous?.focus()
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className={drawer ? 'board-modal board-drawer' : 'board-modal'}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault()
        if (!pending) onClose()
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Tab') return
        const nodes = Array.from(
          e.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]',
          ),
        ).filter((n) => n.getClientRects().length)
        const first = nodes[0],
          last = nodes.at(-1)
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first?.focus()
        }
      }}
    >
      <header className="board-modal-header">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label={`Close ${title}`}
          onClick={onClose}
          disabled={pending}
        >
          <X size={20} />
        </button>
      </header>
      <div className="board-modal-body">{children}</div>
    </dialog>
  )
}
