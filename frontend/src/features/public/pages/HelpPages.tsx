import {
  CheckCircle,
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
    summary:
      'Learn how to invite clients to your project and send a collection request.',
    body: 'Open your project’s Access tab. Add a contact with their name, email and access expiry, then send the invitation. The client explicitly continues from their private email link to enter that project.',
  },
  {
    Icon: FileText,
    title: 'Save a draft',
    summary: 'Keep your progress safe and return to it later.',
    body: 'Enter your answers in the client checklist and save your draft. A saved draft remains editable. Choose Submit for review only when you are ready to send that revision to your team.',
  },
  {
    Icon: Image,
    title: 'Upload photos',
    summary: 'Add and organise photos, images and other files.',
    body: 'Choose an image or file item in your project. Upload the requested files and wait for scanning to finish. Only files marked ready can be included in a submission. Follow the size and type requirements shown for the item.',
  },
  {
    Icon: CheckCircle,
    title: 'Review content',
    summary: 'Collaborate with your team and review client submissions.',
    body: 'Open the project’s Review tab to inspect the submitted revision. Reviewers with permission can approve that exact revision or request changes with feedback. Internal comments remain private to the agency.',
  },
  {
    Icon: FolderOpen,
    title: 'Export content',
    summary: 'Download organised files and content for your next stage.',
    body: 'Open Exports in the project and choose an available format. Exports contain approved revisions captured in an immutable snapshot. Download a completed export before its link expires.',
  },
  {
    Icon: LockKeyhole,
    title: 'Access recovery',
    summary: 'Regain access to your account or workspace.',
    body: 'Agency users can request a password reset from Sign in. Clients should ask their project contact for a new invitation when their access link expires or is revoked. Agency and client access are separate.',
  },
]
export function HelpPage() {
  const [search, setSearch] = useState('')
  const filtered = topics.filter((t) =>
    `${t.title} ${t.summary}`.toLowerCase().includes(search.toLowerCase()),
  )
  return (
    <section className="help-page">
      <p className="breadcrumb">
        <Link to="/">Home</Link> / Help
      </p>
      <header className="help-heading">
        <div>
          <h1>How can we help?</h1>
          <p>
            Search guides or browse topics to get the most out of Content
            Collector.
          </p>
        </div>
        <label className="help-search">
          <Search size={18} />
          <span className="sr-only">Search help articles</span>
          <input
            type="search"
            placeholder="Search help articles…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </header>
      <div className="help-grid">
        {filtered.map(({ Icon, title, summary, body }) => (
          <details key={title}>
            <summary>
              <span className="help-topic-icon">
                <Icon size={25} />
              </span>
              <span>
                <strong>{title}</strong>
                <small>{summary}</small>
              </span>
            </summary>
            <p>{body}</p>
          </details>
        ))}
      </div>
      {!filtered.length && (
        <p role="status">
          No articles match your search. Try “draft”, “invite” or “export”.
        </p>
      )}
      <aside className="help-support">
        <LockKeyhole size={26} />
        <div>
          <h2>Still need help?</h2>
          <p>
            Contact your workspace owner or project contact for account and
            project access assistance.
          </p>
        </div>
        <Link className="secondary-button" to="/sign-in">
          Go to sign in
        </Link>
      </aside>
    </section>
  )
}
export function LegalPage({ terms = false }: { terms?: boolean }) {
  const title = terms ? 'Terms of Service' : 'Privacy Policy'
  const sections = terms
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
    <article className="legal-document">
      <header>
        <h1>{title}</h1>
        <span className="policy-draft">Policy draft</span>
      </header>
      <p>
        This draft is provided for review. It is not an approved production
        policy.
      </p>
      {sections.map(([heading, body], i) => (
        <section key={heading} id={`legal-${i}`}>
          <h2>
            {i + 1}. {heading}
          </h2>
          <p>{body}</p>
        </section>
      ))}
    </article>
  )
}
