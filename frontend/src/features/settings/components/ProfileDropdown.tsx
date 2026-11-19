import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import {
  Bell,
  Building2,
  ChevronDown,
  CreditCard,
  LogOut,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import './ProfileDropdown.css'

export function ProfileDropdown({
  name,
  email,
  base,
  onSignOut,
  owner = false,
}: {
  name: string
  email: string
  base?: string
  onSignOut: () => void
  owner?: boolean
}) {
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    function outside(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  const links = [
    ['account', 'My account', 'Profile, password and sessions', UserRound],
    ['notifications', 'Notifications', 'Daily email updates', Bell],
    ['workspace', 'Workspace settings', 'Name and timezone', Building2],
    ['billing', 'Billing & usage', 'Subscription, plans and usage', CreditCard],
    ['privacy', 'Privacy & data', 'Policies and data information', ShieldCheck],
  ] as const

  return (
    <div
      className="profile-dropdown"
      ref={container}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault()
          event.stopPropagation()
          setOpen(false)
          trigger.current?.focus()
        }
      }}
    >
      <button
        ref={trigger}
        className="profile-trigger"
        aria-expanded={open}
        aria-controls="profile-navigation"
        aria-label="Profile and settings"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="account-avatar" aria-hidden="true">
          {name
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part[0])
            .join('')
            .toUpperCase() || 'A'}
        </span>
        <span className="profile-trigger-name">{name}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="profile-popover" id="profile-navigation">
          <div className="profile-identity">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 font-semibold text-blue-700"
              aria-hidden="true"
            >
              {name
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0])
                .join('')
                .toUpperCase()}
            </span>
            <div className="min-w-0">
              <strong>{name}</strong>
              <p className="mt-0.5 break-all text-xs text-slate-500">{email}</p>
            </div>
          </div>
          {base && (
            <nav aria-label="Personal and workspace settings">
              {links
                .filter(
                  ([view]) => owner || !['workspace', 'billing'].includes(view),
                )
                .map(([view, label, , Icon]) => (
                  <Link
                    key={label}
                    className={
                      view === 'workspace' || view === 'privacy'
                        ? 'profile-group-start'
                        : undefined
                    }
                    aria-current={
                      location.pathname.endsWith('/settings') &&
                      (new URLSearchParams(location.search).get('view') ||
                        'account') === view
                        ? 'page'
                        : undefined
                    }
                    to={base + '/settings?view=' + view}
                    onClick={() => setOpen(false)}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span>
                      <strong>{label}</strong>
                    </span>
                  </Link>
                ))}
            </nav>
          )}
          <button
            className="profile-logout"
            onClick={() => {
              setOpen(false)
              onSignOut()
            }}
          >
            <LogOut size={18} aria-hidden="true" />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
