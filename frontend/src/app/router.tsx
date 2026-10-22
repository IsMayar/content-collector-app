import { createBrowserRouter } from 'react-router'
import { lazy, Suspense } from 'react'
import { StatePanel } from '@/components/Feedback'
import {
  AgencyLayout,
  AuthLayout,
  ClientLayout,
  PublicLayout,
} from '@/components/Layouts'
import {
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
  UnauthorizedPage,
} from '@/features/foundation/AgencyFoundation'
const workspacePages = () => import('@/features/projects/WorkspacePages')
const settingsPages = () => import('@/features/settings/SettingsPages')
const clientPages = () => import('@/features/client/ClientPages')
const WorkspaceEntry = lazy(() =>
  workspacePages().then((m) => ({ default: m.WorkspaceEntry })),
)
const DashboardPage = lazy(() =>
  workspacePages().then((m) => ({ default: m.DashboardPage })),
)
const ProjectsPage = lazy(() =>
  workspacePages().then((m) => ({ default: m.ProjectsPage })),
)
const CreateProjectPage = lazy(() =>
  workspacePages().then((m) => ({ default: m.CreateProjectPage })),
)
const TemplatesPage = lazy(() =>
  workspacePages().then((m) => ({ default: m.TemplatesPage })),
)
const OnboardingPage = lazy(() =>
  workspacePages().then((m) => ({ default: m.OnboardingPage })),
)
const ProjectPage = lazy(() =>
  import('@/features/projects/ProjectPage').then((m) => ({
    default: m.ProjectPage,
  })),
)
const TeamPage = lazy(() =>
  settingsPages().then((m) => ({ default: m.TeamPage })),
)
const SettingsPage = lazy(() =>
  settingsPages().then((m) => ({ default: m.SettingsPage })),
)
const BillingPage = lazy(() =>
  settingsPages().then((m) => ({ default: m.BillingPage })),
)
const InsightsPage = lazy(() =>
  settingsPages().then((m) => ({ default: m.InsightsPage })),
)
const StatusSharePage = lazy(() =>
  settingsPages().then((m) => ({ default: m.StatusSharePage })),
)
const ClientAccessPage = lazy(() =>
  clientPages().then((m) => ({ default: m.ClientAccessPage })),
)
const ClientProjectPage = lazy(() =>
  clientPages().then((m) => ({ default: m.ClientProjectPage })),
)
const PricingPage = lazy(() =>
  import('@/features/public/PublicPages').then((m) => ({
    default: m.PricingPage,
  })),
)
const LandingPage = lazy(() =>
  import('@/features/public/PublicPages').then((m) => ({
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
                element: deferred(<BillingPage />),
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
          { path: '/client/access', element: deferred(<ClientAccessPage />) },
          {
            path: '/client/projects/:projectId',
            element: deferred(<ClientProjectPage />),
          },
        ],
      },
    ],
  },
]
export const router = createBrowserRouter(routes)
