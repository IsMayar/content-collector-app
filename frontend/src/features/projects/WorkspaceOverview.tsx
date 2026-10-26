import { Link } from 'react-router'
import {
  FolderKanban,
  Users,
  Clock3,
  CalendarDays,
  Mail,
  AlertTriangle,
  Layers,
} from 'lucide-react'
import { useData } from '@/api/productApi'
import type { Paged, Project } from '@/api/productTypes'
import {
  Heading,
  Panel,
  QueryState,
  projectTypes,
  useWorkspace,
} from '@/components/ProductUI'
import { ProjectTable, ProjectSymbol } from '@/components/ReferenceUI'

export function DashboardPage() {
  const { id, base, owner, user } = useWorkspace()
  const query = useData<Paged<Project>>(`workspaces/${id}/projects?size=100`)
  const projects = query.data?.data || []
  const active = projects.filter((p) => p.state === 'ACTIVE')
  const waiting = projects.reduce(
    (n, p) =>
      n +
      Math.max(0, p.progress.submittedRequired - p.progress.approvedRequired),
    0,
  )
  const clientAction = active.filter(
    (p) => p.progress.clientActionRequired > 0,
  ).length
  const today = new Date().toISOString().slice(0, 10)
  const nextWeek = new Date(Date.now() + 7 * 86400000)
    .toISOString()
    .slice(0, 10)
  const overdue = active.filter((p) => p.dueDate < today).length
  const due = active.filter(
    (p) => p.dueDate >= today && p.dueDate <= nextWeek,
  ).length
  return (
    <>
      <Heading
        title={`${owner ? 'Welcome back' : 'Good morning'}, ${user?.displayName.split(' ')[0] || 'there'}`}
        description={
          owner
            ? 'Here’s what’s happening across your agency workspace.'
            : 'Here are your assigned projects and items to review.'
        }
      >
        {owner && (
          <Link className="primary-button" to={`${base}/projects/new`}>
            ＋ Create project
          </Link>
        )}
      </Heading>
      <QueryState query={query}>
        {projects.length ? (
          <>
            <div className="metric-grid">
              {[
                {
                  Icon: FolderKanban,
                  value: active.length,
                  label: 'Active projects',
                  caption: 'Across all clients',
                },
                {
                  Icon: Users,
                  value: clientAction,
                  label: 'Client action',
                  caption: 'Waiting on client input',
                },
                {
                  Icon: Clock3,
                  value: waiting,
                  label: 'Awaiting review',
                  caption: 'Ready for your review',
                },
                {
                  Icon: CalendarDays,
                  value: due,
                  label: 'Due this week',
                  caption: 'Next 7 days',
                },
              ].map(({ Icon, value, label, caption }) => (
                <div className="metric-card" key={label}>
                  <Icon size={22} />
                  <div>
                    <span>{label}</span>
                    <strong>{value}</strong>
                    <small>{caption}</small>
                  </div>
                </div>
              ))}
            </div>
            <div className="dashboard-grid">
              <Panel
                title={owner ? 'Recent projects' : 'My assigned projects'}
                action={<Link to={`${base}/projects`}>View all projects</Link>}
              >
                <ProjectTable projects={projects.slice(0, 5)} base={base} />
              </Panel>
              <Panel title="Needs your attention">
                <div className="attention-list">
                  {[
                    {
                      Icon: Mail,
                      title: `${clientAction} projects need client input`,
                      caption: 'Outstanding client content',
                      path: 'projects',
                    },
                    {
                      Icon: AlertTriangle,
                      title: `${overdue} projects overdue`,
                      caption: 'Past due date',
                      path: 'projects?sort=dueDate',
                    },
                    {
                      Icon: Clock3,
                      title: `${waiting} items awaiting review`,
                      caption: 'Client submissions ready',
                      path: 'projects',
                    },
                    {
                      Icon: Layers,
                      title: 'Start with a template',
                      caption: 'Save time on your next project',
                      path: 'templates',
                    },
                  ].map(({ Icon, title, caption, path }) => (
                    <Link key={title} to={`${base}/${path}`}>
                      <span className="attention-icon">
                        <Icon size={20} />
                      </span>
                      <span>
                        <strong>{title}</strong>
                        <small>{caption}</small>
                      </span>
                    </Link>
                  ))}
                </div>
              </Panel>
            </div>
          </>
        ) : (
          <Panel>
            <div className="workspace-empty">
              <FolderKanban size={90} />
              <div>
                <h2>
                  Your workspace is ready.
                  <br />
                  Create your first project
                </h2>
                <p>
                  Collect client content, keep projects organised, and move
                  faster from content to launch.
                </p>
                {owner ? (
                  <Link className="primary-button" to={`${base}/projects/new`}>
                    ＋ Create project
                  </Link>
                ) : (
                  <p>Your owner can assign projects to you.</p>
                )}
              </div>
            </div>
            {owner && (
              <div className="empty-template-options">
                <h3>Start with a template</h3>
                <p>
                  Save time with a ready-to-use structure you can customise for
                  your client.
                </p>
                <div>
                  {projectTypes.map((t) => (
                    <Link
                      key={t.value}
                      to={`${base}/projects/new?type=${t.value}`}
                    >
                      <ProjectSymbol type={t.value} />
                      <span>
                        <strong>{t.label} template</strong>
                        <small>Choose your collection structure</small>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </Panel>
        )}
      </QueryState>
    </>
  )
}
