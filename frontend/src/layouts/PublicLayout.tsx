import { useEffect, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { Brand } from '@/shared/components/Brand'
import { useAppSelector } from '@/shared/hooks/useAppStore'
import { Link, NavLink, Outlet, useLocation } from 'react-router'

const navigation = [
  { label: 'Product', to: '/' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'Help', to: '/about' },
] as const

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-[14px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
    isActive
      ? 'text-blue-700'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`

export function PublicLayout() {
  const authenticated = useAppSelector(
    (state) => state.auth.status === 'authenticated',
  )
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  const workspaceDestination = authenticated ? '/app' : '/sign-up'

  return (
    <div className="flex min-h-dvh flex-col bg-[#F8FAFC] text-[#0A1A2F]">
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-50 rounded-md bg-white px-4 py-2 text-sm font-semibold text-blue-700 shadow-md focus:not-sr-only"
      >
        Skip to content
      </a>

      <header className="relative z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-[72px] w-full max-w-7xl items-center justify-between gap-5 px-5 sm:px-8 lg:px-10">
          <div className="min-w-0 shrink-0">
            <Brand />
          </div>

          <nav
            aria-label="Main navigation"
            className="hidden items-center gap-1 md:flex"
          >
            {navigation.map(({ label, to }) => (
              <NavLink
                key={to}
                end={to === '/'}
                to={to}
                className={navLinkClass}
              >
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            {!authenticated && (
              <Link
                to="/sign-in"
                className="inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-[14px] font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                Sign in
              </Link>
            )}
            <Link
              to={workspaceDestination}
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[#2563EB] px-4 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              {authenticated ? 'Open workspace' : 'Get started'}
            </Link>
          </div>

          <button
            type="button"
            aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={menuOpen}
            aria-controls="public-mobile-menu"
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 md:hidden"
          >
            {menuOpen ? (
              <X size={20} aria-hidden="true" />
            ) : (
              <Menu size={20} aria-hidden="true" />
            )}
          </button>
        </div>

        {menuOpen && (
          <nav
            id="public-mobile-menu"
            aria-label="Mobile navigation"
            className="border-t border-slate-200 bg-white px-5 pb-5 pt-3 shadow-sm md:hidden"
          >
            <div className="mx-auto flex max-w-7xl flex-col gap-1">
              {navigation.map(({ label, to }) => (
                <NavLink
                  key={to}
                  end={to === '/'}
                  to={to}
                  onClick={() => setMenuOpen(false)}
                  className={navLinkClass}
                >
                  {label}
                </NavLink>
              ))}
              <div className="mt-3 flex gap-2 border-t border-slate-100 pt-4">
                {!authenticated && (
                  <Link
                    to="/sign-in"
                    onClick={() => setMenuOpen(false)}
                    className="flex min-h-10 flex-1 items-center justify-center rounded-lg border border-slate-300 text-sm font-semibold text-slate-700"
                  >
                    Sign in
                  </Link>
                )}
                <Link
                  to={workspaceDestination}
                  onClick={() => setMenuOpen(false)}
                  className="flex min-h-10 flex-1 items-center justify-center rounded-lg bg-[#2563EB] px-4 text-sm font-semibold text-white"
                >
                  {authenticated ? 'Open workspace' : 'Get started'}
                </Link>
              </div>
            </div>
          </nav>
        )}
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="w-full flex-1 outline-none"
      >
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-3 px-5 py-6 sm:px-8 md:flex-row lg:px-10">
          <p className="text-center text-xs text-slate-500 md:text-left">
            © {new Date().getFullYear()} AYAANTRIX Technologies · Content
            Collector
          </p>
          <nav
            aria-label="Legal navigation"
            className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs"
          >
            <Link
              to="/privacy"
              className="text-slate-600 hover:text-blue-700 hover:underline"
            >
              Privacy
            </Link>
            <Link
              to="/terms"
              className="text-slate-600 hover:text-blue-700 hover:underline"
            >
              Terms
            </Link>
            <Link
              to="/about"
              className="text-slate-600 hover:text-blue-700 hover:underline"
            >
              Help
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
