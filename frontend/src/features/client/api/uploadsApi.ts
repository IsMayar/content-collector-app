import { store } from '@/app/store/store'
import { portalApi, workspaceApi } from '@/services/api/resourceApi'

// Keep upload mutations on the existing cookie/CSRF or agency RTK Query transport.
// Unlike the presentation hook, recovery needs the actual error code/status.
export async function sendUploadCommand<T>(
  url: string,
  body: unknown,
  method: string,
  headers: Record<string, string> | undefined,
  client: boolean,
): Promise<T> {
  const request = store.dispatch(
    (client
      ? portalApi.endpoints.portalCommand
      : workspaceApi.endpoints.command
    ).initiate({ url, body, method, headers }),
  )
  try {
    return ((await request.unwrap()) ?? {}) as T
  } finally {
    request.reset()
  }
}
