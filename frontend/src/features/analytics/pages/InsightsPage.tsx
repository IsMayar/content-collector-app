import {
  ArrowRight,
  CheckCheck,
  ChevronDown,
  CircleCheck,
  Clock3,
  FolderKanban,
  ListChecks,
  Send,
  UsersRound,
} from 'lucide-react'
import type {
  Progress,
  ProjectSummary,
} from '@/features/projects/types/project.types'
import { useData } from '@/services/api/resourceApi'
import { Empty, Heading, QueryState } from '@/shared/components/ProductUI'
import { useWorkspace } from '@/shared/hooks/useWorkspace'
import type { Paged } from '@/shared/types/common.types'
import { useState } from 'react'
import { Link } from 'react-router'

const emptyProgress: Progress = {
  requiredTotal: 0,
  submittedRequired: 0,
  approvedRequired: 0,
  clientActionRequired: 0,
  optionalApproved: 0,
}

function ratio(part: number, total: number) {
  return total > 0
    ? Math.max(0, Math.min(100, Math.round((part / total) * 100)))
    : 0
}

function metricData(progress: Progress) {
  return [
    {
      label: 'Required items',
      value: progress.requiredTotal,
      Icon: ListChecks,
      iconClass: 'bg-slate-100 text-slate-700',
    },
    {
      label: 'Submitted answers',
      value: progress.submittedRequired,
      Icon: Send,
      iconClass: 'bg-sky-50 text-sky-700',
    },
    {
      label: 'Approved answers',
      value: progress.approvedRequired,
      Icon: CircleCheck,
      iconClass: 'bg-emerald-50 text-emerald-700',
    },
    {
      label: 'Waiting on client',
      value: progress.clientActionRequired,
      Icon: UsersRound,
      iconClass: 'bg-amber-50 text-amber-700',
    },
    {
      label: 'Agency review',
      value: Math.max(
        0,
        progress.submittedRequired - progress.approvedRequired,
      ),
      Icon: Clock3,
      iconClass: 'bg-violet-50 text-violet-700',
    },
  ]
}

type ProgressBreakdownProps = {
  progress: Progress
  ariaLabel: string
}

