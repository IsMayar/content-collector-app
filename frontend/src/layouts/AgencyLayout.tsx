import { ProfileDropdown } from '@/features/settings/components/ProfileDropdown'
import { env } from '@/config/env'
import { logoutSession, selectWorkspace } from '@/features/auth/store/session'
import { WorkspaceBillingNotice } from '@/features/billing/components/WorkspaceBillingNotice'
import type { WorkspaceDetail } from '@/features/workspace/types/workspace.types'
import { useData } from '@/services/api/resourceApi'
import { Brand } from '@/shared/components/Brand'
import { ConfirmDialog, Notice, useNotify } from '@/shared/components/Feedback'
import { UnauthorizedPage } from '@/shared/components/routing/AgencyAccess'
import { useAppDispatch, useAppSelector } from '@/shared/hooks/useAppStore'
import { errorMessage } from '@/shared/utils/apiError'
import {
  ChartNoAxesCombined,
  FolderKanban,
  Layers,
  LayoutDashboard,
  Users,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router'
export function AgencyLayout() {
  const { pathname, search, hash } = useLocation()
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
          <ProfileDropdown
            key={pathname + search + hash + membership?.workspaceId}
            name={state.user?.displayName || 'Your account'}
            email={state.user?.email || ''}
            base={membership ? '/app/w/' + membership.workspaceId : undefined}
            onSignOut={() => setConfirm(true)}
          />
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
          {membership &&
            pathname !== `/app/w/${membership.workspaceId}/billing` && (
              <WorkspaceBillingNotice
                workspace={membership.workspaceId}
                owner={membership.role === 'OWNER'}
                canWrite={workspace.data?.entitlements.canWrite}
              />
            )}
          {membership?.role !== 'OWNER' &&
            workspace.data &&
            !workspace.data.entitlements.canWrite && (
              <Notice>
                Editing is unavailable. Access to saved content and exports
                depends on your permissions and the workspace access period.
                Contact your workspace owner.
              </Notice>
            )}
          <Outlet />
        </main>
        <footer className="agency-footer">
          Website Content Collector{' '}
          {env.mocksEnabled && <span>Frontend preview</span>}
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
