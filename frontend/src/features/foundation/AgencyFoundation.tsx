import { Link, useParams } from 'react-router'
import { useAppSelector } from '@/app/hooks'
import { PageHeader } from '@/components/PageHeader'
import { StatePanel } from '@/components/Feedback'

export function UnauthorizedPage() {
  return (
    <StatePanel
      kind="error"
      title="This space isn’t available to your account"
      description="Choose a workspace you belong to, or contact its owner for access."
      action={
        <Link className="secondary-button" to="/app">
          Back to your workspace
        </Link>
      }
    />
  )
}
export function AgencyFoundation({
  ownerOnly = false,
}: {
  ownerOnly?: boolean
}) {
  const auth = useAppSelector((s) => s.auth)
  const { workspaceId } = useParams()
  const membership = auth.memberships.find(
    (m) => m.workspaceId === (workspaceId || auth.workspaceId),
  )
  if (
    (workspaceId && !membership) ||
    (ownerOnly && membership?.role !== 'OWNER')
  )
    return <UnauthorizedPage />
  return (
    <>
      <PageHeader
        title={
          ownerOnly
            ? 'Owner access foundation'
            : `Welcome, ${auth.user?.displayName.split(' ')[0] || 'there'}`
        }
        description={
          membership?.workspaceName || 'Your agency account is ready.'
        }
        breadcrumbs={[
          { label: 'Workspace' },
          { label: ownerOnly ? 'Owner access' : 'Home' },
        ]}
      />
      <section className="foundation-banner">
        <span className="badge">FE01 · Frontend preview</span>
        <h2>Your next project starts here.</h2>
        <p>
          {ownerOnly
            ? 'This route is visible only to workspace owners. Workspace administration arrives in later frontend batches.'
            : 'Your sign-in and workspace navigation are ready. Dashboard, project creation and templates arrive in FE02.'}
        </p>
      </section>
      <StatePanel
        kind="empty"
        title={
          membership
            ? 'Your workspace foundation is ready'
            : 'No workspace membership yet'
        }
        description={
          membership
            ? `You’re viewing this space as ${membership.role === 'OWNER' ? 'its owner' : 'a team member with assigned-project access'}. No sample project activity is shown.`
            : 'Workspace onboarding will be available in FE02.'
        }
      />
      <p className="permission-note">
        Navigation reflects your current membership. The backend must
        independently authorize every request.
      </p>
    </>
  )
}
export function ClientFoundation() {
  return (
    <StatePanel
      kind="empty"
      title="Your private project space"
      description="This is the client layout foundation. Invitation exchange and content collection arrive in FE04."
      action={
        <Link className="secondary-button" to="/">
          Back to home
        </Link>
      }
    />
  )
}
