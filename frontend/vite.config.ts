import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// Set HTTPS=1 to serve dev / preview over a self-signed cert. Required for
// testing the service worker and `beforeinstallprompt` on a real phone,
// since PWA features are gated to secure origins.
const useHttps = process.env.HTTPS === '1' || process.env.HTTPS === 'true'

export default defineConfig({
  plugins: [react(), ...(useHttps ? [basicSsl()] : [])],
  server: {
    // Proxy /api and /tiles to the running compose stack on :80 so the dev
    // server matches the prod URL layout. Run `docker compose up -d` first;
    // then `npm run dev` for HMR on http://localhost:5173.
    proxy: {
      '/api':   { target: 'http://localhost:80', changeOrigin: true },
      '/tiles': { target: 'http://localhost:80', changeOrigin: true }
    }
  },
  preview: {
    proxy: {
      '/api':   { target: 'http://localhost:80', changeOrigin: true },
      '/tiles': { target: 'http://localhost:80', changeOrigin: true }
    }
  }
})
