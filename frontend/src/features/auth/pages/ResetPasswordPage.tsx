import { authApi } from '@/features/auth/api/authApi'
import { AuthCard, AuthHeading } from '@/features/auth/components/AuthCard'
import {
  confirmPassword,
  newPassword,
  tokenField,
} from '@/features/auth/components/authFields'
import { AuthForm } from '@/features/auth/components/AuthForm'
import { resetSchema } from '@/features/auth/schemas/accountSchemas'
import { captureToken, tokenVault } from '@/features/auth/utils/actionToken'
import { Notice } from '@/shared/components/Feedback'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

export function ResetPasswordPage() {
  const [initialToken] = useState(() => captureToken('reset'))
  const [reset, result] = authApi.useResetPasswordMutation()
  const [complete, setComplete] = useState(false)

  return (
    <AuthCard>
      <AuthHeading
        title="Choose a new password"
        description="Use a password you don't use elsewhere. Reset links expire after 30 minutes."
      />
      {complete ? (
        <Notice>
          Your password was reset and existing sessions revoked. Sign in with
          your new password.
        </Notice>
      ) : (
        <AuthForm
          schema={resetSchema}
          fields={[tokenField, newPassword, confirmPassword]}
          initialValues={{ token: initialToken }}
          submitLabel="Reset password"
          onSubmit={async (values) => {
            await reset({
              token: values.token,
              password: values.password,
            }).unwrap()
            tokenVault.delete('reset')
            result.reset()
            setComplete(true)
          }}
        />
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
