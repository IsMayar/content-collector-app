import { useAppSelector } from '@/shared/hooks/useAppStore'
import { Navigate } from 'react-router'

export function WorkspaceEntry() {
  const state = useAppSelector((s) => s.auth)
  return (
    <Navigate
      replace
      to={
        state.workspaceId
          ? `/app/w/${state.workspaceId}/overview`
          : '/app/onboarding'
      }
    />
  )
}
