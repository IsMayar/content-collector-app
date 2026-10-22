import { Link } from 'react-router'
import type { ReactNode } from 'react'
export function PageHeader({
  title,
  description,
  breadcrumbs,
  action,
}: {
  title: string
  description?: string
  breadcrumbs?: { label: string; to?: string }[]
  action?: ReactNode
}) {
  return (
    <header className="page-heading">
      {breadcrumbs && (
        <nav aria-label="Breadcrumb">
          <ol>
            {breadcrumbs.map((item, index) => (
              <li key={item.label}>
                {item.to ? (
                  <Link to={item.to}>{item.label}</Link>
                ) : (
                  <span
                    aria-current={
                      index === breadcrumbs.length - 1 ? 'page' : undefined
                    }
                  >
                    {item.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="page-heading-row">
        <div>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {action}
      </div>
    </header>
  )
}
