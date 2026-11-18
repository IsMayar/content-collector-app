import type { PortalFoundation as PortalData } from '@/features/client/schemas/portalSchema'
import { TypedValue } from '@/features/client/components/TypedValue'
import { clientAccessUnavailable } from '@/features/client/store/clientAccessSlice'
import { useAppDispatch } from '@/shared/hooks/useAppStore'
import { useCommand } from '@/shared/hooks/useCommand'
import {
  Badge,
  Empty,
  ErrorNotice,
  Heading,
  Panel,
} from '@/shared/components/ProductUI'
import { initialValue } from '@/shared/utils/domain'
import { useState } from 'react'
import { useNavigate } from 'react-router'
export function PortalFoundation({ data }: { data: PortalData }) {
  const [selected, setSelected] = useState('')
  const section =
    data.sections.find((s) => s.id === selected) || data.sections[0]
  const command = useCommand(true)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  return (
    <>
      <Heading
        eyebrow={`${data.project.agencyDisplayName} / PRIVATE PROJECT REQUEST`}
        title={data.project.title}
        description={`Content requested for your ${data.project.projectType.toLowerCase().replaceAll('_', ' ')} · Due ${data.project.dueDate}`}
      >
        <button
          className="secondary-button"
          disabled={command.pending}
          onClick={async () => {
            const result = await command.run('client-access/logout', {}, 'POST')
            if (result) {
              dispatch(clientAccessUnavailable())
              navigate('/client/access', { replace: true })
            }
          }}
        >
          Leave project
        </button>
      </Heading>
      <ErrorNotice error={command.error} />
      <div
        role="status"
        className="mb-5 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm leading-6 text-blue-900"
      >
        This is a read-only content request. You can review the sections and
        questions below, but responses, uploads, and submissions aren't
        available in this view.
      </div>
      {!section ? (
        <Empty
          title="No content requested yet"
          description="Your agency will add the sections and questions for this project."
        />
      ) : (
        <div className="client-workspace mt-5">
          <nav className="client-checklist" aria-label="Requested sections">
            <h2>Content request</h2>
            {data.sections.map((s) => (
              <button
                key={s.id}
                className={s.id === section.id ? 'selected' : ''}
                aria-current={s.id === section.id ? 'page' : undefined}
                onClick={() => setSelected(s.id)}
              >
                {s.title} <small>{s.items.length} questions</small>
              </button>
            ))}
          </nav>
          <section
            className="client-editor"
            aria-labelledby="portal-section-title"
          >
            <h2 id="portal-section-title" tabIndex={-1}>
              {section.title}
            </h2>
            {!section.items.length && <p>No questions in this section yet.</p>}
            {section.items.map((item) => (
              <Panel
                key={item.id}
                title={item.label}
                action={
                  <Badge>{item.required ? 'Required' : 'Optional'}</Badge>
                }
              >
                <p>{item.instructions}</p>

                {item.type === 'REPEATER' ? (
                  <div>
                    <p>
                      Repeating group · up to {item.validation.maxRows || 20}{' '}
                      entries
                    </p>
                    <dl>
                      {item.validation.columns?.map((column) => (
                        <div key={column.key}>
                          <dt>
                            {column.label}{' '}
                            {column.required ? '(Required)' : '(Optional)'}
                          </dt>
                          <dd>
                            {column.type.replaceAll('_', ' ')}
                            {column.options?.length
                              ? ` · ${column.options.map((option) => option.label).join(', ')}`
                              : ''}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ) : (
                  <TypedValue
                    item={item}
                    value={initialValue(item.type)}
                    onChange={() => {}}
                    disabled
                    root=""
                    preview
                  />
                )}
                <small className="subtle">
                  {item.type.replaceAll('_', ' ')} · View only
                </small>
              </Panel>
            ))}
          </section>
        </div>
      )}
    </>
  )
}
