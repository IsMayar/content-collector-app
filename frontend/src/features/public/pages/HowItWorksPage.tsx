import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  FileText,
  FolderOpen,
  LayoutTemplate,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
  UsersRound,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useAppSelector } from '@/shared/hooks/useAppStore'

/* -------------------------------------------------------
   SHARED CONTENT
------------------------------------------------------- */

const workflow = [
  {
    number: '01',
    title: 'Prepare',
    href: '#prepare',
  },
  {
    number: '02',
    title: 'Collaborate',
    href: '#collaborate',
  },
  {
    number: '03',
    title: 'Deliver',
    href: '#deliver',
  },
]

const requestFeatures = [
  'Start with a template or customize the structure.',
  'Organize questions into clear sections.',
  'Invite clients to provide the requested content.',
]

const collaborationFeatures = [
  'Clients can save drafts and submit their answers.',
  'Collect requested files alongside written content.',
  'Approve submissions or request specific changes.',
]

const deliveryFeatures = [
  'Track submitted and approved content.',
  'Keep approved revisions organized by project.',
  'Export approved content using available formats.',
]

/* -------------------------------------------------------
   SHARED COMPONENTS
------------------------------------------------------- */

function FeatureList({ items }: { items: readonly string[] }) {
  return (
    <ul className="mt-6 space-y-3">
      {items.map((item) => (
        <li
          key={item}
          className="flex items-start gap-3 text-sm leading-6 text-slate-700"
        >
          <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
            <Check size={13} strokeWidth={2.5} aria-hidden="true" />
          </span>

          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function StepHeading({
  number,
  eyebrow,
  title,
  description,
}: {
  number: string
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-xs font-bold text-blue-700">
          {number}
        </span>

        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-blue-700">
          {eyebrow}
        </span>
      </div>

      <h2 className="mt-5 max-w-xl text-[28px] font-bold leading-[1.2] tracking-tight text-[#0A1A2F] sm:text-[34px]">
        {title}
      </h2>

      <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
        {description}
      </p>
    </div>
  )
}

function PreviewFrame({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div
      aria-label={`Illustrative ${title.toLowerCase()} preview`}
      className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_16px_45px_-25px_rgba(15,23,42,0.22)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <FolderOpen size={16} aria-hidden="true" />
          </span>

          <span className="truncate text-sm font-semibold text-slate-900">
            {title}
          </span>
        </div>

        <span className="shrink-0 text-[11px] text-slate-400">Example</span>
      </div>

      {children}
    </div>
  )
}

/* -------------------------------------------------------
   PAGE
------------------------------------------------------- */

export function HowItWorksPage() {
  const authenticated = useAppSelector(
    (state) => state.auth.status === 'authenticated',
  )

  const destination = authenticated ? '/app' : '/sign-up'

  return (
    <div className="min-w-0 overflow-x-clip bg-white text-[#0A1A2F]">
      {/* =================================================
          HERO
      ================================================= */}

      <section
        aria-labelledby="how-it-works-title"
        className="border-b border-slate-200 bg-gradient-to-b from-white to-[#F8FAFC]"
      >
        <div className="mx-auto w-full max-w-6xl px-5 pb-14 pt-16 sm:px-8 sm:pb-16 sm:pt-20 lg:px-10">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-700">
              <LayoutTemplate size={15} aria-hidden="true" />A simpler content
              workflow
            </span>

            <h1
              id="how-it-works-title"
              className="mt-6 text-[36px] font-bold leading-[1.13] tracking-[-0.04em] text-[#0A1A2F] sm:text-[46px] lg:text-[52px]"
            >
              From content request to final delivery.
            </h1>

            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
              Collecting content shouldn't mean chasing emails, organizing
              scattered files, or wondering what's ready. Content Collector
              brings the entire process into one structured workspace.
            </p>
          </div>

          {/* WORKFLOW NAVIGATION */}

          <nav
            aria-label="Workflow steps"
            className="mx-auto mt-10 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3"
          >
            {workflow.map((step) => (
              <a
                key={step.number}
                href={step.href}
                className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-blue-600">
                    {step.number}
                  </span>

                  <span className="text-sm font-semibold text-slate-800">
                    {step.title}
                  </span>
                </div>

                <ChevronRight
                  size={17}
                  className="shrink-0 text-slate-400 transition-colors group-hover:text-blue-600"
                  aria-hidden="true"
                />
              </a>
            ))}
          </nav>
        </div>
      </section>

      {/* =================================================
          STEP 1 — PREPARE
      ================================================= */}

      <section
        id="prepare"
        aria-labelledby="prepare-title"
        className="scroll-mt-24 bg-white"
      >
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:gap-14 lg:px-10 lg:py-20">
          {/* CONTENT */}

          <div className="min-w-0">
            <div id="prepare-title">
              <StepHeading
                number="01"
                eyebrow="Prepare your request"
                title="Ask for the right content from the start."
                description="Build a clear content request for your website, web app, or mobile app project. Organize everything your client needs to provide before the work begins."
              />
            </div>

            <FeatureList items={requestFeatures} />
          </div>

          {/* PREVIEW */}

          <PreviewFrame title="Website content request">
            <div className="p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-slate-500">Project structure</p>

                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    Website project
                  </p>
                </div>

                <span className="rounded-md bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                  Draft
                </span>
              </div>

              <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3">
                <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-2">
                  {['Home', 'Services', 'About', 'Contact'].map(
                    (section, index) => (
                      <div
                        key={section}
                        className={`flex min-w-0 items-center gap-2 rounded-md px-2 py-2.5 ${
                          index === 0
                            ? 'bg-blue-100/70 text-blue-700'
                            : 'text-slate-600'
                        }`}
                      >
                        <FileText
                          size={14}
                          className="shrink-0"
                          aria-hidden="true"
                        />

                        <span className="truncate text-xs font-medium">
                          {section}
                        </span>
                      </div>
                    ),
                  )}
                </div>

                <div className="min-w-0 rounded-lg border border-slate-200 p-3">
                  <p className="text-sm font-semibold text-slate-900">Home</p>

                  <p className="mt-1 text-[11px] text-slate-500">
                    Requested content
                  </p>

                  <div className="mt-3 space-y-2">
                    {['Main headline', 'Short introduction', 'Hero image'].map(
                      (question) => (
                        <div
                          key={question}
                          className="flex min-w-0 items-center gap-2 rounded-md border border-slate-100 px-2 py-2.5"
                        >
                          <span
                            className="h-3 w-3 shrink-0 rounded-full border border-slate-300"
                            aria-hidden="true"
                          />

                          <span className="truncate text-xs text-slate-700">
                            {question}
                          </span>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2.5 text-xs text-blue-700">
                <LayoutTemplate
                  size={15}
                  className="shrink-0"
                  aria-hidden="true"
                />
                Organized sections and questions
              </div>
            </div>
          </PreviewFrame>
        </div>
      </section>

      {/* =================================================
          STEP 2 — COLLABORATE
      ================================================= */}

      <section
        id="collaborate"
        aria-labelledby="collaborate-title"
        className="scroll-mt-24 border-y border-slate-200 bg-[#F8FAFC]"
      >
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:gap-14 lg:px-10 lg:py-20">
          {/* PREVIEW */}

          <div className="order-2 min-w-0 lg:order-1">
            <PreviewFrame title="Content review">
              <div className="p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-slate-500">Home / Content</p>

                    <h3 className="mt-1 text-sm font-semibold text-slate-900">
                      Short introduction
                    </h3>
                  </div>

                  <span className="rounded-md bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                    Submitted
                  </span>
                </div>

                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    Client response
                  </p>

                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    We provide friendly, reliable services tailored to the needs
                    of our customers.
                  </p>
                </div>

                <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-100 bg-amber-50/70 p-3">
                  <MessageSquareText
                    size={17}
                    className="mt-0.5 shrink-0 text-amber-700"
                    aria-hidden="true"
                  />

                  <div>
                    <p className="text-xs font-semibold text-slate-900">
                      Example review feedback
                    </p>

                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      Could you add more detail about the services you provide?
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700">
                    <CheckCircle2 size={14} aria-hidden="true" />
                    Approve
                  </span>

                  <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700">
                    <MessageSquareText size={14} aria-hidden="true" />
                    Request changes
                  </span>
                </div>
              </div>
            </PreviewFrame>
          </div>

          {/* CONTENT */}

          <div className="order-1 min-w-0 lg:order-2">
            <div id="collaborate-title">
              <StepHeading
                number="02"
                eyebrow="Collect and review"
                title="Make collaboration easy for everyone."
                description="Give clients a private place to provide their content. Your team can review each submitted answer, leave feedback, and approve the content that's ready."
              />
            </div>

            <FeatureList items={collaborationFeatures} />
          </div>
        </div>
      </section>

      {/* =================================================
          STEP 3 — DELIVER
      ================================================= */}

      <section
        id="deliver"
        aria-labelledby="deliver-title"
        className="scroll-mt-24 bg-white"
      >
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:gap-14 lg:px-10 lg:py-20">
          {/* CONTENT */}

          <div className="min-w-0">
            <div id="deliver-title">
              <StepHeading
                number="03"
                eyebrow="Approve and deliver"
                title="Turn approved content into organized deliverables."
                description="When the content has been reviewed and approved, bring it together for the next stage of your project. No searching through scattered messages or outdated files."
              />
            </div>

            <FeatureList items={deliveryFeatures} />
          </div>

          {/* PREVIEW */}

          <PreviewFrame title="Approved project content">
            <div className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-500">Website project</p>

                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    Content ready for export
                  </p>
                </div>

                <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                  Approved
                </span>
              </div>

              <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
                {['Main headline', 'Short introduction', 'Contact details'].map(
                  (item, index) => (
                    <div
                      key={item}
                      className={`flex min-w-0 items-center gap-3 px-3 py-3.5 ${
                        index > 0 ? 'border-t border-slate-100' : ''
                      }`}
                    >
                      <CheckCircle2
                        size={17}
                        className="shrink-0 text-emerald-600"
                        aria-hidden="true"
                      />

                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800 sm:text-sm">
                        {item}
                      </span>

                      <span className="text-[11px] text-emerald-700">
                        Approved
                      </span>
                    </div>
                  ),
                )}
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-blue-600">
                    <Download size={17} aria-hidden="true" />
                  </span>

                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900">
                      Content export
                    </p>

                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Approved project revisions
                    </p>
                  </div>
                </div>

                <span className="shrink-0 rounded-md bg-white px-2.5 py-1.5 text-[11px] font-semibold text-blue-700">
                  Ready
                </span>
              </div>
            </div>
          </PreviewFrame>
        </div>
      </section>

      {/* =================================================
          WHO IT IS FOR
      ================================================= */}

      <section
        aria-labelledby="audience-heading"
        className="border-y border-slate-200 bg-[#F8FAFC]"
      >
        <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-16 lg:px-10">
          <div className="max-w-2xl">
            <h2
              id="audience-heading"
              className="text-[27px] font-bold tracking-tight text-[#0A1A2F] sm:text-[32px]"
            >
              One workflow. A better experience for both sides.
            </h2>

            <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
              Keep the process structured for your team while making it simple
              for clients to participate.
            </p>
          </div>

          <div className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* AGENCIES */}

            <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <UsersRound size={21} aria-hidden="true" />
              </span>

              <h3 className="mt-4 text-lg font-semibold text-[#0A1A2F]">
                For agencies and freelancers
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                Organize requests, collaborate with your team, track
                submissions, and keep review decisions connected to the right
                project.
              </p>
            </article>

            {/* CLIENTS */}

            <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <LockKeyhole size={21} aria-hidden="true" />
              </span>

              <h3 className="mt-4 text-lg font-semibold text-[#0A1A2F]">
                For your clients
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                Open a private project invitation, see what's needed, provide
                answers and files, and respond to feedback without navigating an
                entire agency workspace.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* =================================================
          FINAL CALL TO ACTION
      ================================================= */}

      <section className="bg-white">
        <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-16 lg:px-10">
          <div className="flex flex-col items-start justify-between gap-6 rounded-2xl border border-blue-100 bg-blue-50/70 p-6 sm:p-8 lg:flex-row lg:items-center">
            <div className="max-w-2xl">
              <div className="mb-3 flex items-center gap-2 text-blue-700">
                <ShieldCheck size={19} aria-hidden="true" />

                <span className="text-xs font-semibold uppercase tracking-wide">
                  A more organized workflow
                </span>
              </div>

              <h2 className="text-[24px] font-bold tracking-tight text-[#0A1A2F] sm:text-[28px]">
                Ready to simplify your content collection?
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                Bring content requests, submissions, feedback, and approvals
                into one organized process.
              </p>
            </div>

            <Link
              to={destination}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#2563EB] px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              {authenticated ? 'Open workspace' : 'Get started'}

              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
