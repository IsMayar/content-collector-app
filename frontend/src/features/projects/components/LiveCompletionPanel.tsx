import type { Project } from '../types/project.types'
import { Badge, DualProgress, Panel } from '@/shared/components/ProductUI'
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
    <Panel title="Project completion">
      <Badge>{project.state}</Badge>
      <DualProgress progress={project.progress} />
      <p>
        {ready
          ? 'Every visible required item is approved. Optional unapproved items do not prevent completion.'
          : 'Approve every visible required item before completing this project.'}
      </p>
      <div className="actions">
        {['ACTIVE', 'PAUSED'].includes(project.state) && (
          <button
            type="button"
            className="primary-button"
            disabled={!ready}
            onClick={() => onAction('complete')}
          >
            Mark project completed
          </button>
        )}
        {project.state === 'COMPLETED' && (
          <button
            type="button"
            className="secondary-button"
            onClick={() => onAction('reopen')}
          >
            Reopen project
          </button>
        )}
        {!['ARCHIVED', 'DELETION_PENDING'].includes(project.state) && (
          <button
            type="button"
            className="secondary-button"
            onClick={() => onAction('archive')}
          >
            Archive project
          </button>
        )}
        {project.state === 'ARCHIVED' && (
          <button
            type="button"
            className="secondary-button"
            onClick={() => onAction('restore')}
          >
            Restore to paused
          </button>
        )}
        <Link className="text-link" to="?tab=review">
          Review and reopen selected items
        </Link>
      </div>
      <p>
        Reopening a project preserves approvals. Reopen each approved item you
        want to change from its exact revision in Review. Historical content and
        approvals stay available.
      </p>
    </Panel>
  )
}
