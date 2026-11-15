import { authApi } from '@/features/auth/api/authApi'
import { AuthCard, AuthHeading } from '@/features/auth/components/AuthCard'
import { email } from '@/features/auth/components/authFields'
import { AuthForm } from '@/features/auth/components/AuthForm'
import { emailSchema } from '@/features/auth/schemas/accountSchemas'
import { Notice } from '@/shared/components/Feedback'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

export function ForgotPasswordPage() {
  const [recover, result] = authApi.useForgotPasswordMutation()
  const [complete, setComplete] = useState(false)

  return (
    <AuthCard>
      <AuthHeading
        title="Reset your password"
        description="Enter your email address and we'll send reset instructions."
      />
      {complete ? (
        <Notice>
          If an account matches that email, you'll receive password reset
          instructions. Check your inbox and spam folder.
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
      <Link
        to="/sign-in"
        className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-blue-700 hover:underline"
      >
        <ArrowLeft size={15} aria-hidden="true" /> Back to sign in
      </Link>
    </AuthCard>
  )
}
