import { signedOut } from '@/features/auth/store/authSlice'
import {
  bootstrapSession,
  clearPrivateCaches,
  refreshIdentity,
} from '@/features/auth/store/session'
import { StatePanel } from '@/shared/components/Feedback'
import { RouteFocus } from '@/shared/components/RouteFocus'
import { useAppDispatch, useAppSelector } from '@/shared/hooks/useAppStore'
import { safeReturnDestination } from '@/shared/utils/returnDestination'
import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'

export function SessionBoundary() {
  const dispatch = useAppDispatch()
  const status = useAppSelector((s) => s.auth.status)
  const { pathname } = useLocation()
  const independent =
    pathname === '/' ||
    pathname === '/about' ||
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname === '/pricing' ||
    pathname.startsWith('/client/') ||
    pathname.startsWith('/status/')
  useEffect(() => {
    void dispatch(bootstrapSession())
  }, [dispatch])
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel('collector-session')
    channel.onmessage = (event) => {
      if (event.data === 'logout') {
        dispatch(signedOut())
        dispatch(clearPrivateCaches())
      }
    }
    return () => channel.close()
  }, [dispatch])
  useEffect(() => {
    if (status !== 'authenticated') return
    const refresh = () => {
      void dispatch(refreshIdentity())
    }
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
    }
  }, [dispatch, status])
  if (status === 'loading' && !independent)
    return (
      <StatePanel
        kind="loading"
        title="Opening your session"
        description="Checking your access securely…"
      />
    )
  if (status === 'error' && !independent)
    return (
      <StatePanel
        kind="error"
        title="We couldn’t check your session"
        description="Check your connection, then try again."
        action={
          <button
            className="secondary-button"
            onClick={() => void dispatch(bootstrapSession())}
          >
            Try again
          </button>
        }
      />
    )
  return (
    <>
      <RouteFocus />
      <Outlet />
    </>
  )
}
export function RequireAgency() {
  const status = useAppSelector((s) => s.auth.status)
  const location = useLocation()
  return status === 'authenticated' ? (
    <Outlet />
  ) : (
    <Navigate
      replace
      to={`/sign-in?returnTo=${encodeURIComponent(safeReturnDestination(location.pathname + location.search))}`}
    />
  )
}
