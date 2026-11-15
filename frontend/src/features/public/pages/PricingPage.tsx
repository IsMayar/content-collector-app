import { ArrowRight, Check, ChevronDown, Info } from 'lucide-react'
import { Link } from 'react-router'
import { publicPlans } from '../publicPlans'

const sharedFeatures = [
  '50 GB private storage',
  'Unlimited active projects within resource limits',
  'Website, web app, and mobile app projects',
  'Approved ZIP, JSON, and Markdown exports',
]

const comparison = [
  { feature: 'Workspace seats', solo: '1', agency: '5' },
  { feature: 'Active projects', solo: 'Unlimited*', agency: 'Unlimited*' },
  { feature: 'Private storage', solo: '50 GB', agency: '50 GB' },
  { feature: 'AI drafts / month', solo: '100', agency: '300' },
  { feature: 'US SMS segments / month', solo: '25', agency: '100' },
]

const questions = [
  {
    title: 'What happens after the trial?',
    answer:
      'Select a plan to continue editing. Payment collection is a mock preview until production billing is integrated.',
  },
  {
    title: 'How do reminders work?',
    answer:
      'Email reminders only chase outstanding client action. Optional US SMS requires verified client consent. Message and data rates may apply.',
  },
  {
    title: 'What if a payment is late?',
    answer:
      'There is a 7-day grace period, followed by 30 days of read-only access. Owners can read and export approved content during read-only access.',
  },
]

export function PricingPage() {
  return (
    <div className="bg-[#F8FAFC]">
      <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16 lg:px-10">
        <header className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">
            Proposed pilot pricing
          </p>
          <h1 className="mt-3 text-[32px] font-bold leading-tight tracking-tight text-[#0A1A2F] sm:text-[38px]">
            Simple plans for your team.
          </h1>
          <p className="mt-3 text-[15px] leading-7 text-slate-600">
            Compare the proposed Solo and Agency plans. A 14-day trial is
            planned for the upcoming MVP.
          </p>
        </header>

        <div
          role="note"
          className="mx-auto mt-7 flex max-w-3xl items-start gap-2.5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-[13px] leading-5 text-blue-900"
        >
          <Info
            size={17}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-blue-700"
          />
          <span>
            These plans and prices are proposals. Billing is a preview until the
            production payment integration is ready.
          </span>
        </div>

        <div className="mx-auto mt-9 grid max-w-4xl gap-5 md:grid-cols-2">
          {publicPlans.map(([name, price, description, ...features]) => (
            <article
              key={name}
              className={`flex flex-col rounded-xl border bg-white p-6 shadow-sm sm:p-7 ${name === 'Agency' ? 'border-blue-300' : 'border-slate-200'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[19px] font-semibold text-slate-900">
                    {name}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">{description}</p>
                </div>
                {name === 'Agency' && (
                  <span className="shrink-0 rounded-md bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                    For teams
                  </span>
                )}
              </div>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-[38px] font-bold tracking-tight text-[#0A1A2F]">
                  ${price}
                </span>
                <span className="text-sm text-slate-500">
                  / month · proposed
                </span>
              </div>
              <div className="my-6 h-px bg-slate-100" />
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Planned inclusions
              </p>
              <ul className="mb-7 flex-1 space-y-3">
                {[...features, ...sharedFeatures].map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2.5 text-[13px] leading-5 text-slate-700"
                  >
                    <Check
                      size={16}
                      className="mt-0.5 shrink-0 text-emerald-600"
                      aria-hidden="true"
                    />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/sign-up"
                className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${name === 'Agency' ? 'bg-[#2563EB] text-white hover:bg-blue-700' : 'border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
              >
                Create account <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>

        <section
          aria-labelledby="compare-heading"
          className="mx-auto mt-14 max-w-4xl"
        >
          <h2
            id="compare-heading"
            className="text-[22px] font-bold tracking-tight text-[#0A1A2F]"
          >
            Compare plans
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            A quick look at the proposed limits.
          </p>
          <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[460px] border-collapse text-left text-[13px]">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th scope="col" className="px-5 py-4 font-semibold">
                    Feature
                  </th>
                  <th scope="col" className="px-5 py-4 font-semibold">
                    Solo
                  </th>
                  <th scope="col" className="px-5 py-4 font-semibold">
                    Agency
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparison.map(({ feature, solo, agency }) => (
                  <tr key={feature} className="border-t border-slate-100">
                    <th
                      scope="row"
                      className="px-5 py-3.5 font-medium text-slate-700"
                    >
                      {feature}
                    </th>
                    <td className="px-5 py-3.5 text-slate-600">{solo}</td>
                    <td className="px-5 py-3.5 text-slate-600">{agency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            * Within resource limits. All figures are proposed pilot pricing and
            allowances.
          </p>
        </section>

        <section
          aria-labelledby="pricing-faq-heading"
          className="mx-auto mt-14 max-w-4xl pb-2"
        >
          <h2
            id="pricing-faq-heading"
            className="text-[22px] font-bold tracking-tight text-[#0A1A2F]"
          >
            Frequently asked questions
          </h2>
          <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {questions.map(({ title, answer }, index) => (
              <details
                key={title}
                className={`group ${index > 0 ? 'border-t border-slate-200' : ''}`}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[14px] font-semibold text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600 [&::-webkit-details-marker]:hidden">
                  {title}
                  <ChevronDown
                    size={17}
                    aria-hidden="true"
                    className="shrink-0 text-slate-500 transition-transform group-open:rotate-180"
                  />
                </summary>
                <p className="px-5 pb-5 text-[13px] leading-6 text-slate-600">
                  {answer}
                </p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
