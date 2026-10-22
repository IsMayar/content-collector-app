import { useState, type FormEvent } from 'react'
import { TemplateEditor } from './TemplateEditor'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import {
  FolderKanban,
  ArrowUpRight,
  Layers,
  CheckCheck,
  Clock3,
} from 'lucide-react'
import { useData } from '@/api/productApi'
import type {
  Client,
  Paged,
  Project,
  TemplateCardData,
  TemplateDefinition,
} from '@/api/productTypes'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { bootstrapSession } from '@/features/auth/session'
import {
  DualProgress,
  Empty,
  ErrorNotice,
  Field,
  Heading,
  Panel,
  QueryState,
  Badge,
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
  const command = useCommand()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const values = Object.fromEntries(new FormData(e.currentTarget))
    const result = await command.run<{ workspace: { id: string } }>(
      'workspaces',
      values,
    )
    if (result) {
      await dispatch(bootstrapSession())
      navigate(`/app/w/${result.workspace.id}/overview`)
    }
  }
  return (
    <div className="narrow-product">
      <Heading
        eyebrow="A GOOD PLACE TO START"
        title="Make space for your next project"
        description="Set up your workspace. Invite your clients when you’re ready."
      />
      <Panel>
        <form className="stack-form" onSubmit={submit}>
          <Field label="Workspace name">
            <input
              name="name"
              required
              minLength={2}
              maxLength={100}
              placeholder="e.g. Northstar Studio"
            />
          </Field>
          <Field label="How do you work?">
            <select name="planKey">
              <option value="SOLO">Freelancer · Solo</option>
              <option value="AGENCY">Small team · Agency</option>
            </select>
          </Field>
          <Field label="Workspace timezone">
            <input
              name="timezone"
              defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone}
              required
            />
          </Field>
          <ErrorNotice error={command.error} />
          <button className="primary-button" disabled={command.pending}>
            Create workspace
          </button>
          <p className="subtle">
            14-day trial. Plans and prices are proposed for this preview.
          </p>
        </form>
      </Panel>
    </div>
  )
}
export function DashboardPage() {
  const { id, base, owner, user } = useWorkspace()
  const query = useData<Paged<Project>>(`workspaces/${id}/projects?size=100`)
  const projects = query.data?.data || []
  const active = projects.filter((p) => p.state === 'ACTIVE')
  const waiting = projects.reduce(
    (n, p) => n + p.progress.submittedRequired - p.progress.approvedRequired,
    0,
  )
  return (
    <>
      <Heading
        eyebrow="THE BIG PICTURE"
        title={`Welcome, ${user?.displayName.split(' ')[0] || 'there'}`}
        description={
          owner
            ? 'Your projects, moving forward. Here’s where things stand.'
            : 'Your assigned projects and the work that needs your attention.'
        }
      >
        {owner && (
          <Link className="primary-button" to={`${base}/projects/new`}>
            ＋ New project
          </Link>
        )}
      </Heading>
      <QueryState query={query}>
        <div className="metric-grid">
          {[
            [FolderKanban, projects.length, 'Total projects'],
            [Layers, active.length, 'Active projects'],
            [Clock3, waiting, 'Awaiting review'],
            [
              CheckCheck,
              projects.filter((p) => p.state === 'COMPLETED').length,
              'Completed',
            ],
          ].map(([Icon, value, label]) => {
            const Symbol = Icon as typeof FolderKanban
            return (
              <div className="metric-card" key={String(label)}>
                <Symbol size={20} />
                <strong>{String(value)}</strong>
                <span>{String(label)}</span>
              </div>
            )
          })}
        </div>
        <div className="dashboard-grid">
          <Panel
            title="Projects in motion"
            action={
              <Link to={`${base}/projects`}>
                View all <ArrowUpRight size={15} />
              </Link>
            }
          >
            {projects.length ? (
              <div className="project-list">
                {projects.slice(0, 4).map((project) => (
                  <Link
                    className="project-row"
                    key={project.id}
                    to={`${base}/projects/${project.id}`}
                  >
                    <div className={`project-icon type-${project.projectType}`}>
                      {project.projectType === 'WEBSITE'
                        ? 'W'
                        : project.projectType === 'WEB_APP'
                          ? 'A'
                          : 'M'}
                    </div>
                    <div className="grow">
                      <strong>{project.title}</strong>
                      <p>
                        {project.clientBusinessName} · Due {project.dueDate}
                      </p>
                      <DualProgress progress={project.progress} />
                    </div>
                    <Badge>{project.state}</Badge>
                  </Link>
                ))}
              </div>
            ) : (
              <Empty
                title="Your next project starts here"
                description="Choose a template, add a customer and make a clear collection plan."
                to={owner ? `${base}/projects/new` : undefined}
                label="Create a project"
              />
            )}
          </Panel>
          <div className="stack">
            <section className="accent-panel">
              <span className="eyebrow">A STRONGER START</span>
              <h2>
                Good questions.
                <br />
                Great projects.
              </h2>
              <p>
                Start with a thoughtful template for your next website, web app
                or mobile app.
              </p>
              <Link to={`${base}/templates`}>
                Explore templates <ArrowUpRight size={18} />
              </Link>
            </section>
            <Panel title="A clear path to handoff">
              <ol className="steps-list">
                <li>Build your collection checklist</li>
                <li>Invite your client to collaborate</li>
                <li>Review, approve and export</li>
              </ol>
            </Panel>
          </div>
        </div>
      </QueryState>
    </>
  )
}
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
        description="Every brief, every detail, one clear place."
      >
        {owner && (
          <Link className="primary-button" to={`${base}/projects/new`}>
            ＋ New project
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
      <QueryState query={query}>
        {query.data?.data.length ? (
          <>
            <div className="project-grid">
              {query.data.data.map((p) => (
                <Link
                  key={p.id}
                  className="project-card"
                  to={`${base}/projects/${p.id}`}
                >
                  <div className="card-top">
                    <span className={`project-icon type-${p.projectType}`}>
                      <FolderKanban size={22} />
                    </span>
                    <Badge>{p.state}</Badge>
                  </div>
                  <p className="eyebrow">
                    {p.projectType.replaceAll('_', ' ')}
                  </p>
                  <h2>{p.title}</h2>
                  <p>{p.clientBusinessName}</p>
                  <DualProgress progress={p.progress} />
                  <footer>
                    <span>Due {p.dueDate}</span>
                    <ArrowUpRight size={18} />
                  </footer>
                </Link>
              ))}
            </div>
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
export function CreateProjectPage() {
  const { id, base, owner } = useWorkspace()
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const [type, setType] = useState(search.get('type') || 'WEBSITE')
  const [newClient, setNewClient] = useState(false)
  const clients = useData<Paged<Client>>(`workspaces/${id}/clients`)
  const templates = useData<{ data: TemplateCardData[] }>(
    `workspaces/${id}/templates`,
  )
  const command = useCommand()
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const values = Object.fromEntries(new FormData(e.currentTarget))
    let clientId = values.clientId
    if (newClient) {
      const result = await command.run<{ client: Client }>(
        `workspaces/${id}/clients`,
        {
          businessName: values.businessName,
          contactName: values.contactName,
          email: values.email,
        },
      )
      if (!result) return
      clientId = result.client.id
    }
    const result = await command.run<{ project: Project }>(
      `workspaces/${id}/projects`,
      {
        clientId,
        title: values.title,
        projectType: type,
        dueDate: values.dueDate,
        timezone: values.timezone,
        templateVersionId: values.templateVersionId,
      },
    )
    if (result) navigate(`${base}/projects/${result.project.id}`)
  }
  if (!owner)
    return (
      <Empty
        title="Owner access required"
        description="Your owner can create projects and assign them to you."
      />
    )
  return (
    <>
      <Heading
        title="A fresh start"
        description="Give your project a home. You can fine-tune the checklist before inviting your client."
      />
      <div className="create-grid">
        <Panel title="Project details">
          <form className="stack-form" onSubmit={submit}>
            <Field label="Project name">
              <input
                required
                maxLength={160}
                name="title"
                placeholder="e.g. Lamar Dental website"
              />
            </Field>
            <Field label="Project type">
              <select
                name="projectType"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                {projectTypes.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Customer">
              <select
                required={!newClient}
                name="clientId"
                disabled={newClient}
              >
                <option value="">Choose a customer</option>
                {clients.data?.data.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.businessName}
                  </option>
                ))}
              </select>
            </Field>
            <label className="check-row">
              <input
                type="checkbox"
                checked={newClient}
                onChange={(e) => setNewClient(e.target.checked)}
              />
              Add a new customer
            </label>
            {newClient && (
              <div className="inset stack-form">
                <Field label="Business name">
                  <input required name="businessName" />
                </Field>
                <Field label="Contact name">
                  <input name="contactName" />
                </Field>
                <Field label="Customer email">
                  <input required type="email" name="email" />
                </Field>
              </div>
            )}
            <div className="form-grid">
              <Field label="Due date">
                <input name="dueDate" type="date" required />
              </Field>
              <Field label="Project timezone">
                <input
                  name="timezone"
                  required
                  defaultValue="America/New_York"
                />
              </Field>
            </div>
            <Field label="Starting template">
              <select
                key={type}
                name="templateVersionId"
                defaultValue={search.get('template') || ''}
              >
                <option value="">Recommended for this project type</option>
                {templates.data?.data
                  .filter((t) => t.projectType === type)
                  .map((t) => (
                    <option key={t.id} value={t.versionId}>
                      {t.title} · v{t.version}
                    </option>
                  ))}
              </select>
            </Field>
            <ErrorNotice error={command.error} />
            <div className="actions">
              <button disabled={command.pending} className="primary-button">
                Create project
              </button>
              <Link className="secondary-button" to={`${base}/projects`}>
                Cancel
              </Link>
            </div>
          </form>
        </Panel>
        <aside className="accent-panel">
          <p className="eyebrow">YOUR PROJECT, YOUR WAY</p>
          <h2>Built on a thoughtful starting point.</h2>
          <p>
            Every project gets an independent copy of its template. Changes to
            this project won’t affect other projects or the original template.
          </p>
          <p>
            Your project starts as a draft. Publish it when the questions feel
            right.
          </p>
        </aside>
      </div>
    </>
  )
}
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
  return (
    <>
      <Heading
        eyebrow="A THOUGHTFUL HEAD START"
        title="Template gallery"
        description="Questions that get to the heart of your next project. Make them your own."
      />
      <div className="filter-bar">
        <Field label="Project type">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {projectTypes.map((t) => (
              <option value={t.value} key={t.value}>
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
            {[...new Set(query.data?.data.map((t) => t.industry))].map((i) => (
              <option key={i}>{i}</option>
            ))}
          </select>
        </Field>
      </div>
      <ErrorNotice error={command.error} />
      {message && <p role="status">{message}</p>}
      <QueryState query={query}>
        <div className="template-grid">
          {query.data?.data
            .filter(
              (t) =>
                (!type || t.projectType === type) &&
                (!industry || t.industry === industry),
            )
            .map((t, index) => (
              <article className="template-card" key={t.id}>
                <div
                  className={`template-art art-${index % 4}`}
                  aria-hidden="true"
                >
                  <div className="mini-window">
                    <span />
                    <span />
                    <span />
                    <div />
                    <div />
                    <div />
                  </div>
                  <Layers size={32} />
                </div>
                <div className="template-copy">
                  <p className="eyebrow">
                    {t.projectType.replaceAll('_', ' ')} ·{' '}
                    {t.isBuiltin ? 'CURATED' : 'WORKSPACE'}
                  </p>
                  <h2>{t.title}</h2>
                  <p>
                    {t.industry.replaceAll('_', ' ')} · Version {t.version}
                  </p>
                  <div className="actions">
                    <button
                      className="secondary-button"
                      onClick={() =>
                        setPreview(preview === t.versionId ? '' : t.versionId)
                      }
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
                  {preview === t.versionId && detail.data && (
                    <div className="template-preview">
                      <h3>Collection checklist</h3>
                      {detail.data.definition.sections.map((s) => (
                        <div key={s.key}>
                          <strong>{s.title}</strong>
                          <ul>
                            {s.items.map((i) => (
                              <li key={i.key}>
                                {i.label}
                                {i.required ? ' *' : ''}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                      {owner && !t.isBuiltin && (
                        <button
                          className="secondary-button"
                          onClick={() => setEditing(t.id)}
                        >
                          Edit workspace template
                        </button>
                      )}
                      {owner && (
                        <button
                          className="secondary-button"
                          disabled={command.pending}
                          onClick={async () => {
                            if (
                              await command.run(`workspaces/${id}/templates`, {
                                definition: {
                                  ...detail.data!.definition,
                                  title: `${t.title} — workspace copy`,
                                },
                              })
                            )
                              setMessage(
                                'Independent workspace template created.',
                              )
                          }}
                        >
                          Copy to workspace
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            ))}
        </div>
      </QueryState>
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
