import { Brand } from '@/shared/components/Brand'
import { Link, Outlet, useLocation } from 'react-router'

const signInStory = {
  title: 'Bring it together.',
  description: 'Your projects, clients, and content in one place.',
}

const stories = new Map([
  [
    '/sign-up',
    {
      title: 'Start with clarity.',
      description:
        'Create your workspace and simplify client content collection.',
    },
  ],
  [
    '/forgot-password',
    {
      title: 'Get back to work.',
      description:
        'Recover your account securely and continue where you left off.',
    },
  ],
  [
    '/verify-email',
    {
      title: 'One more step.',
      description: 'Verify your email to activate your account.',
    },
  ],
  [
    '/reset-password',
    {
      title: 'Set a new password.',
      description: 'Secure your account and continue your work.',
    },
  ],
  [
    '/team-invite',
    {
      title: 'Work together.',
      description:
        'Join your team to collect and review client content in one place.',
    },
  ],
])

export function AuthLayout() {
  const { pathname } = useLocation()
  const story =
    stories.get(pathname.toLowerCase().replace(/\/$/, '')) ?? signInStory
  return (
    <div className="auth-layout auth-refresh">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="auth-main">
        <aside className="auth-story" aria-label="About Content Collector">
          <Brand />
          <div className="story-copy">
            <h2>{story.title}</h2>
            <p>{story.description}</p>
          </div>
        </aside>
        <main id="main-content" tabIndex={-1} className="auth-content">
          <div className="auth-form-region">
            <Outlet />
          </div>
          <footer className="auth-footer">
            <nav aria-label="Help and navigation">
              <Link to="/about">Help</Link>
              <Link to="/">Home</Link>
            </nav>
            <nav aria-label="Legal navigation">
              <Link to="/privacy">Privacy Policy</Link>
              <Link to="/terms">Terms of Service</Link>
            </nav>
          </footer>
        </main>
      </div>
    </div>
  )
}
