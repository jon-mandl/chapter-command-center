import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ToastProvider } from './lib/toast'
import { UserSettingsProvider } from './lib/useUserSettings'
import { ErrorBoundary } from './components/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <UserSettingsProvider>
          <App />
        </UserSettingsProvider>
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
)
