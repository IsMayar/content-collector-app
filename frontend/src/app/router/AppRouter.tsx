import { env } from '@/config/env'
import {
  RequireAgency,
  SessionBoundary,
} from '@/features/auth/components/SessionBoundary'
import { ForgotPasswordPage } from '@/features/auth/pages/ForgotPasswordPage'
import { LoginPage } from '@/features/auth/pages/LoginPage'
import { RegisterPage } from '@/features/auth/pages/RegisterPage'
import { ResetPasswordPage } from '@/features/auth/pages/ResetPasswordPage'
import { TeamInvitationPage } from '@/features/auth/pages/TeamInvitationPage'
import { VerifyEmailPage } from '@/features/auth/pages/VerifyEmailPage'
import { HelpPage, LegalPage } from '@/features/public/pages/HelpPages'
import { AgencyLayout } from '@/layouts/AgencyLayout'
import { AuthLayout } from '@/layouts/AuthLayout'
import { ClientLayout } from '@/layouts/ClientLayout'
import { PublicLayout } from '@/layouts/PublicLayout'
import { MockIndicator, StatePanel } from '@/shared/components/Feedback'
import {
  AgencyFoundation,
  UnauthorizedPage,
} from '@/shared/components/routing/AgencyAccess'
import { NotFoundPage } from '@/shared/components/routing/RecoveryPages'
import { lazy, Suspense } from 'react'
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  useLocation,
} from 'react-router'
import { RouterProvider } from 'react-router/dom'

const WorkspaceEntry = lazy(() =>
  import('@/features/workspace/pages/WorkspaceEntry').then((m) => ({
    default: m.WorkspaceEntry,
  })),
)
const DashboardPage = lazy(() =>
  import('@/features/workspace/pages/DashboardPage').then((m) => ({
    default: m.DashboardPage,
  })),
)
const ProjectsPage = lazy(() =>
  import('@/features/projects/pages/ProjectsPage').then((m) => ({
    default: m.ProjectsPage,
  })),
)
const CreateProjectPage = lazy(() =>
  import('@/features/projects/pages/CreateProjectPage').then((m) => ({
    default: m.CreateProjectPage,
  })),
)
const TemplatesPage = lazy(() =>
  import('@/features/templates/pages/TemplatesPage').then((m) => ({
    default: m.TemplatesPage,
  })),
)
const OnboardingPage = lazy(() =>
  import('@/features/workspace/pages/OnboardingPage').then((m) => ({
    default: m.OnboardingPage,
  })),
)
const ProjectPage = lazy(() =>
  import('@/features/projects/pages/ProjectPage').then((m) => ({
    default: m.ProjectPage,
  })),
)
const TeamPage = lazy(() =>
  import('@/features/workspace/pages/TeamPage').then((m) => ({
    default: m.TeamPage,
  })),
)
const SettingsPage = lazy(() =>
  import('@/features/settings/pages/SettingsPage').then((m) => ({
    default: m.SettingsPage,
  })),
)
const InsightsPage = lazy(() =>
  import('@/features/analytics/pages/InsightsPage').then((m) => ({
    default: m.InsightsPage,
  })),
)
const StatusSharePage = lazy(() =>
  import('@/features/analytics/pages/StatusSharePage').then((m) => ({
    default: m.StatusSharePage,
  })),
)
const ClientAccessPage = lazy(() =>
  import('@/features/client/pages/ClientAccessPage').then((m) => ({
    default: m.ClientAccessPage,
  })),
)
const ClientProjectPage = lazy(() =>
  import('@/features/client/pages/ClientProjectPage').then((m) => ({
    default: m.ClientProjectPage,
  })),
)
const PricingPage = lazy(() =>
  import('@/features/public/pages/PricingPage').then((m) => ({
    default: m.PricingPage,
  })),
)
const LandingPage = lazy(() =>
  import('@/features/public/pages/LandingPage').then((m) => ({
    default: m.LandingPage,
  })),
)
const deferred = (element: React.ReactNode) => (
  <Suspense
    fallback={<StatePanel kind="loading" title="Opening your workspace" />}
  >
    {element}
  </Suspense>
)
const ScenarioControls = env.mocksEnabled
  ? lazy(() =>
      import('@/mocks/ScenarioControls').then((m) => ({
        default: m.ScenarioControls,
      })),
    )
  : null
