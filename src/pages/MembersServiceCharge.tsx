import { useEffect, useMemo, useState } from 'react'
import { supabase, HOURS_QUERY_MAX } from '../lib/supabase'
import { useUserSettings } from '../lib/useUserSettings'
import { useToast } from '../lib/toast'
import { describeError } from '../lib/errors'
import { inputStyle, card, errorBox, thStyle, tdStyle, formatMoney, COLORS } from '../lib/ui'
import {
  aggregateMonthly,
  computeCompanyCharge,
  COMPLIANCE_MIN_MONTHLY_HOURS,
  DISCOUNT_TIER_LABEL,
  SHORT_MONTHS,
  TIER1_CAP,
  TIER2_CAP
} from '../lib/serviceCharge'
import type { CompanyChargeResult, MonthBreakdown } from '../lib/serviceCharge'
import type { WorkforceHours, MemberCompany, ID } from '../lib/types'

// NECA National Service Charge analyzer. All math lives in
// src/lib/serviceCharge.ts (pure functions, per the NECA bylaws); this page
// loads the data, applies the filters, and renders a per-company roster with
// an expandable month-by-month calculation breakdown.

const TODAY_YEAR = new Date().getFullYear()
const TODAY_MONTH = new Date().getMonth() + 1

// Billable-rate dot colors for the breakdown table
const RATE_COLORS: Record<string, string> = {
  '100%': '#16a34a',
  '75%': '#0891b2',
  '0% (capped)': '#dc2626'
}

function parseYear(iso: string): number {
  return parseInt(iso.slice(0, 4), 10)
}

interface CompanyRow {
  company: MemberCompany
  result: CompanyChargeResult
}

