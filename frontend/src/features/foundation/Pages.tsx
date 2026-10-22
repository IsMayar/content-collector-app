import { Button } from '@heroui/react'
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
        The planned workflow brings client drafts, files and feedback together,
        with review before the final handoff. These capabilities are still in
        development.
      </p>
      <Link className="text-link mt-8 inline-block" to="/">
        Back to welcome
      </Link>
    </section>
  )
}

export function NotFoundPage() {
  return (
    <section className="welcome-panel">
      <h1>Page not found</h1>
      <p className="intro">This address does not have a page.</p>
      <Link className="text-link mt-8 inline-block" to="/">
        Back to welcome
      </Link>
    </section>
  )
}
