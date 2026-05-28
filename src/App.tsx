import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import type { ID } from './lib/types'
import Login from './pages/Login'
import SetNewPassword from './pages/SetNewPassword'
import Dashboard from './pages/Dashboard'
import Negotiations from './pages/Negotiations'
import NegotiationDetail from './pages/NegotiationDetail'
import Grievances from './pages/Grievances'
import LocalUnions from './pages/LocalUnions'
import Members from './pages/Members'
import Documents from './pages/Documents'
import Settings from './pages/Settings'

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
      width: '232px',
      minHeight: '100vh',
      background: '#1E3A8A',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0
    }}>
      {/* Logo / App name */}
      <div style={{ padding: '28px 20px 22px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#B8952A', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px' }}>
          Chapter Command Center
        </div>
        <div style={{ fontSize: '13px', fontWeight: 400, color: 'rgba(255,255,255,0.55)', lineHeight: '1.3' }}>
          Association Management
        </div>
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: '16px 0' }}>
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
                color: isActive ? '#fff' : isHovered ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.65)',
                background: isActive ? 'rgba(184,149,42,0.15)' : isHovered ? 'rgba(255,255,255,0.06)' : 'transparent',
                border: 'none',
                borderLeft: isActive ? '3px solid #B8952A' : '3px solid transparent',
                cursor: 'pointer',
                transition: 'background 0.15s, color 0.15s',
                boxSizing: 'border-box'
              }}
            >
              {item.label}
            </button>
          )
        })}
      </nav>

      {/* Sign out */}
      <div style={{ padding: '20px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <button
          onClick={onSignOut}
          onMouseEnter={() => setHoveredSignOut(true)}
          onMouseLeave={() => setHoveredSignOut(false)}
          style={{
            fontSize: '12px',
            color: hoveredSignOut ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)',
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

function PageContent({ page, onNavigate, selectedNegotiationId, setSelectedNegotiationId }: {
  page: Page
  onNavigate: (page: Page) => void
  selectedNegotiationId: ID | null
  setSelectedNegotiationId: (id: ID | null) => void
}): React.JSX.Element {
  switch (page) {
    case 'dashboard':    return <Dashboard onNavigate={onNavigate} />
    case 'negotiations':
      if (selectedNegotiationId !== null) {
        return (
          <NegotiationDetail
            negotiationId={selectedNegotiationId}
            onBack={() => setSelectedNegotiationId(null)}
          />
        )
      }
      return (
        <Negotiations
          onOpenNegotiation={(id) => setSelectedNegotiationId(id)}
          onNavigateToLocalUnions={() => onNavigate('local-unions')}
        />
      )
    case 'grievances':   return <Grievances />
    case 'local-unions': return <LocalUnions />
    case 'members':      return <Members />
    case 'documents':    return <Documents />
    case 'settings':     return <Settings />
  }
}


export default function App(): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState<Page>('dashboard')
  const [selectedNegotiationId, setSelectedNegotiationId] = useState<ID | null>(null)
  const [isRecovery, setIsRecovery] = useState(false)

  function handleNavigate(p: Page) {
    if (p !== 'negotiations') setSelectedNegotiationId(null)
    setPage(p)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovery(true)
      } else {
        setIsRecovery(false)
      }
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

  if (isRecovery) {
    return <SetNewPassword onDone={() => setIsRecovery(false)} />
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar
        active={page}
        onNavigate={handleNavigate}
        onSignOut={() => supabase.auth.signOut()}
      />
      <main style={{ flex: 1, background: '#F8FAFC', overflowY: 'auto' }}>
        <PageContent
          page={page}
          onNavigate={handleNavigate}
          selectedNegotiationId={selectedNegotiationId}
          setSelectedNegotiationId={setSelectedNegotiationId}
        />
      </main>
    </div>
  )
}
