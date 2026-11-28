import {
  AppWindow,
  CalendarDays,
  Layers,
  Globe,
  MoreHorizontal,
} from 'lucide-react'
import { Modal } from '@/shared/components/Modal'
import './ProjectPage.css'
import './ProjectAccess.css'
import './ProjectViews.css'
import { ProjectContent } from '../components/ProjectContent'
import { ProjectTeamAccess } from '../../workspace/components/ProjectTeamAccess'
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
import type { TemplateDefinition } from '@/features/templates/types/template.types'
import { ConfirmDialog, useNotify } from '@/shared/components/Feedback'
import {
  Badge,
  Empty,
  ErrorNotice,
  Field,
  QueryState,
} from '@/shared/components/ProductUI'
import { Button, IconTile } from '@/shared/components/AccessUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { useWorkspace } from '@/shared/hooks/useWorkspace'
import { useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router'

const PROJECT_TYPE_LABEL: Record<string, string> = {
  WEBSITE: 'Website',
  WEB_APP: 'Web app',
  MOBILE_APP: 'Mobile app',
}

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
  const [editDetails, setEditDetails] = useState(false)
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
  const projectTabs = [
    ['checklist', 'Content'],
    ...(owner ? [['access', 'Access']] : []),
    ['files', 'Files'],
    ...(owner ? [['reminders', 'Reminders']] : []),
    ['activity', 'Activity'],
    ...(p?.permissions.canExport ? [['exports', 'Exports']] : []),
  ]

  async function saveTemplate() {
    if (!p || !data || !owner || command.pending) return
    const definition: TemplateDefinition = {
      schemaVersion: 1,
      key: `custom_${Date.now()}`,
      title: `${p.title} template`,
      projectType: p.projectType,
      industry: 'CUSTOM',
      sections: data.structure.map((section) => ({
        key: section.key,
        title: section.title,
        items: section.items.map((item) => ({
          key: item.key,
          label: item.label,
          type: item.type,
          instructions: item.instructions,
          example: item.example,
          required: item.required,
          validation: item.validation,
          visibleWhen: item.visibleWhen,
          enabled: item.enabled,
          ai: item.ai,
        })),
      })),
    }
    if (await command.run(`workspaces/${id}/templates`, { definition }))
      notify('Independent workspace template saved.')
  }

  const projectActions = p && owner && (
    <details className="project-actions-menu" onKeyDown={(event) => {
      if (event.key === 'Escape' && event.currentTarget.open) {
        event.currentTarget.open = false
        event.currentTarget.querySelector('summary')?.focus()
      }
    }}>
      <summary aria-label="Project actions" title="Project actions">
        <MoreHorizontal size={20} aria-hidden="true" />
      </summary>
      <div className="project-actions-popover" onClick={(event) => {
        if ((event.target as HTMLElement).closest('button, a'))
          event.currentTarget.closest('details')?.removeAttribute('open')
      }}>
        <button type="button" disabled={command.pending || !p.permissions.canManageAccess} onClick={() => {
          command.clear()
          setEditDetails(true)
        }}>Edit project</button>
        <button type="button" disabled={command.pending || !p.permissions.canManageAccess} onClick={() => void saveTemplate()}>
          Save as template
        </button>
        <Link to="?tab=completion">Project completion</Link>
        <Link to={base + '/projects'}>All projects</Link>
        {p.permissions.canManageAccess && lifecycleActions.map((a) => (
          <button key={a} type="button" disabled={command.pending} onClick={() => {
            operation.current = {
              signature: a + ':' + reason.trim(),
              key: crypto.randomUUID(),
              version: p.version,
            }
            setLifecycleError('')
            setAction(a)
          }}>
            {a.charAt(0).toUpperCase() + a.slice(1).replaceAll('-', ' ')} project
          </button>
        ))}
      </div>
    </details>
  )

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
  if (tab === 'details' && owner)
    return <Navigate replace to="?tab=checklist" />
  if (tab === 'assignments' && owner)
    return <Navigate replace to={'?tab=access#team-access'} />

  return (
    <QueryState query={{ ...query, isLoading: query.isFetching && !data }}>
      {p && data && (
        <>
          <div className="au-page-head project-access-head project-unified-head">
            <div className="au-summary">
              <IconTile icon={AppWindow} size={22} large />
              <div className="au-summary-main">
                <div className="au-summary-title-row">
                  <h1 className="au-summary-title">{p.title}</h1>
                  <Badge>{p.state}</Badge>
                </div>
                <div className="au-summary-meta">
                  <span className="au-meta-item">
                    <CalendarDays size={15} aria-hidden="true" />
                    {p.dueDate
                      ? 'Due ' +
                        new Date(p.dueDate + 'T12:00:00').toLocaleDateString(
                          undefined,
                          { month: 'short', day: 'numeric', year: 'numeric' },
                        )
                      : 'No due date'}
                  </span>
                  <span className="au-meta-item">
                    <Layers size={15} aria-hidden="true" />
                    {PROJECT_TYPE_LABEL[p.projectType]}
                  </span>
                  {tab !== 'access' && (
                    <span className="au-meta-item">
                      <Globe size={15} aria-hidden="true" />
                      {p.timezone}
                    </span>
                  )}
                </div>
              </div>
              <div className="au-summary-actions">
                {owner &&
                p.permissions.canManageAccess &&
                p.state === 'DRAFT' ? (
                  tab === 'access' ? (
                    <Button
                      variant="primary"
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
                    </Button>
                  ) : (
                    <Link className="au-btn au-btn--primary" to="?tab=access">
                      Send to client
                    </Link>
                  )
                ) : tab !== 'access' &&
                  tab !== 'checklist' &&
                  tab !== 'files' &&
                  tab !== 'reminders' &&
                  tab !== 'exports' &&
                  p.permissions.canReview &&
                  data.progress.submittedRequired >
                    data.progress.approvedRequired ? (
                  <Link className="au-btn au-btn--primary" to="?tab=checklist">
                    Review submissions
                  </Link>
                ) : tab === 'checklist' &&
                  p.permissions.canExport &&
                  data.progress.approvedRequired +
                    data.progress.optionalApproved >
                    0 ? (
                  <Link className="au-btn au-btn--primary" to="?tab=exports">
                    Export approved content
                  </Link>
                ) : null}
                {projectActions}
              </div>
            </div>
          </div>
          <nav className="tabs project-refined-tabs" aria-label="Project sections">
            {projectTabs.map(([key, label]) => (
              <Link
                key={key}
                to={'?tab=' + key}
                className={tab === key ? 'active' : ''}
                aria-current={tab === key ? 'page' : undefined}
              >
                {label}
              </Link>
            ))}
          </nav>
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
          {tab === 'checklist' && (
            <ProjectContent
              key={root}
              data={data}
              root={root}
              editing={editingRequest}
              sectionId={search.get('section')}
              itemId={search.get('item')}
              revisionId={search.get('revision')}
              onSelectSection={(section) =>
                setSearch(
                  {
                    tab: 'checklist',
                    section,
                    ...(editingRequest ? { edit: 'request' } : {}),
                  },
                  { replace: true },
                )
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
                  ? () => {
                      const next = new URLSearchParams(search)
                      if (editingRequest) next.delete('edit')
                      else next.set('edit', 'request')
                      setSearch(next, { replace: true })
                    }
                  : undefined
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
            <section
              aria-label="Project access and permissions"
              className="au-stack project-access-layout"
            >
              <CustomerPanel
                key={p.clientId}
                workspaceId={id}
                clientId={p.clientId}
                canManage={p.permissions.canManageAccess}
              />
              <ContactsPanel
                key={root}
                unpublished={p.state === 'DRAFT'}
                publicationMissing={publicationMissing}
                root={root}
                clientId={p.clientId}
                canManage={p.permissions.canManageAccess}
                canInvite={['ACTIVE', 'PAUSED', 'COMPLETED'].includes(p.state)}
              />
              {p.permissions.canManageAccess && (
                <ProjectTeamAccess root={root} />
              )}
            </section>
          )}
          {tab === 'reminders' && owner && <RemindersPanel root={root} />}
          {tab === 'activity' && <ActivityPanel root={root} />}
          {tab === 'exports' && p.permissions.canExport && (
            <ExportPanel root={root} project={p} />
          )}
          {editDetails && owner && p.permissions.canManageAccess && (
            <Modal title="Edit project" onClose={() => setEditDetails(false)} pending={command.pending} className="project-edit-modal">
              <form
                className="stack-form"
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (command.pending) return
                  const values = Object.fromEntries(new FormData(e.currentTarget))
                  if (await command.run(root, { ...values, expectedVersion: p.version }, 'PATCH')) {
                    notify('Project details saved.')
                    setEditDetails(false)
                  }
                }}
              >
                <Field label="Project name">
                  <input name="title" required defaultValue={p.title} />
                </Field>
                <Field label="Due date">
                  <input name="dueDate" type="date" required defaultValue={p.dueDate} />
                </Field>
                <Field label="Timezone">
                  <input name="timezone" required defaultValue={p.timezone} />
                </Field>
                <ErrorNotice error={command.error} />
                <div className="project-edit-footer">
                  <button type="button" className="secondary-button" disabled={command.pending} onClick={() => setEditDetails(false)}>Cancel</button>
                  <button className="primary-button" disabled={command.pending}>{command.pending ? 'Saving…' : 'Save changes'}</button>
                </div>
              </form>
            </Modal>
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
