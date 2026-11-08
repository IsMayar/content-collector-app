import { Brand } from '@/shared/components/Brand'
import { useAppSelector } from '@/shared/hooks/useAppStore'
import { Link, matchPath, NavLink, Outlet, useLocation } from 'react-router'

export function PublicLayout() {
  const authenticated = useAppSelector((s) => s.auth.status === 'authenticated')
  const { pathname } = useLocation()
  const legal = Boolean(
    matchPath('/privacy', pathname) || matchPath('/terms', pathname),
  )
  const landing = pathname === '/'
  const accountLink = (
    <Link
      className="secondary-button public-sign-in"
      to={authenticated && !legal ? '/app' : '/sign-in'}
    >
      {authenticated && !legal ? 'Open workspace' : 'Sign in'}
    </Link>
  )

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header
        className={
          landing || legal ? 'site-header editorial-header' : 'site-header'
        }
      >
        <div className="header-inner">
          <Brand />
          {landing ? (
            <>
              <nav aria-label="Main navigation" className="public-nav">
                <NavLink to="/" end>
                  Product
                </NavLink>
                <NavLink to="/pricing">Pricing</NavLink>
                <NavLink to="/about">Help</NavLink>
              </nav>
              <div className="public-header-actions">
                {accountLink}
                <Link
                  className="primary-button"
                  to={authenticated ? '/app' : '/sign-up'}
                >
                  Get started
                </Link>
              </div>
            </>
          ) : (
            <nav aria-label="Main navigation" className="public-nav">
              {legal ? (
                <Link to="/">Home</Link>
              ) : (
                <>
                  <Link to="/">Product</Link>
                  <NavLink to="/about">How it works</NavLink>
                  <NavLink to="/pricing">Pricing</NavLink>
                </>
              )}
              {accountLink}
            </nav>
          )}
        </div>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className={
          landing ? 'marketing-home' : legal ? 'legal-main' : 'page-container'
        }
      >
        <Outlet />
      </main>
      <footer
        className={
          landing || legal
            ? 'page-container footer editorial-footer'
            : 'page-container footer'
        }
      >
        <span>
          {landing
            ? '© 2026 AYAANTRIX Technologies'
            : '© 2026 Content Collector by AYAANTRIX'}
        </span>
        <nav aria-label="Legal navigation">
          <NavLink to="/privacy">Privacy</NavLink>
          <NavLink to="/terms">Terms</NavLink>
          <Link to="/about">Help</Link>
        </nav>
      </footer>
    </>
  )
}
