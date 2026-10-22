import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { authApi } from './authApi'
import { identityReceived, tokenReceived } from './authSlice'
import { clearPrivateCaches } from './session'
import { AuthForm } from './AuthForm'
import { emailSchema, resetSchema, signInSchema, signUpSchema, tokenInputSchema } from './schemas'
import { Notice, useNotify } from '@/components/Feedback'
import { safeReturnDestination } from '@/lib/returnDestination'
import type { FieldDefinition } from '@/components/FormFields'

const email: FieldDefinition = { name: 'email', label: 'Email address', type: 'email', autoComplete: 'email' }
const password: FieldDefinition = { name: 'password', label: 'Password', type: 'password', autoComplete: 'current-password' }
const newPassword: FieldDefinition = { ...password, label: 'New password', autoComplete: 'new-password', hint: 'Use 12–128 characters. No special character rules.' }
const confirmPassword: FieldDefinition = { name: 'confirmPassword', label: 'Confirm password', type: 'password', autoComplete: 'new-password' }
const tokenField: FieldDefinition = { name: 'token', label: 'Email link code', autoComplete: 'off' }
const tokenVault = new Map<string, string>()
function captureToken(purpose: string) {
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const query = new URLSearchParams(window.location.search)
  const token = fragment.get('token') || query.get('token')
  if (token) { tokenVault.set(purpose, token); query.delete('token'); window.history.replaceState(window.history.state, '', window.location.pathname + (query.size ? `?${query}` : '')) }
  return tokenVault.get(purpose) || ''
}
export function AuthHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) { return <header className="auth-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></header> }
function AuthCard({ children }: { children: ReactNode }) { return <div className="auth-card">{children}</div> }

export function SignInPage() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const notify = useNotify()
  const [params] = useSearchParams()
  const destination = safeReturnDestination(params.get('returnTo'))
  const [login, loginState] = authApi.useLoginMutation()
  return <AuthCard><AuthHeading eyebrow="Welcome back" title="Sign in to your workspace" description="A little less chasing. A lot more making progress." /><AuthForm schema={signInSchema} fields={[email, password]} submitLabel="Sign in" onSubmit={async values => {
    dispatch(clearPrivateCaches())
    const result = await login({ email: values.email, password: values.password }).unwrap()
    dispatch(tokenReceived(result))
    const me = await dispatch(authApi.endpoints.me.initiate(undefined, { forceRefetch: true, subscribe: false })).unwrap()
    dispatch(identityReceived(me)); loginState.reset(); notify('Welcome back. You are signed in.'); navigate(destination, { replace: true })
  }} /><div className="form-links"><Link to="/forgot-password">Forgot your password?</Link><Link to="/verify-email">Verify email or resend link</Link></div><p className="auth-switch">New here? <Link to="/sign-up">Create an account</Link></p></AuthCard>
}
export function SignUpPage() {
  const [register, result] = authApi.useRegisterMutation()
  const [complete, setComplete] = useState(false)
  return <AuthCard><AuthHeading eyebrow="Start something good" title="Create your agency account" description="For freelancers and teams bringing client projects to life." />{complete ? <><Notice>If your address can be registered, you’ll receive an email with the next steps. Check your inbox to verify your account.</Notice><Link className="secondary-button mt-6" to="/verify-email">Verify your email</Link></> : <AuthForm schema={signUpSchema} fields={[{ name: 'displayName', label: 'Your name', autoComplete: 'name' }, email, { ...newPassword, label: 'Password' }, confirmPassword]} submitLabel="Create account" onSubmit={async values => { await register({ email: values.email, displayName: values.displayName, password: values.password }).unwrap(); result.reset(); setComplete(true) }} />}<p className="auth-switch">Already have an account? <Link to="/sign-in">Sign in</Link></p></AuthCard>
}
export function RecoveryPage() {
  const [recover, result] = authApi.useForgotPasswordMutation()
  const [complete, setComplete] = useState(false)
  return <AuthCard><AuthHeading eyebrow="Let’s get you back in" title="Forgot your password?" description="Enter your email and we’ll help you take the next step." />{complete ? <Notice>If an account matches that email, you’ll receive password reset instructions shortly. Check your inbox and spam folder.</Notice> : <AuthForm schema={emailSchema} fields={[email]} submitLabel="Send reset instructions" onSubmit={async values => { await recover({ email: values.email }).unwrap(); result.reset(); setComplete(true) }} />}<p className="auth-switch"><Link to="/sign-in">Back to sign in</Link></p></AuthCard>
}
export function VerificationPage() {
  const [initialToken] = useState(() => captureToken('verification'))
  const [verify, result] = authApi.useVerifyEmailMutation()
  const [resend, resendResult] = authApi.useResendVerificationMutation()
  const [verified, setVerified] = useState(false)
  const [sent, setSent] = useState(false)
  return <AuthCard><AuthHeading eyebrow="One more step" title="Verify your email" description="Open the email link, then confirm below. Links expire after 24 hours." />{verified ? <Notice>Your email is verified. You can now sign in.</Notice> : <AuthForm schema={tokenInputSchema} fields={[tokenField]} initialValues={{ token: initialToken }} submitLabel="Verify email" onSubmit={async values => { await verify({ token: values.token }).unwrap(); tokenVault.delete('verification'); result.reset(); setVerified(true) }} />}<details className="resend-panel"><summary>Need a new verification link?</summary>{sent ? <Notice>If verification is needed for that email, we’ll send a fresh link.</Notice> : <AuthForm schema={emailSchema} fields={[email]} submitLabel="Resend verification" onSubmit={async values => { await resend({ email: values.email }).unwrap(); resendResult.reset(); setSent(true) }} />}</details><p className="auth-switch"><Link to="/sign-in">Back to sign in</Link></p></AuthCard>
}
export function ResetPasswordPage() {
  const [initialToken] = useState(() => captureToken('reset'))
  const [reset, result] = authApi.useResetPasswordMutation()
  const [complete, setComplete] = useState(false)
  return <AuthCard><AuthHeading eyebrow="A fresh start" title="Set a new password" description="Choose a strong password you don’t use elsewhere. Reset links last 30 minutes." />{complete ? <Notice>Your password was reset and existing sessions revoked. Sign in with your new password.</Notice> : <AuthForm schema={resetSchema} fields={[tokenField, newPassword, confirmPassword]} initialValues={{ token: initialToken }} submitLabel="Reset password" onSubmit={async values => { await reset({ token: values.token, password: values.password }).unwrap(); tokenVault.delete('reset'); result.reset(); setComplete(true) }} />}<p className="auth-switch"><Link to="/sign-in">Back to sign in</Link></p></AuthCard>
}
export function TeamInvitePage() {
  const [initialToken] = useState(() => captureToken('invitation'))
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const auth = useAppSelector(s => s.auth)
  const dispatch = useAppDispatch()
  const [accept, result] = authApi.useAcceptInvitationMutation()
  const [complete, setComplete] = useState(false)
  return <AuthCard><AuthHeading eyebrow="Better together" title="Join your team" description="Accept an invitation using the verified account that matches the invited email." />{complete ? <><Notice>Your team invitation was accepted.</Notice><Link className="secondary-button mt-6" to="/app">Open workspace</Link></> : auth.status !== 'authenticated' ? <><Notice>Sign in to your verified agency account before accepting this invitation. The invitation will remain available in this tab.</Notice><Link className="secondary-button mt-6" to="/sign-in?returnTo=%2Fteam-invite">Sign in to accept</Link></> : !auth.user?.verified ? <Notice error>Verify your email before accepting this invitation.</Notice> : <><p className="signed-in-as">Signed in as {auth.user.email}</p><AuthForm schema={tokenInputSchema} fields={[tokenField]} initialValues={{ token: initialToken }} submitLabel="Accept invitation" onSubmit={async values => { await accept({ token: values.token, idempotencyKey }).unwrap(); tokenVault.delete('invitation'); result.reset(); dispatch(clearPrivateCaches()); const me = await dispatch(authApi.endpoints.me.initiate(undefined, { forceRefetch: true, subscribe: false })).unwrap(); dispatch(identityReceived(me)); setComplete(true) }} /></>}</AuthCard>
}
