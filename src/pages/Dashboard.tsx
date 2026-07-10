import { useEffect, useState } from 'react'
import { supabase, HOURS_QUERY_MAX } from '../lib/supabase'
import { useUserSettings } from '../lib/useUserSettings'
import { useToast } from '../lib/toast'
import { describeError } from '../lib/errors'
import { formatDate, formatMoney, GRIEVANCE_STAGE_COLORS, GRIEVANCE_ACTIVE_STAGES } from '../lib/ui'
import { aggregateMonthly, computeCompanyCharge, SHORT_MONTHS } from '../lib/serviceCharge'
import HoursChart from '../components/HoursChart'
import type { NegotiationCycle, Grievance, WorkforceHours, MemberCompany } from '../lib/types'

type Page = 'dashboard' | 'negotiations' | 'grievances' | 'local-unions' | 'members' | 'documents' | 'settings'

interface DashboardProps {
  onNavigate: (page: Page) => void
}

export default function Dashboard({ onNavigate }: DashboardProps): React.JSX.Element {
  const { effectiveChapterId, applyChapterFilter, loading: chapterLoading } = useUserSettings()
  const toast = useToast()
  const [cycles, setCycles] = useState<NegotiationCycle[]>([])
  const [grievances, setGrievances] = useState<Grievance[]>([])
  const [companies, setCompanies] = useState<MemberCompany[]>([])
  const [hours, setHours] = useState<WorkforceHours[]>([])
  const [loading, setLoading] = useState(true)
  const [hoursYear, setHoursYear] = useState<number>(new Date().getFullYear())

  useEffect(() => {
    let cancelled = false

    void Promise.all([
      applyChapterFilter(supabase.from('negotiation_cycles').select('*').order('created_at', { ascending: false })),
      applyChapterFilter(supabase.from('grievances').select('*').order('filed_date', { ascending: false })),
      applyChapterFilter(supabase.from('member_companies').select('*')),
      applyChapterFilter(supabase.from('workforce_hours').select('*')).range(0, HOURS_QUERY_MAX - 1)
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
  // Re-run on effectiveChapterId change so the admin chapter switcher refetches.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveChapterId])

  if (chapterLoading || loading) {
    return <div style={{ padding: '32px', fontSize: '13px', color: '#64748B' }}>Loading…</div>
  }

  const activeCycles = cycles.filter((c) => c.status === 'Active')
  const activeGrievances = grievances.filter((g) => g.stage !== 'Closed' && g.stage !== 'Withdrawn')

  const today = new Date()
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth() + 1
  const soon = new Date(); soon.setDate(today.getDate() + 180)
  const expiringContracts = activeCycles.filter((c) => {
    if (!c.cba_expiration_date) return false
    const d = new Date(c.cba_expiration_date + 'T00:00:00')
    return d >= today && d <= soon
  }).sort((a, b) => (a.cba_expiration_date ?? '') < (b.cba_expiration_date ?? '') ? -1 : 1)

  // Hours scoped to the current calendar year (matches the stat card label)
  const totalHours = hours.reduce((sum, h) =>
    parseInt(h.report_month.slice(0, 4), 10) === currentYear ? sum + Number(h.total_hours ?? 0) : sum, 0)

  // Years available in the chart's year picker (always includes this year)
  const yearSet = new Set<number>([currentYear])
  hours.forEach((h) => {
    const y = parseInt(h.report_month.slice(0, 4), 10)
    if (Number.isFinite(y)) yearSet.add(y)
  })
  const availableYears = Array.from(yearSet).sort((a, b) => b - a)

  // Monthly totals for the selected chart year
  const monthlyTotals: number[] = Array(12).fill(0)
  const monthsWithData: boolean[] = Array(12).fill(false)
  hours.forEach((h) => {
    if (parseInt(h.report_month.slice(0, 4), 10) !== hoursYear) return
    const m = parseInt(h.report_month.slice(5, 7), 10)
    if (m >= 1 && m <= 12) {
      monthlyTotals[m - 1] += Number(h.total_hours ?? 0)
      monthsWithData[m - 1] = true
    }
  })

  // Active grievances per stage, for the color breakdown
  const stageCounts = GRIEVANCE_ACTIVE_STAGES.map((stage) => ({
    stage,
    count: activeGrievances.filter((g) => g.stage === stage).length
  }))
  const maxStageCount = Math.max(1, ...stageCounts.map((s) => s.count))

  // Service charge year-to-date estimate — same rules as the Service Charge
  // tab with its defaults (Active companies, January through this month)
  const hoursByCompany = aggregateMonthly(hours, currentYear)
  const activeCompanies = companies.filter((c) => c.status === 'Active')
  const serviceChargeYtd = activeCompanies.reduce((sum, c) =>
    sum + computeCompanyCharge(hoursByCompany.get(c.id) ?? [], c.discount_tier, 1, currentMonth).netDue, 0)

  return (
    <div className="page-content">
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#0F172A', margin: 0 }}>Command Center</h1>
        <p style={{ fontSize: '13px', color: '#64748B', margin: '6px 0 0' }}>Overview of your active negotiations and chapter activity</p>
      </div>

      <div className="grid-stats">
        <StatCard label="Active Negotiations" value={activeCycles.length} sub={`${cycles.length - activeCycles.length} settled or archived`} onClick={() => onNavigate('negotiations')} />
        <StatCard label="Active Grievances" value={activeGrievances.length} sub={`${grievances.length - activeGrievances.length} closed or withdrawn`} onClick={() => onNavigate('grievances')} />
        <StatCard label="Member Companies" value={companies.length} sub={`${companies.filter((c) => c.status === 'Active').length} active`} onClick={() => onNavigate('members')} />
        <StatCard label="Hours This Year" value={Math.round(totalHours).toLocaleString()} sub={`${currentYear} year to date`} onClick={() => onNavigate('members')} />
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

      <div className="grid-2col">
        {/* Member hours trend */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px 18px 10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>Member Hours</span>
            <select
              value={hoursYear}
              onChange={(e) => setHoursYear(parseInt(e.target.value, 10))}
              aria-label="Chart year"
              style={{ fontSize: '12px', padding: '4px 8px', border: '1px solid #CBD5E1', borderRadius: '6px', color: '#0F172A', background: '#fff' }}
            >
              {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <HoursChart monthlyTotals={monthlyTotals} monthsWithData={monthsWithData} year={hoursYear} />
        </div>

        {/* Right column: grievance breakdown + service charge */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px 18px', flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>Active Grievances by Stage</span>
              <button onClick={() => onNavigate('grievances')} style={{ fontSize: '12px', color: '#1E3A8A', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>View all</button>
            </div>
            {activeGrievances.length === 0 ? (
              <div style={{ padding: '16px 0', color: '#94A3B8', fontSize: '13px' }}>No active grievances.</div>
            ) : stageCounts.map(({ stage, count }) => {
              const colors = GRIEVANCE_STAGE_COLORS[stage]
              return (
                <button
                  key={stage}
                  onClick={() => onNavigate('grievances')}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', background: 'none', border: 'none', padding: '8px 0', cursor: 'pointer' }}
                >
                  <span style={{ display: 'block', width: '10px', height: '10px', borderRadius: '2px', background: colors.color, flexShrink: 0 }} aria-hidden="true" />
                  <span style={{ fontSize: '13px', color: '#475569', width: '86px', textAlign: 'left', flexShrink: 0 }}>{stage}</span>
                  <span style={{ display: 'block', flex: 1, height: '8px', background: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: count > 0 ? `${Math.max(3, (count / maxStageCount) * 100)}%` : '0%', background: colors.color, borderRadius: '4px' }} />
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', width: '28px', textAlign: 'right', flexShrink: 0 }}>{count}</span>
                </button>
              )
            })}
          </div>

          <button
            onClick={() => onNavigate('members')}
            style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '16px 18px', textAlign: 'left', cursor: 'pointer', transition: 'box-shadow 0.15s' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none' }}
          >
            <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 500, marginBottom: '8px' }}>Service Charge (YTD estimate)</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>{formatMoney(serviceChargeYtd)}</div>
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '6px' }}>
              Estimated Jan–{SHORT_MONTHS[currentMonth - 1]} {currentYear} · {activeCompanies.length} active compan{activeCompanies.length === 1 ? 'y' : 'ies'}
            </div>
          </button>
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
