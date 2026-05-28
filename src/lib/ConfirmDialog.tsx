import { useEffect, useRef } from 'react'
import { btnSecondary, btnDanger } from './ui'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  destructive = true,
  busy = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps): React.JSX.Element | null {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    confirmRef.current?.focus()
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel() }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px'
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '10px',
          maxWidth: '420px',
          width: '100%',
          padding: '24px 26px',
          boxShadow: '0 12px 40px rgba(15, 23, 42, 0.2)'
        }}
      >
        <div id="confirm-dialog-title" style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
          {title}
        </div>
        <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.55, marginBottom: '22px' }}>
          {message}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button style={btnSecondary} onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button
            ref={confirmRef}
            style={{
              ...(destructive ? btnDanger : btnSecondary),
              background: destructive ? '#dc2626' : '#1E3A8A',
              color: '#fff',
              border: 'none',
              opacity: busy ? 0.6 : 1,
              cursor: busy ? 'wait' : 'pointer'
            }}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
