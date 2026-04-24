import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Negotiations from './pages/Negotiations'

type Page = 'dashboard' | 'negotiations' | 'grievances' | 'local-unions' | 'members' | 'documents' | 'settings'

const NAV_ITEMS: { id: Page; label: string }[] = [
  { id: 'dashboard',    label: 'Home' },
  { id: 'negotiations', label: 'Negotiation Tracker' },
  { id: 'grievances',   label: 'Grievances' },
  { id: 'local-unions', label: 'Local Unions' },
  { id: 'members',      label: 'Member Hub' },
  { id: 'documents',    label: 'Documents Vault' },
  { id: 'settings',     label: 'Settings' },
]

function Sidebar({ active, onNavigate, onSignOut }: {
  active: Page
  onNavigate: (page: Page) => void
  onSignOut: () => void
}): React.JSX.Element {
  const [hoveredItem, setHoveredItem] = useState<Page | null>(null)
  const [hoveredSignOut, setHoveredSignOut] = useState(false)

  return (
    <div style={{
      width: '220px',
      minHeight: '100vh',
      background: '#1E3A8A',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0
    }}>
      {/* Logo / App name */}
      <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', lineHeight: '1.3' }}>
          Chapter Command Center
        </div>
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: '12px 0' }}>
        {NAV_ITEMS.map((item) => {
          const isActive = active === item.id
          const isHovered = hoveredItem === item.id
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '10px 20px',
                fontSize: '13px',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? '#fff' : 'rgba(255,255,255,0.75)',
                background: isActive ? 'rgba(255,255,255,0.15)' : isHovered ? 'rgba(255,255,255,0.08)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                transition: 'background 0.15s'
              }}
            >
              {item.label}
            </button>
          )
        })}
      </nav>

      {/* Sign out */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <button
          onClick={onSignOut}
          onMouseEnter={() => setHoveredSignOut(true)}
          onMouseLeave={() => setHoveredSignOut(false)}
          style={{
            fontSize: '12px',
            color: hoveredSignOut ? '#fff' : 'rgba(255,255,255,0.5)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            transition: 'color 0.15s'
          }}
        >
          Sign Out
        </button>
      </div>
    </div>
  )
}

function PageContent({ page, onNavigate }: { page: Page; onNavigate: (page: Page) => void }): React.JSX.Element {
  switch (page) {
    case 'dashboard':    return <Dashboard />
    case 'negotiations': return <Negotiations onOpenNegotiation={(id) => console.log('open', id)} onNavigateToLocalUnions={() => onNavigate('local-unions')} />
    case 'grievances':   return <PlaceholderPage title="Grievances" />
    case 'local-unions': return <PlaceholderPage title="Local Unions" />
    case 'members':      return <PlaceholderPage title="Member Hub" />
    case 'documents':    return <PlaceholderPage title="Documents Vault" />
    case 'settings':     return <PlaceholderPage title="Settings" />
  }
}

function PlaceholderPage({ title }: { title: string }): React.JSX.Element {
  return (
    <div style={{ padding: '32px' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>{title}</h1>
      <p style={{ fontSize: '13px', color: '#64748B' }}>Coming soon.</p>
    </div>
  )
}

export default function App(): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState<Page>('dashboard')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

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

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar
        active={page}
        onNavigate={setPage}
        onSignOut={() => supabase.auth.signOut()}
      />
      <main style={{ flex: 1, background: '#F8FAFC', overflowY: 'auto' }}>
        <PageContent page={page} onNavigate={setPage} />
      </main>
    </div>
  )
}
