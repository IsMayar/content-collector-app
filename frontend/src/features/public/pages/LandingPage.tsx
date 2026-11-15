import { useAppSelector } from '@/shared/hooks/useAppStore'
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Download,
  FileText,
  Image,
  Send,
  Users,
} from 'lucide-react'
import { Link } from 'react-router'
import { publicPlans } from '../publicPlans'

const steps = [
  {
    Icon: Send,
    title: 'Request',
    description: 'Create a project, choose a template, and invite your client.',
  },
  {
    Icon: ClipboardCheck,
    title: 'Review',
    description:
      'Receive answers and files, then approve content or request changes.',
  },
  {
    Icon: Download,
    title: 'Export',
    description: 'Download organized, approved content for your next stage.',
  },
]

const previewQuestions = [
  { label: 'Main headline', Icon: CheckCircle2, done: true },
  { label: 'Short introduction', Icon: CheckCircle2, done: true },
  { label: 'Hero photo', Icon: Image, done: false },
  { label: 'Contact details', Icon: FileText, done: false },
]

export function LandingPage() {
  const authenticated = useAppSelector(
    (state) => state.auth.status === 'authenticated',
  )

  return (
    <>
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1fr_1.04fr] lg:gap-16 lg:px-10 lg:py-24">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
              <Users size={15} aria-hidden="true" /> For agencies, teams, and
              freelancers
            </p>
            <h1 className="max-w-xl text-[36px] font-bold leading-[1.12] tracking-[-0.035em] text-[#0A1A2F] sm:text-[44px] lg:text-[48px]">
              Get client content without the back-and-forth.
            </h1>
            <p className="mt-5 max-w-lg text-[16px] leading-7 text-slate-600">
              Request, collect, review, and export the content you need for
              websites, web apps, and mobile apps—all in one place.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to={authenticated ? '/app' : '/sign-up'}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#2563EB] px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                {authenticated ? 'Open workspace' : 'Get started'}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                How it works
              </a>
            </div>
            <ul className="mt-7 flex flex-col gap-2.5 text-[13px] text-slate-600 sm:flex-row sm:flex-wrap sm:gap-x-6">
              {[
                'Simple client checklists',
                'Private project access',
                'Review and export',
              ].map((benefit) => (
                <li key={benefit} className="flex items-center gap-2">
                  <Check
                    size={15}
                    className="text-emerald-600"
                    aria-hidden="true"
                  />
                  {benefit}
                </li>
              ))}
            </ul>
          </div>

          {/* A clearly illustrative, non-interactive example of the client checklist. */}
          <div
            aria-label="Illustrative project content preview"
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_16px_52px_-28px_rgba(15,23,42,0.34)]"
          >
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Example project
                </p>
                <p className="mt-1 text-[15px] font-semibold text-slate-900">
                  Website content
                </p>
              </div>
              <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                In progress
              </span>
            </div>
            <div className="p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <span className="font-semibold text-slate-800">Home</span>
                <span className="text-slate-500">2 of 4 submitted</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full w-1/2 rounded-full bg-blue-600" />
              </div>
              <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
                {previewQuestions.map(({ label, Icon, done }, index) => (
                  <div
                    key={label}
                    className={`flex items-center gap-3 px-4 py-3.5 ${index > 0 ? 'border-t border-slate-100' : ''}`}
                  >
                    <Icon
                      size={18}
                      className={done ? 'text-emerald-600' : 'text-slate-400'}
                      aria-hidden="true"
                    />
                    <span className="flex-1 text-[13px] font-medium text-slate-800">
                      {label}
                    </span>
                    <span
                      className={`text-xs ${done ? 'text-emerald-700' : 'text-slate-500'}`}
                    >
                      {done ? 'Submitted' : 'To do'}
                    </span>
                    <ChevronRight
                      size={15}
                      className="text-slate-400"
                      aria-hidden="true"
                    />
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-slate-400">
                Illustrative product preview
              </p>
            </div>
          </div>
        </div>
      </section>

      <section
        id="how-it-works"
        aria-labelledby="how-it-works-title"
        className="scroll-mt-24 bg-[#F8FAFC]"
      >
        <div className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 lg:px-10 lg:py-20">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">
              A simpler workflow
            </p>
            <h2
              id="how-it-works-title"
              className="mt-2 text-[27px] font-bold tracking-tight text-[#0A1A2F] sm:text-[30px]"
            >
              How it works
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              From request to delivery in three straightforward steps.
            </p>
          </div>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {steps.map(({ Icon, title, description }, index) => (
              <li
                key={title}
                className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="mb-5 flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <span className="text-xs font-semibold text-slate-400">
                    0{index + 1}
                  </span>
                </div>
                <h3 className="text-[16px] font-semibold text-slate-900">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {description}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        aria-labelledby="marketing-pricing-title"
        className="border-t border-slate-200 bg-white"
      >
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-14 lg:px-10 lg:py-20">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">
              Proposed pilot pricing
            </p>
            <h2
              id="marketing-pricing-title"
              className="mt-2 text-[27px] font-bold tracking-tight text-[#0A1A2F] sm:text-[30px]"
            >
              Plans for individuals and teams.
            </h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-slate-600">
              A 14-day trial is planned. Pricing and billing are previews until
              production billing is available.
            </p>
            <Link
              to="/pricing"
              className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline"
            >
              View plan details <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {publicPlans.map(([name, price, description]) => (
              <article
                key={name}
                className={`rounded-xl border bg-white p-5 ${name === 'Agency' ? 'border-blue-200 shadow-md' : 'border-slate-200 shadow-sm'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[16px] font-semibold text-slate-900">
                    {name}
                  </h3>
                  {name === 'Agency' && (
                    <span className="rounded-md bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700">
                      For teams
                    </span>
                  )}
                </div>
                <p className="mt-2 min-h-10 text-[13px] leading-5 text-slate-600">
                  {description}
                </p>
                <p className="mt-4 text-[30px] font-bold tracking-tight text-slate-900">
                  ${price}
                  <span className="ml-1 text-[13px] font-normal text-slate-500">
                    / month
                  </span>
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
