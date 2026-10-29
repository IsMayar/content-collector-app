import { AuthCard, AuthHeading } from '@/features/auth/components/AuthCard'
import { LoginForm } from '@/features/auth/components/LoginForm'
import { Link } from 'react-router'
export function LoginPage() {
  return (
    <AuthCard>
      <AuthHeading
        eyebrow="Welcome back"
        title="Welcome back"
        description="Sign in to Content Collector to continue."
      />
      <LoginForm />
      <div className="form-links">
        <Link to="/forgot-password">Forgot your password?</Link>
        <Link to="/verify-email">Verify email or resend link</Link>
      </div>
      <p className="auth-switch">
        New here? <Link to="/sign-up">Create an account</Link>
      </p>
    </AuthCard>
  )
}
