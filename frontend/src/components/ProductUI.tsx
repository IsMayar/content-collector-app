import {
  cloneElement,
  useId,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { Link, useParams } from 'react-router'
import { useAppSelector } from '@/app/hooks'
import { workspaceApi, portalApi } from '@/api/productApi'
import { errorMessage } from '@/lib/apiError'
import type { Progress } from '@/api/contracts'
import { percent } from '@/lib/domain'
import { Notice, StatePanel } from './Feedback'

export function useWorkspace() {
  const { workspaceId } = useParams()
  const auth = useAppSelector((s) => s.auth)
  const id = workspaceId || auth.workspaceId || ''
  return {
    id,
    base: `/app/w/${id}`,
    owner: auth.memberships.some(
      (m) => m.workspaceId === id && m.role === 'OWNER',
    ),
    user: auth.user,
  }
}
export function useCommand(client = false) {
  const [agency, a] = workspaceApi.useCommandMutation()
  const [portal, p] = portalApi.usePortalCommandMutation()
  const [error, setError] = useState('')
  async function run<T = Record<string, unknown>>(
    url: string,
    body?: unknown,
    method = 'POST',
  ): Promise<T | undefined> {
    setError('')
    try {
      return (await (client ? portal : agency)({
        url,
        method,
        body,
      }).unwrap()) as T
    } catch (e) {
      setError(errorMessage(e))
      return undefined
    }
  }
  return {
    run,
    error,
    pending: a.isLoading || p.isLoading,
    clear: () => setError(''),
  }
}
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
  query: { isLoading: boolean; isError: boolean; refetch: () => unknown }
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
        description="Check your connection and try again."
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
export const projectTypes = [
  { value: 'WEBSITE', label: 'Website' },
  { value: 'WEB_APP', label: 'Web app' },
  { value: 'MOBILE_APP', label: 'Mobile app' },
]
export const fieldTypes = [
  'SHORT_TEXT',
  'LONG_TEXT',
  'URL',
  'SINGLE_SELECT',
  'MULTI_SELECT',
  'IMAGE',
  'FILE',
  'REPEATER',
] as const