function ProgressBreakdown({ progress, ariaLabel }: ProgressBreakdownProps) {
  // Breakdown of required answers. Unsubmitted items are the remaining part.
  const required = progress.requiredTotal
  const approved = Math.min(required, Math.max(0, progress.approvedRequired))
  const awaitingReview = Math.min(
    Math.max(0, required - approved),
    Math.max(0, progress.submittedRequired - progress.approvedRequired),
  )
  const remaining = Math.max(0, required - approved - awaitingReview)

  const segments = [
    { label: 'Approved', value: approved, color: 'bg-emerald-500' },
    {
      label: 'Submitted, awaiting review',
      value: awaitingReview,
      color: 'bg-blue-500',
    },
    {
      label: 'Not yet approved or submitted',
      value: remaining,
      color: 'bg-slate-200',
    },
  ]

  return (
    <div className="space-y-3">
      <div
        role="img"
        aria-label={`${ariaLabel}: ${approved} approved, ${awaitingReview} submitted awaiting review, ${remaining} remaining out of ${required} required items`}
        className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100"
      >
        {required > 0 &&
          segments.map((segment) => (
            <div
              key={segment.label}
              className={`${segment.color} transition-[width] duration-300`}
              style={{ width: `${(segment.value / required) * 100}%` }}
            />
          ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600">
        {segments.map((segment) => (
          <span key={segment.label} className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${segment.color}`}
            />
            {segment.label}{' '}
            <span className="font-semibold tabular-nums text-slate-900">
              {segment.value}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

export function InsightsPage() {
  const { id, base, owner } = useWorkspace()
  const q = useData<Paged<ProjectSummary>>(`workspaces/${id}/projects?size=100`)
  const loaded = q.currentData as Paged<ProjectSummary> | undefined
  const projects = loaded?.data || []
  const [project, setProject] = useState('')
  const selected = projects.find((entry) => entry.id === project)
  const truncated = (loaded?.page.totalElements ?? 0) > projects.length
  const scope = truncated
    ? 'Loaded projects'
    : owner
      ? 'Workspace overview'
      : 'Assigned projects overview'
  const totals = projects.reduce(
    (sum, { progress }) => ({
      requiredTotal: sum.requiredTotal + progress.requiredTotal,
      submittedRequired: sum.submittedRequired + progress.submittedRequired,
      approvedRequired: sum.approvedRequired + progress.approvedRequired,
      clientActionRequired:
        sum.clientActionRequired + progress.clientActionRequired,
      optionalApproved: sum.optionalApproved + progress.optionalApproved,
    }),
    { ...emptyProgress },
  )
  const activeCount = projects.filter((p) => p.state === 'ACTIVE').length
  const approvalRate = ratio(totals.approvedRequired, totals.requiredTotal)
  const selectedApprovalRate = selected
    ? ratio(selected.progress.approvedRequired, selected.progress.requiredTotal)
    : 0

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-7 pb-10">
      <Heading
        title="Insights"
        description="A clear view of content collection, reviews, and client progress."
      />

      <QueryState query={{ ...q, isLoading: q.isFetching && !loaded }}>
        {projects.length ? (
          <div className="space-y-7">
            {/* Summary: clear hierarchy, with the headline percentage emphasized. */}
            <section
              aria-labelledby="insights-overview-title"
              className="space-y-4"
            >
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
                    Project performance
                  </p>
                  <h2
                    id="insights-overview-title"
                    className="text-xl font-semibold tracking-tight text-slate-900"
                  >
                    {scope}
                  </h2>
                </div>
                <span className="text-xs text-slate-500">
                  Based on {projects.length} accessible{' '}
                  {projects.length === 1 ? 'project' : 'projects'}
                </span>
              </div>
              {truncated && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Showing {projects.length} of {loaded?.page.totalElements}{' '}
                  accessible projects. All totals below reflect loaded projects
                  only.
                </p>
              )}

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                <div className="relative isolate overflow-hidden rounded-2xl bg-[#0A1A2F] p-6 text-white shadow-sm sm:p-7">
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-20 -top-28 -z-10 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -bottom-24 right-12 -z-10 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl"
                  />
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-slate-300">
                        Required content approved
                      </p>
                      <p className="mt-4 text-5xl font-semibold tracking-tight tabular-nums sm:text-6xl">
                        {approvalRate}
                        <span className="ml-1 text-3xl text-slate-300">%</span>
                      </p>
                      <p className="mt-2 text-sm text-slate-300">
                        {totals.approvedRequired} of {totals.requiredTotal}{' '}
                        required answers approved
                      </p>
                    </div>
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/10">
                      <CheckCheck size={22} aria-hidden="true" />
                    </span>
                  </div>
                  <div className="mt-7 h-2.5 overflow-hidden rounded-full bg-white/20">
                    <div
                      className="h-full rounded-full bg-cyan-400 transition-[width] duration-300"
                      style={{ width: `${approvalRate}%` }}
                    />
                  </div>
                  <p className="mt-3 text-xs text-slate-300">
                    Approved answers / required items
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                      <FolderKanban size={19} aria-hidden="true" />
                    </span>
                    <p className="mt-5 text-3xl font-semibold tracking-tight tabular-nums text-slate-900">
                      {activeCount}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Active projects
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                      <UsersRound size={19} aria-hidden="true" />
                    </span>
                    <p className="mt-5 text-3xl font-semibold tracking-tight tabular-nums text-slate-900">
                      {totals.clientActionRequired}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Waiting on client
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                      <Send size={19} aria-hidden="true" />
                    </span>
                    <p className="mt-5 text-3xl font-semibold tracking-tight tabular-nums text-slate-900">
                      {totals.submittedRequired}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Submitted answers
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
                      <Clock3 size={19} aria-hidden="true" />
                    </span>
                    <p className="mt-5 text-3xl font-semibold tracking-tight tabular-nums text-slate-900">
                      {Math.max(
                        0,
                        totals.submittedRequired - totals.approvedRequired,
                      )}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">Agency review</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Required-items breakdown. Uses no new API data. */}
            <section
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
              aria-labelledby="insights-content-title"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2
                    id="insights-content-title"
                    className="text-base font-semibold text-slate-900"
                  >
                    Content pipeline
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    How required content is moving from submission to approval.
                  </p>
                </div>
                <span className="text-sm font-medium tabular-nums text-slate-700">
                  {totals.requiredTotal} required items
                </span>
              </div>
              <div className="mt-6">
                <ProgressBreakdown
                  progress={totals}
                  ariaLabel="Workspace content pipeline"
                />
              </div>
              <p className="mt-4 text-xs leading-5 text-slate-500">
                Counts reflect visible required questions. Submitted includes
                approved; client-action items may overlap the remaining group.
              </p>
            </section>

            {/* Project snapshot retains original manual selection and link. */}
            <section
              className="rounded-2xl border border-slate-200 bg-white shadow-sm"
              aria-labelledby="insights-project-heading"
            >
              <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div>
                  <h2
                    id="insights-project-heading"
                    className="text-base font-semibold text-slate-900"
                  >
                    Project snapshot
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Explore the content status of an individual project.
                  </p>
                </div>
                <div className="relative w-full sm:w-72">
                  <label htmlFor="insights-project-select" className="sr-only">
                    Choose a project
                  </label>
                  <select
                    id="insights-project-select"
                    value={selected?.id || ''}
                    onChange={(e) => setProject(e.target.value)}
                    className="h-11 w-full appearance-none rounded-xl border border-slate-300 bg-white py-2 pl-3 pr-10 text-sm font-medium text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="">Choose a project</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={17}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                    aria-hidden="true"
                  />
                </div>
              </div>
              {selected ? (
                <div className="space-y-7 px-5 py-6 sm:px-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Selected project
                      </p>
                      <h3 className="mt-1 break-words text-xl font-semibold tracking-tight text-slate-900">
                        {selected.title}
                      </h3>
                      <p className="mt-2 text-sm text-slate-500">
                        {selected.progress.approvedRequired} of{' '}
                        {selected.progress.requiredTotal} required answers
                        approved
                      </p>
                    </div>
                    <div className="sm:text-right">
                      <p className="text-3xl font-semibold tabular-nums tracking-tight text-slate-900">
                        {selectedApprovalRate}%
                      </p>
                      <p className="text-xs text-slate-500">
                        Approval progress
                      </p>
                    </div>
                  </div>
                  <ProgressBreakdown
                    progress={selected.progress}
                    ariaLabel={`${selected.title} content pipeline`}
                  />
                  <dl
                    className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
                    aria-label={selected.title}
                  >
                    {metricData(selected.progress).map(
                      ({ label, value, Icon, iconClass }) => (
                        <div
                          key={label}
                          className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
                        >
                          <span
                            className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${iconClass}`}
                          >
                            <Icon size={17} aria-hidden="true" />
                          </span>
                          <dt className="mt-3 text-xs leading-5 text-slate-500">
                            {label}
                          </dt>
                          <dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                            {value}
                          </dd>
                        </div>
                      ),
                    )}
                  </dl>
                  <div className="flex justify-end border-t border-slate-100 pt-5">
                    <Link
                      to={`${base}/projects/${selected.id}?tab=checklist`}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white no-underline transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    >
                      Open project content{' '}
                      <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                    <FolderKanban size={23} aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-slate-900">
                    Choose a project to explore
                  </h3>
                  <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">
                    Select a project above to view its approval progress and
                    pending work.
                  </p>
                </div>
              )}
            </section>
          </div>
        ) : (
          loaded && (
            <Empty
              title="Your insights start with a project"
              description="Collect content to see progress here."
              to={`${base}/projects`}
              label="Open projects"
            />
          )
        )}
      </QueryState>
    </div>
  )
}
