import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import Login from './pages/Login'

export default function App(): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check if user is already logged in
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    // Listen for login/logout events
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC' }}>
        <div style={{ fontSize: '14px', color: '#64748B' }}>Loading…</div>
      </div>
    )
  }

  if (!session) {
    return <Login />
  }

  // Logged in — main app goes here
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
          Welcome to Chapter Command Center
        </div>
        <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '24px' }}>
          Signed in as {session.user.email}
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          style={{ padding: '8px 20px', fontSize: '13px', background: '#1E3A8A', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          Sign Out
        </button>
      </div>
    </div>
  )
}
