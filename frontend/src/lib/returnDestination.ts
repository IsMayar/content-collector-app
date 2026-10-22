export function safeReturnDestination(value: string | null | undefined): string {
  const unsafe = (text: string) => text.includes('\\') || [...text].some(character => character.charCodeAt(0) <= 32)
  if (!value || !value.startsWith('/') || unsafe(value)) return '/app'
  try {
    const decoded = decodeURIComponent(value)
    if (decoded.startsWith('//') || unsafe(decoded)) return '/app'
    const url = new URL(value, 'https://collector.invalid')
    if (url.origin !== 'https://collector.invalid' || !/^\/(app(?:\/|$)|team-invite$)/.test(url.pathname)) return '/app'
    return `${url.pathname}${url.search}${url.hash}`
  } catch { return '/app' }
}
