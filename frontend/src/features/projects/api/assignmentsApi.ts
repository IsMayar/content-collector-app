import type { Assignment } from '@/features/projects/types/project.types'
import { useData } from '@/services/api/resourceApi'

export function useAssignments(projectRoot: string) {
  return useData<{ data: Assignment[] }>(`${projectRoot}/assignments`)
}
