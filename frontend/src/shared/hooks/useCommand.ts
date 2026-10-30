import { portalApi, workspaceApi } from '@/services/api/resourceApi'
import { errorMessage } from '@/shared/utils/apiError'
import { useState } from 'react'

export function useCommand(client = false) {
  const [agency, a] = workspaceApi.useCommandMutation()
  const [portal, p] = portalApi.usePortalCommandMutation()
  const [error, setError] = useState('')
  async function run<T = Record<string, unknown>>(
    url: string,
    body?: unknown,
    method = 'POST',
    headers?: Record<string, string>,
  ): Promise<T | undefined> {
    setError('')
    try {
      const result = await (client ? portal : agency)({
        url,
        method,
        body,
        headers,
      }).unwrap()
      return (result ?? {}) as T
    } catch (e) {
      setError(errorMessage(e))
      return undefined
    }
  }
  return {
    run,
    error,
    pending: a.isLoading || p.isLoading,
    clear: () => setError(''),
  }
}