function DemoLayout() {
  return (
    <>
      <MockIndicator />
      <Outlet />
      {ScenarioControls && (
        <Suspense fallback={null}>
          <ScenarioControls />
        </Suspense>
      )}
    </>
  )
}

function LegacyBillingRoute() {
  const location = useLocation()
  const search = new URLSearchParams(location.search)
  if (!search.has('view')) search.set('view', 'billing')
  return (
    <Navigate
      replace
      to={
        location.pathname.replace(/billing\/?$/, 'settings') +
        '?' +
        search.toString()
      }
    />
  )
}
export const routes = [
  {
    element: <SessionBoundary />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          { path: '/', element: deferred(<LandingPage />) },
          { path: '/pricing', element: deferred(<PricingPage />) },
          { path: '/status/:shareId', element: deferred(<StatusSharePage />) },
          { path: '/about', element: <HelpPage /> },
          { path: '/privacy', element: <LegalPage /> },
          { path: '/terms', element: <LegalPage terms /> },
          { path: '/unauthorized', element: <UnauthorizedPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      {
        element: <DemoLayout />,
        children: [
          {
            element: <AuthLayout />,
            children: [
              { path: '/sign-in', element: <LoginPage /> },
              { path: '/sign-up', element: <RegisterPage /> },
              { path: '/forgot-password', element: <ForgotPasswordPage /> },
              { path: '/reset-password', element: <ResetPasswordPage /> },
              { path: '/verify-email', element: <VerifyEmailPage /> },
              { path: '/team-invite', element: <TeamInvitationPage /> },
            ],
          },
          {
            element: <RequireAgency />,
            children: [
              {
                element: <AgencyLayout />,
                children: [
                  { path: '/app', element: deferred(<WorkspaceEntry />) },
                  {
                    path: '/app/onboarding',
                    element: deferred(<OnboardingPage />),
                  },
                  {
                    path: '/app/w/:workspaceId/overview',
                    element: deferred(<DashboardPage />),
                  },
                  {
                    path: '/app/w/:workspaceId/access-foundation',
                    element: <AgencyFoundation ownerOnly />,
                  },
                  {
                    path: '/app/w/:workspaceId/projects',
                    element: deferred(<ProjectsPage />),
                  },
                  {
                    path: '/app/w/:workspaceId/projects/new',
                    element: deferred(<CreateProjectPage />),
                  },
                  {
                    path: '/app/w/:workspaceId/projects/:projectId',
                    element: deferred(<ProjectPage />),
                  },
                  {
                    path: '/app/w/:workspaceId/templates',
                    element: deferred(<TemplatesPage />),
                  },
                  {
                    path: '/app/w/:workspaceId/team',
                    element: deferred(<TeamPage />),
                  },
                  {
                    path: '/app/w/:workspaceId/settings',
                    element: deferred(<SettingsPage />),
                  },
                  {
                    path: '/app/w/:workspaceId/billing',
                    element: <LegacyBillingRoute />,
                  },
                  {
                    path: '/app/w/:workspaceId/insights',
                    element: deferred(<InsightsPage />),
                  },
                ],
              },
            ],
          },
          {
            element: <ClientLayout />,
            children: [
              {
                path: '/client/access',
                element: deferred(<ClientAccessPage />),
              },
              {
                path: '/client/projects/:projectId',
                element: deferred(<ClientProjectPage />),
              },
            ],
          },
        ],
      },
    ],
  },
]
export const router = createBrowserRouter(routes)
export function AppRouter() {
  return <RouterProvider router={router} />
}
