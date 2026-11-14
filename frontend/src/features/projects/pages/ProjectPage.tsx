import { AppWindow, CalendarDays, Eye, Layers, UsersRound } from 'lucide-react'
import { StatusShareSettings } from '@/features/analytics/components/StatusShareSettings'
import { ProjectContent } from '../components/ProjectContent'
import { useRef } from 'react'
import { LiveCompletionPanel } from '../components/LiveCompletionPanel'
import { env } from '@/config/env'
import { useProjectContacts } from '@/features/clients/api/clientsApi'
import { useProjectDetail } from '@/features/projects/api/projectsApi'
import { CustomerPanel } from '@/features/clients/components/CustomerPanel'
import { ContactsPanel } from '@/features/clients/components/ProjectContactsPanel'
import {
  CompletionPanel,
  FilesPanel,
} from '@/features/projects/components/FilesPanel'
import { RemindersPanel } from '@/features/reminders/components/RemindersPanel'
import {
  ActivityPanel,
  ExportPanel,
} from '@/features/review/components/ReviewPanels'
import { StructureEditor } from '@/features/structure-editor/components/StructureEditor'
import type { TemplateDefinition } from '@/features/templates/types/template.types'
import { ConfirmDialog, useNotify } from '@/shared/components/Feedback'
import {
  Badge,
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
import { Link, Navigate, useParams, useSearchParams } from 'react-router'
export function ProjectPage() {
  const { id, base, owner } = useWorkspace()
  const { projectId } = useParams()
  const root = `workspaces/${id}/projects/${projectId}`
  const [search, setSearch] = useSearchParams()
  const tab = search.get('tab') || 'checklist'
  const query = useProjectDetail(
    id,
    projectId || '',
    tab === 'checklist' ? 15000 : undefined,
  )
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
  const data = query.currentData as
    import('../types/project.types').ProjectDetail | undefined
  const p = data?.project
  const canEditRequest =
    !!p?.permissions.canEditStructure &&
    ['DRAFT', 'ACTIVE', 'PAUSED'].includes(p.state)
  const editingRequest = canEditRequest && search.get('edit') === 'request'
  const contacts = useProjectContacts(owner && tab === 'access' ? root : '')
  const publicationMissing = [
    !p?.dueDate && 'a due date',
    !data?.structure.some(
      (section) =>
        section.enabled !== false &&
        section.items.some((item) => item.enabled !== false),
    ) && 'an enabled question',
    !contacts.data?.data.some(
      (contact) =>
        contact.state === 'ACTIVE' &&
        Date.parse(contact.accessExpiresAt) > Date.now(),
    ) && 'an active client contact',
  ].filter(Boolean)
  const lifecycleActions =
    p?.state === 'ACTIVE'
      ? ['pause']
      : p?.state === 'PAUSED'
        ? ['resume']
        : p?.state === 'COMPLETED' && env.mocksEnabled
          ? ['reopen']
          : p?.state === 'ARCHIVED' && env.mocksEnabled
            ? ['delete-request']
            : []
  const secondary = [
    ['activity', 'Activity'],
    ...(owner
      ? [
          ['assignments', 'Assignments'],
          ['reminders', 'Reminders'],
        ]
      : []),
    ['files', 'Files'],
    ...(p?.permissions.canExport ? [['exports', 'Exports']] : []),
    ...(owner
      ? [
          ['completion', 'Completion'],
          ['details', 'Details'],
        ]
      : []),
  ]
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
  if (
    ['review', 'responses', 'submissions', 'analytics', 'preview'].includes(tab)
  ) {
    const target = new URLSearchParams({ tab: 'checklist' })
    for (const [key, alias] of [
      ['section', 'sectionId'],
      ['item', 'itemId'],
      ['revision', 'revisionId'],
    ]) {
      const value = search.get(key) || search.get(alias)
      if (value) target.set(key, value)
    }
    return <Navigate replace to={'?' + target.toString()} />
  }
  if (tab === 'assignments' && owner)
    return (
      <Navigate
        replace
        to={base + '/team?projectId=' + encodeURIComponent(projectId || '')}
      />
    )
  return (
    <QueryState query={{ ...query, isLoading: query.isFetching && !data }}>
      {p && data && (
        <>
          {tab === 'access' ? (
            <div className="client-access-project-header">
              <div className="client-access-breadcrumb">
                <Link to={base + '/projects'}>Projects</Link>
                <span aria-hidden="true">›</span>
                <span>{p.title}</span>
              </div>
              <div className="client-access-project-summary">
                <span className="client-access-project-icon" aria-hidden="true">
                  <AppWindow size={32} />
                </span>
                <div className="client-access-project-info">
                  <div className="client-access-title">
                    <h1>{p.title}</h1>
                    <Badge>{p.state}</Badge>
                  </div>
                  <div className="client-access-project-meta">
                    <span>
                      <CalendarDays size={18} aria-hidden="true" />
                      {p.dueDate
                        ? 'Due ' +
                          new Date(p.dueDate + 'T12:00:00').toLocaleDateString(
                            undefined,
                            { month: 'short', day: 'numeric', year: 'numeric' },
                          )
                        : 'No due date'}
                    </span>
                    <span>
                      <Layers size={18} aria-hidden="true" />
                      {
                        {
                          WEBSITE: 'Website',
                          WEB_APP: 'Web app',
                          MOBILE_APP: 'Mobile app',
                        }[p.projectType]
                      }
                    </span>
                    {contacts.data && (
                      <span>
                        <UsersRound size={18} aria-hidden="true" />
                        {contacts.data.data.length}{' '}
                        {contacts.data.data.length === 1
                          ? 'contact'
                          : 'contacts'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="client-access-header-actions">
                  <Link className="secondary-button" to="?tab=checklist">
                    <Eye size={18} aria-hidden="true" />
                    View project
                  </Link>
                  {owner &&
                    p.permissions.canManageAccess &&
                    p.state === 'DRAFT' && (
                      <button
                        className="primary-button"
                        disabled={
                          command.pending ||
                          !contacts.data ||
                          publicationMissing.length > 0
                        }
                        onClick={() => {
                          operation.current = null
                          setLifecycleError('')
                          setAction('publish')
                        }}
                      >
                        Publish project
                      </button>
                    )}
                </div>
              </div>
            </div>
          ) : (
            <>
              <Link className="back-link" to={`${base}/projects`}>
                All projects
              </Link>
              <Heading
                eyebrow={`${p.clientBusinessName} / ${p.projectType.replaceAll('_', ' ')}`}
                title={p.title}
                description={
                  p.dueDate
                    ? `Due ${p.dueDate} · ${p.timezone}`
                    : `No due date · ${p.timezone}`
                }
              >
                <Badge>{p.state}</Badge>
                {owner &&
                p.permissions.canManageAccess &&
                p.state === 'DRAFT' &&
                tab !== 'access' ? (
                  <Link className="primary-button" to="?tab=access">
                    Send to client
                  </Link>
                ) : p.permissions.canReview &&
                  data.progress.submittedRequired >
                    data.progress.approvedRequired &&
                  tab !== 'checklist' ? (
                  <Link className="primary-button" to="?tab=checklist">
                    Review submissions
                  </Link>
                ) : p.permissions.canExport &&
                  data.progress.approvedRequired +
                    data.progress.optionalApproved >
                    0 &&
                  tab !== 'exports' ? (
                  <Link className="primary-button" to="?tab=exports">
                    Export approved content
                  </Link>
                ) : owner &&
                  p.state === 'ACTIVE' &&
                  data.progress.clientActionRequired > 0 &&
                  tab !== 'access' ? (
                  <Link className="secondary-button" to="?tab=access">
                    Manage client request
                  </Link>
                ) : null}
                {owner &&
                  p.permissions.canManageAccess &&
                  lifecycleActions.length > 0 && (
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
                      {lifecycleActions.map((a) => (
                        <option key={a} value={a}>
                          {a.replaceAll('-', ' ')}
                        </option>
                      ))}
                    </select>
                  )}
              </Heading>
            </>
          )}
          <div className="project-navigation-bar simplified-project-nav">
            <nav
              className="tabs project-primary-tabs"
              aria-label="Project sections"
            >
              {[
                ['checklist', 'Content', tab === 'checklist'],
                ...(owner
                  ? [['access', 'Client access', tab === 'access']]
                  : []),
              ].map(([key, label, active]) => (
                <Link
                  key={String(key)}
                  to={'?tab=' + key}
                  className={active ? 'active' : ''}
                  aria-current={active ? 'page' : undefined}
                >
                  {label}
                </Link>
              ))}
            </nav>
            <Field label="More project views">
              <select
                value={secondary.some(([key]) => key === tab) ? tab : ''}
                onChange={(e) => setSearch({ tab: e.target.value })}
              >
                <option value="" disabled>
                  More
                </option>
                {secondary.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <ErrorNotice error={command.error} />
          {(![
            'checklist',
            'activity',
            'files',
            'access',
            'assignments',
            'reminders',
            'completion',
            'details',
            'exports',
          ].includes(tab) ||
            ([
              'access',
              'assignments',
              'reminders',
              'completion',
              'details',
            ].includes(tab) &&
              !owner) ||
            (tab === 'exports' && !p.permissions.canExport)) && (
            <Empty
              title="This project view is unavailable"
              description="Choose Content or another permitted project view."
              to="?tab=checklist"
              label="Back to content"
            />
          )}
          {tab === 'checklist' && !editingRequest && (
            <ProjectContent
              key={root}
              data={data}
              root={root}
              sectionId={search.get('section')}
              itemId={search.get('item')}
              revisionId={search.get('revision')}
              onSelectSection={(section) =>
                setSearch({ tab: 'checklist', section }, { replace: true })
              }
              onSelectItem={(item) => {
                const section = data.structure.find((s) =>
                  s.items.some((i) => i.id === (item || search.get('item'))),
                )
                setSearch(
                  {
                    tab: 'checklist',
                    ...(section ? { section: section.id } : {}),
                    ...(item ? { item } : {}),
                  },
                  { replace: true },
                )
              }}
              onEdit={
                canEditRequest
                  ? () => setSearch({ tab: 'checklist', edit: 'request' })
                  : undefined
              }
            />
          )}
          {tab === 'checklist' && editingRequest && (
            <StructureEditor
              key={p.id}
              data={data}
              root={root}
              editMode={search.get('edit') === 'request'}
              onEditMode={(enabled) =>
                setSearch({
                  tab: 'checklist',
                  ...(enabled ? { edit: 'request' } : {}),
                })
              }
              editable={
                p.permissions.canEditStructure &&
                ['DRAFT', 'ACTIVE', 'PAUSED'].includes(p.state)
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
          {tab === 'access' && owner && (
            <>
              <div className="project-customer-card">
                <CustomerPanel
                  key={p.clientId}
                  workspaceId={id}
                  clientId={p.clientId}
                />
              </div>
              <ContactsPanel
                key={root}
                unpublished={p.state === 'DRAFT'}
                publicationMissing={publicationMissing}
                root={root}
                clientId={p.clientId}
                canManage={p.permissions.canManageAccess}
                canInvite={['ACTIVE', 'PAUSED', 'COMPLETED'].includes(p.state)}
              />
            </>
          )}
          {tab === 'reminders' && owner && <RemindersPanel root={root} />}
          {tab === 'activity' && <ActivityPanel root={root} />}
          {tab === 'exports' && p.permissions.canExport && (
            <ExportPanel root={root} project={p} />
          )}
          {tab === 'details' && owner && (
            <>
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
              {p.permissions.canManageAccess && (
                <StatusShareSettings
                  key={root}
                  root={root}
                  progress={data.progress}
                />
              )}
            </>
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
