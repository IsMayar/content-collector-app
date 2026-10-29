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
  ): Promise<T | undefined> {
    setError('')
    try {
      return (await (client ? portal : agency)({
        url,
        method,
        body,
      }).unwrap()) as T
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
