import { existsSync } from 'node:fs'

export function localEdgeOptions() {
  const systemEdge =
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  const executablePath =
    process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
    (process.platform === 'win32' && existsSync(systemEdge)
      ? systemEdge
      : undefined)
  return executablePath ? { executablePath } : { channel: 'msedge' }
}
