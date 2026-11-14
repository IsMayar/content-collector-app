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
import { Field } from '@/shared/components/ProductUI'
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
  DRAFT: 'Not submitted',
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
}: {
  data: ProjectDetail
  root: string
  sectionId: string | null
  itemId: string | null
  revisionId: string | null
  onSelectSection: (id: string) => void
  onSelectItem: (id: string | null) => void
  onEdit?: () => void
}) {
  const sections = data.structure.filter((section) => section.enabled)
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
    <div className="project-content">
      <div className="content-intro">
        <div
          className="content-overall-progress"
          aria-label="Required content progress"
        >
          <span>
            {progress.submitted} of {progress.total} submitted
          </span>
          <div>
            <progress
              max={Math.max(progress.total, 1)}
              value={progress.submitted}
              aria-label="Submitted or approved required questions"
            />
            <strong>{percent}%</strong>
          </div>
        </div>
        {onEdit && (
          <button type="button" className="secondary-button" onClick={onEdit}>
            Edit request
          </button>
        )}
      </div>
      {selectedSection ? (
        <div className="content-workbench">
          <nav aria-label="Content sections" className="content-section-nav">
            {sections.map((section) => (
              <button
                type="button"
                key={section.id}
                aria-current={
                  selectedSection.id === section.id ? 'true' : undefined
                }
                onClick={() => onSelectSection(section.id)}
              >
                <span>{section.title}</span>
                <SectionProgress section={section} />
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            ))}
          </nav>
          <div className="content-mobile-nav">
            <Field label="Content section">
              <select
                value={selectedSection.id}
                onChange={(e) => onSelectSection(e.target.value)}
              >
                {sections.map((section) => {
                  const { submitted, total } =
                    sectionSubmissionProgress(section)
                  return (
                    <option key={section.id} value={section.id}>
                      {section.title} · {submitted} of {total} submitted
                    </option>
                  )
                })}
              </select>
            </Field>
          </div>
          <section
            className="content-questions"
            aria-label={selectedSection.title}
          >
            <header>
              <h2>{selectedSection.title}</h2>
              <SectionProgress section={selectedSection} />
            </header>
            {selectedSection.items
              .filter((item) => item.visible && item.enabled !== false)
              .map((item) => (
                <Question
                  key={item.id}
                  root={root}
                  item={item}
                  expanded={item.id === itemId}
                  revisionId={item.id === itemId ? revisionId : null}
                  onToggle={() =>
                    onSelectItem(item.id === itemId ? null : item.id)
                  }
                  canReview={permissions.canReview}
                  canMutate={state === 'ACTIVE' || state === 'PAUSED'}
                  contacts={contactNames}
                />
              ))}
            {!selectedSection.items.some(
              (item) => item.visible && item.enabled !== false,
            ) && <p>No visible questions in this section.</p>}
          </section>
        </div>
      ) : (
        <p>No enabled sections yet.</p>
      )}
    </div>
  )
}

function SectionProgress({ section }: { section: Section }) {
  const { submitted, total } = sectionSubmissionProgress(section)
  const complete = total > 0 && submitted === total
  return (
    <span
      className={complete ? 'content-progress complete' : 'content-progress'}
    >
      {complete && <Check size={14} aria-hidden="true" />}
      {submitted} of {total} submitted
    </span>
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
