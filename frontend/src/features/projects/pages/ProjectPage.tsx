import { LiveReviewPanel } from '@/features/review/components/LiveReviewPanel'
import { useRef } from 'react'
import { LiveCompletionPanel } from '../components/LiveCompletionPanel'
import { env } from '@/config/env'
import { SubmissionHistoryPanel } from '../components/SubmissionHistoryPanel'
import { AnalyticsPanel } from '@/features/analytics/components/AnalyticsPanel'
import { useProjectDetail } from '@/features/projects/api/projectsApi'
import { CustomerPanel } from '@/features/clients/components/CustomerPanel'
import { ContactsPanel } from '@/features/clients/components/ProjectContactsPanel'
import { AssignmentsPanel } from '@/features/projects/components/AssignmentsPanel'
import {
  CompletionPanel,
  FilesPanel,
} from '@/features/projects/components/FilesPanel'
import { PreviewPanel } from '@/features/projects/components/PreviewPanel'
import { RemindersPanel } from '@/features/reminders/components/RemindersPanel'
import {
  ActivityPanel,
  ExportPanel,
  ReviewPanel,
} from '@/features/review/components/ReviewPanels'
import { StructureEditor } from '@/features/structure-editor/components/StructureEditor'
import type { TemplateDefinition } from '@/features/templates/types/template.types'
import { ConfirmDialog, useNotify } from '@/shared/components/Feedback'
import {
  Badge,
  DualProgress,
  Empty,
  ErrorNotice,
  Field,
  Heading,
  Panel,
  QueryState,
} from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { useWorkspace } from '@/shared/hooks/useWorkspace'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
export function ProjectPage() {
  const { id, base, owner } = useWorkspace()
  const { projectId } = useParams()
  const root = `workspaces/${id}/projects/${projectId}`
  const query = useProjectDetail(id, projectId || '')
  const [search] = useSearchParams()
  const tab = search.get('tab') || 'checklist'
  const command = useCommand()
  const notify = useNotify()
  const [action, setAction] = useState('')
  const [reason, setReason] = useState('')
  const operation = useRef<{
    signature: string
    key: string
    version: number
  } | null>(null)
  const lifecycleBusy = useRef(false)
  const [lifecycleError, setLifecycleError] = useState('')
  const data = query.data
  const p = data?.project
  async function lifecycle() {
    if (!p || lifecycleBusy.current) return
    if (action === 'reopen' && !reason.trim()) {
      setLifecycleError('Provide a reason for reopening this project.')
      return
    }
    const signature = action + ':' + reason.trim()
    if (operation.current?.signature !== signature)
      operation.current = {
        signature,
        key: crypto.randomUUID(),
        version: operation.current?.version ?? p.version,
      }
    lifecycleBusy.current = true
    setLifecycleError('')
    try {
      const result = await command.run<{ projectState: string }>(
        `${root}/${action}`,
        {
          expectedVersion: operation.current.version,
          reason: reason.trim() || undefined,
        },
        'POST',
        { 'Idempotency-Key': operation.current.key },
      )
      if (!result) return
      const expected: Record<string, string> = {
        publish: 'ACTIVE',
        pause: 'PAUSED',
        resume: 'ACTIVE',
        complete: 'COMPLETED',
        reopen: 'ACTIVE',
        archive: 'ARCHIVED',
        restore: 'PAUSED',
        'delete-request': 'DELETION_PENDING',
      }
      if (result.projectState !== expected[action]) {
        setLifecycleError(
          'The project state could not be verified. Refresh before continuing.',
        )
        return
      }
      notify(`Project ${action} completed.`)
      setAction('')
      setReason('')
      operation.current = null
    } finally {
      lifecycleBusy.current = false
    }
  }
  return (
    <QueryState query={query}>
      {p && data && (
        <>
          <Link className="back-link" to={`${base}/projects`}>
            All projects
          </Link>
          <Heading
            eyebrow={`${p.clientBusinessName} / ${p.projectType.replaceAll('_', ' ')}`}
            title={p.title}
            description={`Due ${p.dueDate} · ${p.timezone}`}
          >
            <Badge>{p.state}</Badge>
            {owner && (
              <>
                <select
                  aria-label="Project action"
                  value=""
                  onChange={(e) => {
                    operation.current = {
                      signature: e.target.value + ':' + reason.trim(),
                      key: crypto.randomUUID(),
                      version: p.version,
                    }
                    setLifecycleError('')
                    setAction(e.target.value)
                  }}
                >
                  <option value="">Project actions</option>
                  {(
                    {
                      DRAFT: ['publish', 'archive'],
                      ACTIVE: ['pause', 'complete', 'archive'],
                      PAUSED: ['resume', 'complete', 'archive'],
                      COMPLETED: ['reopen', 'archive'],
                      ARCHIVED: env.mocksEnabled
                        ? ['restore', 'delete-request']
                        : ['restore'],
                      DELETION_PENDING: [],
                    } as Record<string, string[]>
                  )[p.state].map((a) => (
                    <option key={a} value={a}>
                      {a.replaceAll('-', ' ')}
                    </option>
                  ))}
                </select>
              </>
            )}
          </Heading>
          <div className="project-navigation-bar">
            <nav
              className="tabs project-primary-tabs"
              aria-label="Project sections"
            >
              {[
                ['checklist', 'Content'],
                ['activity', 'Activity'],
                ['submissions', 'Submitted versions'],
                ['analytics', 'Analytics'],
                ...(owner ? [['access', 'Client access']] : []),
                ...(p.permissions.canReview ? [['review', 'Review']] : []),
              ].map(([key, label]) => (
                <Link
                  key={key}
                  to={`?tab=${key}`}
                  className={tab === key ? 'active' : ''}
                  aria-current={tab === key ? 'page' : undefined}
                >
                  {label}
                </Link>
              ))}
            </nav>
            <nav className="project-tools" aria-label="Project tools">
              {[
                ...(owner ? [['preview', 'Client preview']] : []),
                ...(owner
                  ? [
                      ['assignments', 'Team'],
                      ['reminders', 'Reminders'],
                    ]
                  : []),
                ['files', 'Files'],
                ...(p.permissions.canExport ? [['exports', 'Exports']] : []),
                ...(owner ? [['completion', 'Completion']] : []),
                ...(owner ? [['details', 'Details']] : []),
              ].map(([key, label]) => (
                <Link
                  key={key}
                  to={`?tab=${key}`}
                  className={tab === key ? 'active' : ''}
                  aria-current={tab === key ? 'page' : undefined}
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>
          <details className="project-progress-disclosure">
            <summary>
              Collection progress · {data.progress.submittedRequired}/
              {data.progress.requiredTotal} submitted ·{' '}
              {data.progress.approvedRequired}/{data.progress.requiredTotal}{' '}
              approved
            </summary>
            <div className="project-summary">
              <DualProgress progress={data.progress} />
              <p>
                <strong>{data.progress.clientActionRequired}</strong> required
                items need client action
                <br />
                <small>
                  Optional approved: {data.progress.optionalApproved}
                </small>
              </p>
            </div>
          </details>
          <ErrorNotice error={command.error} />
          {(![
            'checklist',
            'activity',
            'analytics',
            'preview',
            'files',
            'access',
            'assignments',
            'reminders',
            'completion',
            'details',
            'review',
            'exports',
          ].includes(tab) ||
            ([
              'access',
              'preview',
              'assignments',
              'reminders',
              'completion',
              'details',
            ].includes(tab) &&
              !owner) ||
            (tab === 'review' && !p.permissions.canReview) ||
            (tab === 'exports' && !p.permissions.canExport)) && (
            <Empty
              title="This project view is unavailable"
              description="Choose Content or another permitted project view."
              to="?tab=checklist"
              label="Back to content"
            />
          )}
          {tab === 'checklist' && (
            <StructureEditor
              key={p.id}
              data={data}
              root={root}
              editable={
                p.permissions.canEditStructure &&
                !['ARCHIVED', 'COMPLETED'].includes(p.state)
              }
            />
          )}
          {tab === 'files' && <FilesPanel root={root} project={p} />}
          {tab === 'completion' &&
            owner &&
            (env.mocksEnabled ? (
              <CompletionPanel root={root} project={p} />
            ) : (
              <LiveCompletionPanel
                project={p}
                onAction={(a) => {
                  operation.current = null
                  setAction(a)
                }}
              />
            ))}
          {tab === 'preview' && owner && <PreviewPanel root={root} />}
          {tab === 'access' && owner && (
            <>
              <CustomerPanel workspaceId={id} clientId={p.clientId} />
              <ContactsPanel
                root={root}
                clientId={p.clientId}
                canInvite={['ACTIVE', 'PAUSED', 'COMPLETED'].includes(p.state)}
              />
            </>
          )}
          {tab === 'assignments' && owner && <AssignmentsPanel root={root} />}
          {tab === 'reminders' && owner && <RemindersPanel root={root} />}
          {tab === 'review' &&
            p.permissions.canReview &&
            (env.mocksEnabled ? (
              <ReviewPanel root={root} />
            ) : (
              <LiveReviewPanel
                key={root}
                root={root}
                items={data.structure.flatMap((s) => s.items)}
                canMutate={['ACTIVE', 'PAUSED'].includes(p.state)}
              />
            ))}
          {tab === 'submissions' && (
            <SubmissionHistoryPanel
              key={root}
              root={root}
              items={data.structure.flatMap((s) => s.items)}
            />
          )}
          {tab === 'activity' && <ActivityPanel root={root} />}
          {tab === 'exports' && p.permissions.canExport && (
            <ExportPanel root={root} project={p} />
          )}
          {tab === 'analytics' && <AnalyticsPanel root={root} />}
          {tab === 'details' && owner && (
            <Panel title="Project details">
              <form
                className="stack-form"
                onSubmit={async (e) => {
                  e.preventDefault()
                  const values = Object.fromEntries(
                    new FormData(e.currentTarget),
                  )
                  if (
                    await command.run(
                      root,
                      { ...values, expectedVersion: p.version },
                      'PATCH',
                    )
                  )
                    notify('Project details saved.')
                }}
              >
                <Field label="Project name">
                  <input name="title" required defaultValue={p.title} />
                </Field>
                <Field label="Due date">
                  <input
                    name="dueDate"
                    type="date"
                    required
                    defaultValue={p.dueDate}
                  />
                </Field>
                <Field label="Timezone">
                  <input name="timezone" required defaultValue={p.timezone} />
                </Field>
                <button className="primary-button" disabled={command.pending}>
                  Save details
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={async () => {
                    const definition: TemplateDefinition = {
                      schemaVersion: 1,
                      key: `custom_${Date.now()}`,
                      title: `${p.title} template`,
                      projectType: p.projectType,
                      industry: 'CUSTOM',
                      sections: data.structure.map((s) => ({
                        key: s.key,
                        title: s.title,
                        items: s.items.map((i) => ({
                          key: i.key,
                          label: i.label,
                          type: i.type,
                          instructions: i.instructions,
                          example: i.example,
                          required: i.required,
                          validation: i.validation,
                          visibleWhen: i.visibleWhen,
                          enabled: i.enabled,
                          ai: i.ai,
                        })),
                      })),
                    }
                    if (
                      await command.run(`workspaces/${id}/templates`, {
                        definition,
                      })
                    )
                      notify('Independent workspace template saved.')
                  }}
                >
                  Save checklist as workspace template
                </button>
              </form>
            </Panel>
          )}
          <ConfirmDialog
            open={!!action}
            pending={command.pending}
            title={`${action.replaceAll('-', ' ')} project?`}
            description={
              <>
                <p>
                  Changes affect client access and reminders. Existing
                  submissions and historical approvals are retained.
                </p>
                {['reopen', 'delete-request'].includes(action) && (
                  <Field label="Reason">
                    <input
                      required
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </Field>
                )}
                <ErrorNotice error={lifecycleError || command.error} />
                {(lifecycleError || command.error) && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={async () => {
                      await query.refetch()
                      operation.current = null
                      setLifecycleError('')
                    }}
                  >
                    Refresh project state; keep reason
                  </button>
                )}
              </>
            }
            confirmLabel={`Confirm ${action}`}
            onCancel={() => setAction('')}
            onConfirm={() => void lifecycle()}
          />
        </>
      )}
    </QueryState>
  )
}
