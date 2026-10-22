import { fileURLToPath, URL } from 'node:url'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode, command }) => {
 const env = loadEnv(mode, process.cwd(), 'VITE_')
 return {
  define: { 'import.meta.env.VITE_ENABLE_MOCKS': JSON.stringify(command === 'serve' && (mode === 'mock' || env.VITE_ENABLE_MOCKS === 'true') ? 'true' : 'false') },
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173, strictPort: true, proxy: { '/api': { target: env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8080', changeOrigin: true } } },
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], environmentOptions: { jsdom: { url: 'http://localhost:5173/' } }, restoreMocks: true },
 }
})
