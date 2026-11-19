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
        title="Create an account"
        description="Start collecting content with your team and clients."
      />

      {complete ? (
        <div className="space-y-4">
          <Notice>
            If your address can be registered, you'll receive an email with the
            next steps. Check your inbox to verify your account.
          </Notice>

          <Link
            to="/verify-email"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-[13px] font-semibold text-blue-700 hover:bg-slate-50"
          >
            Verify your email
          </Link>
        </div>
      ) : (
        <AuthForm
          schema={signUpSchema}
          fields={[
            {
              name: 'displayName',
              label: 'Your name',
              autoComplete: 'name',
              placeholder: 'Enter your full name',
            },
            email,
            {
              ...newPassword,
              label: 'Password',
            },
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

      <p className="mt-5 border-t border-slate-200 pt-4 text-center text-[13px] text-slate-600">
        Already have an account?{' '}
        <Link
          to="/sign-in"
          className="font-semibold text-blue-700 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </AuthCard>
  )
}
