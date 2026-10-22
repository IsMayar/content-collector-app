import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { Me, TokenResponse } from '@/api/types'

export interface AuthState {
  status: 'loading' | 'authenticated' | 'anonymous' | 'error'
  accessToken: string | null
  expiresAt: number
  user: Me['user'] | null
  memberships: Me['memberships']
  workspaceId: string | null
  generation: number
}
const initialState: AuthState = {
  status: 'loading',
  accessToken: null,
  expiresAt: 0,
  user: null,
  memberships: [],
  workspaceId: null,
  generation: 0,
}
const slice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
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
      return {
        ...initialState,
        status: 'anonymous',
        generation: state.generation + 1,
      }
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
  tokenReceived,
  identityReceived,
  signedOut,
  bootstrapFailed,
  bootstrapStarted,
  workspaceSelected,
} = slice.actions
export default slice.reducer