export default function MembersServiceCharge(): React.JSX.Element {
  const { effectiveChapterId, applyChapterFilter, loading: chapterLoading } = useUserSettings()
  const toast = useToast()
  const [companies, setCompanies] = useState<MemberCompany[]>([])
  const [hours, setHours] = useState<WorkforceHours[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [year, setYear] = useState<number>(TODAY_YEAR)
  const [fromMonth, setFromMonth] = useState(1)
  const [toMonth, setToMonth] = useState(TODAY_MONTH)
  const [statusFilter, setStatusFilter] = useState<'all' | 'Active' | 'Inactive'>('Active')
  const [expandedIds, setExpandedIds] = useState<Set<ID>>(new Set())

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      applyChapterFilter(supabase.from('member_companies').select('*').order('company_name')),
      applyChapterFilter(supabase.from('workforce_hours').select('*')).range(0, HOURS_QUERY_MAX - 1)
    ]).then(([compRes, hoursRes]: [{ data: unknown; error: unknown }, { data: unknown; error: unknown }]) => {
      if (cancelled) return
      if (compRes.error) {
        setLoadError(describeError(compRes.error, 'Could not load companies.'))
      } else {
        setCompanies((compRes.data ?? []) as MemberCompany[])
      }
      if (hoursRes.error) {
        toast.error('Could not load hours: ' + describeError(hoursRes.error))
      } else {
        const hoursRows = (hoursRes.data ?? []) as WorkforceHours[]
        setHours(hoursRows)
        if (hoursRows.length >= HOURS_QUERY_MAX) {
          toast.error('This chapter has more hours records than can be shown at once; totals may be incomplete. Please contact support.')
        }
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveChapterId])

  const availableYears = useMemo(() => {
    const years = new Set<number>([TODAY_YEAR])
    hours.forEach((h) => years.add(parseYear(h.report_month)))
    return Array.from(years).sort((a, b) => b - a)
  }, [hours])

  function changeYear(y: number): void {
    setYear(y)
    setFromMonth(1)
    setToMonth(y === TODAY_YEAR ? TODAY_MONTH : 12)
  }

  function changeFromMonth(m: number): void {
    setFromMonth(m)
    if (m > toMonth) setToMonth(m)
  }

  function changeToMonth(m: number): void {
    setToMonth(m)
    if (m < fromMonth) setFromMonth(m)
  }

  function toggleExpanded(id: ID): void {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const monthlyByCompany = useMemo(() => aggregateMonthly(hours, year), [hours, year])

  const rows = useMemo<CompanyRow[]>(() => {
    return companies
      .filter((c) => statusFilter === 'all' || c.status === statusFilter)
      .map((company) => ({
        company,
        result: computeCompanyCharge(monthlyByCompany.get(company.id) ?? [], company.discount_tier, fromMonth, toMonth)
      }))
      .sort((a, b) => b.result.netDue - a.result.netDue || a.company.company_name.localeCompare(b.company.company_name))
  }, [companies, monthlyByCompany, statusFilter, fromMonth, toMonth])

  const totals = useMemo(() => ({
    netDue: rows.reduce((sum, r) => sum + r.result.netDue, 0),
    billableGpep: rows.reduce((sum, r) => sum + r.result.billableGpep, 0),
    hours: rows.reduce((sum, r) => sum + r.result.totalHours, 0),
    nonCompliant: rows.filter((r) => r.result.nonCompliant).length
  }), [rows])

  const unlinkedCount = useMemo(
    () => hours.filter((h) => !h.company_id && parseYear(h.report_month) === year).length,
    [hours, year]
  )

  if (chapterLoading || loading) {
    return <div style={{ padding: '32px', fontSize: '13px', color: '#64748B' }}>Loading…</div>
  }

  const rangeLabel = fromMonth === toMonth
    ? `${SHORT_MONTHS[fromMonth - 1]} ${year}`
    : `${SHORT_MONTHS[fromMonth - 1]}–${SHORT_MONTHS[toMonth - 1]} ${year}`

  return (
    <div className="page-content-wide" style={{ maxWidth: '1180px', margin: '0 auto' }}>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', margin: 0 }}>Service Charge</h2>
        <p style={{ fontSize: '13px', color: '#64748B', margin: '6px 0 0' }}>
          National Service Charge owed per company under the NECA bylaws — 0.2% of billable gross payroll (GPEP),
          with annual hour tiers (first {TIER1_CAP.toLocaleString()} hrs at 100%, {TIER1_CAP.toLocaleString()}–{TIER2_CAP.toLocaleString()} at 75%,
          above {TIER2_CAP.toLocaleString()} not billable) and multiple-membership discounts.
        </p>
      </div>

      {loadError && <div style={errorBox}>{loadError}</div>}

      {/* Filters */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label htmlFor="sc-year" style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>Year</label>
          <select id="sc-year" value={year} onChange={(e) => changeYear(parseInt(e.target.value))} style={{ ...inputStyle, width: 'auto', fontSize: '12px', padding: '4px 8px' }}>
            {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label htmlFor="sc-from" style={{ fontSize: '13px', fontWeight: 600, color: '#64748B' }}>From</label>
          <select id="sc-from" value={fromMonth} onChange={(e) => changeFromMonth(parseInt(e.target.value))} style={{ ...inputStyle, width: 'auto', fontSize: '12px', padding: '4px 8px' }}>
            {SHORT_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <label htmlFor="sc-to" style={{ fontSize: '13px', fontWeight: 600, color: '#64748B' }}>To</label>
          <select id="sc-to" value={toMonth} onChange={(e) => changeToMonth(parseInt(e.target.value))} style={{ ...inputStyle, width: 'auto', fontSize: '12px', padding: '4px 8px' }}>
            {SHORT_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {(['Active', 'all', 'Inactive'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: '4px 10px', fontSize: '11px', fontWeight: 500, borderRadius: '20px', cursor: 'pointer',
                background: statusFilter === s ? '#1E3A8A' : '#F8FAFC',
                color: statusFilter === s ? '#fff' : '#64748B',
                border: statusFilter === s ? '1px solid #1E3A8A' : '1px solid #E2E8F0'
              }}
            >
              {s === 'all' ? 'All companies' : `${s} only`}
            </button>
          ))}
        </div>
      </div>

      {fromMonth > 1 && (
        <div style={{ fontSize: '12px', color: '#64748B', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '8px 12px', marginBottom: '12px' }}>
          Tier caps accumulate from January. Months before {SHORT_MONTHS[fromMonth - 1]} still count toward each
          company's annual hour tiers and are shown as context rows in the breakdowns, but their charges are not
          included in the totals below.
        </div>
      )}

      {unlinkedCount > 0 && (
        <div style={{ fontSize: '12px', color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '8px 12px', marginBottom: '12px' }}>
          {unlinkedCount} hours {unlinkedCount === 1 ? 'entry' : 'entries'} in {year} {unlinkedCount === 1 ? 'is' : 'are'} not linked to a company
          and {unlinkedCount === 1 ? 'is' : 'are'} excluded from these calculations. Link them on the Hours tab.
        </div>
      )}

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '12px' }}>
        <SummaryCard label={`Net Due (${rangeLabel})`} value={formatMoney(totals.netDue)} emphasis />
        <SummaryCard label="Billable GPEP" value={formatMoney(totals.billableGpep, false)} />
        <SummaryCard label="Hours" value={Math.round(totals.hours).toLocaleString()} />
        <SummaryCard label="Non-Compliant" value={String(totals.nonCompliant)} warn={totals.nonCompliant > 0} />
      </div>

      {/* Roster table */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
        {rows.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>
            {companies.length === 0 ? 'No companies in the directory yet.' : 'No companies match the filter.'}
          </div>
        ) : (
          <div className="table-scroll">
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: '40px' }} scope="col"><span className="sr-only">Expand</span></th>
                <th style={thStyle} scope="col">Company</th>
                <th style={{ ...thStyle, textAlign: 'right' }} scope="col">Hours</th>
                <th style={{ ...thStyle, textAlign: 'right' }} scope="col">GPEP</th>
                <th style={{ ...thStyle, textAlign: 'right' }} scope="col">Billable GPEP</th>
                <th style={{ ...thStyle, textAlign: 'right' }} scope="col">Base Charge (0.2%)</th>
                <th style={{ ...thStyle, textAlign: 'right' }} scope="col">Discount</th>
                <th style={{ ...thStyle, textAlign: 'right' }} scope="col">Net Due</th>
                <th style={{ ...thStyle, width: '54px' }} scope="col"><span className="sr-only">Flags</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ company, result }) => {
                const expanded = expandedIds.has(company.id)
                const hasActivity = result.totalHours > 0
                return (
                  <CompanyRows
                    key={company.id}
                    company={company}
                    result={result}
                    expanded={expanded}
                    hasActivity={hasActivity}
                    onToggle={() => toggleExpanded(company.id)}
                  />
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <div style={{ marginTop: '16px', fontSize: '12px', color: '#94A3B8', lineHeight: 1.6 }}>
        Charges are computed from the hours and gross payroll reported on the Hours tab. Discount tiers are set
        per company in the Directory. Expand a row to see the full month-by-month calculation.
      </div>
    </div>
  )
}

function SummaryCard({ label, value, emphasis = false, warn = false }: {
  label: string
  value: string
  emphasis?: boolean
  warn?: boolean
}): React.JSX.Element {
  return (
    <div style={{ ...card, marginBottom: 0, borderColor: warn ? '#fde68a' : '#E2E8F0', background: warn ? '#fffbeb' : '#fff' }}>
      <div style={{ fontSize: '11px', color: warn ? '#b45309' : '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '4px', color: warn ? '#b45309' : emphasis ? COLORS.navy : '#0F172A' }}>{value}</div>
    </div>
  )
}

function CompanyRows({ company, result, expanded, hasActivity, onToggle }: {
  company: MemberCompany
  result: CompanyChargeResult
  expanded: boolean
  hasActivity: boolean
  onToggle: () => void
}): React.JSX.Element {
  const muted = { color: '#CBD5E1' }
  return (
    <>
      <tr>
        <td style={{ ...tdStyle, paddingRight: 0 }}>
          <button
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={`Show calculation for ${company.company_name}`}
            title={`Show calculation for ${company.company_name}`}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none"
              style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
              <path d="M6 3l5 5-5 5" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </td>
        <td style={tdStyle}>
          <span style={{ fontWeight: 600, color: '#0F172A' }}>{company.company_name}</span>
          <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
            {[company.city, company.status === 'Inactive' ? 'Inactive' : null].filter(Boolean).join(' · ') || ' '}
          </div>
        </td>
        <td style={{ ...tdStyle, textAlign: 'right', ...(hasActivity ? {} : muted) }}>
          {hasActivity ? Math.round(result.totalHours).toLocaleString() : '—'}
        </td>
        <td style={{ ...tdStyle, textAlign: 'right', ...(hasActivity ? {} : muted) }}>
          {hasActivity ? formatMoney(result.totalGpep, false) : '—'}
        </td>
        <td style={{ ...tdStyle, textAlign: 'right', ...(hasActivity ? {} : muted) }}>
          {hasActivity ? formatMoney(result.billableGpep, false) : '—'}
        </td>
        <td style={{ ...tdStyle, textAlign: 'right', ...(hasActivity ? {} : muted) }}>
          {hasActivity ? formatMoney(result.baseCharge) : '—'}
        </td>
        <td style={{ ...tdStyle, textAlign: 'right' }}>
          {result.discountPct > 0 ? (
            <>
              <span style={{ color: '#059669', fontWeight: 600 }}>
                {hasActivity ? `−${formatMoney(result.discountAmount)}` : `${Math.round(result.discountPct * 100)}%`}
              </span>
              {hasActivity && (
                <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>{Math.round(result.discountPct * 100)}%</div>
              )}
            </>
          ) : (
            <span style={muted}>—</span>
          )}
        </td>
        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: hasActivity ? COLORS.navy : '#CBD5E1' }}>
          {hasActivity ? formatMoney(result.netDue) : '—'}
        </td>
        <td style={{ ...tdStyle, textAlign: 'center' }}>
          <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
            {result.nonCompliant && (
              <svg
                aria-label={complianceMessage(result)}
                role="img"
                width="16" height="16" viewBox="0 0 24 24" fill="#dc2626"
              >
                <title>{complianceMessage(result)}</title>
                <path d="M12 2L1 21h22L12 2zm0 6l7.5 13h-15L12 8zm-1 4v4h2v-4h-2zm0 5v2h2v-2h-2z" fillRule="evenodd" />
              </svg>
            )}
            {result.warnings.length > 0 && (
              <span
                role="img"
                aria-label={result.warnings.join('; ')}
                title={result.warnings.join('\n')}
                style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }}
              />
            )}
          </span>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={9} style={{ padding: 0, borderBottom: '1px solid #E2E8F0', background: '#F8FAFC' }}>
            <Breakdown company={company} result={result} />
          </td>
        </tr>
      )}
    </>
  )
}

