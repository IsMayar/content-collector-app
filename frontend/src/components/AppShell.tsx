import { useEffect, useRef } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'

export function AppShell() {
  const { pathname } = useLocation()
  const main = useRef<HTMLElement>(null)
  const previousPath = useRef(pathname)

  useEffect(() => {
    if (previousPath.current !== pathname) {
      main.current?.focus()
      previousPath.current = pathname
    }
    document.title = `${pathname === '/' ? 'Welcome' : pathname === '/about' ? 'About' : 'Page not found'} | Website Content Collector`
  }, [pathname])

  return (
    <div className="min-h-screen">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="site-header">
        <div className="header-inner">
          <NavLink to="/" className="brand" aria-label="Website Content Collector home">
            <span className="brand-mark" aria-hidden="true">W</span>
            <span>Website Content Collector</span>
          </NavLink>
          <nav aria-label="Main navigation" className="flex flex-wrap gap-2">
            <NavLink to="/" end className="nav-link">Welcome</NavLink>
            <NavLink to="/about" className="nav-link">About</NavLink>
          </nav>
        </div>
      </header>
      <main id="main-content" ref={main} tabIndex={-1} className="page-container">
        <Outlet />
      </main>
      <footer className="page-container footer">AYAANTRIX Technologies · Website Content Collector</footer>
    </div>
  )
}
