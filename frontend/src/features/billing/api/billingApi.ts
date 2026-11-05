import { agencyApi } from '@/services/api/baseApi'
import { z } from 'zod'

export const subscriptionResponse = z.object({
  subscription: z.object({
    planKey: z.enum(['SOLO', 'AGENCY']),
    state: z.enum(['TRIALING', 'ACTIVE', 'PAST_DUE', 'READ_ONLY', 'SUSPENDED']),
    currentPeriodStart: z.iso.datetime(),
    currentPeriodEnd: z.iso.datetime(),
    cancelAtPeriodEnd: z.boolean(),
    graceEndsAt: z.iso.datetime().nullable(),
    readOnlyEndsAt: z.iso.datetime().nullable(),
  }),
  entitlements: z
    .object({ planKey: z.enum(['SOLO', 'AGENCY']), seats: z.number() })
    .passthrough(),
})

const counter = z.number().int().nonnegative()
export const usageResponse = z.object({
  usage: z.object({
    periodStart: z.iso.datetime(),
    periodEnd: z.iso.datetime(),
    storageUsedBytes: counter,
    storageReservedBytes: counter,
    storageLimitBytes: counter,
    aiDraftsUsed: counter,
    aiDraftAllowance: counter,
    smsSegmentsUsed: counter,
    smsSegmentAllowance: counter,
    seatsUsed: counter,
    seatsReserved: counter,
    seatsLimit: counter,
    aiDraftsReserved: counter.default(0),
    smsSegmentsReserved: counter.default(0),
    aiPeriodStart: z.iso.datetime().optional(),
    aiPeriodEnd: z.iso.datetime().optional(),
  }),
})

export const billingApi = agencyApi
  .enhanceEndpoints({ addTagTypes: ['Product'] })
  .injectEndpoints({
    endpoints: (build) => ({
      billingUsage: build.query<z.infer<typeof usageResponse>['usage'], string>(
        {
          async queryFn(workspace, _api, _extra, baseQuery) {
            const result = await baseQuery(`workspaces/${workspace}/usage`)
            if (result.error) return { error: result.error }
            const parsed = usageResponse.safeParse(result.data)
            return parsed.success
              ? { data: parsed.data.usage }
              : {
                  error: {
                    status: 'CUSTOM_ERROR',
                    error:
                      'The usage response is incompatible. Please try again.',
                  },
                }
          },
          providesTags: ['Product'],
        },
      ),
      billingSubscription: build.query<
        z.infer<typeof subscriptionResponse>['subscription'],
        string
      >({
        async queryFn(workspace, _api, _extra, baseQuery) {
          const result = await baseQuery(`workspaces/${workspace}/subscription`)
          if (result.error) return { error: result.error }
          const parsed = subscriptionResponse.safeParse(result.data)
          return parsed.success
            ? { data: parsed.data.subscription }
            : {
                error: {
                  status: 'CUSTOM_ERROR',
                  error:
                    'The billing response is incompatible. Please try again.',
                },
              }
        },
        providesTags: ['Product'],
      }),
    }),
  })

export const { useBillingSubscriptionQuery, useBillingUsageQuery } = billingApi

/** Production hosted sessions must stay on the provider's exact HTTPS hosts. */
export function billingDestination(
  url: string,
  origin: string,
  mocks: boolean,
): URL | null {
  try {
    const target = new URL(url, origin)
    if (
      mocks &&
      target.origin === origin &&
      target.pathname.startsWith('/app/w/') &&
      target.searchParams.get('hosted') === 'demo'
    )
      return target
    return target.protocol === 'https:' &&
      !target.username &&
      !target.password &&
      !target.port &&
      ['checkout.stripe.com', 'billing.stripe.com'].includes(target.hostname)
      ? target
      : null
  } catch {
    return null
  }
}
