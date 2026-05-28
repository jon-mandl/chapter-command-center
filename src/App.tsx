import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { useUserSettings } from './lib/useUserSettings'
import type { Chapter, ID } from './lib/types'
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
import AdminUsers from './pages/AdminUsers'

type Page =
  | 'dashboard'
  | 'negotiations'
  | 'grievances'
  | 'local-unions'
  | 'members'
  | 'documents'
  | 'settings'
  | 'admin-users'

interface NavItem { id: Page; label: string; adminOnly?: boolean }

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard',    label: 'Home' },
  { id: 'negotiations', label: 'Negotiation Tracker' },
  { id: 'grievances',   label: 'Grievances' },
  { id: 'local-unions', label: 'Local Unions' },
  { id: 'members',      label: 'Member Hub' },
  { id: 'documents',    label: 'Documents Vault' },
  { id: 'settings',     label: 'Settings' },
  { id: 'admin-users',  label: 'User Management', adminOnly: true }
]

function Sidebar({ active, onNavigate, onSignOut }: {
  active: Page
  onNavigate: (page: Page) => void
  onSignOut: () => void
}): React.JSX.Element {
  const [hoveredItem, setHoveredItem] = useState<Page | null>(null)
  const [hoveredSignOut, setHoveredSignOut] = useState(false)
  const { isAdmin } = useUserSettings()

  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin)

  return (
    <div style={{
      width: '232px',
      minHeight: '100vh',
      background: '#1E3A8A',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0
    }}>
      <div style={{ padding: '28px 20px 22px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#B8952A', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px' }}>
          Chapter Command Center
        </div>
        <div style={{ fontSize: '13px', fontWeight: 400, color: 'rgba(255,255,255,0.55)', lineHeight: '1.3' }}>
          Association Management
        </div>
      </div>

      {isAdmin && <AdminChapterSwitcher />}

      <nav style={{ flex: 1, padding: '16px 0' }}>
        {visibleItems.map((item) => {
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

// Admin-only "view as" chapter selector. Sits at the top of the sidebar so
// admins can scope the whole app's queries to a single chapter (matching what
// that chapter's staff would see) or back out to "All Chapters" to see
// everything across the system. RLS allows admins to read all chapters.
function AdminChapterSwitcher(): React.JSX.Element {
  const { adminViewChapterId, setAdminViewChapterId } = useUserSettings()
  const [chapters, setChapters] = useState<Chapter[]>([])

  useEffect(() => {
    let cancelled = false
    void supabase
      .from('chapters')
      .select('*')
      .order('name')
      .then(({ data }) => {
        if (cancelled) return
        setChapters((data ?? []) as Chapter[])
      })
    return () => { cancelled = true }
  }, [])

  return (
    <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
      <div style={{ fontSize: '10px', fontWeight: 600, color: '#B8952A', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>
        Viewing as
      </div>
      <select
        value={adminViewChapterId ?? ''}
        onChange={(e) => setAdminViewChapterId(e.target.value ? (e.target.value as ID) : null)}
        aria-label="Filter view to a chapter"
        style={{
          width: '100%',
          padding: '6px 8px',
          fontSize: '12px',
          background: 'rgba(255,255,255,0.08)',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: '6px',
          outline: 'none',
          cursor: 'pointer'
        }}
      >
        <option value="" style={{ color: '#0F172A' }}>All Chapters</option>
        {chapters.map((c) => (
          <option key={c.id} value={c.id} style={{ color: '#0F172A' }}>{c.name}</option>
        ))}
      </select>
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
    case 'admin-users':  return <AdminUsers />
  }
}

// Shown after login while we wait for an admin to assign this account to a
// chapter. No self-service chapter picker by design — admins assign chapters.
function PendingAssignment({ onSignOut }: { onSignOut: () => void }): React.JSX.Element {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', padding: '24px' }}>
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '36px 40px', maxWidth: '440px', width: '100%', boxShadow: '0 4px 16px rgba(15, 23, 42, 0.06)' }}>
        <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '18px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
        </div>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', margin: '0 0 8px' }}>Pending chapter assignment</h1>
        <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6, margin: '0 0 20px' }}>
          Your account has been created, but an administrator needs to assign you to a chapter before
          you can use the app. This usually takes a short time.
        </p>
        <p style={{ fontSize: '12px', color: '#94A3B8', margin: '0 0 24px' }}>
          You can leave this page open and refresh once you've been notified that you're set up.
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 600, background: '#1E3A8A', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
          >
            Refresh
          </button>
          <button
            onClick={onSignOut}
            style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 500, background: '#fff', color: '#0F172A', border: '1px solid #CBD5E1', borderRadius: '6px', cursor: 'pointer' }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}

export default function App(): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [page, setPage] = useState<Page>('dashboard')
  const [selectedNegotiationId, setSelectedNegotiationId] = useState<ID | null>(null)
  const [isRecovery, setIsRecovery] = useState(false)
  const { loading: settingsLoading, error: settingsError, isAdmin, needsOnboarding } = useUserSettings()

  function handleNavigate(p: Page) {
    if (p !== 'negotiations') setSelectedNegotiationId(null)
    setPage(p)
  }

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, sess) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovery(true)
      } else {
        setIsRecovery(false)
      }
      setSession(sess)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  if (authLoading) {
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

  // user_settings is being fetched. Without it we don't yet know the user's
  // role and can't safely render the shell.
  if (settingsLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC' }}>
        <div style={{ fontSize: '14px', color: '#64748B' }}>Loading…</div>
      </div>
    )
  }

  if (settingsError) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', padding: '24px' }}>
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '20px 24px', maxWidth: '440px', color: '#b91c1c', fontSize: '13px' }}>
          {settingsError}
        </div>
      </div>
    )
  }

  // Non-admin user without a chapter waits for assignment. Admins always
  // bypass this gate because they can operate across chapters.
  if (needsOnboarding) {
    return <PendingAssignment onSignOut={() => supabase.auth.signOut()} />
  }

  // If a non-admin manages to navigate to an admin-only page (e.g. via stale
  // state after a role demotion), kick them back to the dashboard.
  const effectivePage: Page = page === 'admin-users' && !isAdmin ? 'dashboard' : page

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar
        active={effectivePage}
        onNavigate={handleNavigate}
        onSignOut={() => supabase.auth.signOut()}
      />
      <main style={{ flex: 1, background: '#F8FAFC', overflowY: 'auto' }}>
        <PageContent
          page={effectivePage}
          onNavigate={handleNavigate}
          selectedNegotiationId={selectedNegotiationId}
          setSelectedNegotiationId={setSelectedNegotiationId}
        />
      </main>
    </div>
  )
}
