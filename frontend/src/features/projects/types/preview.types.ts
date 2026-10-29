import type {
  ClientChecklist,
  ClientItem,
} from '@/features/client/types/client.types'
export type PreviewItem = Omit<ClientItem, 'answer'> & { answer: null }
export type PreviewChecklist = Omit<ClientChecklist, 'sections'> & {
  sections: { id: string; key: string; title: string; items: PreviewItem[] }[]
}
