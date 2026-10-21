import { configureStore } from '@reduxjs/toolkit'
import { setupListeners } from '@reduxjs/toolkit/query'
import { agencyApi } from '@/api/agencyApi'
import { clientApi } from '@/api/clientApi'

export const store = configureStore({
  reducer: {
    [agencyApi.reducerPath]: agencyApi.reducer,
    [clientApi.reducerPath]: clientApi.reducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(
    agencyApi.middleware, clientApi.middleware,
  ),
})

setupListeners(store.dispatch)
export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
