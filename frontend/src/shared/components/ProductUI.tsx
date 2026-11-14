import type { Progress } from '@/features/projects/types/project.types'
import { Notice, StatePanel } from '@/shared/components/Feedback'
import { errorMessage } from '@/shared/utils/apiError'
import { percent } from '@/shared/utils/domain'
import type { ReactElement, ReactNode } from 'react'
import { cloneElement, useId } from 'react'
import { Link } from 'react-router'

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
