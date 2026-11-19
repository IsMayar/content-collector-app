import {
  Check,
  CheckCircle2,
  ChevronRight,
  FileText,
  Image,
  Users,
} from 'lucide-react'

const previewQuestions = [
  {
    label: 'Main headline',
    Icon: CheckCircle2,
    done: true,
  },
  {
    label: 'Short introduction',
    Icon: CheckCircle2,
    done: true,
  },
  {
    label: 'Hero photo',
    Icon: Image,
    done: false,
  },
  {
    label: 'Contact details',
    Icon: FileText,
    done: false,
  },
]

const benefits = [
  'Simple client checklists',
  'Private project access',
  'Review and export',
]

export function LandingPage() {
  return (
    <div className="min-w-0 bg-white">
      <section
        aria-labelledby="landing-hero-title"
        className="relative isolate overflow-hidden bg-gradient-to-br from-white via-white to-blue-50/80"
      >
        {/* Decorative backgrounds */}

        <div
          className="pointer-events-none absolute -right-40 top-12 -z-10 h-[440px] w-[440px] rounded-full bg-blue-100/40 blur-3xl"
          aria-hidden="true"
        />

        <div
          className="pointer-events-none absolute -bottom-48 -left-44 -z-10 h-[360px] w-[480px] rounded-full bg-sky-100/50 blur-3xl"
          aria-hidden="true"
        />

        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-10 px-5 py-14 sm:px-8 sm:py-16 lg:grid-cols-2 lg:gap-12 lg:px-10 lg:py-20 xl:gap-16">
          {/* HERO CONTENT */}

          <div className="min-w-0">
            <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-700 sm:text-sm">
              <Users size={16} className="shrink-0" aria-hidden="true" />

              <span>For agencies, teams, and freelancers</span>
            </div>

            <h1
              id="landing-hero-title"
              className="mt-7 max-w-[650px] text-[38px] font-bold leading-[1.12] tracking-[-0.04em] text-[#0A1A2F] sm:text-[48px] lg:text-[52px] xl:text-[58px]"
            >
              Get client content without the back-and-forth.
            </h1>

            <p className="mt-6 max-w-[570px] text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
              Request, collect, review, and export the content you need for
              websites, web apps, and mobile apps—all in one place.
            </p>

            <ul className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
              {benefits.map((benefit) => (
                <li
                  key={benefit}
                  className="flex items-center gap-2 text-sm text-slate-700"
                >
                  <Check
                    size={17}
                    strokeWidth={2.5}
                    className="shrink-0 text-emerald-600"
                    aria-hidden="true"
                  />

                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* ILLUSTRATIVE PROJECT PREVIEW */}

          <div
            aria-label="Illustrative project content preview"
            className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_-25px_rgba(15,23,42,0.25)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-5 py-5 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Example project
                </p>

                <h2 className="mt-1 text-base font-semibold text-[#0A1A2F]">
                  Website content
                </h2>
              </div>

              <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                In progress
              </span>
            </div>

            <div className="p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-[#0A1A2F]">Home</h3>

                <span className="text-xs font-medium text-slate-500 sm:text-sm">
                  2 of 4 submitted
                </span>
              </div>

              <div
                className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                aria-label="Example project submission progress"
                aria-valuemin={0}
                aria-valuemax={4}
                aria-valuenow={2}
              >
                <div className="h-full w-1/2 rounded-full bg-blue-600" />
              </div>

              <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
                {previewQuestions.map(({ label, Icon, done }, index) => (
                  <div
                    key={label}
                    className={`flex min-w-0 items-center gap-3 px-4 py-4 ${
                      index > 0 ? 'border-t border-slate-100' : ''
                    }`}
                  >
                    <Icon
                      size={19}
                      className={`shrink-0 ${
                        done ? 'text-emerald-600' : 'text-slate-400'
                      }`}
                      aria-hidden="true"
                    />

                    <span className="min-w-0 flex-1 text-sm font-medium leading-5 text-slate-800">
                      {label}
                    </span>

                    <span
                      className={`shrink-0 text-xs font-medium sm:text-sm ${
                        done ? 'text-emerald-700' : 'text-slate-500'
                      }`}
                    >
                      {done ? 'Submitted' : 'To do'}
                    </span>

                    <ChevronRight
                      size={16}
                      className="shrink-0 text-slate-400"
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
    </div>
  )
}
