import { useEffect, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '../lib/supabase'
import { useOrg } from '../lib/useOrg'
import { formatDate } from '../lib/ui'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Negotiation {
  id: number
  name: string
  local_number: string | null
  bargaining_unit: string
  status: string
  contract_expiration_date: string | null
}

interface Grievance {
  id: number
  case_number: string
  employer_name: string
  company_id: number | null
  description: string
  date_filed: string
  status: string
}

interface HoursEntry {
  company_id: number
  year: number
  month: number
  hours: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const NEG_STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  Scheduling:  { bg: '#EEF2FF', color: '#4F46E5', border: '#C7D2FE' },
  Negotiating: { bg: '#f0fdf4', color: '#059669', border: '#bbf7d0' },
  Deadlocked:  { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  Closed:      { bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' }
}

const G_STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  filed:     { bg: '#fef2f2', color: '#dc2626' },
  lmc:       { bg: '#fff7ed', color: '#ea580c' },
  cir:       { bg: '#fefce8', color: '#ca8a04' },
  closed:    { bg: '#F8FAFC', color: '#64748B' },
  withdrawn: { bg: '#F8FAFC', color: '#64748B' }
}

const G_STATUS_LABEL: Record<string, string> = {
  filed: 'Filed', lmc: 'LMC', cir: 'CIR', closed: 'Closed', withdrawn: 'Withdrawn'
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard({ onNavigate }: { onNavigate: (page: 'negotiations' | 'grievances' | 'members' | 'local-unions' | 'documents') => void }): React.JSX.Element {
  const { orgId, loading: orgLoading } = useOrg()
  const [negotiations, setNegotiations] = useState<Negotiation[]>([])
  const [grievances, setGrievances] = useState<Grievance[]>([])
  const [companyNames, setCompanyNames] = useState<Record<number, string>>({})
  const [hoursEntries, setHoursEntries] = useState<HoursEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // Grievance filter
  const [gFilter, setGFilter] = useState<'current' | 'previous' | 'custom'>('current')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  // Hours chart filters
  const [hYear, setHYear] = useState<number>(new Date().getFullYear())
  const [hMonthFrom, setHMonthFrom] = useState(1)
  const [hMonthTo, setHMonthTo] = useState(12)
  const [hFiltersOpen, setHFiltersOpen] = useState(false)

  useEffect(() => {
    if (!orgId) return
    Promise.all([
      supabase.from('negotiations').select('id, name, local_number, bargaining_unit, status, contract_expiration_date').eq('org_id', orgId),
      supabase.from('grievances').select('id, case_number, employer_name, company_id, description, date_filed, status').eq('org_id', orgId),
      supabase.from('member_companies').select('id, company_name').eq('org_id', orgId),
      supabase.from('man_hours').select('company_id, year, month, hours').eq('org_id', orgId)
    ]).then(([negRes, grievRes, compRes, hoursRes]) => {
      if (negRes.error || grievRes.error) {
        setLoadError('Could not load dashboard data. Please refresh.')
      } else {
        setNegotiations((negRes.data as Negotiation[]) ?? [])
        setGrievances((grievRes.data as Grievance[]) ?? [])
        const nameMap: Record<number, string> = {}
        for (const c of (compRes.data ?? []) as { id: number; company_name: string }[]) {
          nameMap[c.id] = c.company_name
        }
        setCompanyNames(nameMap)
        setHoursEntries((hoursRes.data as HoursEntry[]) ?? [])
      }
      setLoading(false)
    })
  }, [orgId])

  // ─── Derived data ──────────────────────────────────────────────────────────

  const currentYear = new Date().getFullYear()
  const activeNegotiations = negotiations.filter((n) => n.status !== 'Closed')
  const recentNegotiations = [...negotiations].sort((a, b) => b.id - a.id).slice(0, 4)

  const activeGrievances = grievances.filter((g) => g.status !== 'closed' && g.status !== 'withdrawn')

  const filteredGrievances = (() => {
    if (gFilter === 'current') return grievances.filter((g) => g.date_filed?.startsWith(String(currentYear)))
    if (gFilter === 'previous') return grievances.filter((g) => g.date_filed?.startsWith(String(currentYear - 1)))
    if (gFilter === 'custom' && customStart && customEnd) return grievances.filter((g) => g.date_filed >= customStart && g.date_filed <= customEnd)
    return grievances
  })()

  const gTotal    = filteredGrievances.length
  const gFiled    = filteredGrievances.filter((g) => g.status === 'filed').length
  const gLmc      = filteredGrievances.filter((g) => g.status === 'lmc').length
  const gCir      = filteredGrievances.filter((g) => g.status === 'cir').length
  const gResolved = filteredGrievances.filter((g) => g.status === 'closed' || g.status === 'withdrawn').length

  // Upcoming contract expirations (within 180 days)
  const today = new Date()
  const soon = new Date(); soon.setDate(today.getDate() + 180)
  const expiringContracts = activeNegotiations.filter((n) => {
    if (!n.contract_expiration_date) return false
    const d = new Date(n.contract_expiration_date + 'T00:00:00')
    return d >= today && d <= soon
  }).sort((a, b) => (a.contract_expiration_date ?? '') < (b.contract_expiration_date ?? '') ? -1 : 1)

  // Hours chart
  const hoursAvailableYears = (() => {
    const years = Array.from(new Set(hoursEntries.map((e) => e.year))).sort((a, b) => b - a)
    if (!years.includes(currentYear)) years.unshift(currentYear)
    return years
  })()

  const hFiltered = hoursEntries.filter((e) => e.year === hYear && e.month >= hMonthFrom && e.month <= hMonthTo)

  const hChartData = Array.from({ length: hMonthTo - hMonthFrom + 1 }, (_, i) => {
    const m = hMonthFrom + i
    const total = hFiltered.filter((e) => e.month === m).reduce((sum, e) => sum + e.hours, 0)
    return { month: MONTH_LABELS[m - 1], hours: total > 0 ? total : null }
  })

  const hTotalHours = hFiltered.reduce((sum, e) => sum + e.hours, 0)
  const hasHoursData = hTotalHours > 0

  function getEmployerName(g: Grievance): string {
    if (g.company_id && companyNames[g.company_id]) return companyNames[g.company_id]
    return g.employer_name || ''
  }

  if (orgLoading || loading) {
    return <div style={{ padding: '32px', fontSize: '13px', color: '#64748B' }}>Loading…</div>
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: '960px', margin: '0 auto' }}>
      {loadError && (
        <div style={{ marginBottom: '20px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '13px' }}>{loadError}</div>
      )}

      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#0F172A', margin: 0 }}>Command Center</h1>
        <p style={{ fontSize: '13px', color: '#64748B', margin: '6px 0 0' }}>Overview of your active negotiations and association activity</p>
      </div>

      {/* Top stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '20px' }}>

        {/* Active Negotiations */}
        <button
          onClick={() => onNavigate('negotiations')}
          style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '20px', textAlign: 'left', cursor: 'pointer', transition: 'box-shadow 0.15s' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1E3A8A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>
            <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 500 }}>Active Negotiations</span>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>{activeNegotiations.length}</div>
          <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '6px' }}>{negotiations.length - activeNegotiations.length} closed</div>
        </button>

        {/* Active Grievances */}
        <button
          onClick={() => onNavigate('grievances')}
          style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '20px', textAlign: 'left', cursor: 'pointer', transition: 'box-shadow 0.15s' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 500 }}>Active Grievances</span>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>{activeGrievances.length}</div>
          <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '6px' }}>{grievances.filter((g) => g.status === 'closed' || g.status === 'withdrawn').length} closed or withdrawn</div>
        </button>

        {/* Quick Links */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '20px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', marginBottom: '12px' }}>Quick Links</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
            {([
              { label: 'Negotiation Tracker', page: 'negotiations' as const },
              { label: 'Grievances', page: 'grievances' as const },
              { label: 'Member Directory', page: 'members' as const },
              { label: 'Local Unions', page: 'local-unions' as const }
            ]).map(({ label, page }) => (
              <button
                key={page}
                onClick={() => onNavigate(page)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#1E3A8A', padding: '2px 0', textAlign: 'left' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Expiring contracts alert — only shown when relevant */}
      {expiringContracts.length > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '14px 18px', marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#92400e', marginBottom: '8px' }}>
            {expiringContracts.length} contract{expiringContracts.length !== 1 ? 's' : ''} expiring within 180 days
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {expiringContracts.map((n) => (
              <div key={n.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: '#78350f', fontWeight: 500 }}>{n.name}</span>
                <span style={{ color: '#92400e' }}>{formatDate(n.contract_expiration_date)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Middle row: Recent Negotiations + Grievance Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>

        {/* Recent Negotiations */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>Recent Negotiations</span>
            <button onClick={() => onNavigate('negotiations')} style={{ fontSize: '12px', color: '#1E3A8A', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>View all</button>
          </div>
          <div>
            {recentNegotiations.length === 0 ? (
              <div style={{ padding: '24px 18px', color: '#94A3B8', fontSize: '13px' }}>
                No negotiations yet.{' '}
                <button onClick={() => onNavigate('negotiations')} style={{ background: 'none', border: 'none', color: '#1E3A8A', cursor: 'pointer', padding: 0, fontSize: '13px' }}>Add one</button>
              </div>
            ) : recentNegotiations.map((neg, i) => {
              const sc = NEG_STATUS_COLORS[neg.status] ?? NEG_STATUS_COLORS['Closed']
              return (
                <div key={neg.id} style={{ padding: '12px 18px', borderBottom: i < recentNegotiations.length - 1 ? '1px solid #F1F5F9' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{neg.name}</div>
                    <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
                      {neg.local_number ? `Local ${neg.local_number}` : neg.bargaining_unit || '—'}
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', flexShrink: 0, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                    {neg.status}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Grievance Summary */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>Grievance Summary</span>
              <button onClick={() => onNavigate('grievances')} style={{ fontSize: '12px', color: '#1E3A8A', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>View all</button>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {(['current', 'previous', 'custom'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setGFilter(f)}
                  style={{
                    padding: '3px 10px', fontSize: '11px', fontWeight: 500, borderRadius: '20px', cursor: 'pointer',
                    background: gFilter === f ? '#1E3A8A' : '#F8FAFC',
                    color: gFilter === f ? '#fff' : '#64748B',
                    border: gFilter === f ? '1px solid #1E3A8A' : '1px solid #E2E8F0'
                  }}
                >
                  {f === 'current' ? 'This Year' : f === 'previous' ? 'Last Year' : 'Custom'}
                </button>
              ))}
              {gFilter === 'custom' && (
                <>
                  <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} style={{ fontSize: '11px', padding: '3px 6px', border: '1px solid #E2E8F0', borderRadius: '4px', color: '#0F172A' }} />
                  <span style={{ fontSize: '11px', color: '#94A3B8', alignSelf: 'center' }}>to</span>
                  <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} style={{ fontSize: '11px', padding: '3px 6px', border: '1px solid #E2E8F0', borderRadius: '4px', color: '#0F172A' }} />
                </>
              )}
            </div>
          </div>
          <div style={{ padding: '16px 18px' }}>
            {gTotal === 0 ? (
              <div style={{ color: '#94A3B8', fontSize: '13px' }}>No grievances for this period.</div>
            ) : (
              <>
                <div style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden', marginBottom: '16px', background: '#F1F5F9' }}>
                  {gFiled    > 0 && <div style={{ width: `${(gFiled    / gTotal) * 100}%`, background: '#ef4444' }} />}
                  {gLmc      > 0 && <div style={{ width: `${(gLmc      / gTotal) * 100}%`, background: '#f97316' }} />}
                  {gCir      > 0 && <div style={{ width: `${(gCir      / gTotal) * 100}%`, background: '#eab308' }} />}
                  {gResolved > 0 && <div style={{ width: `${(gResolved / gTotal) * 100}%`, background: '#CBD5E1' }} />}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { label: 'Filed',              count: gFiled,    color: '#ef4444' },
                    { label: 'Labor-Mgmt. Conf.',   count: gLmc,      color: '#f97316' },
                    { label: 'CIR / Arbitration',  count: gCir,      color: '#eab308' },
                    { label: 'Closed / Withdrawn', count: gResolved, color: '#CBD5E1' }
                  ].map(({ label, count, color }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: color, flexShrink: 0 }} />
                        <span style={{ fontSize: '12px', color: '#64748B' }}>{label}</span>
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>{count}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #F1F5F9', fontSize: '12px', color: '#94A3B8' }}>
                  {filteredGrievances.filter((g) => g.status !== 'closed' && g.status !== 'withdrawn').length} active · {gTotal} in period
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Member Hours chart */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden', marginBottom: '20px' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>Member Hours</span>
            <select
              value={hYear}
              onChange={(e) => setHYear(Number(e.target.value))}
              style={{ fontSize: '12px', padding: '3px 6px', border: '1px solid #E2E8F0', borderRadius: '4px', color: '#0F172A', cursor: 'pointer' }}
            >
              {hoursAvailableYears.map((yr) => <option key={yr} value={yr}>{yr}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => setHFiltersOpen((o) => !o)}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
                background: hFiltersOpen ? '#EEF2FF' : '#F8FAFC', color: hFiltersOpen ? '#1E3A8A' : '#64748B',
                border: hFiltersOpen ? '1px solid #C7D2FE' : '1px solid #E2E8F0', borderRadius: '6px'
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/>
              </svg>
              Filters
            </button>
            <button onClick={() => onNavigate('members')} style={{ fontSize: '12px', color: '#1E3A8A', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>View all</button>
          </div>
        </div>

        {hFiltersOpen && (
          <div style={{ padding: '12px 18px', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: '#64748B' }}>From</span>
            <select value={hMonthFrom} onChange={(e) => { const v = Number(e.target.value); setHMonthFrom(v); if (v > hMonthTo) setHMonthTo(v) }} style={{ fontSize: '12px', padding: '3px 6px', border: '1px solid #E2E8F0', borderRadius: '4px', color: '#0F172A' }}>
              {MONTH_LABELS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <span style={{ fontSize: '12px', color: '#64748B' }}>to</span>
            <select value={hMonthTo} onChange={(e) => { const v = Number(e.target.value); setHMonthTo(v); if (v < hMonthFrom) setHMonthFrom(v) }} style={{ fontSize: '12px', padding: '3px 6px', border: '1px solid #E2E8F0', borderRadius: '4px', color: '#0F172A' }}>
              {MONTH_LABELS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <button onClick={() => { setHMonthFrom(1); setHMonthTo(12) }} style={{ fontSize: '11px', color: '#1E3A8A', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto' }}>Reset</button>
          </div>
        )}

        <div style={{ padding: '20px 18px 8px' }}>
          {hasHoursData ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={hChartData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="hoursGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1E3A8A" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#1E3A8A" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} width={48} tickFormatter={(v: number) => v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)} />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '6px', fontSize: '12px', color: '#0F172A' }}
                  formatter={(value) => [typeof value === 'number' ? value.toLocaleString() + ' hrs' : '', 'Total Hours']}
                  labelStyle={{ color: '#64748B', marginBottom: '2px' }}
                />
                <Area type="monotone" dataKey="hours" stroke="#1E3A8A" strokeWidth={2} fill="url(#hoursGradient)" dot={{ r: 3, fill: '#1E3A8A', strokeWidth: 0 }} activeDot={{ r: 5, fill: '#1E3A8A', strokeWidth: 0 }} connectNulls={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: '13px' }}>
              No hours recorded for this period.{' '}
              <button onClick={() => onNavigate('members')} style={{ background: 'none', border: 'none', color: '#1E3A8A', cursor: 'pointer', padding: '0 4px', fontSize: '13px' }}>Go to Member Hub to add data.</button>
            </div>
          )}
        </div>
        {hasHoursData && (
          <div style={{ padding: '4px 18px 14px', fontSize: '12px', color: '#94A3B8' }}>
            {hTotalHours.toLocaleString()} total hrs · {MONTH_LABELS[hMonthFrom - 1]}{hMonthFrom !== hMonthTo ? `–${MONTH_LABELS[hMonthTo - 1]}` : ''} {hYear}
          </div>
        )}
      </div>

      {/* Active Grievances list */}
      {activeGrievances.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>Active Grievances</span>
            <button onClick={() => onNavigate('grievances')} style={{ fontSize: '12px', color: '#1E3A8A', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>View all</button>
          </div>
          {activeGrievances.slice(0, 5).map((g, i) => {
            const sc = G_STATUS_COLOR[g.status] ?? { bg: '#F8FAFC', color: '#64748B' }
            return (
              <div key={g.id} style={{ padding: '11px 18px', borderBottom: i < Math.min(activeGrievances.length, 5) - 1 ? '1px solid #F1F5F9' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: '#0F172A' }}>
                    Case #{g.case_number}{getEmployerName(g) ? ` · ${getEmployerName(g)}` : ''}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {g.description.length > 80 ? g.description.slice(0, 80) + '…' : g.description}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                  <span style={{ fontSize: '11px', color: '#94A3B8' }}>{formatDate(g.date_filed)}</span>
                  <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', background: sc.bg, color: sc.color }}>
                    {G_STATUS_LABEL[g.status] ?? g.status}
                  </span>
                </div>
              </div>
            )
          })}
          {activeGrievances.length > 5 && (
            <div style={{ padding: '10px 18px', borderTop: '1px solid #F1F5F9', textAlign: 'center' }}>
              <button onClick={() => onNavigate('grievances')} style={{ fontSize: '12px', color: '#1E3A8A', background: 'none', border: 'none', cursor: 'pointer' }}>
                View {activeGrievances.length - 5} more active grievances
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
