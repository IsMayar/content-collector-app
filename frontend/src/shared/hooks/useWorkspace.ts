import { useAppSelector } from '@/shared/hooks/useAppStore'
import { useParams } from 'react-router'

export function useWorkspace() {
  const { workspaceId } = useParams()
  const auth = useAppSelector((s) => s.auth)
  const id = workspaceId || auth.workspaceId || ''
  return {
    id,
    base: `/app/w/${id}`,
    owner: auth.memberships.some(
      (m) => m.workspaceId === id && m.role === 'OWNER',
    ),
    user: auth.user,
  }
}
