import { usePortalData } from '@/services/api/resourceApi'
import type { PortalFoundation } from '@/features/client/schemas/portalSchema'
import type { ClientChecklist } from '@/features/client/types/client.types'
export function useClientChecklist(projectId: string) {
  return usePortalData<ClientChecklist | PortalFoundation>(
    `client/projects/${projectId}/checklist`,
  )
}
