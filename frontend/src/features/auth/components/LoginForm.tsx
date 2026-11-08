import { authApi } from '@/features/auth/api/authApi'
import { email, password } from '@/features/auth/components/authFields'
import { AuthForm } from '@/features/auth/components/AuthForm'
import { loginSchema } from '@/features/auth/schemas/loginSchema'
import {
  identityReceived,
  tokenReceived,
} from '@/features/auth/store/authSlice'
import { clearPrivateCaches } from '@/features/auth/store/session'
import { useNotify } from '@/shared/components/Feedback'
import { useAppDispatch } from '@/shared/hooks/useAppStore'
import { safeReturnDestination } from '@/shared/utils/returnDestination'
import { useNavigate, useSearchParams } from 'react-router'
export function LoginForm() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const notify = useNotify()
  const [params] = useSearchParams()
  const destination = safeReturnDestination(params.get('returnTo'))
  const [login, loginState] = authApi.useLoginMutation()
  return (
    <AuthForm
      schema={loginSchema}
      fields={[email, password]}
      submitLabel="Sign in"
      onSubmit={async (values) => {
        dispatch(clearPrivateCaches())
        const result = await login({
          email: values.email,
          password: values.password,
        }).unwrap()
        dispatch(tokenReceived(result))
        const me = await dispatch(
          authApi.endpoints.me.initiate(undefined, {
            forceRefetch: true,
            subscribe: false,
          }),
        ).unwrap()
        dispatch(identityReceived(me))
        loginState.reset()
        notify('Welcome back. You are signed in.')
        navigate(destination, { replace: true })
      }}
    />
  )
}
