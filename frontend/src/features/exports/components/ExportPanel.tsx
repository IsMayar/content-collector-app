import type { Project } from '@/features/projects/types/project.types'
import type { ExportSummary } from '@/features/review/types/review.types'
import type { Item } from '@/features/structure-editor/types/structure.types'
import { exportCreatedSchema } from '@/features/exports/schemas/exportSchema'
import { useData } from '@/services/api/resourceApi'
import { Notice } from '@/shared/components/Feedback'
import { Modal } from '@/shared/components/Modal'
import {
  Badge,
  Empty,
  ErrorNotice,
  Field,
  Panel,
  QueryState,
} from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { useRef, useState } from 'react'
export function ExportPanel({
  root,
  project,
}: {
  root: string
  project: Project
}) {
  const q = useData<{ data: ExportSummary[] }>(`${root}/exports`, {
    pollingInterval: 2000,
  })
  const detail = useData<{
    structure: { id: string; title: string; items: Item[] }[]
  }>(root)
  const command = useCommand()
  const busy = useRef(false)
  const retry = useRef({ body: '', key: '' })
  const [job, setJob] = useState('')
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(1)
  const poll = useData<{ export: ExportSummary }>(
    job ? `${root}/exports/${job}` : '',
    {
      pollingInterval:
        job &&
        !q.data?.data.some(
          (j) => j.id === job && !['QUEUED', 'RUNNING'].includes(j.state),
        )
          ? 1000
          : 0,
    },
  )
  const [message, setMessage] = useState('')
  const jobs =
    q.data?.data.map((j) =>
      j.id === poll.data?.export?.id ? poll.data.export : j,
    ) || []
  return (
    <>
      <div className="board-toolbar">
        <div>
          <h2>Export history</h2>
          <p>View and manage exports for this project.</p>
        </div>
        <button
          className="primary-button"
          onClick={() => {
            setStep(1)
            setOpen(true)
          }}
        >
          ＋ New export
        </button>
      </div>
      {open && (
        <Modal
          title="Export approved content"
          onClose={() => setOpen(false)}
          pending={command.pending}
        >
          <nav className="reference-tabs" aria-label="Export steps">
            <span className={step === 1 ? 'active' : ''}>
              1 · Format & content
            </span>
            <span className={step === 2 ? 'active' : ''}>
              2 · Review and confirm
            </span>
          </nav>
          <p>
            Exports contain visible, approved exact revisions only. Each export
            is an immutable snapshot, even if the project changes later.
          </p>
          <form
            className="stack-form"
            onSubmit={async (e) => {
              e.preventDefault()
              if (step === 1) {
                setStep(2)
                return
              }
              const v = new FormData(e.currentTarget)
              if (busy.current) return
              const body = {
                format: v.get('format'),
                sectionIds: v.getAll('sections'),
                expectedProjectVersion: project.version,
                includeOriginals: v.has('originals'),
                acknowledgePartial: v.has('partial'),
              }
              if (!body.sectionIds.length) {
                setMessage('Select at least one section to export.')
                return
              }
              const serialized = JSON.stringify(body)
              if (retry.current.body !== serialized)
                retry.current = { body: serialized, key: crypto.randomUUID() }
              busy.current = true
              try {
                const result = await command.run<unknown>(
                  `${root}/exports`,
                  body,
                  'POST',
                  { 'Idempotency-Key': retry.current.key },
                )
                if (!result) return
                const parsed = exportCreatedSchema.safeParse(result)
                if (!parsed.success) {
                  setMessage(
                    'The service returned an incompatible export response. Retry safely or contact support.',
                  )
                  return
                }
                setJob(parsed.data.jobId)
                setOpen(false)
                setMessage(
                  `Export queued. Snapshot captured at project version ${project.version}.`,
                )
                retry.current = { body: '', key: '' }
              } finally {
                busy.current = false
              }
            }}
          >
            <div hidden={step !== 1}>
              <Field label="Export format">
                <select name="format">
                  <option value="APPROVED_ZIP">
                    ZIP · manifest, Markdown and approved files
                  </option>
                  <option value="APPROVED_JSON">
                    JSON · approved content and manifest
                  </option>
                  <option value="APPROVED_MARKDOWN">
                    Markdown · approved content
                  </option>
                </select>
              </Field>
              <fieldset className="export-sections">
                <legend>Include sections</legend>
                <p className="subtle">
                  For packages over 2 GB, select fewer sections and export them
                  separately.
                </p>
                {detail.data?.structure.map((section) => (
                  <label className="check-row" key={section.id}>
                    <input
                      type="checkbox"
                      name="sections"
                      value={section.id}
                      defaultChecked
                    />
                    <strong>{section.title}</strong>
                    <small>{section.items.length} items</small>
                  </label>
                ))}
              </fieldset>
              <label className="check-row">
                <input type="checkbox" name="originals" />
                Include retained originals where available
              </label>
              <label className="check-row">
                <input type="checkbox" name="partial" />I understand this is a
                partial export if required approvals are incomplete
              </label>
              <p className="subtle">
                Downloads expire after 24 hours. Maximum package size: 2 GB.
                Historical drafts and internal notes are excluded.
              </p>
            </div>
            {step === 2 && (
              <div className="export-review">
                <h3>Ready to create your package?</h3>
                <p>{project.title}</p>
                <p>Snapshot: project version {project.version}</p>
                <p>
                  {project.progress.approvedRequired} of{' '}
                  {project.progress.requiredTotal} required items approved.
                </p>
                <Notice>
                  Only visible, approved content and its ready files are
                  included. This snapshot will not change when the project
                  changes.
                </Notice>
                <button
                  type="button"
                  className="text-link"
                  onClick={() => setStep(1)}
                >
                  Edit configuration
                </button>
              </div>
            )}
            <button className="primary-button" disabled={command.pending}>
              {step === 1 ? 'Continue' : 'Create approved export'}
            </button>
          </form>
          <ErrorNotice error={command.error} />
          {message && <Notice>{message}</Notice>}
        </Modal>
      )}
      <ErrorNotice error={command.error} />
      {!open && message && <Notice>{message}</Notice>}
      <Panel title="Export history">
        <QueryState query={q}>
          {jobs.length ? (
            <div className="export-history">
              <div className="export-table-head">
                <strong>Export / snapshot</strong>
                <strong>Status</strong>
                <strong>Download</strong>
              </div>
              {jobs.map((j) => (
                <div className="export-row" key={j.id}>
                  <div className="grow">
                    <strong>{j.format.replaceAll('_', ' ')}</strong>
                    <p>
                      Project v{j.projectVersion} ·{' '}
                      {new Date(j.createdAt).toLocaleString()} ·{' '}
                      {j.partial ? 'Partial snapshot' : 'All required approved'}
                    </p>
                    {j.olderThanCurrentProject && (
                      <small>
                        Older than current project. Create a new export for
                        recent changes.
                      </small>
                    )}
                  </div>
                  <Badge>{j.state}</Badge>
                  {j.state === 'READY' ? (
                    <button
                      className="secondary-button"
                      onClick={async () => {
                        const result = await command.run<{ url: string }>(
                          `${root}/exports/${j.id}/download`,
                          {},
                        )
                        if (result) {
                          try {
                            const url = new URL(
                              result.url,
                              window.location.origin,
                            )
                            if (!['http:', 'https:'].includes(url.protocol))
                              throw new Error('Invalid download URL.')
                            const anchor = document.createElement('a')
                            anchor.href = url.href
                            anchor.referrerPolicy = 'no-referrer'
                            anchor.download = `approved-${j.id}.${j.format === 'APPROVED_ZIP' ? 'zip' : j.format === 'APPROVED_JSON' ? 'json' : 'md'}`
                            document.body.appendChild(anchor)
                            anchor.click()
                            anchor.remove()
                          } catch (e) {
                            setMessage(
                              e instanceof Error
                                ? e.message
                                : 'Download failed.',
                            )
                          }
                        }
                      }}
                    >
                      Download
                    </button>
                  ) : ['QUEUED', 'RUNNING'].includes(j.state) ? (
                    <button className="text-link" onClick={() => setJob(j.id)}>
                      Check progress
                    </button>
                  ) : (
                    <span className="subtle">
                      {j.state === 'EXPIRED'
                        ? 'This download expired. Create a new export.'
                        : j.state === 'FAILED'
                          ? 'Generation failed. Create a new export to retry.'
                          : 'Create a new export.'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="Your handoff is taking shape"
              description="Approve client submissions, then create your first export."
            />
          )}
        </QueryState>
      </Panel>
    </>
  )
}
