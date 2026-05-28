import { useState } from 'react'
import { supabase } from '../lib/supabase'

type Mode = 'login' | 'signup' | 'reset'

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

const submitBtn = (disabled: boolean): React.CSSProperties => ({
  width: '100%',
  padding: '10px',
  fontSize: '14px',
  fontWeight: 600,
  background: disabled ? '#93afd4' : '#1E3A8A',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  cursor: disabled ? 'not-allowed' : 'pointer',
})

const linkBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  fontSize: '13px',
  color: '#1E3A8A',
  cursor: 'pointer',
  textDecoration: 'underline',
}

const errorBox: React.CSSProperties = {
  background: '#fef2f2',
  border: '1px solid #fecaca',
  borderRadius: '6px',
  padding: '10px 14px',
  marginBottom: '16px',
  fontSize: '13px',
  color: '#dc2626',
}

const successBox: React.CSSProperties = {
  background: '#f0fdf4',
  border: '1px solid #bbf7d0',
  borderRadius: '6px',
  padding: '10px 14px',
  marginBottom: '16px',
  fontSize: '13px',
  color: '#15803d',
}

export default function Login(): React.JSX.Element {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function switchMode(next: Mode): void {
    setMode(next)
    setError(null)
    setSuccess(null)
    setPassword('')
    setConfirmPassword('')
  }

  async function handleLogin(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) setError(err.message)
    setLoading(false)
  }

  async function handleSignUp(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    setLoading(true)
    setError(null)
    const { error: err } = await supabase.auth.signUp({ email, password })
    if (err) {
      setError(err.message)
    } else {
      setSuccess('Account created. Check your email to confirm before signing in.')
      setPassword('')
      setConfirmPassword('')
    }
    setLoading(false)
  }

  async function handleReset(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    if (err) {
      setError(err.message)
    } else {
      setSuccess('Password reset email sent. Check your inbox.')
    }
    setLoading(false)
  }

  const titles: Record<Mode, { heading: string; sub: string }> = {
    login:  { heading: 'Chapter Command Center', sub: 'Sign in to your account' },
    signup: { heading: 'Create an Account',      sub: 'Join Chapter Command Center' },
    reset:  { heading: 'Reset Password',         sub: 'Enter your email to receive a reset link' },
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC' }}>
      <div style={{
        background: '#fff',
        border: '1px solid #E2E8F0',
        borderRadius: '10px',
        padding: '40px 48px',
        width: '100%',
        maxWidth: '400px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      }}>
        <div style={{ marginBottom: '28px', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>
            {titles[mode].heading}
          </div>
          <div style={{ fontSize: '13px', color: '#64748B' }}>
            {titles[mode].sub}
          </div>
        </div>

        {/* ── Login ── */}
        {mode === 'login' && (
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={fieldStyle}
              />
            </div>

            <div style={{ marginBottom: '8px' }}>
              <label style={labelStyle}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                style={fieldStyle}
              />
            </div>

            <div style={{ textAlign: 'right', marginBottom: '20px' }}>
              <button type="button" style={linkBtn} onClick={() => switchMode('reset')}>
                Forgot password?
              </button>
            </div>

            {error && <div style={errorBox}>{error}</div>}

            <button type="submit" disabled={loading} style={submitBtn(loading)}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>

            <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '13px', color: '#64748B' }}>
              Don't have an account?{' '}
              <button type="button" style={linkBtn} onClick={() => switchMode('signup')}>
                Sign up
              </button>
            </div>
          </form>
        )}

        {/* ── Sign Up ── */}
        {mode === 'signup' && (
          <form onSubmit={handleSignUp}>
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={fieldStyle}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
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

            {error && <div style={errorBox}>{error}</div>}
            {success && <div style={successBox}>{success}</div>}

            {!success && (
              <button type="submit" disabled={loading} style={submitBtn(loading)}>
                {loading ? 'Creating account…' : 'Create Account'}
              </button>
            )}

            <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '13px', color: '#64748B' }}>
              Already have an account?{' '}
              <button type="button" style={linkBtn} onClick={() => switchMode('login')}>
                Sign in
              </button>
            </div>
          </form>
        )}

        {/* ── Reset Password ── */}
        {mode === 'reset' && (
          <form onSubmit={handleReset}>
            <div style={{ marginBottom: '24px' }}>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={fieldStyle}
              />
            </div>

            {error && <div style={errorBox}>{error}</div>}
            {success && <div style={successBox}>{success}</div>}

            {!success && (
              <button type="submit" disabled={loading} style={submitBtn(loading)}>
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
            )}

            <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '13px', color: '#64748B' }}>
              <button type="button" style={linkBtn} onClick={() => switchMode('login')}>
                Back to sign in
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
