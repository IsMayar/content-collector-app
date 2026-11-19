import { forwardRef } from 'react'
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from 'react'
import type { LucideIcon } from 'lucide-react'
import './AccessUI.css'

/**
 * AccessUI — shared primitives for the project access surface.
 *
 * Every chrome decision (card, header, avatar, badge, button, input, focus
 * ring) is defined once here and in AccessUI.css. Panels compose these
 * instead of repeating utility strings. No `!important`, no duplicated
 * className soup.
 */

export type Tone = 'success' | 'danger' | 'warning' | 'neutral'

/* ----------------------------------------------------------------- card */

export function AccessCard({
  children,
  className = '',
  ...rest
}: { children: ReactNode; className?: string } & HTMLAttributes<HTMLElement>) {
  return (
    <section className={`au-card ${className}`} {...rest}>
      {children}
    </section>
  )
}

export function CardHeader({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon?: LucideIcon
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
}) {
  return (
    <header className="au-card-header">
      {Icon && (
        <span className="au-icon-tile" aria-hidden="true">
          <Icon size={18} />
        </span>
      )}
      <div className="au-card-titles">
        <h2 className="au-card-title">{title}</h2>
        {subtitle && <p className="au-card-subtitle">{subtitle}</p>}
      </div>
      {action && <div className="au-card-action">{action}</div>}
    </header>
  )
}

export function CardBody({
  children,
  className = '',
  ...rest
}: {
  children: ReactNode
  className?: string
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`au-card-body ${className}`} {...rest}>
      {children}
    </div>
  )
}

/* ----------------------------------------------------------- icon / avatar */

export function IconTile({
  icon: Icon,
  size = 18,
  large = false,
}: {
  icon: LucideIcon
  size?: number
  large?: boolean
}) {
  return (
    <span
      className={`au-icon-tile ${large ? 'au-icon-tile--lg' : ''}`}
      aria-hidden="true"
    >
      <Icon size={size} />
    </span>
  )
}

export function Avatar({
  initials,
  label,
}: {
  initials: string
  label?: string
}) {
  return (
    <span className="au-avatar" role="img" aria-label={label || initials}>
      {initials}
    </span>
  )
}

/* --------------------------------------------------------------- badge */

const TONE_CLASS: Record<Tone, string> = {
  success: 'au-badge--success',
  danger: 'au-badge--danger',
  warning: 'au-badge--warning',
  neutral: 'au-badge--neutral',
}

export function StatusBadge({
  tone = 'neutral',
  children,
}: {
  tone?: Tone
  children: ReactNode
}) {
  return <span className={`au-badge ${TONE_CLASS[tone]}`}>{children}</span>
}

/* --------------------------------------------------------------- buttons */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger-ghost'
type ButtonSize = 'md' | 'sm'

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'au-btn--primary',
  secondary: 'au-btn--secondary',
  ghost: 'au-btn--ghost',
  'danger-ghost': 'au-btn--danger-ghost',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  children,
  type = 'button',
  className = '',
  ...rest
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: LucideIcon
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={`au-btn ${VARIANT_CLASS[variant]} ${
        size === 'sm' ? 'au-btn--sm' : ''
      } ${className}`}
      {...rest}
    >
      {Icon && <Icon size={size === 'sm' ? 13 : 15} aria-hidden="true" />}
      {children}
    </button>
  )
}

export function IconButton({
  icon: Icon,
  label,
  tone = 'neutral',
  size = 'md',
  ...rest
}: {
  icon: LucideIcon
  label: string
  tone?: 'neutral' | 'danger'
  size?: 'sm' | 'md'
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`au-icon-btn au-icon-btn--${tone}`}
      {...rest}
    >
      <Icon size={size === 'sm' ? 14 : 16} aria-hidden="true" />
    </button>
  )
}

/* ------------------------------------------------------- field / input */

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: ReactNode
  htmlFor?: string
  hint?: ReactNode
  error?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="au-field">
      <label className="au-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && !error && <p className="au-field-hint">{hint}</p>}
      {error && (
        <p className="au-field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

type TextInputProps = {
  icon?: LucideIcon
  invalid?: boolean
  className?: string
} & InputHTMLAttributes<HTMLInputElement>

/** forwardRef so react-hook-form `register()` works when spread in. */
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  function TextInput(
    { icon: Icon, invalid = false, className = '', ...rest },
    ref,
  ) {
    if (Icon) {
      return (
        <span className="au-input-wrap">
          <Icon size={15} aria-hidden="true" />
          <input
            ref={ref}
            className={`au-input ${invalid ? 'au-input--invalid' : ''} ${className}`}
            {...rest}
          />
        </span>
      )
    }
    return (
      <input
        ref={ref}
        className={`au-input ${invalid ? 'au-input--invalid' : ''} ${className}`}
        {...rest}
      />
    )
  },
)

/* --------------------------------------------------------- callout / empty */

export function Callout({
  tone = 'neutral',
  icon: Icon,
  title,
  children,
}: {
  tone?: 'neutral' | 'warning'
  icon?: LucideIcon
  title?: ReactNode
  children: ReactNode
}) {
  return (
    <div
      className={`au-callout au-callout--${tone}`}
      role={tone === 'warning' ? 'status' : undefined}
    >
      {Icon && (
        <Icon size={16} className="au-callout-icon" aria-hidden="true" />
      )}
      <div>
        {title && <p className="au-callout-title">{title}</p>}
        {children && <div className="au-callout-body">{children}</div>}
      </div>
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon?: LucideIcon
  title: ReactNode
  description?: ReactNode
}) {
  return (
    <div className="au-empty">
      {Icon && <Icon size={28} className="au-empty-icon" aria-hidden="true" />}
      <p className="au-empty-title">{title}</p>
      {description && <p className="au-empty-sub">{description}</p>}
    </div>
  )
}

/* --------------------------------------------------------------- skeleton */

export function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`au-skeleton ${className}`} aria-hidden="true" />
}

/* ----------------------------------------------------------- small helpers */

export function initialsFrom(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  )
}
