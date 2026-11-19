import { useEffect, useRef, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { Brand } from '@/shared/components/Brand'
import { useAppSelector } from '@/shared/hooks/useAppStore'
import { Link, NavLink, Outlet, useLocation } from 'react-router'

const navigation = [
  { label: 'Product', to: '/' },
  { label: 'How it works', to: '/how-it-works' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'Help', to: '/about' },
] as const

const desktopNavClass = ({ isActive }: { isActive: boolean }) =>
  `inline-flex min-h-10 items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
    isActive
      ? 'text-blue-700'
      : 'text-slate-600 hover:bg-slate-100 hover:text-[#0A1A2F]'
  }`

const mobileNavClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 items-center rounded-lg px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
    isActive
      ? 'bg-blue-50 text-blue-700'
      : 'text-slate-700 hover:bg-slate-50 hover:text-blue-700'
  }`

export function PublicLayout() {
  const authenticated = useAppSelector(
    (state) => state.auth.status === 'authenticated',
  )

  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!menuOpen) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        menuButtonRef.current?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  const workspaceDestination = authenticated ? '/app' : '/sign-up'

  const workspaceLabel = authenticated ? 'Open workspace' : 'Get started'

  return (
    <div className="flex min-h-dvh flex-col bg-[#F8FAFC] text-[#0A1A2F]">
      {/* SKIP LINK */}

      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-[60] rounded-lg bg-white px-4 py-2 text-sm font-semibold text-blue-700 shadow-lg focus:not-sr-only focus:outline-2 focus:outline-blue-600"
      >
        Skip to content
      </a>

      {/* STICKY NAVBAR */}

      <header className="sticky top-0 z-50 w-full shrink-0 border-b border-slate-200/80 bg-white/95 shadow-[0_1px_3px_rgba(15,23,42,0.04)] backdrop-blur-md">
        <div className="mx-auto grid h-16 w-full max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 sm:h-[72px] sm:px-8 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:px-10">
          {/* BRAND */}

          <div className="flex min-w-0 items-center">
            <Brand />
          </div>

          {/* DESKTOP NAVIGATION */}

          <nav
            aria-label="Main navigation"
            className="hidden items-center justify-center gap-1 lg:flex"
          >
            {navigation.map(({ label, to }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={desktopNavClass}
              >
                {label}
              </NavLink>
            ))}
          </nav>

          {/* DESKTOP ACTIONS */}

          <div className="hidden items-center justify-end gap-2 lg:flex">
            {!authenticated && (
              <Link
                to="/sign-in"
                className="inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                Sign in
              </Link>
            )}

            <Link
              to={workspaceDestination}
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[#2563EB] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              {workspaceLabel}
            </Link>
          </div>

          {/* MOBILE MENU BUTTON */}

          <button
            ref={menuButtonRef}
            type="button"
            aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={menuOpen}
            aria-controls="public-mobile-menu"
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex h-10 w-10 items-center justify-center justify-self-end rounded-lg border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 lg:hidden"
          >
            {menuOpen ? (
              <X size={20} aria-hidden="true" />
            ) : (
              <Menu size={20} aria-hidden="true" />
            )}
          </button>
        </div>

        {/* MOBILE NAVIGATION */}

        {menuOpen && (
          <nav
            id="public-mobile-menu"
            aria-label="Mobile navigation"
            className="absolute inset-x-0 top-full max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-slate-200 bg-white shadow-lg lg:hidden"
          >
            <div className="mx-auto w-full max-w-7xl px-5 pb-5 pt-3 sm:px-8">
              <div className="flex flex-col gap-1">
                {navigation.map(({ label, to }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/'}
                    onClick={() => setMenuOpen(false)}
                    className={mobileNavClass}
                  >
                    {label}
                  </NavLink>
                ))}
              </div>

              <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row">
                {!authenticated && (
                  <Link
                    to="/sign-in"
                    onClick={() => setMenuOpen(false)}
                    className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Sign in
                  </Link>
                )}

                <Link
                  to={workspaceDestination}
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-[#2563EB] px-4 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  {workspaceLabel}
                </Link>
              </div>
            </div>
          </nav>
        )}
      </header>

      {/* MAIN CONTENT */}

      <main
        id="main-content"
        tabIndex={-1}
        className="w-full min-w-0 flex-1 outline-none"
      >
        <Outlet />
      </main>

      {/* FOOTER */}

      <footer className="shrink-0 border-t border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-4 px-5 py-6 sm:px-8 md:flex-row lg:px-10">
          <p className="text-center text-xs leading-5 text-slate-500 md:text-left">
            © {new Date().getFullYear()} AYAANTRIX Technologies · Content
            Collector
          </p>

          <nav
            aria-label="Legal navigation"
            className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2"
          >
            <Link
              to="/privacy"
              className="text-xs font-medium text-slate-600 hover:text-blue-700 hover:underline"
            >
              Privacy
            </Link>

            <Link
              to="/terms"
              className="text-xs font-medium text-slate-600 hover:text-blue-700 hover:underline"
            >
              Terms
            </Link>

            <Link
              to="/about"
              className="text-xs font-medium text-slate-600 hover:text-blue-700 hover:underline"
            >
              Help
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
