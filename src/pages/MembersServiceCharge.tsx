import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useOrg } from '../lib/useOrg'
import { inputStyle, labelStyle, btnPrimary } from '../lib/ui'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Company {
  id: number
  company_name: string
  status: string
  is_member: number
  discount_tier: 'none' | 'ten_plus' | 'twenty_five_plus'
}

interface YtdRollupRow {
  id: number
  company_name: string
  status: string
  is_member: number
  ytd_hours: number
  ytd_gpep: number
  last_month_reported: number | null
  last_month_hours: number | null
  discount_tier: 'none' | 'ten_plus' | 'twenty_five_plus'
}

interface MonthlyServiceChargeRow {
  company_id: number
  month: number
  hours: number
  gpep: number
  cumulative_hours: number
  cumulative_gpep: number
}

interface EntityCharge extends YtdRollupRow {
  is_non_compliant: boolean
  tier: '0-75k' | '75k-150k' | 'capped'
  billable_pct: number
  billable_gpep: number
  base_charge: number
  discount_amount: number
  entity_charge: number
}

type MonthTier = 'tier1' | 'tier1-2' | 'tier2' | 'tier2-cap' | 'capped'

interface MonthlyChartRow {
  monthLabel: string
  hours: number
  gpep: number
  cumulative_hours: number
  cumulative_gpep: number
  monthly_charge: number
  tier: MonthTier
}

