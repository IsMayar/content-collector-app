import { Brand } from '@/shared/components/Brand'
import { Link, Outlet, useLocation } from 'react-router'

type Story = { title: string; description: string }

const defaultStory: Story = {
  title: 'Bring it together.',
  description: 'Your projects, clients, and content in one place.',
}

const stories: Record<string, Story> = {
  '/sign-up': {
    title: 'Start with clarity.',
    description:
      'Create your workspace and simplify client content collection.',
  },
  '/forgot-password': {
    title: 'Get back to work.',
    description:
      'Recover your account securely and continue where you left off.',
  },
  '/verify-email': {
    title: 'One more step.',
    description: 'Verify your email to activate your account.',
  },
  '/reset-password': {
    title: 'A fresh start.',
    description: 'Set a new password and return to your projects.',
  },
  '/team-invite': {
    title: 'Work together.',
    description: 'Join your team and keep client content in one place.',
  },
}

export function AuthLayout() {
  const { pathname } = useLocation()
  const path = pathname.toLowerCase().replace(/\/+$/, '') || '/'
  const story = stories[path] ?? defaultStory

  return (
    <div className="min-h-dvh bg-[#F8FAFC] text-[#0A1A2F]">
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-50 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-blue-700 shadow-lg focus:not-sr-only"
      >
        Skip to content
      </a>

      <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-5">
        <aside
          aria-label="About Content Collector"
          className="relative hidden min-h-dvh flex-col overflow-hidden bg-gradient-to-br from-[#0A1A2F] via-[#173B76] to-[#2563EB] px-10 py-10 text-white lg:col-span-3 lg:flex xl:px-14"
        >
          <div className="shrink-0 [&_a]:text-white! [&_p]:text-white! [&_span]:text-white! [&_strong]:text-white!">
            <Brand />
          </div>

          <div className="flex flex-1 items-center">
            <div className="max-w-xl">
              <h2 className="m-0 text-[36px]! leading-[1.13]! font-bold! tracking-[-0.025em] text-white! xl:text-[40px]!">
                {story.title}
              </h2>
              <p className="mt-3 max-w-[450px] text-[16px]! leading-7 text-blue-50!">
                {story.description}
              </p>
            </div>
          </div>
        </aside>

        <div className="flex min-h-dvh min-w-0 flex-col bg-[#F8FAFC] lg:col-span-2">
          <header className="border-b border-slate-200 bg-[#0A1A2F] px-5 py-4 text-white lg:hidden [&_a]:text-white! [&_p]:text-white! [&_span]:text-white! [&_strong]:text-white!">
            <Brand />
          </header>

          <main
            id="main-content"
            tabIndex={-1}
            className="flex w-full flex-1 items-center justify-center px-5 py-7 sm:px-8 lg:px-8 lg:py-9 xl:px-12"
          >
            <div className="w-full max-w-[400px]">
              <Outlet />
            </div>
          </main>

          <footer className="w-full px-5 pb-5 pt-2 sm:px-8 lg:px-8 xl:px-12">
            <nav
              aria-label="Help and legal navigation"
              className="mx-auto flex max-w-[400px] flex-wrap items-center justify-center gap-x-4 gap-y-2 text-center text-[12px] leading-5"
            >
              <Link
                to="/about"
                className="text-slate-500 hover:text-blue-700 hover:underline"
              >
                Help
              </Link>
              <Link
                to="/"
                className="text-slate-500 hover:text-blue-700 hover:underline"
              >
                Home
              </Link>
              <Link
                to="/privacy"
                className="text-slate-500 hover:text-blue-700 hover:underline"
              >
                Privacy Policy
              </Link>
              <Link
                to="/terms"
                className="text-slate-500 hover:text-blue-700 hover:underline"
              >
                Terms of Service
              </Link>
            </nav>
          </footer>
        </div>
      </div>
    </div>
  )
}
