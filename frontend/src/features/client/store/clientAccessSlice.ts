import { createSlice } from '@reduxjs/toolkit'
const slice = createSlice({
  name: 'clientAccess',
  initialState: { blocked: false },
  reducers: {
    clientAccessEstablished: () => ({ blocked: false }),
    clientAccessUnavailable: () => ({ blocked: true }),
  },
})
export const { clientAccessEstablished, clientAccessUnavailable } =
  slice.actions
export default slice.reducer
