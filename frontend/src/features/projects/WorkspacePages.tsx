import { useState, type FormEvent } from 'react'
import { useNotify } from '@/components/Feedback'
import { Upload, Users, UserRound } from 'lucide-react'
import { TemplateEditor } from './TemplateEditor'
import {
  ProjectTable,
  TemplateSymbol,
  TemplatePreview,
} from '@/components/ReferenceUI'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { useData } from '@/api/productApi'
import type {
  Paged,
  Project,
  TemplateCardData,
  TemplateDefinition,
} from '@/api/productTypes'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { bootstrapSession } from '@/features/auth/session'
import {
  Empty,
  ErrorNotice,
  Field,
  Heading,
  Panel,
  QueryState,
  projectTypes,
  useCommand,
  useWorkspace,
} from '@/components/ProductUI'

export function WorkspaceEntry() {
  const state = useAppSelector((s) => s.auth)
  return (
    <Navigate
      replace
      to={
        state.workspaceId
          ? `/app/w/${state.workspaceId}/overview`
          : '/app/onboarding'
      }
    />
  )
}
export function OnboardingPage() {
  const [logo, setLogo] = useState('')
  const [logoError, setLogoError] = useState('')
  const [saving, setSaving] = useState(false)
  const notify = useNotify()
  const command = useCommand()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    const values = Object.fromEntries(new FormData(e.currentTarget))
    const result = await command.run<{
      workspace: { id: string; version: number }
    }>('workspaces', values)
    if (result) {
      if (
        logo &&
        !(await command.run(
          `workspaces/${result.workspace.id}`,
          {
            name: values.name,
            timezone: values.timezone,
            logo,
            expectedVersion: result.workspace.version,
          },
          'PATCH',
        ))
      )
        notify(
          'Workspace created. The logo could not be saved; add it in Settings.',
        )
      await dispatch(bootstrapSession())
      navigate(`/app/w/${result.workspace.id}/overview`)
    }
    setSaving(false)
  }
  return (
    <div className="narrow-product">
      <Heading
        eyebrow="WELCOME TO CONTENT COLLECTOR"
        title="Let’s set up your workspace."
        description="Create your workspace and tell us a bit about how you work so we can tailor your experience."
      />
      <Panel>
        <form className="stack-form onboarding-form" onSubmit={submit}>
          <Field label="Workspace name">
            <input
              name="name"
              required
              minLength={2}
              maxLength={100}
              placeholder="e.g. Northstar Studio"
            />
          </Field>
          <div className="onboarding-logo">
            <strong>
              Workspace logo <span>(optional)</span>
            </strong>
            <div>
              {logo ? (
                <img src={logo} alt="Workspace logo preview" />
              ) : (
                <span className="logo-placeholder">A</span>
              )}
              <label className="logo-upload">
                <Upload size={24} />
                <span>Upload logo</span>
                <small>PNG, JPG or WebP · Max 1 MB</small>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  aria-label="Upload workspace logo"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    if (
                      file.size > 1048576 ||
                      !['image/png', 'image/jpeg', 'image/webp'].includes(
                        file.type,
                      )
                    ) {
                      setLogoError(
                        'Choose a PNG, JPEG or WebP image smaller than 1 MB.',
                      )
                      return
                    }
                    setLogoError('')
                    const reader = new FileReader()
                    reader.onload = () => setLogo(String(reader.result))
                    reader.onerror = () =>
                      setLogoError(
                        'Could not read this image. Try another file.',
                      )
                    reader.readAsDataURL(file)
                  }}
                />
              </label>
            </div>
            {logo && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => setLogo('')}
              >
                Remove logo
              </button>
            )}
            <ErrorNotice error={logoError} />
          </div>
          <fieldset className="work-style">
            <legend>How do you work?</legend>
            <label>
              <input
                type="radio"
                name="planKey"
                value="AGENCY"
                defaultChecked
              />
              <Users size={28} />
              <span>
                <strong>Agency</strong>
                <small>Manage multiple clients and team members</small>
              </span>
            </label>
            <label>
              <input type="radio" name="planKey" value="SOLO" />
              <UserRound size={28} />
              <span>
                <strong>Freelancer</strong>
                <small>Work independently with your clients</small>
              </span>
            </label>
          </fieldset>
          <Field label="Workspace timezone">
            <input
              name="timezone"
              defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone}
              required
            />
          </Field>
          <ErrorNotice error={command.error} />
          <button className="primary-button" disabled={saving}>
            {saving ? 'Creating…' : 'Create workspace →'}
          </button>
          <p className="subtle">
            14-day trial. Plans and prices are proposed for this preview.
          </p>
        </form>
      </Panel>
    </div>
  )
}
export { DashboardPage } from './WorkspaceOverview'
export function ProjectsPage() {
  const { id, base, owner } = useWorkspace()
  const [search, setSearch] = useSearchParams()
  const query = useData<Paged<Project>>(
    `workspaces/${id}/projects?${search.toString()}`,
  )
  function filter(key: string, value: string) {
    const next = new URLSearchParams(search)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setSearch(next)
  }
  return (
    <>
      <Heading
        title="Projects"
        description="Manage all projects across your agency workspace."
      >
        {owner && (
          <Link className="primary-button" to={`${base}/projects/new`}>
            ＋ Create project
          </Link>
        )}
      </Heading>
      <div className="filter-bar">
        <Field label="Search projects">
          <input
            type="search"
            value={search.get('search') || ''}
            placeholder="Search by project or customer"
            onChange={(e) => filter('search', e.target.value)}
          />
        </Field>
        <Field label="Project type">
          <select
            value={search.get('projectType') || ''}
            onChange={(e) => filter('projectType', e.target.value)}
          >
            <option value="">All types</option>
            {projectTypes.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="State">
          <select
            value={search.get('state') || ''}
            onChange={(e) => filter('state', e.target.value)}
          >
            <option value="">All states</option>
            {['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Sort by">
          <select
            value={search.get('sort') || 'updatedAt'}
            onChange={(e) => filter('sort', e.target.value)}
          >
            <option value="updatedAt">Recently updated</option>
            <option value="title">Project name</option>
            <option value="dueDate">Due date</option>
          </select>
        </Field>
      </div>
      <nav className="reference-tabs" aria-label="Project types">
        {[{ value: '', label: 'All projects' }, ...projectTypes].map((t) => (
          <button
            key={t.value}
            className={
              (search.get('projectType') || '') === t.value ? 'active' : ''
            }
            onClick={() => filter('projectType', t.value)}
            aria-pressed={(search.get('projectType') || '') === t.value}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <QueryState query={query}>
        {query.data?.data.length ? (
          <>
            <ProjectTable projects={query.data.data} base={base} />
            <div className="pagination">
              <span>{query.data.page.totalElements} projects</span>
              <button
                className="secondary-button"
                disabled={!Number(search.get('page') || 0)}
                onClick={() =>
                  filter('page', String(Number(search.get('page')) - 1))
                }
              >
                Previous
              </button>
              <span>Page {Number(search.get('page') || 0) + 1}</span>
              <button
                className="secondary-button"
                disabled={
                  (Number(search.get('page') || 0) + 1) *
                    query.data.page.size >=
                  query.data.page.totalElements
                }
                onClick={() =>
                  filter('page', String(Number(search.get('page') || 0) + 1))
                }
              >
                Next
              </button>
            </div>
          </>
        ) : (
          <Empty
            title="No projects found"
            description="Try another filter, or start a fresh collection."
            to={owner ? `${base}/projects/new` : undefined}
            label="New project"
          />
        )}
      </QueryState>
    </>
  )
}
export { CreateProjectPage } from './ProjectWizard'
export function TemplatesPage() {
  const { id, base, owner } = useWorkspace()
  const query = useData<{ data: TemplateCardData[] }>(
    `workspaces/${id}/templates`,
  )
  const [type, setType] = useState('')
  const [industry, setIndustry] = useState('')
  const [preview, setPreview] = useState('')
  const [editing, setEditing] = useState('')
  const detail = useData<{ definition: TemplateDefinition }>(
    preview ? `workspaces/${id}/template-versions/${preview}` : '',
  )
  const command = useCommand()
  const [message, setMessage] = useState('')
  const [library, setLibrary] = useState('builtin')
  const selected = query.data?.data.find((t) => t.versionId === preview)
  return (
    <>
      {selected ? (
        <>
          <button
            className="back-link"
            onClick={() => {
              setPreview('')
              setEditing('')
            }}
          >
            ← Templates / {selected.industry.replaceAll('_', ' ')}
          </button>
          <Heading
            title={selected.title}
            description="Collect all the content you need from your client. Explore the sections, questions and examples in this template."
          >
            {owner && (
              <Link
                className="primary-button"
                to={`${base}/projects/new?type=${selected.projectType}&template=${selected.versionId}`}
              >
                Use this template →
              </Link>
            )}
          </Heading>
          <QueryState query={detail}>
            {detail.data && (
              <TemplatePreview
                key={preview}
                definition={detail.data.definition}
              />
            )}
          </QueryState>
          <div className="actions template-actions">
            {owner && !selected.isBuiltin && (
              <button
                className="secondary-button"
                onClick={() => setEditing(selected.id)}
              >
                Edit workspace template
              </button>
            )}
            {owner && detail.data && (
              <button
                className="secondary-button"
                disabled={command.pending}
                onClick={async () => {
                  if (
                    await command.run(`workspaces/${id}/templates`, {
                      definition: {
                        ...detail.data!.definition,
                        title: `${selected.title} — workspace copy`,
                      },
                    })
                  )
                    setMessage('Independent workspace template created.')
                }}
              >
                Copy to workspace
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <Heading
            title="Project templates"
            description="Save and reuse content structures across projects."
          />
          <nav className="reference-tabs" aria-label="Template library">
            {[
              ['builtin', 'Built-in templates'],
              ['workspace', 'My templates'],
            ].map(([key, label]) => (
              <button
                key={key}
                className={library === key ? 'active' : ''}
                aria-pressed={library === key}
                onClick={() => setLibrary(key)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="filter-bar">
            <Field label="Project type">
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">All types</option>
                {projectTypes.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Industry">
              <select
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
              >
                <option value="">All industries</option>
                {[...new Set(query.data?.data.map((t) => t.industry))].map(
                  (i) => (
                    <option key={i}>{i}</option>
                  ),
                )}
              </select>
            </Field>
          </div>
          <QueryState query={query}>
            <div className="template-grid">
              {query.data?.data
                .filter(
                  (t) =>
                    (library === 'builtin' ? t.isBuiltin : !t.isBuiltin) &&
                    (!type || t.projectType === type) &&
                    (!industry || t.industry === industry),
                )
                .map((t) => (
                  <article className="template-card" key={t.id}>
                    <TemplateSymbol industry={t.industry} />
                    <div className="template-copy">
                      <p className="eyebrow">
                        {t.isBuiltin ? 'Built-in' : 'Workspace'} ·{' '}
                        {t.projectType.replaceAll('_', ' ')}
                      </p>
                      <h2>{t.title}</h2>
                      <p>
                        {t.industry.replaceAll('_', ' ')} · Version {t.version}
                      </p>
                      <div className="actions">
                        <button
                          className="secondary-button"
                          onClick={() => setPreview(t.versionId)}
                        >
                          Preview
                        </button>
                        {owner && (
                          <Link
                            className="text-link"
                            to={`${base}/projects/new?type=${t.projectType}&template=${t.versionId}`}
                          >
                            Use template →
                          </Link>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
            </div>
            {library === 'workspace' &&
              !query.data?.data.some((t) => !t.isBuiltin) && (
                <Empty
                  title="Your templates will appear here"
                  description="Preview a built-in template and copy it to your workspace to make it your own."
                />
              )}
          </QueryState>
          <p className="reference-info">
            ⓘ Templates are saved as a stable snapshot. Changes to a template do
            not affect existing projects.
          </p>
        </>
      )}
      <ErrorNotice error={command.error} />
      {message && <p role="status">{message}</p>}
      {editing && detail.data && (
        <TemplateEditor
          root={`workspaces/${id}/templates/${editing}`}
          definition={detail.data.definition}
          onClose={() => setEditing('')}
        />
      )}
    </>
  )
}
