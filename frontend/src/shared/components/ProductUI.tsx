import type { Progress } from '@/features/projects/types/project.types'
import { Notice, StatePanel } from '@/shared/components/Feedback'
import { errorMessage } from '@/shared/utils/apiError'
import { percent } from '@/shared/utils/domain'
import type { ReactElement, ReactNode } from 'react'
import { cloneElement, useId } from 'react'
import { Link } from 'react-router'
import { FolderOpen } from 'lucide-react'

export function Heading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string
  title: string
  description?: string
  children?: ReactNode
}) {
  return (
    <div className="product-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="subtle">{description}</p>}
      </div>
      <div className="actions">{children}</div>
    </div>
  )
}
export function Panel({
  title,
  children,
  action,
}: {
  title?: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section className="product-panel">
      {title && (
        <header className="panel-heading">
          <h2>{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}
export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className={`status-badge status-${String(children).toLowerCase()}`}>
      {String(children).replaceAll('_', ' ')}
    </span>
  )
}
export function DualProgress({ progress: p }: { progress: Progress }) {
  return (
    <div className="dual-progress">
      {[
        ['Submitted', p.submittedRequired],
        ['Approved', p.approvedRequired],
      ].map(([label, count]) => (
        <div key={label}>
          <div className="progress-label">
            <span>{label}</span>
            <strong>
              {count} / {p.requiredTotal}
            </strong>
          </div>
          <progress
            aria-label={`${label} required items`}
            value={Number(count)}
            max={p.requiredTotal || 1}
          />
          <span className="sr-only">
            {percent(Number(count), p.requiredTotal)}%
          </span>
        </div>
      ))}
    </div>
  )
}
export function QueryState({
  query,
  children,
}: {
  query: {
    isLoading: boolean
    isError: boolean
    error?: unknown
    refetch: () => unknown
  }
  children: ReactNode
}) {
  if (query.isLoading)
    return (
      <StatePanel
        kind="loading"
        title="Loading your workspace"
        description="Bringing the latest details together."
      />
    )
  if (query.isError)
    return (
      <StatePanel
        kind="error"
        title="Couldn’t load this view"
        description={errorMessage(query.error)}
        action={
          <button className="secondary-button" onClick={() => query.refetch()}>
            Try again
          </button>
        }
      />
    )
  return <>{children}</>
}
export function ErrorNotice({ error }: { error?: string }) {
  return error ? <Notice error>{error}</Notice> : null
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  const id = useId()
  return (
    <div className="product-field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(
        children as ReactElement<{ id: string; 'aria-describedby'?: string }>,
        { id, 'aria-describedby': hint ? `${id}-hint` : undefined },
      )}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  )
}
export function Empty({
  title,
  description,
  to,
  label,
}: {
  title: string
  description: string
  to?: string
  label?: string
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white px-5 py-9 text-center shadow-sm sm:px-8">
      <span
        className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600"
        aria-hidden="true"
      >
        <FolderOpen size={24} />
      </span>
      <h2 className="mt-4 text-lg font-semibold tracking-tight text-[#0A1A2F]">
        {title}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
        {description}
      </p>
      {to && (
        <Link
          className="mt-5 inline-flex min-h-10 items-center justify-center rounded-lg bg-[#2563EB] px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          to={to}
        >
          {label || 'Continue'}
        </Link>
      )}
    </section>
  )
}: {
  title: string
  description: string
  to?: string
  label?: string
}) {
  return (
    <div className="product-empty">
      <span className="empty-symbol" aria-hidden="true">
        ◇
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {to && (
        <Link className="primary-button" to={to}>
          {label}
        </Link>
      )}
    </div>
  )
}
