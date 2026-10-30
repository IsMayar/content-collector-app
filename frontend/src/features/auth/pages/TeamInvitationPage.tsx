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
        eyebrow="Better together"
        title="You’re invited to join"
        description="Accept an invitation using the verified account that matches the invited email."
      />
      {complete ? (
        <>
          <Notice>Your team invitation was accepted.</Notice>
          <Link
            className="secondary-button mt-6"
            to={`/app/w/${complete}/overview`}
          >
            Open workspace
          </Link>
        </>
      ) : auth.status !== 'authenticated' ? (
        <>
          <Notice>
            Sign in to your verified agency account before accepting this
            invitation. The invitation will remain available in this tab.
          </Notice>
          <Link
            className="secondary-button mt-6"
            to="/sign-in?returnTo=%2Fteam-invite"
          >
            Sign in to accept
          </Link>
        </>
      ) : !auth.user?.verified ? (
        <Notice error>
          Verify your email before accepting this invitation.
        </Notice>
      ) : (
        <>
          <p className="signed-in-as">Signed in as {auth.user.email}</p>
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
