import { useState } from 'react'
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
  CreditCard,
  FileText,
  LockKeyhole,
  MailCheck,
  ShieldCheck,
  UserPlus,
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
  const stories: Record<
    string,
    {
      Icon: typeof FileText
      title: string
      description: string
      tips: string[]
    }
  > = {
    '/sign-in': {
      Icon: FileText,
      title: 'Your content, organized',
      description:
        'Secure access for your team, clients and projects, all in one place.',
      tips: [
        'Collect content and files',
        'Keep projects moving',
        'Built for agencies',
      ],
    },
    '/sign-up': {
      Icon: Users,
      title: 'Built for teams',
      description:
        'Create your account to set up your workspace, invite your team and start collecting content.',
      tips: [
        'Set up your workspace',
        'Invite team members',
        'Create your first project',
      ],
    },
    '/verify-email': {
      Icon: MailCheck,
      title: 'Confirm your email',
      description:
        'Verifying your email helps keep your account secure and gives you access to all features.',
      tips: [
        'Click the link in your inbox',
        'Check your spam folder',
        'Resend if needed',
      ],
    },
    '/forgot-password': {
      Icon: LockKeyhole,
      title: 'Get back to your work',
      description:
        'Reset your password to regain access to your projects and content.',
      tips: [
        'Enter your work email',
        'Check your inbox',
        'Click the reset link',
      ],
    },
    '/reset-password': {
      Icon: ShieldCheck,
      title: 'Keep your account secure',
      description:
        'Use a strong, unique password to protect your workspace and content.',
      tips: [
        'Create a strong password',
        'Keep it private',
        'You can change it anytime',
      ],
    },
    '/team-invite': {
      Icon: UserPlus,
      title: 'Collaborate with your team',
      description:
        'Join your team to access shared projects, templates and content.',
      tips: [
        'Work with your team',
        'Access shared projects',
        'Keep everything organized',
      ],
    },
  }
  const story = stories[pathname] || stories['/sign-in']
  const Icon = story.Icon
  return (
    <div className="auth-layout">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="auth-top">
        <Brand />
        <nav aria-label="Help and navigation">
          <Link to="/about">Help</Link>
          <Link to="/">← Back</Link>
        </nav>
      </header>
      <main id="main-content" tabIndex={-1} className="auth-main">
        <div className="auth-content">
          <Outlet />
        </div>
        <aside className="auth-story" aria-label="About Content Collector">
          <div className="reference-auth-icon" aria-hidden="true">
            <Icon size={64} strokeWidth={1.7} />
            <span>✓</span>
          </div>
          <div className="story-copy">
            <h2>{story.title}</h2>
            <p>{story.description}</p>
            <ul className="auth-benefits">
              {story.tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </aside>
      </main>
      <footer className="auth-footer">
        Your agency account. Your clients’ next great project.
      </footer>
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
        <details className="mobile-navigation">
          <summary>Workspace menu</summary>
          <nav aria-label="Mobile workspace navigation">{navigation}</nav>
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
