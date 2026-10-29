export async function downloadFile(url: string, filename: string) {
  const target = new URL(url, window.location.origin)
  if (!['http:', 'https:'].includes(target.protocol))
    throw new Error('Invalid download URL.')
  const result = await fetch(target, {
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
  })
  if (!result.ok)
    throw new Error(
      result.status === 403
        ? 'Download link expired. Choose Download again for a fresh link.'
        : 'Download failed. Try again.',
    )
  const href = URL.createObjectURL(await result.blob())
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = filename.replace(/[\\/:*?"<>|]/g, '_')
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(href), 30000)
}
