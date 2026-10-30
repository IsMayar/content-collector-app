import { refreshIdentity } from '@/features/auth/store/session'
import authReducer, {
  identityReceived,
  accessRejected,
  signedOut,
} from '@/features/auth/store/authSlice'
import type { AuthState } from '@/features/auth/types/auth.types'
import { agencyApi } from '@/services/api/baseApi'
import { clientApi } from '@/services/api/clientApi'
import { configureStore, createListenerMiddleware } from '@reduxjs/toolkit'
import { setupListeners } from '@reduxjs/toolkit/query'

export const createAppStore = () => {
  const sessionListener = createListenerMiddleware()
  sessionListener.startListening({
    actionCreator: signedOut,
    effect: (_action, api) => {
      api.dispatch(agencyApi.util.resetApiState())
      api.dispatch(clientApi.util.resetApiState())
    },
  })
  sessionListener.startListening({
    actionCreator: identityReceived,
    effect: (_action, api) => {
      const previous = (api.getOriginalState() as { auth: AuthState }).auth
      const current = (api.getState() as { auth: AuthState }).auth
      if (
        previous.user &&
        (previous.user.id !== current.user?.id ||
          JSON.stringify(previous.memberships) !==
            JSON.stringify(current.memberships))
      ) {
        api.dispatch(agencyApi.util.resetApiState())
        api.dispatch(clientApi.util.resetApiState())
      }
    },
  })
  sessionListener.startListening({
    actionCreator: accessRejected,
    effect: (_action, api) => {
      const dispatch = api.dispatch as typeof store.dispatch
      void dispatch(refreshIdentity())
    },
  })
  return configureStore({
    devTools: false,
    reducer: {
      auth: authReducer,
      [agencyApi.reducerPath]: agencyApi.reducer,
      [clientApi.reducerPath]: clientApi.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware()
        .prepend(sessionListener.middleware)
        .concat(agencyApi.middleware, clientApi.middleware),
  })
}
export const store = createAppStore()
setupListeners(store.dispatch)
export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
