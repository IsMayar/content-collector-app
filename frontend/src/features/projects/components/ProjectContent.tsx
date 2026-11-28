import {
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleAlert,
} from 'lucide-react'
import { useId } from 'react'
import { useProjectContacts } from '@/features/clients/api/clientsApi'
import { LiveRevisionReview } from '@/features/review/components/LiveReviewPanel'
import type {
  Item,
  Section,
} from '@/features/structure-editor/types/structure.types'
import { StructureEditor } from '@/features/structure-editor/components/StructureEditor'
import type { ProjectDetail } from '../types/project.types'
import './ProjectContent.css'

export function sectionSubmissionProgress(section: Section) {
  const required = section.enabled
    ? section.items.filter(
        (item) => item.required && item.enabled !== false && item.visible,
      )
    : []
  return {
    total: required.length,
    submitted: required.filter((item) =>
      ['SUBMITTED', 'APPROVED'].includes(item.state),
    ).length,
  }
}

const statusText = {
  NOT_STARTED: 'Not submitted',
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  CHANGES_REQUESTED: 'Changes requested',
}

export function ProjectContent({
  data,
  root,
  sectionId,
  itemId,
  revisionId,
  onSelectSection,
  onSelectItem,
  onEdit,
  editing = false,
}: {
  data: ProjectDetail
  root: string
  sectionId: string | null
  itemId: string | null
  revisionId: string | null
  onSelectSection: (id: string) => void
  onSelectItem: (id: string | null) => void
  editing?: boolean
  onEdit?: () => void
}) {
  const sections = data.structure.filter(
    (section) => editing || section.enabled,
  )
  const selectedSection =
    sections.find((section) =>
      section.items.some(
        (item) => item.id === itemId && item.visible && item.enabled !== false,
      ),
    ) ||
    sections.find((section) => section.id === sectionId) ||
    sections[0]
  const { permissions, state } = data.project
  const progress = sections.map(sectionSubmissionProgress).reduce(
    (sum, section) => ({
      submitted: sum.submitted + section.submitted,
      total: sum.total + section.total,
    }),
    { submitted: 0, total: 0 },
  )
  const percent = progress.total
    ? Math.round((progress.submitted / progress.total) * 100)
    : 0
  const contacts = useProjectContacts(
    permissions.canManageAccess && itemId ? root : '',
  )
  const contactNames = new Map(
    permissions.canManageAccess && !contacts.isError
      ? contacts.data?.data.map((contact) => [contact.id, contact.name])
      : [],
  )

  return (
    <StructureEditor
      data={data}
      root={root}
      editable={!!onEdit}
      editMode={editing}
      onEditMode={() => onEdit?.()}
      sectionId={selectedSection?.id}
      onSelectSection={onSelectSection}
      sectionSummary={(section) => {
        const p = sectionSubmissionProgress(section)
        return (
          <span
            className={
              p.total > 0 && p.total === p.submitted
                ? 'content-progress complete'
                : 'content-progress'
            }
          >
            {p.submitted} of {p.total} submitted
          </span>
        )
      }}
      progress={
        <div
          className="project-content-meter"
          aria-label="Required content progress"
        >
          <span>
            {progress.submitted} of {progress.total} submitted
          </span>
          <progress
            className="project-content-progress"
            max={Math.max(progress.total, 1)}
            value={progress.submitted}
            aria-label="Submitted or approved required questions"
          />
          <strong>{percent}%</strong>
        </div>
      }
      renderQuestion={(item) => (
        <Question
          root={root}
          item={item}
          expanded={item.id === itemId}
          revisionId={item.id === itemId ? revisionId : null}
          onToggle={() => onSelectItem(item.id === itemId ? null : item.id)}
          canReview={permissions.canReview}
          canMutate={state === 'ACTIVE' || state === 'PAUSED'}
          contacts={contactNames}
        />
      )}
    />
  )
}

function Question({
  root,
  item,
  expanded,
  revisionId,
  onToggle,
  canReview,
  canMutate,
  contacts,
}: {
  root: string
  item: Item
  expanded: boolean
  revisionId: string | null
  onToggle: () => void
  canReview: boolean
  canMutate: boolean
  contacts: ReadonlyMap<string, string>
}) {
  const bodyId = useId()
  return (
    <article className="content-question" aria-label={item.label}>
      <h3 className="content-question-heading">
        <button
          type="button"
          className="content-question-toggle"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          <span
            className={`question-state-icon question-state-${item.state.toLowerCase()}`}
            aria-hidden="true"
          >
            {item.state === 'APPROVED' || item.state === 'SUBMITTED' ? (
              <Check size={13} />
            ) : item.state === 'CHANGES_REQUESTED' ? (
              <CircleAlert size={18} />
            ) : (
              <Circle size={18} />
            )}
          </span>
          <span className="question-label">{item.label}</span>
          <span
            className={`question-state-text status-${item.state.toLowerCase()}`}
          >
            {statusText[item.state]}
          </span>
          {expanded ? (
            <ChevronDown
              className="question-chevron expanded"
              size={19}
              aria-hidden="true"
            />
          ) : (
            <ChevronRight
              className="question-chevron"
              size={19}
              aria-hidden="true"
            />
          )}
        </button>
      </h3>
      <div id={bodyId} hidden={!expanded}>
        {expanded && (
          <LiveRevisionReview
            key={revisionId || 'current'}
            root={root}
            item={item}
            initialRevision={revisionId || ''}
            canReview={canReview}
            canMutate={canMutate}
            contacts={contacts}
          />
        )}
      </div>
    </article>
  )
}
