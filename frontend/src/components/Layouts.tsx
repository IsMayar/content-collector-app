import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { ConfirmDialog, Notice, useNotify } from './Feedback'
import { logoutSession, selectWorkspace } from '@/features/auth/session'
import { errorMessage } from '@/lib/apiError'
import {
  FolderKanban,
  LayoutDashboard,
  Layers,
  Users,
  ChartNoAxesCombined,
  Settings,
  CreditCard,
} from 'lucide-react'

export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="Website Content Collector home">
      <span className="brand-mark" aria-hidden="true">
        W
      </span>
      <span>
        Website Content
        <br className="brand-break" /> Collector
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
            <NavLink to="/pricing">Pricing</NavLink>
            <NavLink to="/about">About</NavLink>
            <Link
              className="secondary-button"
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
        AYAANTRIX Technologies · Built for a clearer handoff
      </footer>
    </>
  )
}
export function AuthLayout() {
  return (
    <div className="auth-layout">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="auth-story">
        <Brand />
        <div className="story-copy">
          <p className="eyebrow">A better beginning</p>
          <h2>
            Less chasing.
            <br />
            More creating.
          </h2>
          <p>
            A thoughtful space for the content, conversations and details that
            make your next project possible.
          </p>
          <div className="story-card">
            <span className="story-step">01</span>
            <div>
              <strong>Bring the right details together</strong>
              <p>From the first idea to the final handoff.</p>
            </div>
            <span aria-hidden="true">↗</span>
          </div>
        </div>
        <p className="story-footer">
          Websites · Web applications · Mobile applications
        </p>
      </aside>
      <div className="auth-main">
        <header className="auth-top">
          <Link to="/">← Back to home</Link>
          <span>Website Content Collector</span>
        </header>
        <main id="main-content" tabIndex={-1} className="auth-content">
          <Outlet />
        </main>
        <footer className="auth-footer">
          Your agency account. Your clients’ next great project.
        </footer>
      </div>
    </div>
  )
}
export function AgencyLayout() {
  const state = useAppSelector((s) => s.auth)
  const { workspaceId } = useParams()
  const membership = state.memberships.find(
    (m) => m.workspaceId === (workspaceId || state.workspaceId),
  )
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const notify = useNotify()
  const [confirm, setConfirm] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const home = membership ? `/app/w/${membership.workspaceId}/overview` : '/app'
  const navigation = (
    <>
      <NavLink end to={home}>
        <LayoutDashboard size={18} /> <span>Workspace home</span>
      </NavLink>
      {membership?.role === 'OWNER' && (
        <NavLink to={`/app/w/${membership.workspaceId}/access-foundation`}>
          ⌘ <span>Owner access</span>
        </NavLink>
      )}
      {membership && (
        <>
          <span className="nav-section-label">COLLECT & CREATE</span>
          <NavLink to={`/app/w/${membership.workspaceId}/projects`}>
            <FolderKanban size={18} />
            <span>Projects</span>
          </NavLink>
          <NavLink to={`/app/w/${membership.workspaceId}/templates`}>
            <Layers size={18} />
            <span>Template gallery</span>
          </NavLink>
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
              <NavLink to={`/app/w/${membership.workspaceId}/billing`}>
                <CreditCard size={18} />
                <span>Billing & usage</span>
              </NavLink>
              <NavLink to={`/app/w/${membership.workspaceId}/settings`}>
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
  return (
    <div className="agency-layout">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="agency-sidebar">
        <Brand />
        <div className="sidebar-caption">YOUR WORKSPACE</div>
        <nav aria-label="Workspace navigation" className="sidebar-nav">
          {navigation}
        </nav>
        <div className="sidebar-foot">
          A clearer path from
          <br />
          first brief to final handoff.
        </div>
      </aside>
      <div className="agency-main">
        <header className="agency-top">
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
                  {m.workspaceName}
                </option>
              ))}
            </select>
          </div>
          <div className="account-menu">
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
              className="secondary-button"
              onClick={() => setConfirm(true)}
            >
              Sign out
            </button>
          </div>
        </header>
        <details className="mobile-navigation">
          <summary>Workspace menu</summary>
          <nav aria-label="Mobile workspace navigation">{navigation}</nav>
        </details>
        <main id="main-content" tabIndex={-1} className="agency-content">
          {error && <Notice error>{error}</Notice>}
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
