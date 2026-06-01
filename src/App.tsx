import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, authCallbackType } from './lib/supabase'
import { useUserSettings } from './lib/useUserSettings'
import type { Chapter, ID } from './lib/types'
import Login from './pages/Login'
import SetNewPassword from './pages/SetNewPassword'
import ProfileCompletion from './pages/ProfileCompletion'
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

// Sidebar role badge palette. The sidebar is dark navy so we use translucent
// pastels here rather than the page-level ROLE_COLORS that assume a white
// background.
const SIDEBAR_ROLE_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  admin: { bg: 'rgba(248, 113, 113, 0.18)', color: '#fecaca', label: 'Admin' },
  user:  { bg: 'rgba(255,255,255,0.10)',    color: 'rgba(255,255,255,0.75)', label: 'User' },
}

// Icon abbreviations shown in the collapsed sidebar strip.
const NAV_ICONS: Record<string, React.JSX.Element> = {
  dashboard: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  ),
  negotiations: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
  ),
  grievances: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  ),
  'local-unions': (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  members: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
    </svg>
  ),
  documents: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  settings: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
    </svg>
  ),
  'admin-users': (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
}

function Sidebar({ active, onNavigate, onSignOut, collapsed, onToggleCollapse }: {
  active: Page
  onNavigate: (page: Page) => void
  onSignOut: () => void
  collapsed: boolean
  onToggleCollapse: () => void
}): React.JSX.Element {
  const [hoveredItem, setHoveredItem] = useState<Page | null>(null)
  const [hoveredSignOut, setHoveredSignOut] = useState(false)
  const { isAdmin } = useUserSettings()

  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin)

  if (collapsed) {
    return (
      <div style={{
        width: '56px',
        minHeight: '100vh',
        background: '#1E3A8A',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        alignItems: 'center',
        transition: 'width 0.2s'
      }}>
        {/* Expand toggle */}
        <button
          onClick={onToggleCollapse}
          aria-label="Expand sidebar"
          title="Expand sidebar"
          style={{ marginTop: '18px', marginBottom: '10px', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', padding: '6px', borderRadius: '6px' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>

        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', paddingTop: '6px', width: '100%' }}>
          {visibleItems.map((item) => {
            const isActive = active === item.id
            const isHovered = hoveredItem === item.id
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                onMouseEnter={() => setHoveredItem(item.id)}
                onMouseLeave={() => setHoveredItem(null)}
                aria-label={item.label}
                title={item.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '40px',
                  height: '40px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  color: isActive ? '#fff' : isHovered ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)',
                  background: isActive ? 'rgba(184,149,42,0.2)' : isHovered ? 'rgba(255,255,255,0.08)' : 'transparent',
                  outline: isActive ? '2px solid rgba(184,149,42,0.4)' : 'none',
                  transition: 'background 0.15s, color 0.15s'
                }}
              >
                {NAV_ICONS[item.id]}
              </button>
            )
          })}
        </nav>

        {/* Sign out icon */}
        <button
          onClick={onSignOut}
          aria-label="Sign out"
          title="Sign out"
          style={{
            margin: '14px 0 18px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: hoveredSignOut ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)',
            padding: '6px',
            borderRadius: '6px',
            transition: 'color 0.15s'
          }}
          onMouseEnter={() => setHoveredSignOut(true)}
          onMouseLeave={() => setHoveredSignOut(false)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div style={{
      width: '232px',
      minHeight: '100vh',
      background: '#1E3A8A',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      transition: 'width 0.2s'
    }}>
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#B8952A', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px' }}>
            Chapter Command Center
          </div>
          <div style={{ fontSize: '13px', fontWeight: 400, color: 'rgba(255,255,255,0.55)', lineHeight: '1.3' }}>
            Association Management
          </div>
        </div>
        <button
          onClick={onToggleCollapse}
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
          style={{ flexShrink: 0, marginTop: '2px', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', padding: '4px', borderRadius: '4px', transition: 'color 0.15s' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
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

      <div style={{ padding: '14px 20px 18px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <SidebarUserCard />
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
            marginTop: '14px',
            transition: 'color 0.15s'
          }}
        >
          Sign Out
        </button>
      </div>
    </div>
  )
}

// Compact identity card in the sidebar footer: display name (or email
// fallback), role badge, and the chapter the user is currently scoped to.
// For non-admins this is their assigned chapter; for admins it's whatever
// the AdminChapterSwitcher has selected (or "All Chapters").
function SidebarUserCard(): React.JSX.Element {
  const { settings, isAdmin, effectiveChapterId } = useUserSettings()
  // Cache the most recent fetch keyed by the chapter id it was for. Renderers
  // only use `cached.name` when `cached.forId === effectiveChapterId`; that
  // lets us avoid a setState-on-mismatch (which the React 19 lint rule
  // disallows inside effect bodies).
  const [cached, setCached] = useState<{ forId: ID; name: string | null } | null>(null)

  useEffect(() => {
    if (!effectiveChapterId) return
    const targetId = effectiveChapterId
    let cancelled = false
    void supabase
      .from('chapters')
      .select('name')
      .eq('id', targetId)
      .single()
      .then(({ data }) => {
        if (cancelled) return
        setCached({ forId: targetId, name: data?.name ?? null })
      })
    return () => { cancelled = true }
  }, [effectiveChapterId])

  if (!settings) return <></>

  const displayName = settings.display_name?.trim() || settings.email || 'Signed in'
  const role = settings.role ?? 'user'
  const badge = SIDEBAR_ROLE_BADGE[role] ?? SIDEBAR_ROLE_BADGE.user
  const chapterName = cached && cached.forId === effectiveChapterId ? cached.name : null
  const chapterDisplay = effectiveChapterId
    ? (chapterName ?? '(loading…)')
    : (isAdmin ? 'All chapters' : 'No chapter assigned')

  return (
    <div>
      <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={displayName}>
        {displayName}
      </div>
      <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        <span style={{
          fontSize: '10px', fontWeight: 600, padding: '2px 8px',
          borderRadius: '20px', background: badge.bg, color: badge.color,
          textTransform: 'uppercase', letterSpacing: '0.04em',
        }}>
          {badge.label}
        </span>
      </div>
      <div style={{ marginTop: '6px', fontSize: '11px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={chapterDisplay}>
        {chapterDisplay}
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('sidebarCollapsed')
      if (stored !== null) return stored === 'true'
    } catch { /* ignore */ }
    return window.innerWidth < 900
  })
  // Forces the SetNewPassword screen. Set for both recovery (forgot-password)
  // and invite (first-time accept) flows. We seed it from a snapshot taken in
  // lib/supabase.ts *before* the SDK consumed the URL hash; PASSWORD_RECOVERY
  // events also flip it on (e.g. when a recovery link arrives after mount).
  const initialCallback = authCallbackType()
  const [mustSetPassword, setMustSetPassword] = useState<boolean>(initialCallback !== null)
  const [callbackKind, setCallbackKind] = useState<'invite' | 'recovery' | null>(initialCallback)
  const { loading: settingsLoading, error: settingsError, isAdmin, needsOnboarding, needsProfileCompletion } = useUserSettings()

  function handleNavigate(p: Page) {
    if (p !== 'negotiations') setSelectedNegotiationId(null)
    setPage(p)
  }

  function handleToggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev
      try { localStorage.setItem('sidebarCollapsed', String(next)) } catch { /* ignore */ }
      return next
    })
  }

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, sess) => {
      // PASSWORD_RECOVERY fires when the SDK finishes exchanging a recovery
      // token. Invite acceptance fires SIGNED_IN — that path is covered by
      // the module-load snapshot in lib/supabase.ts.
      if (event === 'PASSWORD_RECOVERY') {
        setMustSetPassword(true)
        setCallbackKind('recovery')
      }
      setSession(sess)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  // Once the invite/recovery session is established, scrub the auth tokens
  // from the URL so a refresh doesn't re-trigger the screen and the bookmark
  // bar stays clean. We wait until we actually have a session so the SDK has
  // finished its own hash consumption.
  useEffect(() => {
    if (session && window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }, [session])

  // If the user landed here from an invite or recovery link, hold on the
  // loading screen until the SDK has finished exchanging the hash tokens for
  // a real session. Otherwise the `!session` branch below would briefly flash
  // the Login page in between hash detection and SIGNED_IN.
  if (mustSetPassword && !session) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC' }}>
        <div style={{ fontSize: '14px', color: '#64748B' }}>Setting up your account…</div>
      </div>
    )
  }

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

  if (mustSetPassword) {
    return (
      <SetNewPassword
        mode={callbackKind === 'invite' ? 'invite' : 'reset'}
        onDone={() => { setMustSetPassword(false); setCallbackKind(null) }}
      />
    )
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

  // First-time post-invite gate: collect display name, job title, contact
  // info. Stays up until profile_completed flips true (or the user clicks
  // "Skip for now"). Admins go through this too.
  if (needsProfileCompletion) {
    return <ProfileCompletion />
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
        collapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleSidebar}
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
