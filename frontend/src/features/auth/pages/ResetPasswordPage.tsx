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
import { useState } from 'react'
import { Link } from 'react-router'
export function ResetPasswordPage() {
  const [initialToken] = useState(() => captureToken('reset'))
  const [reset, result] = authApi.useResetPasswordMutation()
  const [complete, setComplete] = useState(false)
  return (
    <AuthCard>
      <AuthHeading
        eyebrow="A fresh start"
        title="Choose a new password"
        description="Choose a strong password you don’t use elsewhere. Reset links last 30 minutes."
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
      <p className="auth-switch">
        <Link to="/sign-in">Back to sign in</Link>
      </p>
    </AuthCard>
  )
}
