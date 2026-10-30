import { UnsavedDraftRecovery } from './UnsavedDraftRecovery'
import { useState } from 'react'
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
  const [selected, setSelected] = useState('')
  const command = useCommand(true)
  const navigate = useNavigate()
  const current =
    data.sections.find((s) => s.id === selected) || data.sections[0]
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
    <>
      <Heading
        title={data.project.title}
        description="Answers remain drafts. Check the save status for each question. Final submission and uploads are not available yet."
      >
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
          Leave project
        </button>
      </Heading>
      <ErrorNotice error={command.error} />
      <UnsavedDraftRecovery projectId={data.project.id} />
      {!data.capabilities.canRespond && (
        <p role="status">
          This project is read-only. Your saved drafts remain available.
        </p>
      )}
      <div className="client-workspace">
        <nav className="client-checklist" aria-label="Requested sections">
          {data.sections.map((s) => (
            <button
              key={s.id}
              className={current?.id === s.id ? 'selected' : ''}
              aria-current={current?.id === s.id ? 'page' : undefined}
              onClick={async () => {
                if (await flush()) {
                  setSelected(s.id)
                  requestAnimationFrame(() =>
                    document.getElementById('section-' + s.id)?.focus(),
                  )
                }
              }}
            >
              {s.title}
            </button>
          ))}
        </nav>
        <div className="client-editor">
          {data.sections.map((s) => (
            <section key={s.id} hidden={s.id !== current?.id}>
              <h2 tabIndex={-1} id={'section-' + s.id}>
                {s.title}
              </h2>
              {s.items.map((item) => (
                <ClientDraftField
                  key={item.id}
                  item={item}
                  projectId={data.project.id}
                  structureVersion={data.project.structureVersion}
                  onSaved={onRefresh}
                />
              ))}
            </section>
          ))}
        </div>
      </div>
    </>
  )
}
