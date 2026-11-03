import { z } from 'zod'
import { agencyApi } from '@/services/api/baseApi'
import { projectAnalytics, templateMetric } from '../schemas/analyticsSchema'
export const analyticsApi = agencyApi
  .enhanceEndpoints({ addTagTypes: ['Product'] })
  .injectEndpoints({
    endpoints: (build) => ({
      projectAnalytics: build.query<z.infer<typeof projectAnalytics>, string>({
        providesTags: ['Product'],
        query: (root) => `${root}/analytics`,
        transformResponse: (data: unknown) =>
          z.object({ metrics: projectAnalytics }).parse(data).metrics,
      }),
      templateAnalytics: build.query<z.infer<typeof templateMetric>[], string>({
        providesTags: ['Product'],
        query: (workspaceId) => `workspaces/${workspaceId}/analytics/templates`,
        transformResponse: (data: unknown) =>
          z.object({ data: z.array(templateMetric) }).parse(data).data,
      }),
    }),
  })
export const { useProjectAnalyticsQuery, useTemplateAnalyticsQuery } =
  analyticsApi
