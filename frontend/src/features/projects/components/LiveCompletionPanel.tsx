import type { Project } from '../types/project.types'
import { CheckCircle2, Archive, RotateCcw } from 'lucide-react'
import { CardHeader } from '@/shared/components/AccessUI'
import { Badge } from '@/shared/components/ProductUI'
import { Link } from 'react-router'
export function LiveCompletionPanel({
  project,
  onAction,
}: {
  project: Project
  onAction: (action: string) => void
}) {
  const ready =
    project.progress.approvedRequired === project.progress.requiredTotal
  return (
    <section className="project-view-card project-completion-card">
      <CardHeader
        icon={CheckCircle2}
        title="Project completion"
        action={<Badge>{project.state}</Badge>}
      />
      <div className="project-view-body">
      <div className="project-completion-progress">
        <strong>Required approvals</strong>
        <span>{project.progress.approvedRequired} of {project.progress.requiredTotal} approved</span>
        <progress
          aria-label="Required approvals"
          value={project.progress.approvedRequired}
          max={project.progress.requiredTotal || 1}
        />
      </div>
      <p>
        {ready
          ? 'Every visible required item is approved. Optional unapproved items do not prevent completion.'
          : 'Approve every visible required item before completing this project.'}
      </p>
      <div className="actions">
        {project.permissions.canManageAccess &&
          ['ACTIVE', 'PAUSED'].includes(project.state) && (
            <button
              type="button"
              className="primary-button"
              disabled={!ready}
              onClick={() => onAction('complete')}
            >
              <CheckCircle2 size={16} aria-hidden="true" />
              Mark project completed
            </button>
          )}
        {project.permissions.canManageAccess &&
          project.state === 'COMPLETED' && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => onAction('reopen')}
            >
              Reopen project
            </button>
          )}
        {project.permissions.canManageAccess &&
          !['ARCHIVED', 'DELETION_PENDING'].includes(project.state) && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => onAction('archive')}
            >
              <Archive size={16} aria-hidden="true" />
              Archive project
            </button>
          )}
        {project.permissions.canManageAccess &&
          project.state === 'ARCHIVED' && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => onAction('restore')}
            >
              Restore to paused
            </button>
          )}
        <Link className="au-btn au-btn--secondary" to="?tab=checklist">
          <RotateCcw size={16} aria-hidden="true" />
          Review and reopen selected items
        </Link>
      </div>
      <p>
        Reopening preserves historical content and approvals. Reopen individual
        approved revisions from Content.
      </p>
      </div>
    </section>
  )
}
