import { configureStore, createListenerMiddleware } from '@reduxjs/toolkit'
import { setupListeners } from '@reduxjs/toolkit/query'
import { agencyApi } from '@/api/agencyApi'
import { clientApi } from '@/api/clientApi'
import authReducer from '@/features/auth/authSlice'
import { signedOut } from '@/features/auth/authSlice'

export const createAppStore = () => {
  const sessionListener = createListenerMiddleware()
  sessionListener.startListening({ actionCreator: signedOut, effect: (_action, api) => {
    api.dispatch(agencyApi.util.resetApiState())
    api.dispatch(clientApi.util.resetApiState())
  } })
  return configureStore({
  devTools: false,
  reducer: {
    auth: authReducer,
    [agencyApi.reducerPath]: agencyApi.reducer,
    [clientApi.reducerPath]: clientApi.reducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().prepend(sessionListener.middleware).concat(
    agencyApi.middleware, clientApi.middleware,
  ),
  })
}
export const store = createAppStore()
setupListeners(store.dispatch)
export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
