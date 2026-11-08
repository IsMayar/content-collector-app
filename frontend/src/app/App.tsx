import { AppRouter } from '@/app/router/AppRouter'
import { store } from '@/app/store/store'
import { ConnectionStatus } from '@/shared/components/ConnectionStatus'
import { Notifications } from '@/shared/components/Feedback'
import { Provider } from 'react-redux'

export function App() {
  return (
    <Provider store={store}>
      <Notifications>
        <ConnectionStatus />
        <AppRouter />
      </Notifications>
    </Provider>
  )
}
