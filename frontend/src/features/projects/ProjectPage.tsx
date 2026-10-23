import { useState, useEffect, useRef, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  Plus,
  Pencil,
  FileText,
  X,
} from 'lucide-react'
import { useData } from '@/api/productApi'
import type {
  Assignment,
  ClientChecklist,
  Item,
  ItemDefinition,
  Member,
  ProjectDetail,
  RepeaterColumn,
  Section,
  TemplateDefinition,
} from '@/api/productTypes'
import {
  Badge,
  DualProgress,
  ErrorNotice,
  Field,
  Heading,
  Panel,
  QueryState,
  fieldTypes,
  useCommand,
  useWorkspace,
} from '@/components/ProductUI'
import { ConfirmDialog, Notice, useNotify } from '@/components/Feedback'
import {
  ReviewPanel,
  ActivityPanel,
  ExportPanel,
} from '@/features/review/ReviewPanels'
import { AnalyticsPanel } from '@/features/settings/SettingsPages'
import { FilesPanel, CompletionPanel } from './FilesPanel'
import { ContactsPanel } from './AccessPanels'
import { RemindersPanel } from '@/features/settings/RemindersPanel'

export function ProjectPage() {
  const { id, base, owner } = useWorkspace()
  const { projectId } = useParams()
  const root = `workspaces/${id}/projects/${projectId}`
  const query = useData<ProjectDetail>(root)
  const [search] = useSearchParams()
  const tab = search.get('tab') || 'checklist'
  const command = useCommand()
  const notify = useNotify()
  const [action, setAction] = useState('')
  const [reason, setReason] = useState('')
  const data = query.data
  const p = data?.project
  async function lifecycle() {
    if (!p) return
    if (
      await command.run(`${root}/${action}`, {
        expectedVersion: p.version,
        reason,
      })
    ) {
      notify(`Project ${action} completed.`)
      setAction('')
      setReason('')
    }
  }
  return (
    <QueryState query={query}>
      {p && data && (
        <>
          <Link className="back-link" to={`${base}/projects`}>
            ← All projects
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
                  onChange={(e) => setAction(e.target.value)}
                >
                  <option value="">Project actions</option>
                  {(
                    {
                      DRAFT: ['publish', 'archive'],
                      ACTIVE: ['pause', 'complete', 'archive'],
                      PAUSED: ['resume', 'complete', 'archive'],
                      COMPLETED: ['reopen', 'archive'],
                      ARCHIVED: ['restore', 'delete-request'],
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
                ...(owner
                  ? [
                      ['analytics', 'Analytics'],
                      ['access', 'Client access'],
                    ]
                  : []),
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
                ['preview', 'Client preview'],
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
          {tab === 'completion' && owner && (
            <CompletionPanel root={root} project={p} />
          )}
          {tab === 'preview' && <PreviewPanel root={root} />}
          {tab === 'access' && owner && <ContactsPanel root={root} />}
          {tab === 'assignments' && owner && <AssignmentsPanel root={root} />}
          {tab === 'reminders' && owner && <RemindersPanel root={root} />}
          {tab === 'review' && p.permissions.canReview && (
            <ReviewPanel root={root} />
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
                <ErrorNotice error={command.error} />
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
function StructureEditor({
  data,
  root,
  editable,
}: {
  data: ProjectDetail
  root: string
  editable: boolean
}) {
  const latest = useData<ProjectDetail>(root)
  const command = useCommand()
  const notify = useNotify()
  const [editing, setEditing] = useState<{
    section: Section
    item?: Item
  } | null>(null)
  const [selectedSection, setSelectedSection] = useState('')
  const currentSection =
    data.structure.find((s) => s.id === selectedSection) || data.structure[0]
  const [drag, setDrag] = useState('')
  const [sectionTitle, setSectionTitle] = useState('')
  async function reorder(sections: Section[]) {
    if (
      await command.run(`${root}/structure/reorder`, {
        sectionIds: sections.map((s) => s.id),
        itemOrderBySection: Object.fromEntries(
          sections.map((s) => [s.id, s.items.map((i) => i.id)]),
        ),
        expectedStructureVersion: data.project.structureVersion,
      })
    )
      notify('Order updated.')
  }
  function moveSection(index: number, delta: number) {
    const sections = structuredClone(data.structure)
    const [s] = sections.splice(index, 1)
    sections.splice(index + delta, 0, s)
    void reorder(sections)
  }
  function moveItem(s: Section, index: number, delta: number) {
    const sections = structuredClone(data.structure)
    const target = sections.find((t) => t.id === s.id)!
    const [i] = target.items.splice(index, 1)
    target.items.splice(index + delta, 0, i)
    void reorder(sections)
  }
  return (
    <>
      <div className="section-intro">
        <div>
          <h2>Project content</h2>
          <p className="subtle">
            Organise your content and capture what you need from your client.
          </p>
        </div>
        <span className="subtle">{data.structure.length} sections</span>
      </div>
      <ErrorNotice error={command.error} />
      {command.error && (
        <button
          className="secondary-button"
          onClick={() => void latest.refetch()}
        >
          Refresh latest structure (keeps editor open)
        </button>
      )}
      <div className="structure-workbench">
        <nav className="structure-navigation" aria-label="Content sections">
          <h3>
            {data.project.projectType === 'WEBSITE'
              ? 'Website structure'
              : 'Application structure'}
          </h3>
          {data.structure.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedSection(s.id)}
              aria-current={currentSection?.id === s.id ? 'page' : undefined}
              className={currentSection?.id === s.id ? 'selected' : ''}
            >
              <FileText size={17} />
              <span>{s.title}</span>
              <small>{s.items.length}</small>
            </button>
          ))}
        </nav>
        <div className="structure-detail">
          {data.structure.map(
            (s, index) =>
              s.id === currentSection?.id && (
                <Panel key={s.id}>
                  <header className="section-header">
                    <div>
                      <span className="section-number">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <h2>{s.title}</h2>
                      {!s.enabled && <Badge>DISABLED</Badge>}
                    </div>
                    {editable && (
                      <div className="actions">
                        <button
                          className="icon-button"
                          aria-label={`Move ${s.title} section up`}
                          disabled={!index || command.pending}
                          onClick={() => moveSection(index, -1)}
                        >
                          <ArrowUp size={16} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Move ${s.title} section down`}
                          disabled={
                            index === data.structure.length - 1 ||
                            command.pending
                          }
                          onClick={() => moveSection(index, 1)}
                        >
                          <ArrowDown size={16} />
                        </button>
                        <button
                          className="secondary-button"
                          disabled={command.pending}
                          onClick={() =>
                            void command.run(
                              `${root}/sections/${s.id}`,
                              {
                                enabled: !s.enabled,
                                expectedStructureVersion:
                                  data.project.structureVersion,
                              },
                              'PATCH',
                            )
                          }
                        >
                          {s.enabled ? 'Disable' : 'Enable'}
                        </button>
                      </div>
                    )}
                  </header>
                  {editable && (
                    <details className="section-rename">
                      <summary>Edit section name</summary>
                      <form
                        className="inline-form"
                        onSubmit={async (e) => {
                          e.preventDefault()
                          await command.run(
                            `${root}/sections/${s.id}`,
                            {
                              title: new FormData(e.currentTarget).get('title'),
                              expectedStructureVersion:
                                data.project.structureVersion,
                            },
                            'PATCH',
                          )
                        }}
                      >
                        <Field label="Section name">
                          <input
                            name="title"
                            defaultValue={s.title}
                            required
                            maxLength={120}
                          />
                        </Field>
                        <button
                          className="secondary-button"
                          disabled={command.pending}
                        >
                          Save section name
                        </button>
                      </form>
                    </details>
                  )}
                  <div className="reference-table-wrap">
                    <table className="reference-table structure-items">
                      <thead>
                        <tr>
                          <th>Label</th>
                          <th>Type</th>
                          <th>Required</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.items.map((i, n) => (
                          <tr
                            key={i.id}
                            draggable={editable}
                            onDragStart={() => setDrag(i.id)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault()
                              if (
                                !editable ||
                                !s.items.some((i) => i.id === drag)
                              )
                                return
                              const sections = structuredClone(data.structure)
                              const target = sections.find(
                                (t) => t.id === s.id,
                              )!
                              const from = target.items.findIndex(
                                (i) => i.id === drag,
                              )
                              const [item] = target.items.splice(from, 1)
                              target.items.splice(n, 0, item)
                              void reorder(sections)
                              setDrag('')
                            }}
                          >
                            <td>
                              <div className="structure-item-label">
                                <GripVertical size={16} className="subtle" />
                                <div>
                                  <strong>
                                    {i.label}{' '}
                                    {i.required && (
                                      <span className="required-mark">*</span>
                                    )}
                                  </strong>
                                  {i.visibleWhen && <small>Conditional</small>}
                                  {i.enabled === false && (
                                    <small>Disabled</small>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="item-type">
                              {i.type.toLowerCase().replaceAll('_', ' ')}
                            </td>
                            <td className="item-required">
                              {i.required ? 'Yes' : 'No'}
                            </td>
                            <td>
                              <Badge>{i.state}</Badge>
                            </td>
                            <td>
                              {editable && (
                                <div className="actions">
                                  <button
                                    className="icon-button"
                                    disabled={!n || command.pending}
                                    aria-label={`Move ${i.label} up`}
                                    onClick={() => moveItem(s, n, -1)}
                                  >
                                    <ArrowUp size={16} />
                                  </button>
                                  <button
                                    className="icon-button"
                                    disabled={
                                      n === s.items.length - 1 ||
                                      command.pending
                                    }
                                    aria-label={`Move ${i.label} down`}
                                    onClick={() => moveItem(s, n, 1)}
                                  >
                                    <ArrowDown size={16} />
                                  </button>
                                  <button
                                    className="icon-button"
                                    aria-label={`Edit ${i.label}`}
                                    onClick={() =>
                                      setEditing({ section: s, item: i })
                                    }
                                  >
                                    <Pencil size={16} />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {editable && (
                    <button
                      className="add-item"
                      onClick={() => setEditing({ section: s })}
                    >
                      <Plus size={16} /> Add item
                    </button>
                  )}
                </Panel>
              ),
          )}
        </div>
      </div>
      {editable && (
        <details className="add-section-details">
          <summary>＋ Add section</summary>
          <Panel title="Add a section">
            <form
              className="inline-form"
              onSubmit={async (e) => {
                e.preventDefault()
                if (
                  await command.run(`${root}/sections`, {
                    title: sectionTitle,
                    expectedStructureVersion: data.project.structureVersion,
                  })
                )
                  setSectionTitle('')
              }}
            >
              <Field label="Section title">
                <input
                  required
                  value={sectionTitle}
                  onChange={(e) => setSectionTitle(e.target.value)}
                  placeholder="e.g. Brand and identity"
                />
              </Field>
              <button className="secondary-button" disabled={command.pending}>
                Add section
              </button>
            </form>
          </Panel>
        </details>
      )}
      {editing && (
        <ItemEditor
          key={editing.item?.id || editing.section.id}
          root={root}
          structureVersion={data.project.structureVersion}
          section={editing.section}
          item={editing.item}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
function ItemEditor({
  root,
  structureVersion,
  section,
  item,
  onClose,
}: {
  root: string
  structureVersion: number
  section: Section
  item?: Item
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    const previous = document.activeElement as HTMLElement | null
    element?.showModal()
    return () => {
      element?.close()
      previous?.focus()
    }
  }, [])
  const [type, setType] = useState<ItemDefinition['type']>(
    item?.type || 'SHORT_TEXT',
  )
  const latest = useData<ProjectDetail>(root)
  const [options, setOptions] = useState(
    item?.validation.options?.map((o) => `${o.key}|${o.label}`).join('\n') ||
      'yes|Yes\nno|No',
  )
  const [columns, setColumns] = useState<RepeaterColumn[]>(
    item?.validation.columns || [
      { key: 'name', label: 'Name', type: 'SHORT_TEXT', required: true },
    ],
  )
  const command = useCommand()
  const [localError, setLocalError] = useState('')
  const [controller, setController] = useState(
    item?.visibleWhen?.dependsOnItemKey || '',
  )
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLocalError('')
    const v = Object.fromEntries(new FormData(e.currentTarget))
    try {
      const definition: ItemDefinition = {
        key: String(v.key),
        label: String(v.label),
        type,
        instructions: String(v.instructions || ''),
        example: String(v.example || ''),
        required: v.required === 'on',
        enabled: v.enabled === 'on',
        validation: {
          ...(item?.type === type ? item.validation : {}),
          ...(['SHORT_TEXT', 'LONG_TEXT'].includes(type)
            ? {
                maxLength:
                  Number(v.maxLength) || (type === 'SHORT_TEXT' ? 200 : 10000),
              }
            : {}),
          ...(['SINGLE_SELECT', 'MULTI_SELECT'].includes(type)
            ? {
                options: options
                  .split('\n')
                  .filter(Boolean)
                  .map((line) => {
                    const [key, label] = line.split('|')
                    return { key: key.trim(), label: (label || key).trim() }
                  }),
              }
            : {}),
          ...(['IMAGE', 'FILE'].includes(type)
            ? { maxFiles: Number(v.maxFiles) || 10 }
            : {}),
          ...(type === 'REPEATER'
            ? {
                columns,
                maxRows: Math.min(20, Number(v.maxRows) || 20),
              }
            : {}),
        },
        ...(controller
          ? {
              visibleWhen: {
                dependsOnItemKey: controller,
                operator: 'EQUALS' as const,
                optionKey: String(v.optionKey),
              },
            }
          : {}),
        ...(type === 'LONG_TEXT'
          ? { ai: { enabled: v.ai === 'on', targetWords: 150 } }
          : {}),
      }
      const result = await command.run(
        item
          ? `${root}/items/${item.id}/schema`
          : `${root}/sections/${section.id}/items`,
        {
          definition,
          expectedStructureVersion: structureVersion,
          reopenAffected: v.reopen === 'on',
        },
        item ? 'PATCH' : 'POST',
      )
      if (result) onClose()
    } catch {
      setLocalError('Check the field settings and try saving again.')
    }
  }
  return (
    <dialog
      ref={dialog}
      className="item-settings-drawer"
      aria-label="Item settings"
      onCancel={onClose}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]',
          ),
        ).filter((element) => element.getClientRects().length > 0)
        const first = controls[0]
        const last = controls.at(-1)
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }}
    >
      <header className="drawer-heading">
        <h2>{type === 'REPEATER' ? 'Repeater builder' : 'Item settings'}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close item settings"
        >
          <X size={20} />
        </button>
      </header>
      <Panel title={item ? 'Edit checklist item' : 'New checklist item'}>
        <p className="subtle">
          Your edits stay here if another change causes a version conflict.
        </p>
        <form className="stack-form" onSubmit={submit}>
          <div className="form-grid">
            <Field label="Label">
              <input required name="label" defaultValue={item?.label} />
            </Field>
            <Field label="Stable key">
              <input
                required
                pattern="[a-zA-Z][a-zA-Z0-9_.]*"
                name="key"
                defaultValue={item?.key || `item_${Date.now()}`}
                readOnly={!!item}
              />
            </Field>
            <Field label="Field type">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as typeof type)}
              >
                {fieldTypes.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Example">
              <input name="example" defaultValue={item?.example} />
            </Field>
          </div>
          <Field label="Instructions">
            <textarea name="instructions" defaultValue={item?.instructions} />
          </Field>
          <div className="actions">
            <label className="check-row">
              <input
                type="checkbox"
                name="required"
                defaultChecked={item?.required ?? true}
              />
              Required
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={item?.enabled !== false}
              />
              Enabled
            </label>
          </div>
          {['SHORT_TEXT', 'LONG_TEXT'].includes(type) && (
            <Field label="Maximum characters">
              <input
                type="number"
                name="maxLength"
                min={1}
                max={type === 'SHORT_TEXT' ? 200 : 10000}
                defaultValue={
                  item?.validation.maxLength ||
                  (type === 'SHORT_TEXT' ? 200 : 10000)
                }
              />
            </Field>
          )}
          {type === 'LONG_TEXT' && (
            <label className="check-row">
              <input
                type="checkbox"
                name="ai"
                defaultChecked={item?.ai?.enabled}
              />
              Allow optional fact-based writing assistance
            </label>
          )}
          {['SINGLE_SELECT', 'MULTI_SELECT'].includes(type) && (
            <Field label="Options (one key|Label per line)">
              <textarea
                value={options}
                onChange={(e) => setOptions(e.target.value)}
                required
              />
            </Field>
          )}
          {['IMAGE', 'FILE'].includes(type) && (
            <Field label="Maximum files">
              <input
                name="maxFiles"
                type="number"
                min={1}
                max={50}
                defaultValue={item?.validation.maxFiles || 10}
              />
            </Field>
          )}
          {type === 'REPEATER' && (
            <>
              <Field label="Maximum rows">
                <input
                  name="maxRows"
                  type="number"
                  min={1}
                  max={20}
                  defaultValue={item?.validation.maxRows || 20}
                />
              </Field>
              <fieldset className="stack-form repeater-columns">
                <legend>Entry fields · up to 8</legend>
                {columns.map((c, index) => (
                  <div className="inset stack-form" key={index}>
                    <div className="form-grid">
                      <Field label="Entry field label">
                        <input
                          required
                          value={c.label}
                          onChange={(e) =>
                            setColumns(
                              columns.map((v, i) =>
                                i === index
                                  ? { ...v, label: e.target.value }
                                  : v,
                              ),
                            )
                          }
                        />
                      </Field>
                      <Field label="Entry field key">
                        <input
                          required
                          pattern="[a-zA-Z][a-zA-Z0-9_]*"
                          value={c.key}
                          onChange={(e) =>
                            setColumns(
                              columns.map((v, i) =>
                                i === index ? { ...v, key: e.target.value } : v,
                              ),
                            )
                          }
                        />
                      </Field>
                      <Field label="Entry field type">
                        <select
                          value={c.type}
                          onChange={(e) =>
                            setColumns(
                              columns.map((v, i) =>
                                i === index
                                  ? {
                                      ...v,
                                      type: e.target
                                        .value as RepeaterColumn['type'],
                                    }
                                  : v,
                              ),
                            )
                          }
                        >
                          {[
                            'SHORT_TEXT',
                            'LONG_TEXT',
                            'URL',
                            'NUMBER',
                            'SINGLE_SELECT',
                            'IMAGE',
                          ].map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                        </select>
                      </Field>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={c.required}
                          onChange={(e) =>
                            setColumns(
                              columns.map((v, i) =>
                                i === index
                                  ? { ...v, required: e.target.checked }
                                  : v,
                              ),
                            )
                          }
                        />
                        Required
                      </label>
                    </div>
                    {c.type === 'SINGLE_SELECT' && (
                      <Field label="Entry options (one per line)">
                        <textarea
                          value={
                            c.options?.map((o) => o.label).join('\n') || ''
                          }
                          onChange={(e) =>
                            setColumns(
                              columns.map((v, i) =>
                                i === index
                                  ? {
                                      ...v,
                                      options: e.target.value
                                        .split('\n')
                                        .filter(Boolean)
                                        .map((label, n) => ({
                                          key: `option_${n + 1}`,
                                          label,
                                        })),
                                    }
                                  : v,
                              ),
                            )
                          }
                        />
                      </Field>
                    )}
                    <button
                      type="button"
                      className="danger-link"
                      disabled={columns.length === 1}
                      onClick={() =>
                        setColumns(columns.filter((_, i) => i !== index))
                      }
                    >
                      Remove entry field
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="secondary-button"
                  disabled={columns.length >= 8}
                  onClick={() =>
                    setColumns([
                      ...columns,
                      {
                        key: `field_${columns.length + 1}`,
                        label: 'New field',
                        type: 'SHORT_TEXT',
                        required: false,
                      },
                    ])
                  }
                >
                  Add entry field
                </button>
              </fieldset>
              <section
                className="repeater-preview"
                aria-label="Repeater preview"
              >
                <h3>Preview — one row</h3>
                <p className="subtle">
                  A repeating group of fields. Limited to one level and 20 rows.
                </p>
                <div>
                  {columns.map((column, index) => (
                    <div className="product-field" key={index}>
                      <label htmlFor={`preview-column-${index}`}>
                        {column.label}
                        {column.required ? ' *' : ''}
                      </label>
                      {column.type === 'LONG_TEXT' ? (
                        <textarea
                          id={`preview-column-${index}`}
                          disabled
                          placeholder="Add a short description…"
                        />
                      ) : column.type === 'SINGLE_SELECT' ? (
                        <select id={`preview-column-${index}`} disabled>
                          <option>Select an option</option>
                          {column.options?.map((o) => (
                            <option key={o.key}>{o.label}</option>
                          ))}
                        </select>
                      ) : column.type === 'IMAGE' ? (
                        <div className="preview-upload">Upload image</div>
                      ) : (
                        <input
                          id={`preview-column-${index}`}
                          disabled
                          placeholder={`Enter ${column.label.toLowerCase()}`}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
          <Field label="Show when an earlier single select equals">
            <select
              value={controller}
              onChange={(e) => setController(e.target.value)}
            >
              <option value="">Always visible</option>
              {section.items
                .filter(
                  (i) =>
                    i.type === 'SINGLE_SELECT' &&
                    (!item || i.sortOrder < item.sortOrder),
                )
                .map((i) => (
                  <option value={i.key} key={i.id}>
                    {i.label}
                  </option>
                ))}
            </select>
          </Field>
          {controller && (
            <Field label="Matching option">
              <select
                name="optionKey"
                defaultValue={item?.visibleWhen?.optionKey}
              >
                {section.items
                  .find((i) => i.key === controller)
                  ?.validation.options?.map((o) => (
                    <option value={o.key} key={o.key}>
                      {o.label}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          {controller && (
            <p className="reference-info">
              When hidden, previously entered answers are retained. Hidden items
              return when their condition is met.
            </p>
          )}
          {item && ['SUBMITTED', 'APPROVED'].includes(item.state) && (
            <label className="check-row">
              <input required name="reopen" type="checkbox" />
              Reopen affected item; historical submissions remain immutable
            </label>
          )}
          <ErrorNotice error={localError || command.error} />
          {command.error && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => void latest.refetch()}
            >
              Refresh latest structure; keep my input
            </button>
          )}
          <div className="actions">
            <button className="primary-button" disabled={command.pending}>
              Save item
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </form>
      </Panel>
    </dialog>
  )
}
function PreviewPanel({ root }: { root: string }) {
  const q = useData<ClientChecklist>(`${root}/client-preview`)
  const [section, setSection] = useState('')
  return (
    <QueryState query={q}>
      <Notice>
        Read-only owner preview. This does not create or impersonate a client
        session.
      </Notice>
      <nav className="reference-tabs" aria-label="Preview sections">
        {q.data?.sections.map((s) => (
          <button
            key={s.id}
            className={
              s.id === (section || q.data?.sections[0]?.id) ? 'active' : ''
            }
            onClick={() => setSection(s.id)}
          >
            {s.title}
          </button>
        ))}
      </nav>
      {q.data?.sections
        .filter((s) => s.id === (section || q.data?.sections[0]?.id))
        .map((s) => (
          <Panel key={s.id} title={s.title}>
            {s.items.map((i) => (
              <div className="preview-item" key={i.id}>
                <strong>
                  {i.label}
                  {i.required ? ' *' : ''}
                </strong>
                <p>{i.instructions}</p>
                <div className="disabled-preview">
                  {i.example ||
                    `Client response · ${i.type.replaceAll('_', ' ')}`}
                </div>
              </div>
            ))}
          </Panel>
        ))}
    </QueryState>
  )
}
function AssignmentsPanel({ root }: { root: string }) {
  const { id } = useWorkspace()
  const members = useData<{ data: Member[] }>(`workspaces/${id}/members`)
  const assignments = useData<{ data: Assignment[] }>(`${root}/assignments`)
  const command = useCommand()
  return (
    <Panel title="Project team">
      <p className="subtle">
        Members see assigned projects only. Grant review and export separately.
      </p>
      <ErrorNotice error={command.error} />
      {members.data?.data
        .filter((m) => m.role === 'MEMBER' && m.state === 'ACTIVE')
        .map((m) => {
          const a = assignments.data?.data.find((a) => a.memberId === m.id)
          return (
            <form
              className="access-row"
              key={`${m.id}-${JSON.stringify(a)}`}
              onSubmit={async (e) => {
                e.preventDefault()
                const v = new FormData(e.currentTarget)
                await command.run(
                  `${root}/assignments/${m.id}`,
                  { canReview: v.has('review'), canExport: v.has('export') },
                  'PUT',
                )
              }}
            >
              <div className="grow">
                <strong>{m.user.displayName}</strong>
                <p>{m.user.email}</p>
              </div>
              <label className="check-row">
                <input
                  name="review"
                  type="checkbox"
                  defaultChecked={a?.canReview}
                />
                Review
              </label>
              <label className="check-row">
                <input
                  name="export"
                  type="checkbox"
                  defaultChecked={a?.canExport}
                />
                Export
              </label>
              <button className="secondary-button" disabled={command.pending}>
                {a ? 'Save permissions' : 'Assign'}
              </button>
              {a && (
                <button
                  type="button"
                  className="danger-link"
                  onClick={() =>
                    void command.run(
                      `${root}/assignments/${m.id}`,
                      undefined,
                      'DELETE',
                    )
                  }
                >
                  Remove
                </button>
              )}
            </form>
          )
        })}
    </Panel>
  )
}
