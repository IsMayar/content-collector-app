export const env = {
  production: import.meta.env.PROD,
  test: import.meta.env.MODE === 'test',
  development: import.meta.env.DEV,
  mocksEnabled:
    import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCKS === 'true',
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '/api/v1/',
} as const
