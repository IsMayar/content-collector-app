import { CollectionPortal } from '@/features/client/components/CollectionPortal'
import { collectionSchema } from '@/features/client/schemas/collectionSchema'
import { clearPendingDrafts } from '@/features/client/hooks/draftAutosave'
import { ClientProjectPage } from '@/features/client/pages/ClientProjectPage'
import { errorMessage } from '@/shared/utils/apiError'
import { ClientAccessPage } from '@/features/client/pages/ClientAccessPage'
import { createAppStore } from '@/app/store/store'
import {
  identityReceived,
  tokenReceived,
} from '@/features/auth/store/authSlice'
import { PortalFoundation } from '@/features/client/components/PortalFoundation'
import { portalFoundationSchema } from '@/features/client/schemas/portalSchema'
import { clientAccessEstablished } from '@/features/client/store/clientAccessSlice'
import { accountFixtures } from '@/mocks/fixtures'
import { portalApi } from '@/services/api/resourceApi'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Provider } from 'react-redux'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import { server } from './setup'
const projectId = '33333333-3333-4333-8333-333333333333'
function foundation() {
  return {
    project: {
      id: projectId,
      title: 'Private client request',
      projectType: 'WEBSITE',
      state: 'ACTIVE',
      dueDate: '2026-12-20',
      structureVersion: 1,
      agencyDisplayName: 'Synthetic agency',
      aiEnabled: false,
    },
    capabilities: { canRespond: false },
    progress: {
      requiredTotal: 1,
      submittedRequired: 0,
      approvedRequired: 0,
      clientActionRequired: 1,
      optionalApproved: 0,
    },
    sections: [
      {
        id: '44444444-4444-4444-8444-444444444444',
        key: 'about',
        title: 'About your business',
        items: [
          {
            id: '55555555-5555-4555-8555-555555555555',
            key: 'about.introduction',
            label: 'Business introduction',
            type: 'SHORT_TEXT',
            instructions: 'Describe your business in a few sentences.',
            example: 'A local practice serving families.',
            required: true,
            validation: { maxLength: 200 },
            version: 1,
            state: 'NOT_STARTED',
            visible: true,
            canEdit: false,
            answer: null,
            assets: [],
            comments: [],
          },
        ],
      },
    ],
  }
}
describe('T14 client portal foundation', () => {
  it('accepts explicit null answers without fabricating saved responses', () => {
    const data = portalFoundationSchema.parse(foundation())
    expect(data.sections[0].items[0].answer).toBeNull()
    expect(data.capabilities.canRespond).toBe(false)
  })
  it('rejects saved-answer records in the read-only foundation contract', () => {
    const data = foundation()
    Object.assign(data.sections[0].items[0], {
      answer: { version: 1, value: {}, savedAt: new Date().toISOString() },
    })
    expect(portalFoundationSchema.safeParse(data).success).toBe(false)
  })
  it('rejects response capabilities in a foundation-only response', () => {
    const data = foundation()
    data.capabilities.canRespond = true
    expect(portalFoundationSchema.safeParse(data).success).toBe(false)
  })
  it.each([
    'SHORT_TEXT',
    'LONG_TEXT',
    'URL',
    'SINGLE_SELECT',
    'MULTI_SELECT',
    'IMAGE',
    'FILE',
    'REPEATER',
  ])('presents valid %s field metadata', (type) => {
    const data = foundation()
    const item = data.sections[0].items[0]
    Object.assign(item, {
      type,
      validation:
        type === 'REPEATER'
          ? {
              maxRows: 20,
              columns: [
                {
                  key: 'name',
                  label: 'Name',
                  type: 'SHORT_TEXT',
                  required: true,
                },
              ],
            }
          : ['SINGLE_SELECT', 'MULTI_SELECT'].includes(type)
            ? { options: [{ key: 'yes', label: 'Yes' }] }
            : {},
    })
    expect(portalFoundationSchema.safeParse(data).success).toBe(true)
  })
  it('renders instructions and required indicators with no save/upload/submit actions', () => {
    render(
      <Provider store={createAppStore()}>
        <MemoryRouter>
          <PortalFoundation data={portalFoundationSchema.parse(foundation())} />
        </MemoryRouter>
      </Provider>,
    )
    expect(
      screen.getByRole('heading', { name: 'Private client request' }),
    ).toBeVisible()
    expect(
      screen.getByRole('navigation', { name: 'Requested sections' }),
    ).toBeVisible()
    expect(
      screen.getByText('Describe your business in a few sentences.'),
    ).toBeVisible()
    expect(screen.getByText('Required', { exact: true })).toBeVisible()
    expect(screen.getByLabelText('Your response')).toBeDisabled()
    expect(
      screen.queryByRole('button', { name: /save|submit|upload/i }),
    ).not.toBeInTheDocument()
  })
  it('isolates cookie-only client reads and clears revoked client caches without signing out the agency', async () => {
    const store = createAppStore()
    const owner = accountFixtures()['owner@studio.example']
    store.dispatch(
      identityReceived({ user: owner.user, memberships: owner.memberships }),
    )
    store.dispatch(
      tokenReceived({ accessToken: 'synthetic-agency-token', expiresIn: 300 }),
    )
    let authorization: string | null = null
    let credentials = ''
    let refreshes = 0
    server.use(
      http.get(
        `http://localhost:5173/api/v1/client/projects/${projectId}/checklist`,
        ({ request }) => {
          authorization = request.headers.get('Authorization')
          credentials = request.credentials
          return HttpResponse.json(foundation())
        },
      ),
      http.post('http://localhost:5173/api/v1/auth/refresh', () => {
        refreshes++
        return HttpResponse.json({}, { status: 500 })
      }),
    )
    await store
      .dispatch(
        portalApi.endpoints.portalRead.initiate(
          `client/projects/${projectId}/checklist`,
          { subscribe: false },
        ),
      )
      .unwrap()
    expect(authorization).toBeNull()
    expect(credentials).toBe('include')
    server.use(
      http.get(
        `http://localhost:5173/api/v1/client/projects/${projectId}/checklist`,
        () =>
          HttpResponse.json(
            { code: 'CLIENT_ACCESS_UNAVAILABLE' },
            { status: 401 },
          ),
      ),
    )
    await store.dispatch(
      portalApi.endpoints.portalRead.initiate(
        `client/projects/${projectId}/checklist`,
        { forceRefetch: true, subscribe: false },
      ),
    )
    await waitFor(() =>
      expect(store.getState().clientAccess.blocked).toBe(true),
    )
    expect(store.getState().clientApi.queries).toEqual({})
    expect(store.getState().auth.user?.id).toBe(owner.user.id)
    expect(store.getState().auth.status).toBe('authenticated')
    expect(refreshes).toBe(0)
    store.dispatch(clientAccessEstablished())
    expect(store.getState().clientAccess.blocked).toBe(false)
  })
  it('treats a successful 204 client logout as success and clears protected client state', async () => {
    const store = createAppStore()
    server.use(
      http.post(
        'http://localhost:5173/api/v1/client-access/logout',
        () => new HttpResponse(null, { status: 204 }),
      ),
    )
    render(
      <Provider store={store}>
        <MemoryRouter>
          <PortalFoundation data={portalFoundationSchema.parse(foundation())} />
        </MemoryRouter>
      </Provider>,
    )
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Leave project' }))
    await waitFor(() =>
      expect(store.getState().clientAccess.blocked).toBe(true),
    )
  })
  it('captures a fresh email link on a hash-only navigation without remounting the access screen', async () => {
    render(
      <Provider store={createAppStore()}>
        <MemoryRouter
          initialEntries={['/client/access?projectId=' + projectId]}
        >
          <Link
            to={
              '/client/access?projectId=' +
              projectId +
              '#token=' +
              's'.repeat(43)
            }
          >
            Open new email link
          </Link>
          <ClientAccessPage />
        </MemoryRouter>
      </Provider>,
    )
    expect(
      screen.queryByRole('button', { name: 'Open my project' }),
    ).not.toBeInTheDocument()
    await userEvent
      .setup()
      .click(screen.getByRole('link', { name: 'Open new email link' }))
    expect(
      await screen.findByRole('button', {
        name: 'Open my project',
      }),
    ).toBeVisible()
    expect(screen.getByLabelText('Project ID')).toHaveValue(projectId)
  })
  it('offers client-specific expiry recovery without an agency sign-in redirect or raw server detail', () => {
    const message = errorMessage({
      status: 401,
      data: {
        code: 'CLIENT_ACCESS_UNAVAILABLE',
        detail: 'untrusted-private-value',
      },
    })
    expect(message).toContain('expired')
    expect(message).toContain('fresh link')
    expect(message).not.toContain('sign in')
    expect(message).not.toContain('untrusted-private-value')
  })
  it('does not render the previous project while a different project ID is being authorized', async () => {
    const other = '66666666-6666-4666-8666-666666666666'
    let release!: () => void
    let started!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const ready = new Promise<void>((resolve) => {
      started = resolve
    })
    server.use(
      http.get(
        `http://localhost:5173/api/v1/client/projects/${projectId}/checklist`,
        () => HttpResponse.json(foundation()),
      ),
      http.get(
        `http://localhost:5173/api/v1/client/projects/${other}/checklist`,
        async () => {
          started()
          await gate
          return HttpResponse.json({ code: 'NOT_FOUND' }, { status: 404 })
        },
      ),
    )
    render(
      <Provider store={createAppStore()}>
        <MemoryRouter initialEntries={['/client/projects/' + projectId]}>
          <Link to={'/client/projects/' + other}>Different project</Link>
          <Routes>
            <Route
              path="/client/projects/:projectId"
              element={<ClientProjectPage />}
            />
          </Routes>
        </MemoryRouter>
      </Provider>,
    )
    await screen.findByRole('heading', {
      name: 'Private client request',
    })
    await userEvent
      .setup()
      .click(screen.getByRole('link', { name: 'Different project' }))
    await ready
    try {
      expect(
        screen.queryByRole('heading', {
          name: 'Private client request',
        }),
      ).not.toBeInTheDocument()
    } finally {
      release()
    }
    await screen.findByRole('heading', {
      name: 'Let’s reconnect to your project',
    })
  })
})

