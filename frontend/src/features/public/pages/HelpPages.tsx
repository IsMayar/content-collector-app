import {
  CheckCircle,
  ChevronDown,
  FileText,
  FolderOpen,
  Image,
  LockKeyhole,
  Search,
  UserPlus,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

const topics = [
  {
    Icon: UserPlus,
    title: 'Invite a client',
    summary: 'Invite contacts to a project and send a private link.',
    body: 'Publish your project, then open Client access. Add a contact with their name, email, and access expiry, and send the invitation. The client uses their private email link to open that project.',
  },
  {
    Icon: FileText,
    title: 'Save a draft',
    summary: 'Keep your progress and return to an answer later.',
    body: 'Enter your answers in the client checklist. A saved draft remains editable and is not yet submitted. Choose Review and submit when you are ready to send that answer for review.',
  },
  {
    Icon: Image,
    title: 'Upload photos',
    summary: 'Send images, documents, and other requested files.',
    body: 'Open the image or file question in your project. Upload the requested files and wait for scanning to finish. Only files marked ready can be included in a submission. Follow the size and type requirements shown for the item.',
  },
  {
    Icon: CheckCircle,
    title: 'Review content',
    summary: 'Approve submissions or request changes.',
    body: 'Open the project’s Content view and select a submitted answer. Reviewers with permission can approve that exact revision or request changes with feedback. Internal comments remain private to the agency.',
  },
  {
    Icon: FolderOpen,
    title: 'Export content',
    summary: 'Download approved content for the next stage.',
    body: 'Open the project’s export controls and choose an available format. Exports contain approved revisions captured in an immutable snapshot. Download a completed export before its link expires.',
  },
  {
    Icon: LockKeyhole,
    title: 'Access recovery',
    summary: 'Recover agency access or request a new client invitation.',
    body: 'Agency users can request a password reset from Sign in. Clients should ask their agency for a new invitation when their access link expires or is revoked. Agency and client access are separate.',
  },
]

export function HelpPage() {
  const [search, setSearch] = useState('')
  const term = search.trim().toLowerCase()
  const filtered = topics.filter((topic) =>
    `${topic.title} ${topic.summary} ${topic.body}`
      .toLowerCase()
      .includes(term),
  )

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16 lg:px-10">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link to="/" className="hover:text-blue-700 hover:underline">
          Home
        </Link>
        <span className="mx-2" aria-hidden="true">
          /
        </span>
        <span aria-current="page">Help</span>
      </nav>

      <div className="mt-6 flex flex-col gap-6 border-b border-slate-200 pb-8 md:flex-row md:items-end md:justify-between">
        <div className="max-w-xl">
          <h1 className="text-[32px] font-bold tracking-tight text-[#0A1A2F] sm:text-[36px]">
            How can we help?
          </h1>
          <p className="mt-2 text-[14px] leading-6 text-slate-600">
            Find quick answers about invitations, submissions, files, and
            project access.
          </p>
        </div>
        <label className="relative block w-full md:max-w-[310px]">
          <Search
            size={17}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <span className="sr-only">Search help topics</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search help topics"
            className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-[14px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
          />
        </label>
      </div>

      <div className="mt-7 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {filtered.map(({ Icon, title, summary, body }, index) => (
          <details
            key={title}
            className={`group ${index > 0 ? 'border-t border-slate-200' : ''}`}
          >
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600 sm:px-5 [&::-webkit-details-marker]:hidden">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <Icon size={18} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block text-[14px] font-semibold text-slate-900">
                  {title}
                </strong>
                <span className="mt-0.5 block text-[13px] leading-5 text-slate-500">
                  {summary}
                </span>
              </span>
              <ChevronDown
                size={17}
                aria-hidden="true"
                className="shrink-0 text-slate-500 transition-transform group-open:rotate-180"
              />
            </summary>
            <div className="px-4 pb-5 pl-16 text-[13px] leading-6 text-slate-600 sm:pl-[76px] sm:pr-6">
              {body}
            </div>
          </details>
        ))}
        {filtered.length === 0 && (
          <p
            role="status"
            className="px-5 py-10 text-center text-sm text-slate-600"
          >
            No topics match your search. Try “draft”, “invite”, or “export”.
          </p>
        )}
      </div>
    </section>
  )
}

export function LegalPage({ terms = false }: { terms?: boolean }) {
  const title = terms ? 'Terms of Service' : 'Privacy Policy'
  const sections: ReadonlyArray<readonly [string, string]> = terms
    ? [
        [
          'Introduction',
          'This is a draft outline for Content Collector. Final terms require review and approval before launch.',
        ],
        [
          'Workspace access',
          'Agency accounts and project-scoped client access serve different roles. Workspace owners manage team assignments and client invitations.',
        ],
        [
          'Content and approvals',
          'Drafts remain separate from immutable submissions. Approval applies to a specific submitted revision.',
        ],
        [
          'Service availability',
          'This development preview is not a production service commitment. Subscription and provider integrations are subject to implementation and release verification.',
        ],
      ]
    : [
        [
          'Introduction',
          'This is a draft policy outline for Content Collector by AYAANTRIX. It must be reviewed and completed before launch.',
        ],
        [
          'Data collected',
          'The application handles account information, workspace membership, project content, uploaded files, submission history and operational delivery records.',
        ],
        [
          'Files and access',
          'Project files are intended to remain private. Access depends on current workspace, project and action permissions.',
        ],
        [
          'Retention',
          'Final retention periods, deletion procedures and legal obligations have not yet been approved for publication.',
        ],
        [
          'AI assistance',
          'Optional assistance uses supplied facts to suggest text. Users explicitly accept suggestions; the application does not automatically submit or approve them.',
        ],
        [
          'Your rights',
          'The final policy must identify the operator, applicable rights, request process and contact details before production launch.',
        ],
      ]

  return (
    <article className="mx-auto w-full max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link to="/" className="hover:text-blue-700 hover:underline">
          Home
        </Link>
        <span className="mx-2" aria-hidden="true">
          /
        </span>
        <span aria-current="page">{title}</span>
      </nav>
      <header className="mt-6 border-b border-slate-200 pb-7">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
          Legal information
        </p>
        <h1 className="mt-2 text-[32px] font-bold tracking-tight text-[#0A1A2F] sm:text-[36px]">
          {title}
        </h1>
        <span className="mt-4 inline-flex rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
          Policy draft — not approved for publication
        </span>
        <p className="mt-4 text-[14px] leading-6 text-slate-600">
          This draft is provided for review. It is not an approved production
          policy.
        </p>
      </header>
      <div className="divide-y divide-slate-200">
        {sections.map(([heading, body], index) => (
          <section key={heading} id={`legal-${index}`} className="py-6">
            <h2 className="text-[17px] font-semibold text-slate-900">
              {index + 1}. {heading}
            </h2>
            <p className="mt-2 text-[14px] leading-7 text-slate-600">{body}</p>
          </section>
        ))}
      </div>
    </article>
  )
}
