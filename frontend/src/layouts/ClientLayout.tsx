import { LockKeyhole } from 'lucide-react'
import { Brand } from '@/shared/components/Brand'
import { Outlet } from 'react-router'

export function ClientLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-[#F8FAFC] text-[#0A1A2F]">
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-[60] rounded-lg bg-white px-4 py-2 text-sm font-semibold text-blue-700 shadow-lg focus:not-sr-only"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 shrink-0 border-b border-slate-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex min-h-[72px] w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Brand />
          <span className="hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 sm:inline-flex">
            <LockKeyhole size={14} aria-hidden="true" />
            Private project access
          </span>
        </div>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-7xl min-w-0 flex-1 flex-col px-4 py-7 outline-none sm:px-6 sm:py-10 lg:px-8"
      >
        <Outlet />
      </main>

      <footer className="shrink-0 border-t border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-center px-4 py-4 text-center text-xs text-slate-500 sm:px-6 lg:px-8">
          <LockKeyhole size={13} className="mr-2 shrink-0" aria-hidden="true" />
          A private space for your project's content and files.
        </div>
      </footer>
    </div>
  )
}