describe('T15 persisted collection portal', () => {
  function collection(saved = false) {
    const data = foundation()
    Object.assign(data, {
      collection: true,
      capabilities: { canRespond: true },
    })
    Object.assign(data.sections[0].items[0], {
      canEdit: true,
      state: saved ? 'DRAFT' : 'NOT_STARTED',
      answer: saved
        ? {
            itemId: data.sections[0].items[0].id,
            value: { text: 'Restored from PostgreSQL' },
            version: 3,
            savedAt: '2026-10-30T00:00:00Z',
          }
        : null,
    })
    return collectionSchema.parse(data)
  }
  it('accepts client-visible feedback in a collected checklist without changing preview contracts', () => {
    const data = collection(true)
    data.sections[0].items[0].comments = [
      {
        id: '77777777-7777-4777-8777-777777777777',
        body: 'Please clarify your services.',
        authorDisplayName: 'Reviewer',
        createdAt: '2026-11-01T10:00:00Z',
        revisionId: null,
      },
    ]
    expect(
      collectionSchema.parse(data).sections[0].items[0].comments[0].body,
    ).toBe('Please clarify your services.')
  })
  it('renders acknowledged persisted answers and no future submit action', () => {
    clearPendingDrafts()
    const data = collection(true)
    render(
      <Provider store={createAppStore()}>
        <MemoryRouter>
          <CollectionPortal data={data} onRefresh={() => {}} />
        </MemoryRouter>
      </Provider>,
    )
    expect(screen.getByLabelText('Your response')).toHaveValue(
      'Restored from PostgreSQL',
    )
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
    expect(
      screen.queryByRole('button', { name: /Submit for review/ }),
    ).not.toBeInTheDocument()
    clearPendingDrafts()
  })
  it('saves through the existing client HTTP transport and announces server confirmation', async () => {
    clearPendingDrafts()
    let writes = 0
    const data = collection()
    server.use(
      http.put(
        '*/api/v1/client/projects/:p/items/:i/answer',
        async ({ request }) => {
          expect(request.headers.get('Authorization')).toBeNull()
          const body = (await request.json()) as {
            value: unknown
            expectedVersion: number
          }
          writes++
          return HttpResponse.json({
            answer: {
              itemId: data.sections[0].items[0].id,
              value: body.value,
              version: body.expectedVersion + 1,
              savedAt: '2026-10-30T00:00:00Z',
            },
            itemState: 'DRAFT',
          })
        },
      ),
    )
    render(
      <Provider store={createAppStore()}>
        <MemoryRouter>
          <CollectionPortal data={data} onRefresh={() => {}} />
        </MemoryRouter>
      </Provider>,
    )
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Your response'), 'A real draft')
    await user.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Saved at'),
    )
    expect(writes).toBe(1)
    expect(screen.getByLabelText('Your response')).toHaveValue('A real draft')
    clearPendingDrafts()
  })
  it('keeps read-only lifecycle fields disabled', () => {
    clearPendingDrafts()
    const data = collection(true)
    data.capabilities.canRespond = false
    data.sections[0].items[0].canEdit = false
    render(
      <Provider store={createAppStore()}>
        <MemoryRouter>
          <CollectionPortal data={data} onRefresh={() => {}} />
        </MemoryRouter>
      </Provider>,
    )
    expect(screen.getByLabelText('Your response')).toBeDisabled()
    expect(
      screen.queryByRole('button', { name: 'Save draft' }),
    ).not.toBeInTheDocument()
    clearPendingDrafts()
  })
})
