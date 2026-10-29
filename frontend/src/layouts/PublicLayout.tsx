import { Brand } from '@/shared/components/Brand'
import { useAppSelector } from '@/shared/hooks/useAppStore'
import { Link, NavLink, Outlet } from 'react-router'
export function PublicLayout() {
  const authenticated = useAppSelector((s) => s.auth.status === 'authenticated')
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Brand />
          <nav aria-label="Main navigation" className="public-nav">
            <Link to="/">Product</Link>
            <NavLink to="/about">How it works</NavLink>
            <NavLink to="/pricing">Pricing</NavLink>
            <Link
              className="secondary-button public-sign-in"
              to={authenticated ? '/app' : '/sign-in'}
            >
              {authenticated ? 'Open workspace' : 'Sign in'}
            </Link>
          </nav>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="page-container">
        <Outlet />
      </main>
      <footer className="page-container footer">
        © 2026 Content Collector by AYAANTRIX{' '}
        <nav aria-label="Legal navigation">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/about">Help</Link>
        </nav>
      </footer>
    </>
  )
}
