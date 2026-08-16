import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Build: 2026-08-16
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
