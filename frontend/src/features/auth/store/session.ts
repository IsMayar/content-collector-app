import type { RootState } from '@/app/store/store'
import { authApi } from '@/features/auth/api/authApi'
import {
  bootstrapFailed,
  bootstrapStarted,
  identityReceived,
  signedOut,
  workspaceSelected,
} from '@/features/auth/store/authSlice'
import { agencyApi } from '@/services/api/baseApi'
import { clientApi } from '@/services/api/clientApi'
import type { ThunkAction, UnknownAction } from '@reduxjs/toolkit'

type AsyncAction = ThunkAction<Promise<void>, RootState, unknown, UnknownAction>
export function clearPrivateCaches(): ThunkAction<
  void,
  RootState,
  unknown,
  UnknownAction
> {
  return (dispatch) => {
    navigator.serviceWorker?.controller?.postMessage({
      type: 'CLEAR_PRIVATE_CACHES',
    })
    dispatch(agencyApi.util.resetApiState())
    dispatch(clientApi.util.resetApiState())
  }
}
let bootstrapTask: Promise<void> | null = null
export const bootstrapSession = (): AsyncAction => (dispatch, getState) => {
  if (bootstrapTask) return bootstrapTask
  if (identityTask) return identityTask.then(() => dispatch(bootstrapSession()))
  dispatch(bootstrapStarted())
  const generation = getState().auth.generation
  const request = dispatch(
    authApi.endpoints.bootstrap.initiate(undefined, {
      forceRefetch: true,
      subscribe: false,
    }),
  )
  bootstrapTask = request
    .unwrap()
    .then((me) => {
      if (getState().auth.generation === generation)
        dispatch(identityReceived(me))
    })
    .catch(() => {
      if (getState().auth.status !== 'anonymous') dispatch(bootstrapFailed())
    })
    .finally(() => {
      bootstrapTask = null
      request.unsubscribe()
    })
  return bootstrapTask
}
export const logoutSession = (): AsyncAction => async (dispatch) => {
  const result = await dispatch(authApi.endpoints.logout.initiate())
  if (
    result.error &&
    (!('status' in result.error) || result.error.status !== 401)
  )
    throw result.error
  dispatch(signedOut())
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('collector-session')
    channel.postMessage('logout')
    channel.close()
  }
}
export const selectWorkspace =
  (id: string): ThunkAction<void, RootState, unknown, UnknownAction> =>
  (dispatch, getState) => {
    const state = getState().auth
    if (
      id === state.workspaceId ||
      !state.memberships.some((m) => m.workspaceId === id)
    )
      return
    dispatch(clearPrivateCaches())
    dispatch(workspaceSelected(id))
  }

// Reconcile live roles without replacing the active route with a bootstrap screen.
let identityTask: Promise<void> | null = null
export const refreshIdentity = (): AsyncAction => (dispatch, getState) => {
  if (identityTask) return identityTask
  if (getState().auth.status !== 'authenticated') return Promise.resolve()
  const generation = getState().auth.generation
  const request = dispatch(
    authApi.endpoints.me.initiate(undefined, {
      forceRefetch: true,
      subscribe: false,
    }),
  )
  identityTask = request
    .unwrap()
    .then((me) => {
      if (getState().auth.generation === generation)
        dispatch(identityReceived(me))
    })
    .catch(() => {
      // The API layer handles an expired session. A network outage does not fabricate revocation.
    })
    .finally(() => {
      identityTask = null
      request.unsubscribe()
    })
  return identityTask
}
