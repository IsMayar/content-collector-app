import { z } from 'zod'
import { savedDraftAnswer } from '../schemas/draftAnswerSchema'
import { clientApi } from '@/services/api/clientApi'
import type {
  Answer,
  SaveAnswerCommand,
} from '@/features/client/types/client.types'
export const clientAnswersApi = clientApi.injectEndpoints({
  endpoints: (build) => ({
    saveDraft: build.mutation<
      { answer: Answer; itemState: string },
      { projectId: string; itemId: string; command: SaveAnswerCommand }
    >({
      transformResponse: (data: unknown) =>
        z
          .object({ answer: savedDraftAnswer, itemState: z.string() })
          .parse(data),
      transformErrorResponse: (error, meta) => ({
        ...error,
        retryAfter: Number(meta?.response?.headers.get('Retry-After') || 60),
      }),
      query: ({ projectId, itemId, command }) => ({
        url: `client/projects/${projectId}/items/${itemId}/answer`,
        method: 'PUT',
        body: command,
      }),
    }),
    readDraft: build.query<
      { answer: Answer },
      { projectId: string; itemId: string }
    >({
      query: ({ projectId, itemId }) =>
        `client/projects/${projectId}/items/${itemId}`,
    }),
  }),
})
export const { useSaveDraftMutation, useLazyReadDraftQuery } = clientAnswersApi
