import { authApi } from '@/features/auth/api/authApi'
import { AuthCard, AuthHeading } from '@/features/auth/components/AuthCard'
import {
  confirmPassword,
  email,
  newPassword,
} from '@/features/auth/components/authFields'
import { AuthForm } from '@/features/auth/components/AuthForm'
import { signUpSchema } from '@/features/auth/schemas/accountSchemas'
import { Notice } from '@/shared/components/Feedback'
import { useState } from 'react'
import { Link } from 'react-router'
export function RegisterPage() {
  const [register, result] = authApi.useRegisterMutation()
  const [complete, setComplete] = useState(false)
  return (
    <AuthCard>
      <AuthHeading
        eyebrow="Start something good"
        title="Create your account"
        description="For freelancers and teams bringing client projects to life."
      />
      {complete ? (
        <>
          <Notice>
            If your address can be registered, you’ll receive an email with the
            next steps. Check your inbox to verify your account.
          </Notice>
          <Link className="secondary-button mt-6" to="/verify-email">
            Verify your email
          </Link>
        </>
      ) : (
        <AuthForm
          schema={signUpSchema}
          fields={[
            { name: 'displayName', label: 'Your name', autoComplete: 'name' },
            email,
            { ...newPassword, label: 'Password' },
            confirmPassword,
          ]}
          submitLabel="Create account"
          onSubmit={async (values) => {
            await register({
              email: values.email,
              displayName: values.displayName,
              password: values.password,
            }).unwrap()
            result.reset()
            setComplete(true)
          }}
        />
      )}
      <p className="auth-switch">
        Already have an account? <Link to="/sign-in">Sign in</Link>
      </p>
    </AuthCard>
  )
}
