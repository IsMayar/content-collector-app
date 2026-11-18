import { Button } from '@heroui/react'
import { ArrowLeft, FileQuestion } from 'lucide-react'
import { Link, useNavigate } from 'react-router'

export function WelcomePage() {
  const navigate = useNavigate()
  return (
    <section aria-labelledby="welcome-title" className="welcome-panel">
      <p className="eyebrow">A clearer start to every project</p>
      <h1 id="welcome-title">Great projects start with the right content.</h1>
      <p className="intro">
        One place for agencies and their clients to gather the words,
        requirements and files that bring a project to life.
      </p>
      <div className="mt-8">
        <Button onPress={() => navigate('/sign-in')}>
          Open your workspace
        </Button>
      </div>
      <div className="project-types" aria-label="Supported project types">
        <span>Websites</span>
        <span>Web applications</span>
        <span>Mobile applications</span>
      </div>
      <aside className="placeholder-note" aria-label="Application availability">
        <h2>Your workspace is taking shape</h2>
        <p>
          Sign in to explore the workspace foundation. Client invitations,
          content collection and review will arrive in later stages.
        </p>
      </aside>
    </section>
  )
}
export function AboutPage() {
  return (
    <section className="welcome-panel" aria-labelledby="about-title">
      <p className="eyebrow">Built for a better handoff</p>
      <h1 id="about-title">Content, gathered with care.</h1>
      <p className="intro">
        Website Content Collector is being built for freelancers and small
        development agencies working on websites, web applications and mobile
        applications.
      </p>
      <p className="mt-6 max-w-2xl">
        Bring client drafts, files and feedback together in a clear collection
        checklist. Review exact submissions, approve the details and prepare a
        thoughtful final handoff.
      </p>
      <Link className="text-link mt-8 inline-block" to="/">
        Back to welcome
      </Link>
    </section>
  )
}
export function NotFoundPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl items-center justify-center px-5 py-14 sm:px-8 sm:py-20">
      <section
        aria-labelledby="not-found-title"
        className="w-full rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm sm:p-12"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <FileQuestion size={27} aria-hidden="true" />
        </div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-blue-700">
          Page unavailable
        </p>
        <h1 id="not-found-title" className="mt-2 text-[28px] font-bold tracking-tight text-[#0A1A2F] sm:text-[34px]">
          Page not found
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">
          This address doesn't match an available page. Check the link or return
          to the homepage.
        </p>
        <Link
          to="/"
          className="mt-7 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#2563EB] px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to homepage
        </Link>
      </section>
    </div>
  )
}
