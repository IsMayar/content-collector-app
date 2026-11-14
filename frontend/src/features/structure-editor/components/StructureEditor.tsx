import type { ProjectDetail } from '@/features/projects/types/project.types'
import { ItemEditor } from '@/features/structure-editor/components/ItemEditor'
import type {
  Item,
  Section,
} from '@/features/structure-editor/types/structure.types'
import { useData } from '@/services/api/resourceApi'
import { useNotify } from '@/shared/components/Feedback'
import { Badge, ErrorNotice, Field, Panel } from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { FileText, GripVertical, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
export function StructureEditor({
  data,
  root,
  editable: canEdit,
  editMode,
  onEditMode,
}: {
  data: ProjectDetail
  root: string
  editable: boolean
  editMode: boolean
  onEditMode: (enabled: boolean) => void
}) {
  const editable = canEdit && editMode
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
        {canEdit && (
          <button
            type="button"
            className="secondary-button"
            onClick={() => onEditMode(!editable)}
          >
            {editable ? 'Done editing' : 'Edit request'}
          </button>
        )}
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
                          Up
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
                          Down
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
                  {editable ? (
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
                                    {i.visibleWhen && (
                                      <small>Conditional</small>
                                    )}
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
                                      Up
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
                                      Down
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
                  ) : (
                    <ul className="request-checklist">
                      {s.items
                        .filter((item) => item.enabled !== false)
                        .map((item) => (
                          <li key={item.id}>
                            <div>
                              <strong>{item.label}</strong>
                              <small>
                                {item.required ? 'Required' : 'Optional'}
                                {item.visibleWhen ? ' · Conditional' : ''}
                              </small>
                            </div>
                            <Badge>{item.state}</Badge>
                          </li>
                        ))}
                      {!s.items.some((item) => item.enabled !== false) && (
                        <li>No enabled questions in this section.</li>
                      )}
                    </ul>
                  )}
                  {editable && (
                    <button
                      className="add-item"
                      onClick={() => setEditing({ section: s })}
                    >
                      <Plus size={16} /> Add question
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
