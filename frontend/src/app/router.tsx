import { createBrowserRouter } from 'react-router'
import {
  AgencyLayout,
  AuthLayout,
  ClientLayout,
  PublicLayout,
} from '@/components/Layouts'
import {
  WelcomePage,
  AboutPage,
  NotFoundPage,
} from '@/features/foundation/Pages'
import { SessionBoundary, RequireAgency } from '@/features/auth/SessionBoundary'
import {
  RecoveryPage,
  ResetPasswordPage,
  SignInPage,
  SignUpPage,
  TeamInvitePage,
  VerificationPage,
} from '@/features/auth/AuthPages'
import {
  AgencyFoundation,
  ClientFoundation,
  UnauthorizedPage,
} from '@/features/foundation/AgencyFoundation'

export const routes = [
  {
    element: <SessionBoundary />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          { path: '/', element: <WelcomePage /> },
          { path: '/about', element: <AboutPage /> },
          { path: '/unauthorized', element: <UnauthorizedPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      {
        element: <AuthLayout />,
        children: [
          { path: '/sign-in', element: <SignInPage /> },
          { path: '/sign-up', element: <SignUpPage /> },
          { path: '/forgot-password', element: <RecoveryPage /> },
          { path: '/reset-password', element: <ResetPasswordPage /> },
          { path: '/verify-email', element: <VerificationPage /> },
          { path: '/team-invite', element: <TeamInvitePage /> },
        ],
      },
      {
        element: <RequireAgency />,
        children: [
          {
            element: <AgencyLayout />,
            children: [
              { path: '/app', element: <AgencyFoundation /> },
              { path: '/app/onboarding', element: <AgencyFoundation /> },
              {
                path: '/app/w/:workspaceId/overview',
                element: <AgencyFoundation />,
              },
              {
                path: '/app/w/:workspaceId/access-foundation',
                element: <AgencyFoundation ownerOnly />,
              },
            ],
          },
        ],
      },
      {
        element: <ClientLayout />,
        children: [{ path: '/client/access', element: <ClientFoundation /> }],
      },
    ],
  },
]
export const router = createBrowserRouter(routes)
