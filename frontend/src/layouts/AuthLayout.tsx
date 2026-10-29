import { Brand } from '@/shared/components/Brand'
import { Link, Outlet, useLocation } from 'react-router'
export function AuthLayout() {
  const { pathname } = useLocation()
  const signup = pathname === '/sign-up'
  const story = signup
    ? {
        title: 'Welcome back!',
        description:
          'Your clients, content and projects are waiting. Sign in and pick up where you left off.',
        to: '/sign-in',
        action: 'Sign in',
      }
    : pathname === '/sign-in'
      ? {
          title: 'Hello, friend!',
          description:
            'Bring your team and your clients together. Create a workspace and make room for your next great project.',
          to: '/sign-up',
          action: 'Create account',
        }
      : {
          title: 'A fresh start.',
          description:
            'Keep your workspace secure and your projects moving. We’ll help you get back to your content.',
          to: '/sign-in',
          action: 'Back to sign in',
        }
  return (
    <div className="auth-layout auth-refresh">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="auth-main">
        <aside className="auth-story" aria-label="About Content Collector">
          <Brand />
          <div className="story-copy">
            <span className="auth-side-eyebrow">Content Collector</span>
            <h2>{story.title}</h2>
            <p>{story.description}</p>
            <Link className="auth-side-action" to={story.to}>
              {story.action}
            </Link>
          </div>
          <span className="auth-decoration auth-circle" aria-hidden="true" />
          <span className="auth-decoration auth-diamond" aria-hidden="true" />
        </aside>
        <main id="main-content" tabIndex={-1} className="auth-content">
          <Outlet />
          <nav className="auth-help-nav" aria-label="Help and navigation">
            <Link to="/about">Help</Link>
            <Link to="/">Home</Link>
          </nav>
        </main>
      </div>
      <footer className="auth-footer">
        <span>Content Collector by AYAANTRIX</span>
        <nav aria-label="Legal navigation">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </nav>
      </footer>
    </div>
  )
}
