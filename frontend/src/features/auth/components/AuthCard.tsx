import type { ReactNode } from 'react'

export function AuthHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <header className="auth-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  )
}
export function AuthCard({ children }: { children: ReactNode }) {
  return <div className="auth-card">{children}</div>
}
