import { useState } from 'react'
import { supabase } from '../lib/supabase'

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  fontSize: '14px',
  border: '1px solid #CBD5E1',
  borderRadius: '6px',
  outline: 'none',
  color: '#0F172A',
  background: '#fff',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 500,
  color: '#0F172A',
  marginBottom: '6px',
}

// `mode` controls the copy only — both flows do the same thing under the hood
// (the user already has a session from the auth-callback exchange; we just
// call updateUser to set a password they can sign in with next time).
type SetNewPasswordMode = 'invite' | 'reset'

interface Props {
  onDone: () => void
  mode?: SetNewPasswordMode
}

export default function SetNewPassword({ onDone, mode = 'reset' }: Props): React.JSX.Element {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const isInvite = mode === 'invite'
  const heading = isInvite ? 'Welcome — set your password' : 'Set new password'
  const sub = isInvite
    ? "You've been invited to Chapter Command Center. Choose a password to finish setting up your account."
    : 'Choose a new password for your account.'
  const submitLabel = isInvite ? 'Create Password' : 'Set Password'
  const continueLabel = isInvite ? 'Continue to App' : 'Continue to App'

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setLoading(true)
    setError(null)
    const { error: err } = await supabase.auth.updateUser({ password })
    if (err) {
      setError(err.message)
    } else {
      setSuccess(true)
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC' }}>
      <div style={{
        background: '#fff',
        border: '1px solid #E2E8F0',
        borderRadius: '10px',
        padding: '40px 48px',
        width: '100%',
        maxWidth: '420px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      }}>
        <div style={{ marginBottom: '24px', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>
            {heading}
          </div>
          <div style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5 }}>
            {sub}
          </div>
        </div>

        {success ? (
          <div>
            <div style={{
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '6px',
              padding: '10px 14px',
              marginBottom: '20px',
              fontSize: '13px',
              color: '#15803d',
            }}>
              {isInvite ? 'Account ready. Welcome aboard.' : 'Password updated successfully.'}
            </div>
            <button
              onClick={onDone}
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '14px',
                fontWeight: 600,
                background: '#1E3A8A',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              {continueLabel}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>New Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                autoComplete="new-password"
                style={fieldStyle}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={labelStyle}>Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                style={fieldStyle}
              />
            </div>

            {error && (
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                padding: '10px 14px',
                marginBottom: '16px',
                fontSize: '13px',
                color: '#dc2626',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '14px',
                fontWeight: 600,
                background: loading ? '#93afd4' : '#1E3A8A',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Saving…' : submitLabel}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
