import { env } from '@/config/env'
import { authApi } from '@/features/auth/api/authApi'
import { AuthCard, AuthHeading } from '@/features/auth/components/AuthCard'
import { email, tokenField } from '@/features/auth/components/authFields'
import { AuthForm } from '@/features/auth/components/AuthForm'
import {
  emailSchema,
  tokenInputSchema,
} from '@/features/auth/schemas/accountSchemas'
import { captureToken, tokenVault } from '@/features/auth/utils/actionToken'
import { Notice } from '@/shared/components/Feedback'
import { useState } from 'react'
import { Link } from 'react-router'
export function VerifyEmailPage() {
  const [initialToken] = useState(() => captureToken('verification'))
  const [verify, result] = authApi.useVerifyEmailMutation()
  const [resend, resendResult] = authApi.useResendVerificationMutation()
  const [verified, setVerified] = useState(false)
  const [sent, setSent] = useState(false)
  return (
    <AuthCard>
      <AuthHeading
        eyebrow="One more step"
        title="Verify your email"
        description="Open the email link, then confirm below. Links expire after 24 hours."
      />
      {verified ? (
        <Notice>Your email is verified. You can now sign in.</Notice>
      ) : (
        <AuthForm
          schema={tokenInputSchema}
          fields={[tokenField]}
          initialValues={{ token: initialToken }}
          submitLabel="Verify email"
          onSubmit={async (values) => {
            await verify({ token: values.token }).unwrap()
            tokenVault.delete('verification')
            result.reset()
            setVerified(true)
          }}
        />
      )}
      {env.mocksEnabled ? (
        <details className="resend-panel">
          <summary>Need a new verification link?</summary>
          {sent ? (
            <Notice>
              If verification is needed for that email, we’ll send a fresh link.
            </Notice>
          ) : (
            <AuthForm
              schema={emailSchema}
              fields={[email]}
              submitLabel="Resend verification"
              onSubmit={async (values) => {
                await resend({ email: values.email }).unwrap()
                resendResult.reset()
                setSent(true)
              }}
            />
          )}
        </details>
      ) : (
        !verified && (
          <p className="subtle">
            Verification resend is unavailable. Use the link from your original
            email.
          </p>
        )
      )}
      <p className="auth-switch">
        <Link to="/sign-in">Back to sign in</Link>
      </p>
    </AuthCard>
  )
}
