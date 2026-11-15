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
import { ArrowLeft } from 'lucide-react'
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
        title="Verify your email"
        description="Enter the verification code from your email. Links expire after 24 hours."
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
        <details className="group mt-5 rounded-lg border border-slate-200 bg-white px-4 py-3">
          <summary className="cursor-pointer text-[13px] font-semibold text-slate-700">
            Need a new verification link?
          </summary>
          <div className="pt-4">
            {sent ? (
              <Notice>
                If verification is needed for that email, we'll send a fresh
                link.
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
          </div>
        </details>
      ) : (
        !verified && (
          <p className="mt-3 text-[12px] leading-5 text-slate-500">
            Need another code? Use the original email link or contact support.
          </p>
        )
      )}
      <Link
        to="/sign-in"
        className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-blue-700 hover:underline"
      >
        <ArrowLeft size={15} aria-hidden="true" /> Back to sign in
      </Link>
    </AuthCard>
  )
}
