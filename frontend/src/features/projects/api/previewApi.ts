import type { PreviewChecklist } from '@/features/projects/types/preview.types'
import { useData } from '@/services/api/resourceApi'
export function useClientPreview(root: string) {
  return useData<{ preview: PreviewChecklist }>(`${root}/client-preview`)
}
