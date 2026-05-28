import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ToastProvider } from './lib/toast'
import { UserSettingsProvider } from './lib/useUserSettings'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <UserSettingsProvider>
        <App />
      </UserSettingsProvider>
    </ToastProvider>
  </StrictMode>,
)
