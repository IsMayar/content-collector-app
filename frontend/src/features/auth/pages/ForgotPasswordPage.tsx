import { authApi } from '@/features/auth/api/authApi'
import { AuthCard, AuthHeading } from '@/features/auth/components/AuthCard'
import { email } from '@/features/auth/components/authFields'
import { AuthForm } from '@/features/auth/components/AuthForm'
import { emailSchema } from '@/features/auth/schemas/accountSchemas'
import { Notice } from '@/shared/components/Feedback'
import { useState } from 'react'
import { Link } from 'react-router'
export function ForgotPasswordPage() {
  const [recover, result] = authApi.useForgotPasswordMutation()
  const [complete, setComplete] = useState(false)
  return (
    <AuthCard>
      <AuthHeading
        eyebrow="Let’s get you back in"
        title="Reset your password"
        description="Enter your email and we’ll help you take the next step."
      />
      {complete ? (
        <Notice>
          If an account matches that email, you’ll receive password reset
          instructions shortly. Check your inbox and spam folder.
        </Notice>
      ) : (
        <AuthForm
          schema={emailSchema}
          fields={[email]}
          submitLabel="Send reset instructions"
          onSubmit={async (values) => {
            await recover({ email: values.email }).unwrap()
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
