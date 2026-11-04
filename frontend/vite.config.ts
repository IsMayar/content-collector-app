import { fileURLToPath, URL } from 'node:url'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    define: {
      'import.meta.env.VITE_ENABLE_MOCKS': JSON.stringify(
        command === 'serve' &&
          (mode === 'mock' || env.VITE_ENABLE_MOCKS === 'true')
          ? 'true'
          : 'false',
      ),
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'private-page-security',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (!req.url?.startsWith('/api/')) {
              res.setHeader('X-Frame-Options', 'DENY')
              res.setHeader('Content-Security-Policy', "frame-ancestors 'none'")
              res.setHeader('Referrer-Policy', 'no-referrer')
            }
            next()
          })
        },
        configurePreviewServer(server) {
          server.middlewares.use((req, res, next) => {
            if (!req.url?.startsWith('/api/')) {
              res.setHeader('X-Frame-Options', 'DENY')
              res.setHeader('Content-Security-Policy', "frame-ancestors 'none'")
              res.setHeader('Referrer-Policy', 'no-referrer')
            }
            next()
          })
        },
      },
    ],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      watch: { ignored: ['**/.artifacts/**'] },
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8080',
          changeOrigin: true,
        },
      },
    },
    test: {
      include: ['tests/unit/**/*.test.{ts,tsx}'],
      environment: 'jsdom',
      setupFiles: ['./tests/unit/setup.ts'],
      environmentOptions: { jsdom: { url: 'http://localhost:5173/' } },
      restoreMocks: true,
    },
  }
})
