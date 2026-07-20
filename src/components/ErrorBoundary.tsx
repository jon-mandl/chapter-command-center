import { Component, type ReactNode } from 'react'
import { btnPrimary } from '../lib/ui'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

// Global crash guard. React requires a class component for error boundaries —
// there is no hook equivalent. Without this, any uncaught render error blanks
// the entire app; with it, the user gets a friendly message and a reload
// button. Wraps everything in main.tsx, including the context providers.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', padding: '24px' }}>
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '24px 28px', maxWidth: '480px' }}>
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#b91c1c', marginBottom: '8px' }}>
            Something went wrong
          </div>
          <div style={{ fontSize: '13px', color: '#7f1d1d', marginBottom: '16px', lineHeight: 1.5 }}>
            The app hit an unexpected error. Your data is safe — reloading
            usually fixes it. If this keeps happening, note what you were
            doing and contact support.
          </div>
          <div style={{ fontSize: '12px', color: '#991b1b', fontFamily: 'monospace', marginBottom: '16px', wordBreak: 'break-word' }}>
            {this.state.error.message}
          </div>
          <button style={btnPrimary} onClick={() => window.location.reload()}>
            Reload app
          </button>
        </div>
      </div>
    )
  }
}