function complianceMessage(result: CompanyChargeResult): string {
  const monthLabel = result.lastReportedMonth ? SHORT_MONTHS[result.lastReportedMonth - 1] : 'any month'
  const hoursLabel = result.lastReportedMonthHours == null ? 'no hours' : `${Math.round(result.lastReportedMonthHours).toLocaleString()} hours`
  return `Last reported month (${monthLabel}) has ${hoursLabel} — below the ${COMPLIANCE_MIN_MONTHLY_HOURS.toLocaleString()}-hour minimum; discount eligibility at risk.`
}

// Month-by-month walk: hours -> cumulative hours -> tier rate -> GPEP x rate
// x 0.2% -> minus discount -> net due. Months that straddle a tier cap render
// as two rows (the "(cont'd)" pattern); context months before the selected
// range are muted.
function Breakdown({ company, result }: { company: MemberCompany; result: CompanyChargeResult }): React.JSX.Element {
  const visibleMonths = result.months.filter((m) => m.hours > 0 || m.gpep > 0)

  const cellStyle: React.CSSProperties = { ...tdStyle, fontSize: '12px', padding: '8px 16px', background: 'transparent' }
  const headStyle: React.CSSProperties = { ...thStyle, fontSize: '10px', padding: '8px 16px' }

  if (visibleMonths.length === 0) {
    return (
      <div style={{ padding: '18px 24px', fontSize: '13px', color: '#94A3B8' }}>
        No hours reported for {company.company_name} in this period.
      </div>
    )
  }

  return (
    <div style={{ padding: '14px 24px 18px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={headStyle} scope="col">Month</th>
            <th style={{ ...headStyle, textAlign: 'right' }} scope="col">Hours</th>
            <th style={{ ...headStyle, textAlign: 'right' }} scope="col">Cumulative Hours</th>
            <th style={{ ...headStyle, textAlign: 'right' }} scope="col">GPEP</th>
            <th style={headStyle} scope="col">Billable Rate</th>
            <th style={{ ...headStyle, textAlign: 'right' }} scope="col">Charge</th>
          </tr>
        </thead>
        <tbody>
          {visibleMonths.map((m) => <MonthRows key={m.month} m={m} />)}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5} style={{ ...cellStyle, textAlign: 'right', fontWeight: 600, color: '#64748B' }}>
              Total billable GPEP (GPEP × tier rate)
            </td>
            <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 600 }}>{formatMoney(result.billableGpep)}</td>
          </tr>
          <tr>
            <td colSpan={5} style={{ ...cellStyle, textAlign: 'right', fontWeight: 600, color: '#64748B' }}>
              Base charge = billable GPEP × 0.2%
            </td>
            <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 600 }}>{formatMoney(result.baseCharge)}</td>
          </tr>
          {result.discountPct > 0 && (
            <tr>
              <td colSpan={5} style={{ ...cellStyle, textAlign: 'right', fontWeight: 600, color: '#059669' }}>
                Membership discount ({DISCOUNT_TIER_LABEL[company.discount_tier]})
              </td>
              <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 600, color: '#059669' }}>−{formatMoney(result.discountAmount)}</td>
            </tr>
          )}
          <tr>
            <td colSpan={5} style={{ ...cellStyle, textAlign: 'right', fontWeight: 700, color: COLORS.navy, borderBottom: 'none' }}>
              Net Service Charge Due
            </td>
            <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 700, color: COLORS.navy, fontSize: '13px', borderBottom: 'none' }}>
              {formatMoney(result.netDue)}
            </td>
          </tr>
        </tfoot>
      </table>

      {(result.warnings.length > 0 || result.nonCompliant) && (
        <div style={{ marginTop: '10px', fontSize: '12px', color: '#b45309', lineHeight: 1.6 }}>
          {result.nonCompliant && <div>{complianceMessage(result)}</div>}
          {result.warnings.map((w) => <div key={w}>{w}</div>)}
        </div>
      )}
    </div>
  )
}

