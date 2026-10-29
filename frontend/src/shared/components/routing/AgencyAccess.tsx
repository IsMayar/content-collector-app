import { StatePanel } from '@/shared/components/Feedback'
import { useAppSelector } from '@/shared/hooks/useAppStore'
import { Link, Navigate, useParams } from 'react-router'

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
  if (!membership || (ownerOnly && membership.role !== 'OWNER'))
    return <UnauthorizedPage />
  return (
    <Navigate
      replace
      to={`/app/w/${membership.workspaceId}/${ownerOnly ? 'settings' : 'overview'}`}
    />
  )
}
