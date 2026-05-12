import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy /api and /tiles to the running compose stack on :80 so the dev
    // server matches the prod URL layout. Run `docker compose up -d` first;
    // then `npm run dev` for HMR on http://localhost:5173.
    proxy: {
      '/api':   { target: 'http://localhost:80', changeOrigin: true },
      '/tiles': { target: 'http://localhost:80', changeOrigin: true }
    }
  }
})
