import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'

type ToastVariant = 'success' | 'error' | 'info'

interface Toast {
  id: number
  message: string
  variant: ToastVariant
}

interface ToastContextValue {
  push: (message: string, variant?: ToastVariant) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const VARIANT_STYLES: Record<ToastVariant, { bg: string; border: string; color: string; icon: string }> = {
  success: { bg: '#f0fdf4', border: '#bbf7d0', color: '#15803d', icon: '✓' },
  error:   { bg: '#fef2f2', border: '#fecaca', color: '#b91c1c', icon: '!' },
  info:    { bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8', icon: 'i' }
}

export function ToastProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = nextId.current++
    setToasts((prev) => [...prev, { id, message, variant }])
    window.setTimeout(() => dismiss(id), variant === 'error' ? 6000 : 3500)
  }, [dismiss])

  const value: ToastContextValue = {
    push,
    success: (m) => push(m, 'success'),
    error:   (m) => push(m, 'error'),
    info:    (m) => push(m, 'info')
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          zIndex: 9999,
          pointerEvents: 'none'
        }}
      >
        {toasts.map((t) => {
          const s = VARIANT_STYLES[t.variant]
          return (
            <div
              key={t.id}
              role={t.variant === 'error' ? 'alert' : 'status'}
              style={{
                background: s.bg,
                border: `1px solid ${s.border}`,
                color: s.color,
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '13px',
                fontWeight: 500,
                boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
                minWidth: '240px',
                maxWidth: '420px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                pointerEvents: 'auto'
              }}
            >
              <span style={{ fontWeight: 700, flexShrink: 0 }}>{s.icon}</span>
              <span style={{ flex: 1, lineHeight: 1.4 }}>{t.message}</span>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                style={{
                  background: 'none',
                  border: 'none',
                  color: s.color,
                  cursor: 'pointer',
                  fontSize: '16px',
                  lineHeight: 1,
                  padding: 0,
                  opacity: 0.6
                }}
              >
                ×
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
