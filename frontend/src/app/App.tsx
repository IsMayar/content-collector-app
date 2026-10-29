import { AppRouter } from '@/app/router/AppRouter'
import { store } from '@/app/store/store'
import { env } from '@/config/env'
import { ConnectionStatus } from '@/shared/components/ConnectionStatus'
import { MockIndicator, Notifications } from '@/shared/components/Feedback'
import { lazy, Suspense } from 'react'
import { Provider } from 'react-redux'

const ScenarioControls = env.mocksEnabled
  ? lazy(() =>
      import('@/mocks/ScenarioControls').then((m) => ({
        default: m.ScenarioControls,
      })),
    )
  : null
export function App() {
  return (
    <Provider store={store}>
      <Notifications>
        <MockIndicator />
        <ConnectionStatus />
        <AppRouter />
        {ScenarioControls && (
          <Suspense fallback={null}>
            <ScenarioControls />
          </Suspense>
        )}
      </Notifications>
    </Provider>
  )
}
