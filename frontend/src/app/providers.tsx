import { Provider } from 'react-redux'
import { RouterProvider } from 'react-router/dom'
import { store } from '@/app/store'
import { router } from '@/app/router'
import { MockIndicator, Notifications } from '@/components/Feedback'
import { lazy, Suspense } from 'react'
import { ConnectionStatus } from '@/components/ConnectionStatus'
const ScenarioControls=import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCKS==='true'?lazy(()=>import('@/mocks/ScenarioControls').then(m=>({default:m.ScenarioControls}))):null

// HeroUI v3 components do not require the v2 HeroUIProvider.
export function AppProviders() {
  return (
    <Provider store={store}>
      <Notifications>
        <MockIndicator />
        <ConnectionStatus />
        <RouterProvider router={router} />
        {ScenarioControls && <Suspense fallback={null}><ScenarioControls/></Suspense>}
      </Notifications>
    </Provider>
  )
}
