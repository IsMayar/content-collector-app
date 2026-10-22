import type { ThunkAction, UnknownAction } from '@reduxjs/toolkit'
import type { RootState } from '@/app/store'
import { agencyApi } from '@/api/agencyApi'
import { clientApi } from '@/api/clientApi'
import { authApi } from './authApi'
import {
  bootstrapFailed,
  bootstrapStarted,
  identityReceived,
  signedOut,
  workspaceSelected,
} from './authSlice'

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
  (dispatch) => {
    dispatch(clearPrivateCaches())
    dispatch(workspaceSelected(id))
  }
