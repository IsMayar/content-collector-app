import type {
  AuthState,
  Me,
  TokenResponse,
} from '@/features/auth/types/auth.types'
import type { PayloadAction } from '@reduxjs/toolkit'
import { createSlice } from '@reduxjs/toolkit'

const initialState: AuthState = {
  status: 'loading',
  accessToken: null,
  expiresAt: 0,
  user: null,
  memberships: [],
  workspaceId: null,
  generation: 0,
}
const anonymousState = (generation: number): AuthState => ({
  ...initialState,
  status: 'anonymous',
  generation: generation + 1,
})
const slice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    accessRejected() {},
    tokenReceived(state, { payload }: PayloadAction<TokenResponse>) {
      state.accessToken = payload.accessToken
      state.expiresAt = Date.now() + payload.expiresIn * 1000
    },
    identityReceived(state, { payload }: PayloadAction<Me>) {
      state.status = 'authenticated'
      state.user = payload.user
      state.memberships = payload.memberships
      if (!payload.memberships.some((m) => m.workspaceId === state.workspaceId))
        state.workspaceId = payload.memberships[0]?.workspaceId ?? null
    },
    signedOut(state) {
      return anonymousState(state.generation)
    },
    anonymousBootstrap(state) {
      return anonymousState(state.generation)
    },
    bootstrapFailed(state) {
      state.status = 'error'
    },
    bootstrapStarted(state) {
      state.status = 'loading'
    },
    workspaceSelected(state, { payload }: PayloadAction<string>) {
      if (state.memberships.some((m) => m.workspaceId === payload))
        state.workspaceId = payload
    },
  },
})
export const {
  accessRejected,
  tokenReceived,
  identityReceived,
  signedOut,
  anonymousBootstrap,
  bootstrapFailed,
  bootstrapStarted,
  workspaceSelected,
} = slice.actions
export default slice.reducer
