import type {
  Project,
  ProjectDetail,
} from '@/features/projects/types/project.types'
import { useData } from '@/services/api/resourceApi'
import type { Paged } from '@/shared/types/common.types'

// Feature-owned typed queries share the existing RTK endpoint/cache and HTTP transport.
export function useProjectDetail(
  workspaceId: string,
  projectId: string,
  pollingInterval?: number,
) {
  return useData<ProjectDetail>(
    `workspaces/${workspaceId}/projects/${projectId}`,
    { pollingInterval },
  )
}
export function useProjects(workspaceId: string, filters: URLSearchParams) {
  return useData<Paged<Project>>(
    `workspaces/${workspaceId}/projects?${filters.toString()}`,
  )
}
