import { clientApi } from '@/services/api/clientApi'
import { Notice } from '@/shared/components/Feedback'
import { ErrorNotice, Field, Heading } from '@/shared/components/ProductUI'
import { useAppDispatch } from '@/shared/hooks/useAppStore'
import { useCommand } from '@/shared/hooks/useCommand'
import { Check, FileText, LockKeyhole } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'

export function ClientAccessPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const [token, setToken] = useState(
    () => new URLSearchParams(location.hash.slice(1)).get('token') || '',
  )
  const command = useCommand(true)
  const [message, setMessage] = useState('')
  const [fresh, setFresh] = useState('')
  useEffect(() => {
    if (location.hash) navigate('/client/access', { replace: true })
  }, [location.hash, navigate])
  return (
    <div className="access-card invitation-landing">
      <span className="access-emblem">
        <LockKeyhole size={28} />
      </span>
      <Heading
        eyebrow="YOUR PRIVATE PROJECT SPACE"
        title="You’re invited to share content."
        description="Your agency has invited you to securely share your content, requirements and files for your project."
      />
      <div className="invitation-benefits">
        <p>
          <LockKeyhole />
          <span>
            <strong>Private and secure</strong>Access is limited to your invited
            project.
          </span>
        </p>
        <p>
          <FileText />
          <span>
            <strong>Organised and easy</strong>A simple checklist keeps
            everything in one place.
          </span>
        </p>
        <p>
          <Check />
          <span>
            <strong>Submit and revise</strong>Send your content for review and
            respond to feedback.
          </span>
        </p>
      </div>
      <aside className="invitation-steps">
        <div className="invitation-art" aria-hidden="true">
          <FileText size={100} />
          <LockKeyhole size={40} />
        </div>
        <ol>
          <li>
            <b>1</b>
            <strong>Continue</strong>Verify your identity to access the project.
          </li>
          <li>
            <b>2</b>
            <strong>Fill your checklist</strong>Share content, answer questions
            and upload files.
          </li>
          <li>
            <b>3</b>
            <strong>Submit for review</strong>Send your content and respond to
            feedback.
          </li>
        </ol>
      </aside>
      {token ? (
        <>
          <Notice>
            Your invitation is only used when you choose to open the project.
          </Notice>
          <button
            className="primary-button"
            disabled={command.pending}
            onClick={async () => {
              const result = await command.run<{ projectId: string }>(
                'client-access/exchange',
                { token },
              )
              if (result) {
                setToken('')
                dispatch(clientApi.util.resetApiState())
                navigate(`/client/projects/${result.projectId}`)
              }
            }}
          >
            Open my project
          </button>
        </>
      ) : (
        <p>
          Use the private link from your agency, or request a fresh invitation
          below.
        </p>
      )}
      <ErrorNotice error={command.error} />
      <details open={!token}>
        <summary>Need a fresh link?</summary>
        <form
          className="stack-form"
          onSubmit={async (e) => {
            e.preventDefault()
            const v = Object.fromEntries(new FormData(e.currentTarget))
            const result = await command.run<{
              message: string
              demoUrl?: string
            }>('client-access/request-link', v)
            if (result) {
              setMessage(result.message)
              setFresh(result.demoUrl || '')
            }
          }}
        >
          <Field label="Your email">
            <input required name="email" type="email" autoComplete="email" />
          </Field>
          <Field label="Project ID">
            <input
              required
              name="projectId"
              defaultValue={
                new URLSearchParams(location.search).get('projectId') || ''
              }
              placeholder="From your agency’s invitation"
            />
          </Field>
          <button disabled={command.pending} className="secondary-button">
            Request fresh link
          </button>
        </form>
      </details>
      {message && <Notice>{message}</Notice>}
      {fresh && (
        <Link
          to={fresh}
          onClick={() =>
            setToken(
              new URLSearchParams(fresh.split('#')[1]).get('token') || '',
            )
          }
        >
          Open synthetic fresh invitation
        </Link>
      )}
    </div>
  )
}
