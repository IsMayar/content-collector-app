import { Provider } from 'react-redux'
import { RouterProvider } from 'react-router/dom'
import { store } from '@/app/store'
import { router } from '@/app/router'

// HeroUI v3 components do not require the v2 HeroUIProvider.
export function AppProviders() {
  return <Provider store={store}><RouterProvider router={router} /></Provider>
}
