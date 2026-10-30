import { usePortalData } from '@/services/api/resourceApi'
import type { CollectionData } from '../schemas/collectionSchema'
import type { PortalFoundation } from '@/features/client/schemas/portalSchema'
import type { ClientChecklist } from '@/features/client/types/client.types'
export function useClientChecklist(projectId: string) {
  return usePortalData<ClientChecklist | PortalFoundation | CollectionData>(
    `client/projects/${projectId}/checklist`,
  )
}
