import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { bootstrapSession, clearPrivateCaches } from './session'
import { signedOut } from './authSlice'
import { StatePanel } from '@/components/Feedback'
import { safeReturnDestination } from '@/lib/returnDestination'
import { RouteFocus } from '@/components/RouteFocus'

export function SessionBoundary() {
  const dispatch = useAppDispatch()
  const status = useAppSelector((s) => s.auth.status)
  const { pathname } = useLocation()
  const independent =
    pathname === '/' ||
    pathname === '/about' ||
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
