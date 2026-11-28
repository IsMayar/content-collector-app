import type { ProjectDetail } from '@/features/projects/types/project.types'
import { ItemEditor } from '@/features/structure-editor/components/ItemEditor'
import type {
  Item,
  Section,
} from '@/features/structure-editor/types/structure.types'
import { useData } from '@/services/api/resourceApi'
import { useNotify } from '@/shared/components/Feedback'
import { ErrorNotice } from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import {
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  GripVertical,
  Pencil,
  Plus,
  Save,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'

/* ---------------------------------------------------------------
   Helpers
---------------------------------------------------------------- */

function formatStatus(status: string): string {
  return status
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^\w/, (character) => character.toUpperCase())
}

function statusStyle(status: string): string {
  switch (status) {
    case 'APPROVED':
      return 'bg-emerald-50 text-emerald-700'
    case 'SUBMITTED':
      return 'bg-blue-50 text-blue-700'
    case 'CHANGES_REQUESTED':
      return 'bg-amber-50 text-amber-700'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

function formatItemType(type: string): string {
  return type
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

const actionButton =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-40'

const primaryButton =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50'

const secondaryButton =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50'

const inputStyle =
  'mt-2 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'

/* ---------------------------------------------------------------
   Structure Editor
---------------------------------------------------------------- */

export function StructureEditor({
  data,
  root,
  editable: canEdit,
  editMode,
  onEditMode,
  sectionId,
  onSelectSection,
  renderQuestion,
  progress,
  sectionSummary,
}: {
  data: ProjectDetail
  root: string
  editable: boolean
  editMode: boolean
  sectionId?: string
  onSelectSection?: (id: string) => void
  renderQuestion?: (item: Item) => ReactNode
  progress?: ReactNode
  sectionSummary?: (section: Section) => ReactNode
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
  const [drag, setDrag] = useState('')
  const [sectionTitle, setSectionTitle] = useState('')

  const sections = data.structure.filter(
    (section) => editable || section.enabled,
  )
  const currentSection =
    sections.find((section) => section.id === (sectionId || selectedSection)) ||
    sections[0]

  /* -------------------------------------------------------------
     Existing reorder functionality
  ------------------------------------------------------------- */

  async function reorder(sections: Section[]) {
    if (
      await command.run(`${root}/structure/reorder`, {
        sectionIds: sections.map((section) => section.id),
        itemOrderBySection: Object.fromEntries(
          sections.map((section) => [
            section.id,
            section.items.map((item) => item.id),
          ]),
        ),
        expectedStructureVersion: data.project.structureVersion,
      })
    ) {
      notify('Order updated.')
    }
  }

  function moveSection(index: number, delta: number) {
    const sections = structuredClone(data.structure)
    const [section] = sections.splice(index, 1)

    sections.splice(index + delta, 0, section)

    void reorder(sections)
  }

  function moveItem(section: Section, index: number, delta: number) {
    const sections = structuredClone(data.structure)

    const target = sections.find((item) => item.id === section.id)!

    const [item] = target.items.splice(index, 1)

    target.items.splice(index + delta, 0, item)

    void reorder(sections)
  }

  function dropItem(section: Section, targetIndex: number) {
    if (
      !editable ||
      command.pending ||
      !section.items.some((item) => item.id === drag)
    ) {
      setDrag('')
      return
    }

    const sections = structuredClone(data.structure)

    const target = sections.find((item) => item.id === section.id)!

    const from = target.items.findIndex((item) => item.id === drag)

    if (from < 0 || from === targetIndex) {
      setDrag('')
      return
    }

    const [item] = target.items.splice(from, 1)

    target.items.splice(targetIndex, 0, item)

    void reorder(sections)
    setDrag('')
  }

  /* -------------------------------------------------------------
     Render
  ------------------------------------------------------------- */

  return (
    <div className="project-content-view w-full min-w-0 space-y-4">
      {/* ---------------------------------------------------------
          PAGE HEADER
      --------------------------------------------------------- */}

      <div className="project-content-toolbar">
        <div className="project-content-toolbar-title">
          <h2>Project content</h2>
          {progress}
        </div>

        {canEdit && (
          <button
            type="button"
            className={secondaryButton}
            onClick={() => onEditMode(!editable)}
          >
            {editable ? (
              <>
                <Check size={16} aria-hidden="true" />
                Done editing
              </>
            ) : (
              <>
                <Pencil size={15} aria-hidden="true" />
                Edit request
              </>
            )}
          </button>
        )}
      </div>

      {/* ---------------------------------------------------------
          ERRORS
      --------------------------------------------------------- */}

      <ErrorNotice error={command.error} />

      {command.error && (
        <button
          type="button"
          className={secondaryButton}
          onClick={() => void latest.refetch()}
        >
          Refresh latest structure (keeps editor open)
        </button>
      )}

      {/* ---------------------------------------------------------
          STRUCTURE WORKSPACE
      --------------------------------------------------------- */}

      <div className="grid min-w-0 grid-cols-1 overflow-hidden rounded-xl border border-slate-200 bg-white md:grid-cols-[230px_minmax(0,1fr)]">
        {/* -------------------------------------------------------
            SECTION NAVIGATION
        ------------------------------------------------------- */}

        <aside className="min-w-0 border-b border-slate-200 bg-slate-50/40 md:border-r md:border-b-0">
          <div className="border-b border-slate-200 px-5 py-5">
            <h3 className="text-sm font-semibold text-slate-900">
              {data.project.projectType === 'WEBSITE'
                ? 'Website structure'
                : 'Application structure'}
            </h3>

            <p className="mt-1 text-xs text-slate-500">
              {data.structure.length}{' '}
              {data.structure.length === 1 ? 'section' : 'sections'}
            </p>
          </div>

          <nav aria-label="Content sections" className="space-y-1 p-3">
            {sections.map((section) => {
              const selected = currentSection?.id === section.id

              return (
                <button
                  type="button"
                  key={section.id}
                  onClick={() => {
                    setSelectedSection(section.id)
                    onSelectSection?.(section.id)
                  }}
                  title={section.title}
                  aria-current={selected ? 'page' : undefined}
                  className={`flex w-full min-w-0 items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                    selected
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <FileText
                    size={18}
                    className={`shrink-0 ${
                      selected ? 'text-blue-600' : 'text-slate-400'
                    }`}
                    aria-hidden="true"
                  />

                  <span
                    className={`min-w-0 flex-1 truncate text-sm ${
                      selected ? 'font-semibold' : 'font-medium'
                    }`}
                  >
                    {section.title}
                  </span>

                  <span
                    className={`shrink-0 rounded-md px-2 py-0.5 text-xs tabular-nums ${
                      selected
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {section.items.length}
                  </span>
                </button>
              )
            })}
          </nav>

          {/* -----------------------------------------------------
              ADD SECTION
          ----------------------------------------------------- */}

          {editable && (
            <div className="border-t border-slate-200 p-3">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-3 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 [&::-webkit-details-marker]:hidden">
                  <Plus size={17} aria-hidden="true" />
                  Add section
                </summary>

                <form
                  className="space-y-3 px-3 pt-3 pb-2"
                  onSubmit={async (event) => {
                    event.preventDefault()

                    if (
                      await command.run(`${root}/sections`, {
                        title: sectionTitle,
                        expectedStructureVersion: data.project.structureVersion,
                      })
                    ) {
                      setSectionTitle('')
                    }
                  }}
                >
                  <label className="block">
                    <span className="text-xs font-medium text-slate-700">
                      Section title
                    </span>

                    <input
                      required
                      maxLength={120}
                      value={sectionTitle}
                      onChange={(event) => setSectionTitle(event.target.value)}
                      placeholder="e.g. Brand and identity"
                      className={inputStyle}
                    />
                  </label>

                  <button
                    type="submit"
                    className={`${primaryButton} w-full`}
                    disabled={command.pending}
                  >
                    <Plus size={15} aria-hidden="true" />
                    Add section
                  </button>
                </form>
              </details>
            </div>
          )}
        </aside>

        {/* -------------------------------------------------------
            SECTION DETAILS
        ------------------------------------------------------- */}

        <div className="min-w-0">
          {data.structure.map(
            (section, sectionIndex) =>
              section.id === currentSection?.id && (
                <section
                  key={section.id}
                  className="min-w-0"
                  aria-label={section.title}
                >
                  {/* -------------------------------------------------
                      SECTION HEADER
                  ------------------------------------------------- */}

                  <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="break-words text-lg font-semibold text-slate-950">
                            {section.title}
                          </h2>

                          {!section.enabled && (
                            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                              Disabled
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-500">
                          {sectionSummary
                            ? sectionSummary(section)
                            : section.items.length + ' questions'}
                        </p>
                      </div>

                      {/* SECTION ACTIONS */}

                      {editable && (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className={actionButton}
                            title="Move section up"
                            aria-label={`Move ${section.title} section up`}
                            disabled={sectionIndex === 0 || command.pending}
                            onClick={() => moveSection(sectionIndex, -1)}
                          >
                            <ChevronUp size={17} aria-hidden="true" />
                          </button>

                          <button
                            type="button"
                            className={actionButton}
                            title="Move section down"
                            aria-label={`Move ${section.title} section down`}
                            disabled={
                              sectionIndex === data.structure.length - 1 ||
                              command.pending
                            }
                            onClick={() => moveSection(sectionIndex, 1)}
                          >
                            <ChevronDown size={17} aria-hidden="true" />
                          </button>

                          <button
                            type="button"
                            className={secondaryButton}
                            disabled={command.pending}
                            onClick={() =>
                              void command.run(
                                `${root}/sections/${section.id}`,
                                {
                                  enabled: !section.enabled,
                                  expectedStructureVersion:
                                    data.project.structureVersion,
                                },
                                'PATCH',
                              )
                            }
                          >
                            {section.enabled ? 'Disable' : 'Enable'}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* -----------------------------------------------
                        RENAME SECTION
                    ----------------------------------------------- */}

                    {editable && (
                      <details className="group mt-4">
                        <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-slate-500 transition-colors hover:text-blue-600 [&::-webkit-details-marker]:hidden">
                          <Pencil size={13} aria-hidden="true" />
                          Edit section name
                        </summary>

                        <form
                          className="mt-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-end"
                          onSubmit={async (event) => {
                            event.preventDefault()

                            await command.run(
                              `${root}/sections/${section.id}`,
                              {
                                title: new FormData(event.currentTarget).get(
                                  'title',
                                ),
                                expectedStructureVersion:
                                  data.project.structureVersion,
                              },
                              'PATCH',
                            )
                          }}
                        >
                          <label className="block min-w-0 flex-1">
                            <span className="text-xs font-medium text-slate-700">
                              Section name
                            </span>

                            <input
                              name="title"
                              defaultValue={section.title}
                              required
                              maxLength={120}
                              className={inputStyle}
                            />
                          </label>

                          <button
                            type="submit"
                            className={primaryButton}
                            disabled={command.pending}
                          >
                            <Save size={15} aria-hidden="true" />
                            Save name
                          </button>
                        </form>
                      </details>
                    )}
                  </div>

                  {/* -------------------------------------------------
                      EDIT MODE — QUESTION LIST
                  ------------------------------------------------- */}

                  <div className="min-w-0 px-4 py-2">
                    {section.items
                      .filter(
                        (item) =>
                          editable || (item.enabled !== false && item.visible),
                      )
                      .map((item, index) => (
                        <div
                          key={item.id}
                          className="border-b border-slate-100 last:border-0"
                        >
                          <div hidden={editable}>
                            {renderQuestion ? (
                              renderQuestion(item)
                            ) : (
                              <p className="py-3 text-sm">{item.label}</p>
                            )}
                          </div>
                          <div hidden={!editable}>
                            <div
                              className="flex flex-wrap items-center gap-3 py-3"
                              draggable={editable && !command.pending}
                              onDragStart={() => setDrag(item.id)}
                              onDragEnd={() => setDrag('')}
                              onDragOver={(event) => {
                                if (drag && !command.pending)
                                  event.preventDefault()
                              }}
                              onDrop={(event) => {
                                event.preventDefault()
                                dropItem(section, index)
                              }}
                            >
                              <GripVertical
                                size={16}
                                aria-hidden="true"
                                className="shrink-0 text-slate-400"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-slate-900">
                                  {item.label}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {formatItemType(item.type)} ·{' '}
                                  {item.required ? 'Required' : 'Optional'}
                                  {item.visibleWhen ? ' · Conditional' : ''}
                                  {item.enabled === false ? ' · Disabled' : ''}
                                </p>
                              </div>
                              <span
                                className={
                                  'inline-flex rounded px-2 py-1 text-xs ' +
                                  statusStyle(item.state)
                                }
                              >
                                {formatStatus(item.state)}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  className={actionButton}
                                  aria-label={'Move ' + item.label + ' up'}
                                  disabled={index === 0 || command.pending}
                                  onClick={() => moveItem(section, index, -1)}
                                >
                                  <ChevronUp size={16} aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  className={actionButton}
                                  aria-label={'Move ' + item.label + ' down'}
                                  disabled={
                                    index === section.items.length - 1 ||
                                    command.pending
                                  }
                                  onClick={() => moveItem(section, index, 1)}
                                >
                                  <ChevronDown size={16} aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  className={actionButton}
                                  aria-label={'Edit ' + item.label}
                                  disabled={command.pending}
                                  onClick={() => setEditing({ section, item })}
                                >
                                  <Pencil size={16} aria-hidden="true" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    {!section.items.some(
                      (item) =>
                        editable || (item.enabled !== false && item.visible),
                    ) && (
                      <p className="py-6 text-sm text-slate-500">
                        No visible questions in this section.
                      </p>
                    )}
                    {editable && (
                      <button
                        type="button"
                        className="my-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 text-sm font-medium text-blue-600 hover:bg-blue-50"
                        onClick={() => setEditing({ section })}
                      >
                        <Plus size={16} aria-hidden="true" />
                        Add question
                      </button>
                    )}
                  </div>
                </section>
              ),
          )}

          {/* NO SECTIONS */}

          {data.structure.length === 0 && (
            <div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
              <FileText
                size={30}
                className="text-slate-300"
                aria-hidden="true"
              />

              <h3 className="mt-3 text-sm font-semibold text-slate-800">
                No sections yet
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                Add a section to start building your request.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------------
          EXISTING ITEM EDITOR
      --------------------------------------------------------- */}

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
    </div>
  )
}