// One reported month -> one row per tier segment. The first segment carries
// the month label; further segments render as "(cont'd)" rows, exactly like
// months that cross the 75k/150k caps on a paper worksheet.
function MonthRows({ m }: { m: MonthBreakdown }): React.JSX.Element {
  const base: React.CSSProperties = {
    ...tdStyle,
    fontSize: '12px',
    padding: '8px 16px',
    background: 'transparent',
    opacity: m.inRange ? 1 : 0.5
  }
  const label = SHORT_MONTHS[m.month - 1]

  return (
    <>
      {m.segments.map((seg, i) => {
        const dotColor = RATE_COLORS[seg.tierLabel]
        let cumulative = m.cumulativeHoursBefore
        for (let j = 0; j <= i; j++) cumulative += m.segments[j].hours
        return (
          <tr key={`${m.month}-${i}`}>
            <td style={{ ...base, fontStyle: i > 0 ? 'italic' : 'normal', color: i > 0 ? '#94A3B8' : '#0F172A' }}>
              {i === 0 ? label : `${label} (cont'd)`}
              {i === 0 && !m.inRange && <span style={{ fontSize: '10px', color: '#94A3B8' }}> (context)</span>}
            </td>
            <td style={{ ...base, textAlign: 'right' }}>{Math.round(seg.hours).toLocaleString()}</td>
            <td style={{ ...base, textAlign: 'right', color: '#64748B' }}>{Math.round(cumulative).toLocaleString()}</td>
            <td style={{ ...base, textAlign: 'right' }}>
              {m.gpepMissing && i === 0 ? (
                <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '20px', background: '#fffbeb', color: '#b45309' }}>
                  no payroll reported
                </span>
              ) : (
                formatMoney(seg.gpep, false)
              )}
            </td>
            <td style={base}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <span aria-hidden="true" style={{ width: '8px', height: '8px', borderRadius: '50%', background: dotColor, display: 'inline-block' }} />
                {seg.tierLabel}
              </span>
            </td>
            <td style={{ ...base, textAlign: 'right', fontWeight: i === m.segments.length - 1 ? 600 : 400 }}>
              {formatMoney(seg.charge)}
            </td>
          </tr>
        )
      })}
    </>
  )
}
