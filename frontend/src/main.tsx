import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { LocaleProvider } from './i18n/LocaleProvider'
import { ThemeProvider } from './theme/ThemeProvider'
import { ToastProvider } from './components/Toast'
import { InstallPrompt } from './pwa/InstallPrompt'
import { registerSW } from './pwa/registerSW'

registerSW()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <LocaleProvider>
        <ToastProvider>
          <App />
          <InstallPrompt />
        </ToastProvider>
      </LocaleProvider>
    </ThemeProvider>
  </StrictMode>,
)
