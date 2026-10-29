export const tokenVault = new Map<string, string>()
export function captureToken(purpose: string) {
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const query = new URLSearchParams(window.location.search)
  const token = fragment.get('token') || query.get('token')
  if (token) {
    tokenVault.set(purpose, token)
    query.delete('token')
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + (query.size ? `?${query}` : ''),
    )
  }
  return tokenVault.get(purpose) || ''
}
