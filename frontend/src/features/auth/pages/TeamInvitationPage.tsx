import { authApi } from '@/features/auth/api/authApi'
import { AuthCard, AuthHeading } from '@/features/auth/components/AuthCard'
import { tokenField } from '@/features/auth/components/authFields'
import { AuthForm } from '@/features/auth/components/AuthForm'
import { tokenInputSchema } from '@/features/auth/schemas/accountSchemas'
import { identityReceived } from '@/features/auth/store/authSlice'
import {
  selectWorkspace,
  clearPrivateCaches,
} from '@/features/auth/store/session'
import { captureToken, tokenVault } from '@/features/auth/utils/actionToken'
import { Notice } from '@/shared/components/Feedback'
import { useAppDispatch, useAppSelector } from '@/shared/hooks/useAppStore'
import { useState } from 'react'
import { Link } from 'react-router'

const actionClass =
  'mt-4 inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-[13px] font-semibold text-blue-700 hover:bg-slate-50'

export function TeamInvitationPage() {
  const [initialToken] = useState(() => captureToken('invitation'))
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const auth = useAppSelector((s) => s.auth)
  const dispatch = useAppDispatch()
  const [accept, result] = authApi.useAcceptInvitationMutation()
  const [complete, setComplete] = useState('')

  return (
    <AuthCard>
      <AuthHeading
        title="Join your team"
        description="Use the verified account that matches your invitation email."
      />
      {complete ? (
        <>
          <Notice>Your team invitation was accepted.</Notice>
          <Link className={actionClass} to={`/app/w/${complete}/overview`}>
            Open workspace
          </Link>
        </>
      ) : auth.status !== 'authenticated' ? (
        <>
          <Notice>
            Sign in with the email address that received this invitation. The
            invitation will remain available in this tab.
          </Notice>
          <Link className={actionClass} to="/sign-in?returnTo=%2Fteam-invite">
            Sign in to accept
          </Link>
          <p className="mt-3 text-sm text-slate-600">
            New here?{' '}
            <Link to="/sign-up" className="font-medium text-blue-700">
              Create an account
            </Link>
            , verify your email, then return to this invitation in this tab.
          </p>
        </>
      ) : !auth.user?.verified ? (
        <Notice error>
          Verify your email before accepting this invitation.{' '}
          <Link to="/verify-email">Verify email</Link>
        </Notice>
      ) : (
        <>
          <p className="mb-4 break-all text-[13px] text-slate-600">
            Signed in as{' '}
            <span className="font-medium text-slate-900">
              {auth.user.email}
            </span>
          </p>
          <p className="mb-3 text-xs text-slate-500">
            If this invitation has expired, was revoked, or has already been
            used, ask the workspace owner for a new invitation.
          </p>
          <AuthForm
            schema={tokenInputSchema}
            fields={[tokenField]}
            initialValues={{ token: initialToken }}
            submitLabel="Accept invitation"
            onSubmit={async (values) => {
              const accepted = await accept({
                token: values.token,
                idempotencyKey,
              }).unwrap()
              tokenVault.delete('invitation')
              result.reset()
              dispatch(clearPrivateCaches())
              const me = await dispatch(
                authApi.endpoints.me.initiate(undefined, {
                  forceRefetch: true,
                  subscribe: false,
                }),
              ).unwrap()
              dispatch(identityReceived(me))
              dispatch(selectWorkspace(accepted.membership.workspaceId))
              setComplete(accepted.membership.workspaceId)
            }}
          />
        </>
      )}
    </AuthCard>
  )
}