interface ServiceChargeTableRow {
  key: string
  monthLabel: string
  hours: number
  gpep: number
  dotColor: string
  rateLabel: string
  charge: number
  isContinuation: boolean
  isLastInMonth: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIER1_CAP = 75000
const TIER2_CAP = 150000

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// ─── Pure Calculation Functions ───────────────────────────────────────────────

function computeMonthlyChartData(rows: MonthlyServiceChargeRow[], discount_pct: number = 0): MonthlyChartRow[] {
  return rows.map((row) => {
    const cumBefore = row.cumulative_hours - row.hours
    const cumAfter  = row.cumulative_hours
    const gpepPerHour = row.hours > 0 ? row.gpep / row.hours : 0

    const hoursInTier1 = Math.max(0, Math.min(cumAfter, TIER1_CAP) - Math.max(cumBefore, 0))
    const hoursInTier2 = Math.max(0, Math.min(cumAfter, TIER2_CAP) - Math.max(cumBefore, TIER1_CAP))

    const monthly_charge = (hoursInTier1 * gpepPerHour * 1.00 + hoursInTier2 * gpepPerHour * 0.75) * 0.002 * (1 - discount_pct)

    let tier: MonthTier
    if (cumBefore < TIER1_CAP && cumAfter <= TIER1_CAP)       tier = 'tier1'
    else if (cumBefore < TIER1_CAP && cumAfter <= TIER2_CAP)  tier = 'tier1-2'
    else if (cumBefore >= TIER1_CAP && cumAfter <= TIER2_CAP) tier = 'tier2'
    else if (cumBefore < TIER2_CAP && cumAfter > TIER2_CAP)   tier = 'tier2-cap'
    else                                                        tier = 'capped'

    return {
      monthLabel: SHORT_MONTHS[row.month - 1],
      hours: row.hours,
      gpep: row.gpep,
      cumulative_hours: row.cumulative_hours,
      cumulative_gpep: row.cumulative_gpep,
      monthly_charge,
      tier
    }
  })
}

function computeServiceCharge(rows: YtdRollupRow[], monthlyRows: MonthlyServiceChargeRow[]): {
  entities: EntityCharge[]
  total_ytd_hours: number
  total_ytd_gpep: number
  active_entity_count: number
  discount_pct: number
  final_charge: number
} {
  // Discount rate comes from the company's discount_tier field (set annually from the NECA national list)
  const discountTier = rows[0]?.discount_tier ?? 'none'
  const discount_pct = discountTier === 'twenty_five_plus' ? 0.25 : discountTier === 'ten_plus' ? 0.10 : 0
  const active_entity_count = rows.filter((r) => r.status === 'active' && r.is_member === 1).length

  const entities: EntityCharge[] = rows.map((r) => {
    // Non-members do not pay the NECA service charge
    if (r.is_member !== 1) {
      return {
        ...r, is_non_compliant: false,
        tier: '0-75k', billable_pct: 0, billable_gpep: 0,
        base_charge: 0, discount_amount: 0, entity_charge: 0
      }
    }

    let tier: '0-75k' | '75k-150k' | 'capped'
    let billable_pct: number
    if (r.ytd_hours <= 75000) {
      tier = '0-75k'; billable_pct = 1.0
    } else if (r.ytd_hours <= 150000) {
      tier = '75k-150k'; billable_pct = 0.75
    } else {
      tier = 'capped'; billable_pct = 0.0
    }

    // Derive billable_gpep from the monthly breakdown for accurate tier boundary math
    const entityMonthlyRows = monthlyRows.filter((m) => m.company_id === r.id)
    const billable_gpep = entityMonthlyRows.length > 0
      ? computeMonthlyChartData(entityMonthlyRows, 0).reduce((sum, d) => sum + d.monthly_charge, 0) / 0.002
      : r.ytd_gpep * billable_pct

    const base_charge     = billable_gpep * 0.002
    const discount_amount = base_charge * discount_pct
    const entity_charge   = base_charge * (1 - discount_pct)

    const is_non_compliant =
      r.status === 'active' &&
      discount_pct > 0 &&
      (r.last_month_hours == null || r.last_month_hours < 1250)

    return { ...r, is_non_compliant, tier, billable_pct, billable_gpep, base_charge, discount_amount, entity_charge }
  })

  const selected = rows[0]
  const total_ytd_hours = selected?.ytd_hours ?? 0
  const total_ytd_gpep  = selected?.ytd_gpep  ?? 0
  const final_charge    = entities[0]?.entity_charge ?? 0

  return { entities, total_ytd_hours, total_ytd_gpep, active_entity_count, discount_pct, final_charge }
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function ServiceChargePage(): React.JSX.Element {
  const { orgId, loading: orgLoading } = useOrg()

  const [companies, setCompanies] = useState<Company[]>([])
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('')
  const [year, setYear] = useState(new Date().getFullYear())
  const [throughMonth, setThroughMonth] = useState(new Date().getMonth() + 1)
  const [result, setResult] = useState<(ReturnType<typeof computeServiceCharge> & { company_name: string }) | null>(null)
  const [monthlyData, setMonthlyData] = useState<MonthlyServiceChargeRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [initError, setInitError] = useState<string | null>(null)

  // Load companies and available years on mount
  useEffect(() => {
    if (!orgId) return
    Promise.all([
      supabase
        .from('member_companies')
        .select('id, company_name, status, is_member, discount_tier')
        .eq('org_id', orgId)
        .order('company_name'),
      supabase
        .from('man_hours')
        .select('year')
        .eq('org_id', orgId)
    ]).then(([companiesRes, hoursRes]) => {
      if (companiesRes.error) {
        setInitError('Could not load companies. Please try again.')
        return
      }
      setCompanies((companiesRes.data as Company[]) ?? [])

      const yearSet = new Set<number>((hoursRes.data ?? []).map((r: { year: number }) => r.year))
      yearSet.add(new Date().getFullYear())
      const years = Array.from(yearSet).sort((a, b) => b - a)
      setAvailableYears(years)
      if (years.length > 0) setYear(years[0])
    })
  }, [orgId])

  async function handleCalculate(): Promise<void> {
    if (!orgId || !selectedCompanyId) { setError('Please select a company.'); return }
    setLoading(true)
    setError(null)
    setResult(null)
    setMonthlyData(null)

    try {
      const companyId = parseInt(selectedCompanyId)

      // Fetch company info (for discount_tier, is_member, status)
      const { data: companyData, error: companyErr } = await supabase
        .from('member_companies')
        .select('id, company_name, status, is_member, discount_tier')
        .eq('id', companyId)
        .eq('org_id', orgId)
        .single()

      if (companyErr || !companyData) {
        setError('Could not load company data. Please try again.')
        setLoading(false)
        return
      }

      // Fetch all monthly hours for this company through the selected period
      const { data: hoursData, error: hoursErr } = await supabase
        .from('man_hours')
        .select('month, hours, gpep')
        .eq('org_id', orgId)
        .eq('company_id', companyId)
        .eq('year', year)
        .lte('month', throughMonth)
        .order('month', { ascending: true })

      if (hoursErr) {
        setError('Could not load hours data. Please try again.')
        setLoading(false)
        return
      }

      const rawMonthly = (hoursData ?? []) as Array<{ month: number; hours: number; gpep: number | null }>

      // Build monthly rows with running cumulative totals
      const monthlyRows: MonthlyServiceChargeRow[] = []
      let cumHours = 0
      let cumGpep = 0

      // Fill all months 1..throughMonth, inserting zeros for missing months
      for (let m = 1; m <= throughMonth; m++) {
        const found = rawMonthly.find((r) => r.month === m)
        const hrs = found ? found.hours : 0
        const gpep = found ? (found.gpep ?? 0) : 0
        cumHours += hrs
        cumGpep  += gpep
        monthlyRows.push({
          company_id: companyId,
          month: m,
          hours: hrs,
          gpep,
          cumulative_hours: cumHours,
          cumulative_gpep: cumGpep
        })
      }

      // Determine last reported month hours for non-compliance check
      const lastReportedRow = rawMonthly.length > 0 ? rawMonthly[rawMonthly.length - 1] : null

      // Build a single YtdRollupRow for the selected company
      const ytdRollup: YtdRollupRow = {
        id: companyData.id,
        company_name: companyData.company_name,
        status: companyData.status,
        is_member: companyData.is_member,
        ytd_hours: cumHours,
        ytd_gpep: cumGpep,
        last_month_reported: lastReportedRow ? lastReportedRow.month : null,
        last_month_hours: lastReportedRow ? lastReportedRow.hours : null,
        discount_tier: (companyData.discount_tier as 'none' | 'ten_plus' | 'twenty_five_plus') ?? 'none'
      }

      const calc = computeServiceCharge([ytdRollup], monthlyRows)
      setResult({ ...calc, company_name: companyData.company_name })
      setMonthlyData(monthlyRows)
    } catch {
      setError('Failed to load data. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (orgLoading) {
    return <div style={{ padding: '32px', fontSize: '13px', color: '#64748B' }}>Loading…</div>
  }

  const fmtHours = (n: number): string => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 })
  const fmtMoney = (n: number): string => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const fmtGpep  = (n: number): string => n > 0 ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '\u2014'

  return (
    <div style={{ padding: '32px 36px', maxWidth: '960px' }}>
      <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>Service Charge Calculator</h1>
      <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 24px' }}>
        Select a company, year, and month to calculate the National Service Charge owed based on workforce hours and GPEP.
      </p>

      {initError && (
        <div style={{ marginBottom: '16px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '13px' }}>
          {initError}
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap', marginBottom: '24px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '16px 20px' }}>
        <div>
          <label style={labelStyle}>Company</label>
          <select
            value={selectedCompanyId}
            onChange={(e) => { setSelectedCompanyId(e.target.value); setResult(null); setMonthlyData(null) }}
            style={{ ...inputStyle, width: '280px' }}
          >
            <option value="">Select a company…</option>
            {companies
              .filter((c) => c.status === 'active' && c.is_member === 1)
              .map((c) => (
                <option key={c.id} value={c.id}>{c.company_name}</option>
              ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Year</label>
          <select
            value={year}
            onChange={(e) => { setYear(Number(e.target.value)); setResult(null); setMonthlyData(null) }}
            style={{ ...inputStyle, width: '100px' }}
          >
            {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Through Month</label>
          <select
            value={throughMonth}
            onChange={(e) => { setThroughMonth(Number(e.target.value)); setResult(null); setMonthlyData(null) }}
            style={{ ...inputStyle, width: '140px' }}
          >
            {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <button
          onClick={handleCalculate}
          disabled={!selectedCompanyId || loading}
          style={{ ...btnPrimary, opacity: !selectedCompanyId || loading ? 0.6 : 1, alignSelf: 'flex-end' }}
        >
          {loading ? 'Loading…' : 'Calculate'}
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: '16px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {result && (() => {
        const selected = result.entities[0]
        if (!selected) return null

        // Build table rows for the monthly breakdown
        const selectedRows = monthlyData ? monthlyData.filter((r) => r.company_id === selected.id) : []
        const hasData = selectedRows.some((r) => r.hours > 0)

        const tableRows: ServiceChargeTableRow[] = []
        if (hasData) {
          computeMonthlyChartData(selectedRows, result.discount_pct).forEach((d) => {
            const cumBefore = d.cumulative_hours - d.hours
            const gpepPerHour = d.hours > 0 ? d.gpep / d.hours : 0
            if (d.tier === 'tier1-2') {
              const hoursT1 = TIER1_CAP - cumBefore
              const hoursT2 = d.hours - hoursT1
              tableRows.push({ key: `${d.monthLabel}-t1`, monthLabel: d.monthLabel, hours: hoursT1, gpep: hoursT1 * gpepPerHour, dotColor: '#16a34a', rateLabel: '100%', charge: hoursT1 * gpepPerHour * 1.00 * 0.002, isContinuation: false, isLastInMonth: false })
              tableRows.push({ key: `${d.monthLabel}-t2`, monthLabel: d.monthLabel, hours: hoursT2, gpep: hoursT2 * gpepPerHour, dotColor: '#0891b2', rateLabel: '75%',  charge: hoursT2 * gpepPerHour * 0.75 * 0.002, isContinuation: true,  isLastInMonth: true  })
            } else if (d.tier === 'tier2-cap') {
              const hoursT2  = TIER2_CAP - cumBefore
              const hoursCap = d.hours - hoursT2
              tableRows.push({ key: `${d.monthLabel}-t2`,  monthLabel: d.monthLabel, hours: hoursT2,  gpep: hoursT2  * gpepPerHour, dotColor: '#0891b2', rateLabel: '75%',         charge: hoursT2 * gpepPerHour * 0.75 * 0.002, isContinuation: false, isLastInMonth: false })
              tableRows.push({ key: `${d.monthLabel}-cap`, monthLabel: d.monthLabel, hours: hoursCap, gpep: hoursCap * gpepPerHour, dotColor: '#dc2626', rateLabel: '0% (Capped)', charge: 0,                                     isContinuation: true,  isLastInMonth: true  })
            } else {
              const dotColor  = d.tier === 'tier1' ? '#16a34a' : d.tier === 'tier2' ? '#0891b2' : '#dc2626'
              const rateLabel = d.tier === 'tier1' ? '100%'    : d.tier === 'tier2' ? '75%'    : '0% (Capped)'
              tableRows.push({ key: d.monthLabel, monthLabel: d.monthLabel, hours: d.hours, gpep: d.gpep, dotColor, rateLabel, charge: d.monthly_charge, isContinuation: false, isLastInMonth: true })
            }
          })
        }

        return (
          <>
            {/* Warnings */}
            {selected.is_non_compliant && (
              <div style={{ marginBottom: '12px', padding: '8px 12px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '6px', fontSize: '12px', color: '#92400e' }}>
                This company reported fewer than 1,250 workforce hours in the most recent month. Multi-entity discount eligibility may be affected.
              </div>
            )}
            {result.total_ytd_gpep === 0 && (
              <div style={{ marginBottom: '12px', padding: '8px 12px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '6px', fontSize: '12px', color: '#92400e' }}>
                No GPEP data found for this period. Add GPEP amounts in the Hours tab to enable calculation.
              </div>
            )}

            {/* Monthly Charge Breakdown */}
            {hasData && tableRows.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px', paddingBottom: '8px', borderBottom: '2px solid #E2E8F0' }}>
                  Monthly Charge Breakdown
                </div>
                <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                        <th scope="col" style={{ padding: '10px 16px', textAlign: 'left',  fontWeight: 600, color: '#64748B' }}>Month</th>
                        <th scope="col" style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: '#64748B' }}>Hours</th>
                        <th scope="col" style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: '#64748B' }}>GPEP</th>
                        <th scope="col" style={{ padding: '10px 16px', textAlign: 'left',  fontWeight: 600, color: '#64748B' }}>Billable Rate</th>
                        <th scope="col" style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: '#64748B' }}>Charge</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map((row, idx) => {
                        const isLast = idx === tableRows.length - 1
                        const borderColor = row.isLastInMonth ? '#F1F5F9' : '#E9ECEF'
                        return (
                          <tr key={row.key} style={{ borderBottom: isLast ? 'none' : `1px solid ${borderColor}`, background: row.isContinuation ? '#FAFBFC' : '#fff' }}>
                            <td style={{ padding: '9px 16px', color: row.isContinuation ? '#9CA3AF' : '#111827', fontWeight: row.isContinuation ? 400 : 500, fontStyle: row.isContinuation ? 'italic' : 'normal' }}>
                              {row.isContinuation ? `${row.monthLabel} (cont'd)` : row.monthLabel}
                            </td>
                            <td style={{ padding: '9px 16px', textAlign: 'right', color: '#64748B' }}>{fmtHours(row.hours)}</td>
                            <td style={{ padding: '9px 16px', textAlign: 'right', color: row.gpep > 0 ? '#374151' : '#D1D5DB' }}>{fmtGpep(row.gpep)}</td>
                            <td style={{ padding: '9px 16px' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: row.dotColor, flexShrink: 0, display: 'inline-block' }} />
                                <span style={{ color: '#64748B', fontSize: '12px' }}>{row.rateLabel}</span>
                              </span>
                            </td>
                            <td style={{ padding: '9px 16px', textAlign: 'right', color: '#0F172A', fontWeight: 500 }}>{fmtMoney(row.charge)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#F8FAFC', borderTop: '2px solid #E2E8F0' }}>
                        <td colSpan={4} style={{ padding: '9px 16px', fontSize: '12px', color: '#64748B' }}>Total GPEP</td>
                        <td style={{ padding: '9px 16px', textAlign: 'right', fontSize: '12px', color: '#64748B', fontWeight: 500 }}>
                          {fmtGpep(tableRows.reduce((sum, r) => sum + r.gpep, 0))}
                        </td>
                      </tr>
                      {result.discount_pct > 0 && (
                        <tr style={{ background: '#f0fdf4', borderTop: '1px solid #E2E8F0' }}>
                          <td colSpan={5} style={{ padding: '8px 16px', fontSize: '12px', color: '#166534', fontStyle: 'italic' }}>
                            Membership Discount ({result.discount_pct === 0.10 ? '10% \u2014 10+ Memberships' : '25% \u2014 25+ Memberships'}) applied to each month above
                          </td>
                        </tr>
                      )}
                      <tr style={{ background: '#1E3A8A', borderTop: '1px solid #1e40af' }}>
                        <td colSpan={4} style={{ padding: '13px 16px', fontWeight: 700, color: '#fff', fontSize: '14px' }}>National Service Charge Due</td>
                        <td style={{ padding: '13px 16px', textAlign: 'right', fontWeight: 700, color: '#fff', fontSize: '14px' }}>{fmtMoney(result.final_charge)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* No data state — show summary row even without monthly detail */}
            {!hasData && (
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '32px', textAlign: 'center', color: '#94A3B8', fontSize: '14px' }}>
                No hours data found for {result.company_name} in {year} through {MONTHS[throughMonth - 1]}.
                Add hours in the Member Hours tab to calculate the service charge.
              </div>
            )}
          </>
        )
      })()}
    </div>
  )
}
