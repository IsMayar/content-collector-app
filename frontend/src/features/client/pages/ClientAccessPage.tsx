import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { ArrowRight, FolderOpen, LockKeyhole, Mail } from 'lucide-react'

import { pendingDrafts, clearPendingDrafts } from '../hooks/draftAutosave'
import { clientAccessEstablished } from '@/features/client/store/clientAccessSlice'
import { clientApi } from '@/services/api/clientApi'
import { useAppDispatch } from '@/shared/hooks/useAppStore'
import { useCommand } from '@/shared/hooks/useCommand'

export function ClientAccessPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const command = useCommand(true)

  const [token, setToken] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get('token') || '',
  )

  const [openPreferences, setOpenPreferences] = useState(
    () =>
      new URLSearchParams(window.location.hash.slice(1)).get('preferences') ===
      '1',
  )

  const [showRequestForm, setShowRequestForm] = useState(false)
  const [message, setMessage] = useState('')

  const projectId = new URLSearchParams(location.search).get('projectId') || ''

  const hasInvitation = Boolean(token)
  const requestMode = !hasInvitation || showRequestForm

  // Read incoming invitation fragments and remove them
  // from browser history without consuming the token.
  useEffect(() => {
    if (!location.hash) return

    const params = new URLSearchParams(location.hash.slice(1))
    const nextToken = params.get('token') || ''

    setToken(nextToken)
    setShowRequestForm(false)
    setMessage('')

    if (params.get('preferences') === '1') {
      setOpenPreferences(true)
    }

    navigate(
      {
        pathname: location.pathname,
        search: location.search,
        hash: '',
      },
      { replace: true },
    )
  }, [location.hash, location.pathname, location.search, navigate])

  async function openProject() {
    if (!token || command.pending) return

    const hasUnsavedDrafts = [...pendingDrafts.values()].some(
      (draft) => draft.state.dirty,
    )

    if (
      hasUnsavedDrafts &&
      !window.confirm(
        'You have unsaved answers in this tab. Copy them before opening a new session. Continue and discard those local changes?',
      )
    ) {
      return
    }

    const result = await command.run<{ projectId: string }>(
      'client-access/exchange',
      { token },
    )

    if (!result) return

    clearPendingDrafts()
    setToken('')

    dispatch(clientApi.util.resetApiState())
    dispatch(clientAccessEstablished())

    navigate(
      `/client/projects/${result.projectId}${
        openPreferences ? '?preferences=1' : ''
      }`,
      { replace: true },
    )
  }

  async function requestFreshLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (command.pending) return

    setMessage('')

    const values = Object.fromEntries(new FormData(event.currentTarget))

    const result = await command.run<{ message: string }>(
      'client-access/request-link',
      values,
    )

    if (result) {
      setMessage(result.message)
      setShowRequestForm(false)
    }
  }

  return (
    <main className="w-full bg-[#F8FAFC] px-4 py-6 sm:py-10">
      <section
        aria-labelledby="client-access-heading"
        className="mx-auto w-full max-w-[420px] rounded-xl border border-slate-200 bg-white px-5 py-6 shadow-sm sm:px-7 sm:py-7"
      >
        {/* Icon */}
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          {requestMode ? (
            <Mail size={21} strokeWidth={1.8} aria-hidden="true" />
          ) : (
            <FolderOpen size={21} strokeWidth={1.8} aria-hidden="true" />
          )}
        </div>

        {/* Heading */}
        <div className="text-center">
          <h1
            id="client-access-heading"
            className="m-0! text-[22px]! leading-7! font-semibold! tracking-tight text-[#0A1A2F] sm:text-[23px]!"
          >
            {requestMode
              ? 'Request a project link'
              : "You're invited to a project"}
          </h1>

          <p className="mx-auto mt-2 max-w-[340px] text-[13px] leading-5 text-slate-500">
            {requestMode
              ? 'Enter your email address to request a fresh invitation.'
              : 'Open your private project to share content, upload files, and respond to feedback.'}
          </p>
        </div>

        {/* Open project */}
        {!requestMode && (
          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={() => void openProject()}
              disabled={command.pending}
              className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {command.pending ? (
                'Opening project...'
              ) : (
                <>
                  Open my project
                  <ArrowRight size={16} aria-hidden="true" />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowRequestForm(true)}
              className="w-full cursor-pointer rounded-md px-2 py-2 text-[13px] font-medium text-slate-500 transition-colors hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              Need a new invitation link?
            </button>
          </div>
        )}

        {/* Fresh link form */}
        {requestMode && !message && (
          <form
            onSubmit={(event) => void requestFreshLink(event)}
            className="mt-6 space-y-4"
          >
            <div>
              <label
                htmlFor="client-access-email"
                className="mb-1.5 block text-[13px] font-medium text-slate-700"
              >
                Email address
              </label>

              <div className="relative">
                <Mail
                  size={16}
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400"
                />

                <input
                  id="client-access-email"
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white pr-3 pl-10 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                />
              </div>
            </div>

            {/* Reuse the project ID from the invitation URL */}
            {projectId ? (
              <input type="hidden" name="projectId" value={projectId} />
            ) : (
              <div>
                <label
                  htmlFor="client-access-project"
                  className="mb-1.5 block text-[13px] font-medium text-slate-700"
                >
                  Project ID
                </label>

                <input
                  id="client-access-project"
                  name="projectId"
                  type="text"
                  required
                  placeholder="Enter your project ID"
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                />

                <p className="mt-1.5 text-xs leading-4 text-slate-500">
                  Available in your original invitation.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={command.pending}
              className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {command.pending ? 'Sending request...' : 'Request invitation'}
            </button>
          </form>
        )}

        {/* Error */}
        {command.error && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-[13px] leading-5 text-red-700"
          >
            {command.error}
          </div>
        )}

        {/* Result */}
        {message && (
          <div
            role="status"
            className="mt-5 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-center text-[13px] leading-5 text-slate-700"
          >
            {message}
          </div>
        )}

        {/* Return to invitation if a token is available */}
        {requestMode && hasInvitation && (
          <button
            type="button"
            onClick={() => {
              setShowRequestForm(false)
              setMessage('')
            }}
            className="mt-4 w-full cursor-pointer rounded-md py-1.5 text-[13px] font-medium text-blue-600 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            Back to invitation
          </button>
        )}

        {/* Privacy footer */}
        <div className="mt-5 flex items-center justify-center gap-2 border-t border-slate-100 pt-4 text-center text-xs text-slate-400">
          <LockKeyhole size={13} aria-hidden="true" className="shrink-0" />
          <span>Private project access</span>
        </div>
      </section>
    </main>
  )
}
