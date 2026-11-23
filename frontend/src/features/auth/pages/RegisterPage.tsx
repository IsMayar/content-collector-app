import { authApi } from '@/features/auth/api/authApi'
import { AuthCard, AuthHeading } from '@/features/auth/components/AuthCard'
import {
  confirmPassword,
  email,
  newPassword,
} from '@/features/auth/components/authFields'
import { AuthForm } from '@/features/auth/components/AuthForm'
import { signUpSchema } from '@/features/auth/schemas/accountSchemas'
import { Link, useNavigate } from 'react-router'

export function RegisterPage() {
  const [register] = authApi.useRegisterMutation()
  const navigate = useNavigate()

  return (
    <AuthCard>
      <AuthHeading
        title="Create an account"
        description="Start collecting content with your team and clients."
      />

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

            navigate('/verify-email', { replace: true })
          }}
        />

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
