import { useEffect, useRef, useState } from 'react'
import { UnauthorizedPage } from '@/features/foundation/AgencyFoundation'
import {
  Link,
  NavLink,
  Outlet,
  useNavigate,
  useParams,
  useLocation,
} from 'react-router'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { ConfirmDialog, Notice, useNotify } from './Feedback'
import { logoutSession, selectWorkspace } from '@/features/auth/session'
import { errorMessage } from '@/lib/apiError'
import { useData } from '@/api/productApi'
import type { WorkspaceDetail } from '@/api/productTypes'
import {
  FolderKanban,
  LayoutDashboard,
  Layers,
  Users,
  ChartNoAxesCombined,
  Settings,
} from 'lucide-react'

export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="Website Content Collector home">
      <span className="brand-mark" aria-hidden="true">
        C
      </span>
      <span className="brand-copy">
        <strong>Content Collector</strong>
        <small>BY AYAANTRIX</small>
      </span>
    </Link>
  )
}
export function PublicLayout() {
  const authenticated = useAppSelector((s) => s.auth.status === 'authenticated')
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Brand />
          <nav aria-label="Main navigation" className="public-nav">
            <Link to="/">Product</Link>
            <NavLink to="/about">How it works</NavLink>
            <NavLink to="/pricing">Pricing</NavLink>
            <Link
              className="secondary-button public-sign-in"
              to={authenticated ? '/app' : '/sign-in'}
            >
              {authenticated ? 'Open workspace' : 'Sign in'}
            </Link>
          </nav>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="page-container">
        <Outlet />
      </main>
      <footer className="page-container footer">
        © 2026 Content Collector by AYAANTRIX{' '}
        <nav aria-label="Legal navigation">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/about">Help</Link>
        </nav>
      </footer>
    </>
  )
}
export function AuthLayout() {
  const { pathname } = useLocation()
  const signup = pathname === '/sign-up'
  const story = signup
    ? {
        title: 'Welcome back!',
        description:
          'Your clients, content and projects are waiting. Sign in and pick up where you left off.',
        to: '/sign-in',
        action: 'Sign in',
      }
    : pathname === '/sign-in'
      ? {
          title: 'Hello, friend!',
          description:
            'Bring your team and your clients together. Create a workspace and make room for your next great project.',
          to: '/sign-up',
          action: 'Create account',
        }
      : {
          title: 'A fresh start.',
          description:
            'Keep your workspace secure and your projects moving. We’ll help you get back to your content.',
          to: '/sign-in',
          action: 'Back to sign in',
        }
  return (
    <div className="auth-layout auth-refresh">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="auth-main">
        <aside className="auth-story" aria-label="About Content Collector">
          <Brand />
          <div className="story-copy">
            <span className="auth-side-eyebrow">Content Collector</span>
            <h2>{story.title}</h2>
            <p>{story.description}</p>
            <Link className="auth-side-action" to={story.to}>
              {story.action}
            </Link>
          </div>
          <span className="auth-decoration auth-circle" aria-hidden="true" />
          <span className="auth-decoration auth-diamond" aria-hidden="true" />
        </aside>
        <main id="main-content" tabIndex={-1} className="auth-content">
          <Outlet />
          <nav className="auth-help-nav" aria-label="Help and navigation">
            <Link to="/about">Help</Link>
            <Link to="/">Home</Link>
          </nav>
        </main>
      </div>
      <footer className="auth-footer">
        <span>Content Collector by AYAANTRIX</span>
        <nav aria-label="Legal navigation">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </nav>
      </footer>
    </div>
  )
}
export function AgencyLayout() {
  const { pathname } = useLocation()
  const state = useAppSelector((s) => s.auth)
  const { workspaceId } = useParams()
  const membership = state.memberships.find(
    (m) => m.workspaceId === (workspaceId || state.workspaceId),
  )
  const dispatch = useAppDispatch()
  const routeWorkspace =
    workspaceId && membership ? membership.workspaceId : null
  useEffect(() => {
    if (routeWorkspace && routeWorkspace !== state.workspaceId)
      dispatch(selectWorkspace(routeWorkspace))
  }, [dispatch, routeWorkspace, state.workspaceId])
  const navigate = useNavigate()
  const notify = useNotify()
  const [confirm, setConfirm] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const mobileNavigation = useRef<HTMLDetailsElement>(null)
  const home = membership ? `/app/w/${membership.workspaceId}/overview` : '/app'
  const workspace = useData<WorkspaceDetail>(
    membership ? `workspaces/${membership.workspaceId}` : '',
  )
  const navigation = (
    <>
      <NavLink end to={home}>
        <LayoutDashboard size={18} /> <span>Overview</span>
      </NavLink>
      {membership && (
        <>
          <span className="nav-section-label">COLLECT & CREATE</span>
          <NavLink to={`/app/w/${membership.workspaceId}/projects`}>
            <FolderKanban size={18} />
            <span>Projects</span>
          </NavLink>
          <NavLink to={`/app/w/${membership.workspaceId}/templates`}>
            <Layers size={18} />
            <span>Templates</span>
          </NavLink>
          {membership.role !== 'OWNER' && (
            <NavLink
              to={`/app/w/${membership.workspaceId}/settings?view=account`}
            >
              <Settings size={18} />
              <span>My account</span>
            </NavLink>
          )}
          {membership.role === 'OWNER' && (
            <>
              <span className="nav-section-label">MANAGE</span>
              <NavLink to={`/app/w/${membership.workspaceId}/team`}>
                <Users size={18} />
                <span>Team</span>
              </NavLink>
              <NavLink to={`/app/w/${membership.workspaceId}/insights`}>
                <ChartNoAxesCombined size={18} />
                <span>Insights</span>
              </NavLink>
              <NavLink
                to={`/app/w/${membership.workspaceId}/settings`}
                className={({ isActive }) =>
                  isActive ||
                  pathname === `/app/w/${membership.workspaceId}/billing`
                    ? 'active'
                    : undefined
                }
                aria-current={
                  pathname === `/app/w/${membership.workspaceId}/billing`
                    ? 'page'
                    : undefined
                }
              >
                <Settings size={18} />
                <span>Settings</span>
              </NavLink>
            </>
          )}
        </>
      )}
    </>
  )
  async function logout() {
    setPending(true)
    setError('')
    try {
      await dispatch(logoutSession())
      setConfirm(false)
      notify('You have signed out.')
      navigate('/sign-in', { replace: true })
    } catch (cause) {
      setError(errorMessage(cause))
      setConfirm(false)
    } finally {
      setPending(false)
    }
  }
  if (workspaceId && !membership) return <UnauthorizedPage />
  return (
    <div className="agency-layout">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="agency-top">
        <Brand />
        <div className="workspace-picker">
          <label htmlFor="workspace-picker">Workspace</label>
          <select
            id="workspace-picker"
            value={membership?.workspaceId || ''}
            onChange={(event) => {
              dispatch(selectWorkspace(event.target.value))
              navigate(`/app/w/${event.target.value}/overview`)
              notify('Workspace changed.')
            }}
          >
            {!state.memberships.length && (
              <option value="">No workspace yet</option>
            )}
            {state.memberships.map((m) => (
              <option key={m.memberId} value={m.workspaceId}>
                {m.workspaceId === workspace.data?.workspace.id
                  ? workspace.data.workspace.name
                  : m.workspaceName}
              </option>
            ))}
          </select>
        </div>
        <div className="agency-tools">
          <Link className="help-link" to="/about">
            Help
          </Link>
          <div className="account-menu">
            <span className="account-avatar" aria-hidden="true">
              {state.user?.displayName?.slice(0, 1).toUpperCase() || 'A'}
            </span>
            <div>
              <strong>{state.user?.displayName}</strong>
              <span>
                {membership?.role === 'OWNER'
                  ? 'Workspace owner'
                  : membership
                    ? 'Team member'
                    : 'Agency account'}
              </span>
            </div>
            <button
              className="account-signout"
              onClick={() => setConfirm(true)}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <aside className="agency-sidebar">
        <nav aria-label="Workspace navigation" className="sidebar-nav">
          {navigation}
        </nav>
      </aside>
      <div className="agency-main">
        <details ref={mobileNavigation} className="mobile-navigation">
          <summary>Workspace menu</summary>
          <nav
            aria-label="Mobile workspace navigation"
            onClick={(event) => {
              if (
                (event.target as HTMLElement).closest('a') &&
                mobileNavigation.current
              )
                mobileNavigation.current.open = false
            }}
          >
            {navigation}
          </nav>
        </details>
        <main id="main-content" tabIndex={-1} className="agency-content">
          {error && <Notice error>{error}</Notice>}
          {workspace.data && !workspace.data.entitlements.canWrite && (
            <Notice>
              This workspace is read-only. Reading and permitted exports remain
              available. Contact the owner to restore editing.
            </Notice>
          )}
          <Outlet />
        </main>
        <footer className="agency-footer">
          Website Content Collector <span>Frontend preview</span>
        </footer>
      </div>
      <ConfirmDialog
        open={confirm}
        pending={pending}
        title="Sign out of your account?"
        description="You’ll need to sign in again to open your agency workspace."
        confirmLabel="Sign out"
        onCancel={() => setConfirm(false)}
        onConfirm={() => void logout()}
      />
    </div>
  )
}
export function ClientLayout() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Brand />
          <span className="subtle">Private project access</span>
        </div>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="page-container client-container"
      >
        <Outlet />
      </main>
      <footer className="page-container footer">
        A dedicated space for your project materials.
      </footer>
    </>
  )
}
