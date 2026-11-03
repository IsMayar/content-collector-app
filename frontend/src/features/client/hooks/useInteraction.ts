import { useCallback, useRef } from 'react'
import { useRecordInteractionMutation } from '../api/interactionApi'
// No answer, cookie, URL, referrer, storage or arbitrary metadata enters this boundary.
export function useInteraction(projectId: string) {
  const [record] = useRecordInteractionMutation()
  const sent = useRef(new Set<string>())
  return useCallback(
    (itemId?: string) => {
      const key = `${projectId}/${itemId || 'open'}`
      if (sent.current.has(key)) return
      sent.current.add(key)
      void record({
        projectId,
        event: {
          clientEventId: crypto.randomUUID(),
          type: itemId ? 'item_started' : 'project_opened',
          ...(itemId ? { itemId } : {}),
        },
      })
        .unwrap()
        .catch(() => {
          sent.current.delete(
            key,
          ) /* Optional telemetry must never block ordinary writing. */
        })
    },
    [projectId, record],
  )
}
