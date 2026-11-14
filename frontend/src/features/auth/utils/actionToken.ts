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

export function parseActionCode(value: string, path: string) {
  if (/^[A-Za-z0-9_-]+$/.test(value)) return value
  try {
    const url = new URL(value)
    if (
      url.origin !== window.location.origin ||
      url.pathname !== path ||
      url.username ||
      url.password
    )
      return
    const token =
      new URLSearchParams(url.hash.slice(1)).get('token') ??
      url.searchParams.get('token')
    if (token && /^[A-Za-z0-9_-]+$/.test(token)) return token
  } catch {
    // Malformed input is reported on the field.
  }
}
