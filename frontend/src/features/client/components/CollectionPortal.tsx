import {
  Bell,
  ChevronRight,
  FileText,
  LogOut,
  CheckCircle2,
} from 'lucide-react'
import { Modal } from '@/shared/components/Modal'
import './ClientPortal.css'
import { ClientPreferences } from './ClientPreferences'
import { UnsavedDraftRecovery } from './UnsavedDraftRecovery'
import { useEffect, useState } from 'react'
import { useInteraction } from '../hooks/useInteraction'
import { useNavigate } from 'react-router'
import type { CollectionData } from '../schemas/collectionSchema'
import { ClientDraftField } from './ClientDraftField'
import { pendingDrafts, clearPendingDrafts } from '../hooks/draftAutosave'
import { useCommand } from '@/shared/hooks/useCommand'
import { Heading, ErrorNotice } from '@/shared/components/ProductUI'
export function CollectionPortal({
  data,
  onRefresh,
}: {
  data: CollectionData
  onRefresh: () => void
}) {
  const interaction = useInteraction(data.project.id)
  useEffect(() => {
    interaction()
  }, [interaction])
  const [selected, setSelected] = useState('')
  const [expanded, setExpanded] = useState('')
  const [preferences, setPreferences] = useState(
    () =>
      new URLSearchParams(window.location.search).get('preferences') === '1',
  )
  const command = useCommand(true)
  const navigate = useNavigate()
  const current =
    data.sections.find((s) => s.id === selected) || data.sections[0]
  const required = data.sections
    .flatMap((s) => s.items)
    .filter((i) => i.required)
  const submitted = required.filter((i) =>
    ['SUBMITTED', 'APPROVED'].includes(i.state),
  ).length
  async function flush() {
    const visibleIds = new Set(
      data.sections.flatMap((s) =>
        s.items.map((i) => data.project.id + '/' + i.id),
      ),
    )
    const drafts = [...pendingDrafts.entries()]
      .filter(([key]) => visibleIds.has(key))
      .map(([, d]) => d)
    const results = await Promise.all(drafts.map((d) => d.flush()))
    return results.every(Boolean)
  }
  return (
    <div className="collection-portal">
      <Heading
        title={data.project.title}
        description="Share your answers and files, then send each question for review."
      >
        <button
          className="secondary-button"
          aria-expanded={preferences}
          onClick={() => setPreferences(!preferences)}
        >
          <Bell size={16} aria-hidden="true" /> Reminder preferences
        </button>
        <button
          className="secondary-button"
          onClick={async () => {
            if (!(await flush())) return
            const result = await command.run('client-access/logout', {}, 'POST')
            if (result) {
              clearPendingDrafts()
              navigate('/client/access', { replace: true })
            }
          }}
        >
          <LogOut size={16} aria-hidden="true" /> Leave project
        </button>
      </Heading>
      {required.length > 0 && (
        <div className="client-project-progress" aria-label="Project progress">
          <span>
            {submitted} of {required.length} required questions submitted
          </span>
          <progress
            value={submitted}
            max={required.length}
            aria-label="Submitted or approved required questions"
          />
          <strong>{Math.round((submitted / required.length) * 100)}%</strong>
        </div>
      )}
      <ErrorNotice error={command.error} />
      {preferences && (
        <Modal
          title="Reminder preferences"
          onClose={() => setPreferences(false)}
        >
          <div className="client-preferences-dialog">
            <ClientPreferences root={`client/projects/${data.project.id}`} />
          </div>
        </Modal>
      )}
      <UnsavedDraftRecovery projectId={data.project.id} />
      {!data.capabilities.canRespond && (
        <p role="status">
          This project is read-only. Your saved drafts remain available.
        </p>
      )}

      <div className="client-workspace">
        <nav className="client-checklist" aria-label="Requested sections">
          <p className="client-sections-label">
            <FileText size={16} aria-hidden="true" /> Content sections
          </p>
          {data.sections.map((s) => (
            <button
              key={s.id}
              className={current?.id === s.id ? 'selected' : ''}
              aria-current={current?.id === s.id ? 'page' : undefined}
              onClick={async () => {
                if (await flush()) {
                  setSelected(s.id)
                  setExpanded('')
                  requestAnimationFrame(() =>
                    document.getElementById('section-' + s.id)?.focus(),
                  )
                }
              }}
            >
              <span>
                {s.title}
                <small>
                  {
                    s.items.filter((i) =>
                      ['SUBMITTED', 'APPROVED'].includes(i.state),
                    ).length
                  }{' '}
                  of {s.items.length} submitted
                </small>
              </span>
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          ))}
        </nav>
        <div className="client-editor">
          {data.sections.map((s) => (
            <section key={s.id} hidden={s.id !== current?.id}>
              <header className="client-section-heading">
                <h2 tabIndex={-1} id={'section-' + s.id}>
                  {s.title}
                </h2>
                <span>
                  <CheckCircle2 size={15} aria-hidden="true" />{' '}
                  {
                    s.items.filter((i) =>
                      ['SUBMITTED', 'APPROVED'].includes(i.state),
                    ).length
                  }{' '}
                  of {s.items.length} submitted
                </span>
              </header>
              {!s.items.length && (
                <p className="client-empty-section">
                  No questions in this section yet.
                </p>
              )}
              {s.items.map((item) => (
                <ClientDraftField
                  key={
                    item.id +
                    ':' +
                    (item.state === 'SUBMITTED' ? 'submitted' : 'editable')
                  }
                  item={item}
                  expanded={expanded === item.id}
                  onToggle={async () => {
                    if (!(await flush())) return
                    setExpanded((open) => (open === item.id ? '' : item.id))
                  }}
                  projectId={data.project.id}
                  structureVersion={data.project.structureVersion}
                  onSaved={onRefresh}
                  canUpload={data.capabilities.canUpload}
                  canRespond={data.capabilities.canSubmit}
                  aiEnabled={data.project.aiEnabled}
                />
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
