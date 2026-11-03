import { clientApi } from '@/services/api/clientApi'
export type Interaction = {
  clientEventId: string
  type: 'project_opened' | 'item_started'
  itemId?: string
}
export const interactionApi = clientApi.injectEndpoints({
  endpoints: (build) => ({
    recordInteraction: build.mutation<
      { accepted: number },
      { projectId: string; event: Interaction }
    >({
      query: ({ projectId, event }) => ({
        url: `client/projects/${projectId}/events`,
        method: 'POST',
        body: { events: [event] },
      }),
    }),
  }),
})
export const { useRecordInteractionMutation } = interactionApi
