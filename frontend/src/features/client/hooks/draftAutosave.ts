import type {
  Answer,
  AnswerValue,
  SaveAnswerCommand,
} from '@/features/client/types/client.types'
export type DraftState = {
  value: AnswerValue
  version: number
  dirty: boolean
  status: string
  error: string
  conflict?: Answer
}
export type SaveFailure = {
  status?: number | string
  data?: { detail?: string; code?: string }
  retryAfter?: number
}
type Save = (command: SaveAnswerCommand) => Promise<{ answer: Answer }>
/** One writer and one immutable operation per item. Retrying an uncertain save reuses its operation ID. */
export class DraftAutosave {
  private listeners = new Set<() => void>()
  private timer?: ReturnType<typeof setTimeout>
  private inFlight?: Promise<boolean>
  private operation?: SaveAnswerCommand
  private attempts = 0
  private blockedConflict = false
  state: DraftState
  constructor(
    value: AnswerValue,
    version: number,
    private structureVersion: number,
    private send: Save,
  ) {
    this.state = {
      value,
      version,
      dirty: false,
      status: version ? 'Saved' : 'No saved answer',
      error: '',
    }
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }
  snapshot = () => this.state
  private change(p: Partial<DraftState>) {
    this.state = { ...this.state, ...p }
    this.listeners.forEach((f) => f())
  }
  edit(value: AnswerValue) {
    this.change({
      value,
      dirty: true,
      status: this.blockedConflict
        ? 'Conflict � unsaved changes'
        : 'Unsaved changes',
      error: '',
    })
    this.attempts = 0
    if (!this.operation && !this.state.conflict) {
      clearTimeout(this.timer)
      this.timer = setTimeout(() => void this.flush(), 800)
    }
  }
  async flush(): Promise<boolean> {
    clearTimeout(this.timer)
    if (this.inFlight) {
      const ok = await this.inFlight
      return ok ? this.flush() : false
    }
    if (!this.state.dirty) return true
    if (this.state.conflict || this.blockedConflict) return false
    const command = this.operation || {
      value: this.state.value,
      expectedVersion: this.state.version,
      expectedStructureVersion: this.structureVersion,
      saveOperationId: crypto.randomUUID(),
    }
    this.operation = command
    this.change({ status: 'Saving…', error: '' })
    this.inFlight = (async () => {
      try {
        const result = await this.send(command)
        const dirty =
          JSON.stringify(this.state.value) !== JSON.stringify(command.value)
        this.operation = undefined
        this.attempts = 0
        this.change({
          version: result.answer.version,
          dirty,
          status: dirty
            ? 'Unsaved changes'
            : `Saved at ${new Date(result.answer.savedAt).toLocaleTimeString()}`,
          error: '',
        })
        return true
      } catch (raw) {
        const e = raw as SaveFailure
        const status = e.status
        const detail =
          e.data?.detail || 'Could not save. Your answer is kept in this tab.'
        if (status === 409) {
          this.blockedConflict = true
          this.change({ status: 'Conflict', error: detail })
          return false
        }
        if (status === 422 || status === 400) {
          this.operation = undefined
          this.change({ status: 'Validation error', error: detail })
          return false
        }
        if (status === 401 || status === 403) {
          this.change({
            status: 'Session unavailable — unsaved changes kept',
            error:
              'Request a fresh project link. Copy your unsaved answer before leaving.',
          })
          return false
        }
        this.change({
          status:
            typeof navigator !== 'undefined' && !navigator.onLine
              ? 'Offline — unsaved changes'
              : 'Save error',
          error: detail,
        })
        if (this.attempts < 2) {
          const wait =
            status === 429
              ? Math.max(60000, (e.retryAfter || 60) * 1000)
              : 1000 * 2 ** this.attempts
          this.attempts++
          this.timer = setTimeout(() => void this.flush(), wait)
        }
        return false
      } finally {
        this.inFlight = undefined
      }
    })()
    const result = await this.inFlight
    if (result && this.state.dirty) return this.flush()
    return result
  }
  compare(answer: Answer) {
    this.change({ conflict: answer, status: 'Conflict — compare answers' })
  }
  loadServer() {
    this.blockedConflict = false
    if (!this.state.conflict) return
    const a = this.state.conflict
    this.operation = undefined
    this.change({
      value: a.value as AnswerValue,
      version: a.version,
      dirty: false,
      conflict: undefined,
      status: 'Saved version loaded',
      error: '',
    })
  }
  keepLocal() {
    this.blockedConflict = false
    if (!this.state.conflict) return
    this.operation = undefined
    this.change({
      version: this.state.conflict.version,
      conflict: undefined,
      status: 'Unsaved changes',
      error: '',
    })
  }
  pause() {
    clearTimeout(this.timer)
  }
}
// Volatile recovery only: no browser persistence; explicit project logout clears it.
export const pendingDrafts = new Map<string, DraftAutosave>()
export function clearPendingDrafts() {
  for (const d of pendingDrafts.values()) d.pause()
  pendingDrafts.clear()
}
