import type { Project, ProjectDetail } from '@/features/projects/types/project.types'
import type { ExportSummary } from '@/features/review/types/review.types'
import { exportCreatedSchema } from '@/features/exports/schemas/exportSchema'
import { useData } from '@/services/api/resourceApi'
import { Notice } from '@/shared/components/Feedback'
import { Modal } from '@/shared/components/Modal'
import {
  Badge,
  Empty,
  ErrorNotice,
  Panel,
  QueryState,
} from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Download, FileArchive, FileCode, FileText, TriangleAlert } from 'lucide-react'
import './ExportPanel.css'

const formats = [
  { value: 'APPROVED_ZIP', label: 'ZIP', description: 'Content and approved files', icon: FileArchive },
  { value: 'APPROVED_JSON', label: 'JSON', description: 'Content and manifest', icon: FileCode },
  { value: 'APPROVED_MARKDOWN', label: 'Markdown', description: 'Approved content', icon: FileText },
] as const

type ExportFormat = (typeof formats)[number]['value']

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
  const detail = useData<ProjectDetail>(root)
  const command = useCommand()
  const busy = useRef(false)
  const retry = useRef({ body: '', key: '' })
  const [job, setJob] = useState('')
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(1)
  const [format, setFormat] = useState<ExportFormat>('APPROVED_ZIP')
  const [selection, setSelection] = useState<string[] | null>(null)
  const [originals, setOriginals] = useState(false)
  const [partial, setPartial] = useState(false)
  const [reviewVersion, setReviewVersion] = useState<number | null>(null)
  const sections = detail.data?.structure ?? []
  const selected = sections.filter((section) => selection === null || selection.includes(section.id))
  const approved = selected.reduce((total, section) => total + (section.enabled === false ? 0 : section.items.filter((item) => item.enabled !== false && item.visible && item.state === 'APPROVED').length), 0)
  const incomplete = project.progress.approvedRequired < project.progress.requiredTotal
  const versionChanged = reviewVersion !== null && reviewVersion !== project.version
  const canReview = !!detail.data && !detail.isError && selected.length > 0 && approved > 0
  const formatLabel = formats.find((entry) => entry.value === format)!.label
  const listedJob = q.data?.data.find((entry) => entry.id === job)
  const needsStatus =
    !listedJob || ['QUEUED', 'RUNNING'].includes(listedJob.state)
  const poll = useData<{ export: ExportSummary }>(
    job ? `${root}/exports/${job}` : '',
    {
      pollingInterval: job && needsStatus ? 1000 : 0,
    },
  )
  const [message, setMessage] = useState('')
  const hasApproved =
    project.progress.approvedRequired + project.progress.optionalApproved > 0
  const jobs =
    q.data?.data.map((j) =>
      needsStatus && j.id === poll.data?.export?.id ? poll.data.export : j,
    ) || []
  return (
    <>
      <div className="board-toolbar">
        <div>
          <h2>Export history</h2>
          <p>View and manage exports for this project.</p>
        </div>
        {hasApproved && (
          <button
            className="primary-button"
            onClick={() => {
              setStep(1)
              setFormat('APPROVED_ZIP')
              setSelection(null)
              setOriginals(false)
              setPartial(false)
              setReviewVersion(null)
              setMessage('')
              command.clear()
              setOpen(true)
            }}
          >
            ＋ New export
          </button>
        )}
      </div>
      {!hasApproved && (
        <p>
          Approve a response before creating an export. Previous exports stay
          available below.
        </p>
      )}
      {open && hasApproved && (
        <Modal
          title="Export approved content"
          onClose={() => setOpen(false)}
          pending={command.pending}
          className="refined-export-modal"
        >
          <form className="refined-export-form" onSubmit={async (e) => {
            e.preventDefault()
            if (!canReview || busy.current || command.pending) return
            if (step === 1) {
              setReviewVersion(project.version)
              setPartial(false)
              setMessage('')
              command.clear()
              setStep(2)
              return
            }
            if (versionChanged || (incomplete && !partial)) return
            const body = {
              format,
              sectionIds: selected.map((section) => section.id),
              expectedProjectVersion: reviewVersion ?? project.version,
              includeOriginals: originals,
              acknowledgePartial: partial,
            }
            const serialized = JSON.stringify(body)
            if (retry.current.body !== serialized)
              retry.current = { body: serialized, key: crypto.randomUUID() }
            busy.current = true
            try {
              const result = await command.run<unknown>(
                `${root}/exports`, body, 'POST',
                { 'Idempotency-Key': retry.current.key },
              )
              if (!result) return
              const parsed = exportCreatedSchema.safeParse(result)
              if (!parsed.success) {
                setMessage('The service returned an incompatible export response. Retry safely or contact support.')
                return
              }
              setJob(parsed.data.jobId)
              setOpen(false)
              setMessage('Export queued. Your download will appear in export history when ready.')
              retry.current = { body: '', key: '' }
            } finally {
              busy.current = false
            }
          }}>
            <div className="refined-export-body">
              <p className="export-project-name">{project.title}</p>
              <ol className="export-stepper" aria-label="Export steps">
                <li aria-current={step === 1 ? 'step' : undefined} className={step === 2 ? 'done' : ''}>
                  <span>{step === 2 ? <Check size={15} aria-hidden="true" /> : '1'}</span> Configure
                </li>
                <li aria-current={step === 2 ? 'step' : undefined}><span>2</span> Review</li>
              </ol>
              {step === 1 ? (
                <>
                  <fieldset className="export-format-group">
                    <legend>Export format</legend>
                    <div className="export-format-grid">
                      {formats.map(({ value, label, description, icon: Icon }) => (
                        <label key={value} className={'export-format-card' + (format === value ? ' selected' : '')}>
                          <input type="radio" name="format" value={value} checked={format === value} onChange={() => setFormat(value)} />
                          <Icon size={21} aria-hidden="true" />
                          <strong>{label}</strong>
                          <small>{description}</small>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset className="refined-export-sections">
                    <legend>Include sections</legend>
                    <QueryState query={detail}>
                      <div className="export-selection-bar">
                        <span>{selected.length} of {sections.length} selected</span>
                        <button type="button" className="text-link" onClick={() => setSelection(selected.length === sections.length ? [] : null)}>
                          {selected.length === sections.length ? 'Deselect all' : 'Select all'}
                        </button>
                      </div>
                      <div className="export-section-list">
                        {sections.map((section) => {
                          const count = section.enabled === false ? 0 : section.items.filter((item) => item.enabled !== false && item.visible && item.state === 'APPROVED').length
                          const checked = selected.some((entry) => entry.id === section.id)
                          return (
                            <label className="export-section-option" key={section.id}>
                              <input type="checkbox" name="sections" value={section.id} checked={checked} onChange={(e) => setSelection(e.target.checked ? [...selected.map((entry) => entry.id), section.id] : selected.filter((entry) => entry.id !== section.id).map((entry) => entry.id))} />
                              <strong>{section.title}</strong>
                              <small>{count} approved</small>
                            </label>
                          )
                        })}
                        {sections.length === 0 && <p>No sections available.</p>}
                      </div>
                    </QueryState>
                  </fieldset>
                  <label className="check-row">
                    <input type="checkbox" name="originals" checked={originals} onChange={(e) => setOriginals(e.target.checked)} />
                    Include retained originals where available
                  </label>
                  {selected.length > 0 && approved === 0 && detail.data && <p className="export-inline-warning">Select a section with approved content.</p>}
                  <p className="export-helper">Approved, visible content only. Maximum package size: 2 GB. Downloads expire after 24 hours.</p>
                </>
              ) : (
                <>
                  <div className="export-summary-card">
                    <div className="export-summary-title">
                      <span className="export-summary-icon"><Download size={22} aria-hidden="true" /></span>
                      <div><h3>{formatLabel} export</h3><p>Approved content · Project version {reviewVersion}</p></div>
                    </div>
                    <div className="export-summary-metrics">
                      <div><strong>{selected.length}</strong><span>Selected sections</span></div>
                      <div><strong>{approved}</strong><span>Approved items selected</span></div>
                    </div>
                    <dl className="export-summary-details">
                      <div><dt>Sections</dt><dd>{selected.map((section) => section.title).join(', ')}</dd></div>
                      <div><dt>Original files</dt><dd>{originals ? 'Include where available' : 'Not included'}</dd></div>
                      <div><dt>Download access</dt><dd>24 hours</dd></div>
                    </dl>
                  </div>
                  <div className="export-approval">
                    <div><strong>Project approval progress</strong><span>{project.progress.approvedRequired} / {project.progress.requiredTotal}</span></div>
                    <progress aria-label="Required items approved" value={project.progress.approvedRequired} max={project.progress.requiredTotal || 1} />
                  </div>
                  <div className={incomplete ? 'export-partial-warning' : 'export-partial-option'}>
                    {incomplete && <div className="export-warning-title"><TriangleAlert size={17} aria-hidden="true" /><strong>Partial export</strong></div>}
                    {incomplete && <p>Some required content is not approved. Only approved content and ready files will be included.</p>}
                    <label className="check-row">
                      <input type="checkbox" name="partial" checked={partial} onChange={(e) => setPartial(e.target.checked)} />
                      I understand this is a partial export if required approvals are incomplete
                    </label>
                  </div>
                  {versionChanged && <p role="alert" className="export-inline-warning">The project changed. Go back and review the latest content before exporting.</p>}
                  <p className="export-helper">This package captures the approved content as it is now; later edits won't change it.</p>
                </>
              )}
              <ErrorNotice error={command.error} />
              {message && <Notice error>{message}</Notice>}
            </div>
            <footer className="export-modal-footer">
              <button type="button" className="secondary-button" disabled={command.pending} onClick={() => {
                if (step === 1) setOpen(false)
                else { setStep(1); setReviewVersion(null); setMessage(''); command.clear() }
              }}>
                {step === 1 ? 'Cancel' : <><ArrowLeft size={16} aria-hidden="true" /> Back</>}
              </button>
              <button type="submit" className="primary-button" disabled={command.pending || !canReview || (step === 2 && (versionChanged || (incomplete && !partial)))}>
                {command.pending ? 'Creating export…' : step === 1 ? <>Continue <ArrowRight size={16} aria-hidden="true" /></> : <><Download size={16} aria-hidden="true" /> Create approved export</>}
              </button>
            </footer>
          </form>
        </Modal>
      )}
      <ErrorNotice error={command.error} />
      {!open && message && <Notice>{message}</Notice>}
      <Panel>
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
                    <strong>{formats.find((entry) => entry.value === j.format)?.label ?? j.format.replaceAll('_', ' ')} export</strong>
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
