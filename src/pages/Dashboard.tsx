import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useChapter } from '../lib/useChapter'
import { useToast } from '../lib/toast'
import { describeError } from '../lib/errors'
import { formatDate } from '../lib/ui'
import type { NegotiationCycle, Grievance, WorkforceHours, MemberCompany } from '../lib/types'

type Page = 'dashboard' | 'negotiations' | 'grievances' | 'local-unions' | 'members' | 'documents' | 'settings'

interface DashboardProps {
  onNavigate: (page: Page) => void
}

const CYCLE_STATUS_COLORS: Record<NegotiationCycle['status'], { bg: string; color: string; border: string }> = {
  Active:   { bg: '#f0fdf4', color: '#059669', border: '#bbf7d0' },
  Settled:  { bg: '#EEF2FF', color: '#4F46E5', border: '#C7D2FE' },
  Archived: { bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' }
}

const GRIEVANCE_STAGE_COLORS: Record<Grievance['stage'], { bg: string; color: string }> = {
  Filed:       { bg: '#fef2f2', color: '#dc2626' },
  LMC:         { bg: '#fff7ed', color: '#ea580c' },
  CIR:         { bg: '#fefce8', color: '#ca8a04' },
  Arbitration: { bg: '#fefce8', color: '#a16207' },
  Closed:      { bg: '#F8FAFC', color: '#64748B' },
  Withdrawn:   { bg: '#F8FAFC', color: '#64748B' }
}

export default function Dashboard({ onNavigate }: DashboardProps): React.JSX.Element {
  const { chapterId, loading: chapterLoading, error: chapterError } = useChapter()
  const toast = useToast()
  const [cycles, setCycles] = useState<NegotiationCycle[]>([])
  const [grievances, setGrievances] = useState<Grievance[]>([])
  const [companies, setCompanies] = useState<MemberCompany[]>([])
  const [hours, setHours] = useState<WorkforceHours[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!chapterId) return
    let cancelled = false

    void Promise.all([
      supabase.from('negotiation_cycles').select('*').eq('chapter_id', chapterId).order('created_at', { ascending: false }),
      supabase.from('grievances').select('*').eq('chapter_id', chapterId).order('filed_date', { ascending: false }),
      supabase.from('member_companies').select('*').eq('chapter_id', chapterId),
      supabase.from('workforce_hours').select('*').eq('chapter_id', chapterId)
    ]).then(([cyclesRes, grievRes, compRes, hoursRes]) => {
      if (cancelled) return
      if (cyclesRes.error) toast.error('Could not load negotiations: ' + describeError(cyclesRes.error))
      else setCycles((cyclesRes.data ?? []) as NegotiationCycle[])
      if (grievRes.error) toast.error('Could not load grievances: ' + describeError(grievRes.error))
      else setGrievances((grievRes.data ?? []) as Grievance[])
      if (compRes.error) toast.error('Could not load companies: ' + describeError(compRes.error))
      else setCompanies((compRes.data ?? []) as MemberCompany[])
      if (hoursRes.error) toast.error('Could not load hours: ' + describeError(hoursRes.error))
      else setHours((hoursRes.data ?? []) as WorkforceHours[])
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [chapterId, toast])

  if (chapterLoading || loading) {
    return <div style={{ padding: '32px', fontSize: '13px', color: '#64748B' }}>Loading…</div>
  }

  if (chapterError) {
    return (
      <div style={{ padding: '32px' }}>
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '14px 18px', color: '#b91c1c', fontSize: '13px' }}>
          {chapterError}
        </div>
      </div>
    )
  }

  const activeCycles = cycles.filter((c) => c.status === 'Active')
  const recentCycles = cycles.slice(0, 4)
  const activeGrievances = grievances.filter((g) => g.stage !== 'Closed' && g.stage !== 'Withdrawn')

  const today = new Date()
  const soon = new Date(); soon.setDate(today.getDate() + 180)
  const expiringContracts = activeCycles.filter((c) => {
    if (!c.cba_expiration_date) return false
    const d = new Date(c.cba_expiration_date + 'T00:00:00')
    return d >= today && d <= soon
  }).sort((a, b) => (a.cba_expiration_date ?? '') < (b.cba_expiration_date ?? '') ? -1 : 1)

  const totalHours = hours.reduce((sum, h) => sum + Number(h.total_hours ?? 0), 0)

  return (
    <div style={{ padding: '28px 32px', maxWidth: '960px', margin: '0 auto' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#0F172A', margin: 0 }}>Command Center</h1>
        <p style={{ fontSize: '13px', color: '#64748B', margin: '6px 0 0' }}>Overview of your active negotiations and chapter activity</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px' }}>
        <StatCard label="Active Negotiations" value={activeCycles.length} sub={`${cycles.length - activeCycles.length} settled or archived`} onClick={() => onNavigate('negotiations')} />
        <StatCard label="Active Grievances" value={activeGrievances.length} sub={`${grievances.length - activeGrievances.length} closed or withdrawn`} onClick={() => onNavigate('grievances')} />
        <StatCard label="Member Companies" value={companies.length} sub={`${companies.filter((c) => c.status === 'Active').length} active`} onClick={() => onNavigate('members')} />
        <StatCard label="Hours This Year" value={Math.round(totalHours).toLocaleString()} sub="across all months" onClick={() => onNavigate('members')} />
      </div>

      {expiringContracts.length > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '14px 18px', marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#92400e', marginBottom: '8px' }}>
            {expiringContracts.length} contract{expiringContracts.length !== 1 ? 's' : ''} expiring within 180 days
          </div>
          {expiringContracts.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
              <span style={{ color: '#78350f', fontWeight: 500 }}>{c.name}</span>
              <span style={{ color: '#92400e' }}>{formatDate(c.cba_expiration_date)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>Recent Negotiations</span>
            <button onClick={() => onNavigate('negotiations')} style={{ fontSize: '12px', color: '#1E3A8A', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>View all</button>
          </div>
          {recentCycles.length === 0 ? (
            <div style={{ padding: '24px 18px', color: '#94A3B8', fontSize: '13px' }}>
              No negotiations yet.{' '}
              <button onClick={() => onNavigate('negotiations')} style={{ background: 'none', border: 'none', color: '#1E3A8A', cursor: 'pointer', padding: 0, fontSize: '13px' }}>Add one</button>
            </div>
          ) : recentCycles.map((c, i) => {
            const sc = CYCLE_STATUS_COLORS[c.status]
            return (
              <div key={c.id} style={{ padding: '12px 18px', borderBottom: i < recentCycles.length - 1 ? '1px solid #F1F5F9' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                  <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>{c.classification}</div>
                </div>
                <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', flexShrink: 0, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                  {c.status}
                </span>
              </div>
            )
          })}
        </div>

        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>Active Grievances</span>
            <button onClick={() => onNavigate('grievances')} style={{ fontSize: '12px', color: '#1E3A8A', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>View all</button>
          </div>
          {activeGrievances.length === 0 ? (
            <div style={{ padding: '24px 18px', color: '#94A3B8', fontSize: '13px' }}>No active grievances.</div>
          ) : activeGrievances.slice(0, 5).map((g, i) => {
            const sc = GRIEVANCE_STAGE_COLORS[g.stage]
            return (
              <div key={g.id} style={{ padding: '11px 18px', borderBottom: i < Math.min(activeGrievances.length, 5) - 1 ? '1px solid #F1F5F9' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: '#0F172A' }}>
                    {g.grievance_number ? `#${g.grievance_number} — ` : ''}{g.title}
                  </div>
                  {g.employer_name && <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>{g.employer_name}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                  <span style={{ fontSize: '11px', color: '#94A3B8' }}>{formatDate(g.filed_date)}</span>
                  <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', background: sc.bg, color: sc.color }}>
                    {g.stage}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, onClick }: { label: string; value: number | string; sub: string; onClick: () => void }): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      style={{
        background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '18px 20px',
        textAlign: 'left', cursor: 'pointer', transition: 'box-shadow 0.15s'
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none' }}
    >
      <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 500, marginBottom: '8px' }}>{label}</div>
      <div style={{ fontSize: '28px', fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '6px' }}>{sub}</div>
    </button>
  )
}
