import { createBrowserRouter } from 'react-router'
import { AppShell } from '@/components/AppShell'
import { WelcomePage, AboutPage, NotFoundPage } from '@/features/foundation/Pages'

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <WelcomePage /> },
      { path: '/about', element: <AboutPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
