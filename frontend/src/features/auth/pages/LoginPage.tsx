import { AuthCard, AuthHeading } from '@/features/auth/components/AuthCard'
import { LoginForm } from '@/features/auth/components/LoginForm'
import { Link } from 'react-router'

export function LoginPage() {
  return (
    <AuthCard>
      <AuthHeading
        title="Welcome back"
        description="Sign in to your account."
      />
      <LoginForm />
      <nav
        aria-label="Account recovery"
        className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[13px]"
      >
        <Link
          to="/forgot-password"
          className="font-medium text-blue-700 hover:underline"
        >
          Forgot password?
        </Link>
      </nav>
      <p className="mt-6 border-t border-slate-200 pt-4 text-center text-[13px] text-slate-600">
        Don't have an account?{' '}
        <Link
          to="/sign-up"
          className="font-semibold text-blue-700 hover:underline"
        >
          Create one
        </Link>
      </p>
    </AuthCard>
  )
}
