import type { Answer } from '@/features/client/types/client.types'
import type { AssetSummary } from '@/features/projects/types/file.types'

export async function fetchLatest(
  path: string,
): Promise<{ answer: Answer } | undefined> {
  // Use the same client RTK endpoint, including session/CSRF behavior.
  const { store } = await import('@/app/store/store')
  const { portalApi } = await import('@/services/api/resourceApi')
  const request = store.dispatch(
    portalApi.endpoints.portalRead.initiate(path, {
      forceRefetch: true,
      subscribe: false,
    }),
  )
  try {
    return (await request.unwrap()) as { answer: Answer }
  } catch {
    return undefined
  } finally {
    request.unsubscribe()
  }
}

export async function fetchLatestAsset(path: string, client = true) {
  const { store } = await import('@/app/store/store')
  const { portalApi, workspaceApi } = await import('@/services/api/resourceApi')
  const req = store.dispatch(
    (client
      ? portalApi.endpoints.portalRead
      : workspaceApi.endpoints.read
    ).initiate(path, {
      forceRefetch: true,
      subscribe: false,
    }),
  )
  try {
    return ((await req.unwrap()) as { asset: AssetSummary }).asset
  } catch {
    return undefined
  } finally {
    req.unsubscribe()
  }
}
