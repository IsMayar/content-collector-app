import { env } from '@/config/env'
import type { UsageSummary } from '@/features/billing/types/billing.types'
import { UploadQueue } from '@/features/client/components/UploadQueue'
import type { AssetSummary } from '@/features/projects/types/file.types'
import type {
  Project,
  ProjectDetail,
} from '@/features/projects/types/project.types'
import { useData } from '@/services/api/resourceApi'
import { ConfirmDialog, Notice } from '@/shared/components/Feedback'
import { Modal } from '@/shared/components/Modal'
import {
  Badge,
  Empty,
  ErrorNotice,
  Heading,
  Panel,
  QueryState,
} from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { formatBytes } from '@/shared/utils/domain'
import { downloadFile } from '@/shared/utils/download'
import {
  Archive,
  CheckCircle2,
  FileText,
  Grid2X2,
  Image as ImageIcon,
  List,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

export function FilesPanel({
  root,
  project,
}: {
  root: string
  project: Project
}) {
  if (env.mocksEnabled) return <DemoFilesPanel root={root} project={project} />
  return (
    <Panel title="Project files">
      <p>
        The live service does not provide a project-wide file gallery. Clients
        add files to individual questions. Submitted files are available to
        authorized agency users from the exact revision.
      </p>
      <Link className="secondary-button" to="?tab=checklist">
        Open project content
      </Link>
    </Panel>
  )
}
function DemoFilesPanel({ root, project }: { root: string; project: Project }) {
  const detail = useData<ProjectDetail>(root)
  const [upload, setUpload] = useState(false),
    [uploadItem, setUploadItem] = useState(''),
    [uploaded, setUploaded] = useState<string[]>([])
  const eligible =
    detail.data?.structure
      .flatMap((s) => s.items)
      .filter(
        (i) =>
          ['IMAGE', 'FILE'].includes(i.type) &&
          !['SUBMITTED', 'APPROVED'].includes(i.state),
      ) || []
  const target = eligible.find((i) => i.id === uploadItem) || eligible[0]
  const q = useData<{
      data: (AssetSummary & { itemLabel: string; previewUrl?: string })[]
    }>(`${root}/assets`),
    usage = useData<UsageSummary>(`workspaces/${project.workspaceId}/usage`),
    command = useCommand()
  const [search, setSearch] = useState(''),
    [type, setType] = useState('all'),
    [status, setStatus] = useState('all'),
    [layout, setLayout] = useState('grid'),
    [selected, setSelected] = useState<
      (AssetSummary & { itemLabel: string; previewUrl?: string }) | null
    >(null),
    [remove, setRemove] = useState(false),
    [error, setError] = useState('')
  const assets = (q.data?.data || []).filter(
    (a) =>
      a.state !== 'DELETED' &&
      a.originalName.toLowerCase().includes(search.toLowerCase()) &&
      (status === 'all' || a.state === status) &&
      (type === 'all' ||
        (type === 'image'
          ? a.contentType?.startsWith('image/')
          : !a.contentType?.startsWith('image/'))),
  )
  async function download(a: AssetSummary) {
    const result = await command.run<{ url: string }>(
      `${root}/assets/${a.id}/download`,
      { variant: 'WORKING' },
    )
    if (result)
      try {
        await downloadFile(result.url, a.originalName)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Download failed')
      }
  }
  return (
    <>
      <Heading
        title="Project files"
        description="Manage images and documents linked to your project content."
      >
        {usage.data && (
          <div className="storage-meter">
            <strong>{formatBytes(usage.data?.storageUsedBytes || 0)}</strong> of{' '}
            {formatBytes(usage.data?.storageLimitBytes || 0)} used
            <progress
              aria-label="Workspace storage"
              value={usage.data?.storageUsedBytes || 0}
              max={usage.data?.storageLimitBytes || 1}
            />
          </div>
        )}
      </Heading>
      {q.data && project.permissions.canEditStructure && (
        <button
          className="primary-button"
          disabled={
            !eligible.length || !['ACTIVE', 'DRAFT'].includes(project.state)
          }
          onClick={() => setUpload(true)}
        >
          Upload files ＋
        </button>
      )}
      {upload && (
        <Modal title="Upload files" onClose={() => setUpload(false)}>
          <p>Add images, documents and other files linked to a content item.</p>
          <label className="stack-form">
            Linked content item
            <select
              value={target?.id || ''}
              onChange={(e) => {
                setUploadItem(e.target.value)
                setUploaded([])
              }}
            >
              {eligible.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </select>
          </label>
          {target && (
            <UploadQueue
              key={target.id}
              client={false}
              root={root}
              itemId={target.id}
              image={target.type === 'IMAGE'}
              assets={q.data?.data.filter((a) => a.itemId === target.id) || []}
              selected={uploaded}
              onChange={(ids) => {
                setUploaded(ids)
                void q.refetch()
              }}
              disabled={false}
            />
          )}
          <Notice>
            Files stay linked to this item. Only client submissions can move its
            answer into review.
          </Notice>
        </Modal>
      )}
      <div className="board-toolbar file-filters">
        <input
          aria-label="Search project files"
          placeholder="Search files by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="File type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="all">All types</option>
          <option value="image">Images</option>
          <option value="document">Documents</option>
        </select>
        <select
          aria-label="File status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All statuses</option>
          {['READY', 'PROCESSING', 'REJECTED', 'FAILED', 'RESERVED'].map(
            (s) => (
              <option key={s}>{s}</option>
            ),
          )}
        </select>
        <div className="view-toggle">
          <button
            aria-label="Gallery view"
            aria-pressed={layout === 'grid'}
            onClick={() => setLayout('grid')}
          >
            <Grid2X2 size={18} />
          </button>
          <button
            aria-label="List view"
            aria-pressed={layout === 'list'}
            onClick={() => setLayout('list')}
          >
            <List size={18} />
          </button>
        </div>
      </div>
      <QueryState query={q}>
        {assets.length ? (
          <div
            className={`file-gallery ${layout === 'list' ? 'file-list' : ''}`}
          >
            {assets.map((a) => (
              <button
                className="file-card"
                key={a.id}
                onClick={() => setSelected(a)}
              >
                <div className="file-art">
                  <Badge>{a.state}</Badge>
                  {a.previewUrl ? (
                    <img src={a.previewUrl} alt="" loading="lazy" />
                  ) : a.contentType?.startsWith('image/') ? (
                    <ImageIcon size={44} />
                  ) : (
                    <FileText size={44} />
                  )}
                </div>
                <strong>{a.originalName}</strong>
                <small>
                  {a.contentType || 'File'} · {formatBytes(a.sourceBytes)}
                </small>
                <small>
                  {a.keepOriginal
                    ? 'Original retained'
                    : 'Optimized working copy'}
                </small>
                <span className="text-link">{a.itemLabel}</span>
              </button>
            ))}
          </div>
        ) : (
          <Empty
            title="No matching project files"
            description="Files uploaded through client content items appear here. Try another filter or invite your client to add files."
          />
        )}
      </QueryState>
      <ErrorNotice error={error || command.error} />
      {selected && (
        <Modal
          title={selected.originalName}
          drawer
          onClose={() => setSelected(null)}
        >
          <div className="file-detail-art">
            {selected.previewUrl ? (
              <img src={selected.previewUrl} alt={selected.originalName} />
            ) : selected.contentType?.startsWith('image/') ? (
              <ImageIcon size={90} />
            ) : (
              <FileText size={90} />
            )}
            <Badge>{selected.state}</Badge>
          </div>
          <dl className="file-metadata">
            <dt>File type</dt>
            <dd>{selected.contentType || 'Unknown'}</dd>
            <dt>Source size</dt>
            <dd>{formatBytes(selected.sourceBytes)}</dd>
            <dt>Stored size</dt>
            <dd>{formatBytes(selected.retainedBytes)}</dd>
            <dt>Available variants</dt>
            <dd>{selected.availableVariants.join(', ') || 'Processing'}</dd>
            <dt>Linked content item</dt>
            <dd>{selected.itemLabel}</dd>
          </dl>
          <h3>Original retention</h3>
          <p>
            {selected.keepOriginal
              ? 'Original file kept without changes.'
              : 'Only the optimized working copy is retained.'}
          </p>
          {selected.rejectionCode && (
            <Notice error>{selected.rejectionCode}</Notice>
          )}
          <div className="modal-actions">
            <button
              className="primary-button"
              disabled={selected.state !== 'READY' || command.pending}
              onClick={() => void download(selected)}
            >
              Download
            </button>
            {project.permissions.canManageAccess && (
              <button className="danger-button" onClick={() => setRemove(true)}>
                Remove
              </button>
            )}
          </div>
          <ErrorNotice error={error || command.error} />
        </Modal>
      )}
      <ConfirmDialog
        open={remove}
        title="Remove this file?"
        description={
          <>
            <p>
              This removes an unsubmitted file. Files referenced by immutable
              submissions cannot be removed.
            </p>
            <ErrorNotice error={command.error} />
          </>
        }
        confirmLabel="Remove file"
        pending={command.pending}
        onCancel={() => setRemove(false)}
        onConfirm={() =>
          void (async () => {
            if (
              selected &&
              (await command.run(
                `${root}/assets/${selected.id}`,
                undefined,
                'DELETE',
              ))
            ) {
              setRemove(false)
              setSelected(null)
            }
          })()
        }
      />
    </>
  )
}
export function CompletionPanel({
  root,
  project,
}: {
  root: string
  project: Project
}) {
  const command = useCommand(),
    [action, setAction] = useState('')
  const ready =
    project.progress.requiredTotal > 0 &&
    project.progress.approvedRequired === project.progress.requiredTotal
  return (
    <>
      <Heading
        title="Project completion"
        description="Review your progress, download approved content and archive when you’re finished."
      >
        <Badge>{project.state}</Badge>
      </Heading>
      <Panel
        title={
          ready
            ? 'All required content approved'
            : 'Content collection in progress'
        }
      >
        <div className="completion-callout">
          <CheckCircle2 size={36} />
          <div className="grow">
            <h3>
              {ready
                ? 'Ready for your final handoff'
                : 'Keep your project moving'}
            </h3>
            <p>
              {ready
                ? 'Create a final approved package before archiving.'
                : `${project.progress.clientActionRequired} required items still need client action.`}
            </p>
          </div>
          {project.permissions.canExport &&
            project.progress.approvedRequired +
              project.progress.optionalApproved >
              0 && (
              <Link className="primary-button" to="?tab=exports">
                Download approved package
              </Link>
            )}
        </div>
      </Panel>
      <Panel title="Need to make a change?">
        <p>
          You can reopen an approved item to request updates. Previous approvals
          remain in history.
        </p>
        <Link className="secondary-button" to="?tab=checklist">
          Reopen an item
        </Link>
      </Panel>
      {project.permissions.canManageAccess &&
        ['ACTIVE', 'PAUSED'].includes(project.state) && (
          <Panel title="Mark project complete">
            <p>Complete the project once all required content is approved.</p>
            <button
              className="primary-button"
              disabled={!ready}
              onClick={() => setAction('complete')}
            >
              Complete project
            </button>
          </Panel>
        )}
      <Panel
        title={
          project.state === 'ARCHIVED' ? 'Restore project' : 'Archive project'
        }
      >
        <div className="completion-callout">
          <Archive />
          <p className="grow">
            Archiving hides the project from active projects. You can restore it
            later.
          </p>
          <button
            className="danger-button"
            onClick={() =>
              setAction(project.state === 'ARCHIVED' ? 'restore' : 'archive')
            }
          >
            {project.state === 'ARCHIVED'
              ? 'Restore project'
              : 'Archive project'}
          </button>
        </div>
      </Panel>
      <ErrorNotice error={command.error} />
      <ConfirmDialog
        open={!!action}
        title={`${action === 'archive' ? 'Archive' : action === 'restore' ? 'Restore' : 'Complete'} this project?`}
        description={
          <>
            <p>Your content and submission history will be retained.</p>
            <ErrorNotice error={command.error} />
          </>
        }
        confirmLabel="Confirm"
        pending={command.pending}
        onCancel={() => setAction('')}
        onConfirm={() =>
          void (async () => {
            if (
              await command.run(`${root}/${action}`, {
                expectedVersion: project.version,
                reason: 'Project handoff',
              })
            )
              setAction('')
          })()
        }
      />
    </>
  )
}
