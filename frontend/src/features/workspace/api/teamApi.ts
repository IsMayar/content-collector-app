import { useData } from '@/services/api/resourceApi'
import type {
  InviteSummary,
  Member,
  WorkspaceDetail,
} from '@/features/workspace/types/workspace.types'
export interface TeamResponse {
  data: Member[]
  pendingInvites: InviteSummary[]
}
export function useTeam(workspaceId: string, owner = true) {
  return useData<TeamResponse>(`workspaces/${workspaceId}/members`, {
    skip: !owner,
  })
}
export function useTeamEntitlements(workspaceId: string, owner = true) {
  return useData<WorkspaceDetail>(`workspaces/${workspaceId}`, { skip: !owner })
}
