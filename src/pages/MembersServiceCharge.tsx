import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useUserSettings } from '../lib/useUserSettings'
import { useToast } from '../lib/toast'
import { describeError } from '../lib/errors'
import { inputStyle, card, errorBox, thStyle, tdStyle } from '../lib/ui'
import type { WorkforceHours, MemberCompany } from '../lib/types'

// Per-company hours summary by year. The previous version applied NECA-specific
// service-charge math (tier caps, percentage rates, discount tiers); those
// numbers were hardcoded and have moved out of the codebase. Once the chapter
// confirms the current rates, the calculation can be re-added on top of this
// summary view.

const TODAY_YEAR = new Date().getFullYear()

function parseYear(iso: string): number {
  return parseInt(iso.slice(0, 4), 10)
}

export default function MembersServiceCharge(): React.JSX.Element {
  const { effectiveChapterId, applyChapterFilter, loading: chapterLoading } = useUserSettings()
  const toast = useToast()
  const [companies, setCompanies] = useState<MemberCompany[]>([])
  const [hours, setHours] = useState<WorkforceHours[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [year, setYear] = useState<number>(TODAY_YEAR)
  const [statusFilter, setStatusFilter] = useState<'all' | 'Active' | 'Inactive'>('Active')

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      applyChapterFilter(supabase.from('member_companies').select('*').order('company_name')),
      applyChapterFilter(supabase.from('workforce_hours').select('*'))
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
        setHours((hoursRes.data ?? []) as WorkforceHours[])
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

  const rows = useMemo(() => {
    const out = companies
      .filter((c) => statusFilter === 'all' || c.status === statusFilter)
      .map((c) => {
        let thisYear = 0
        let lastYear = 0
        let total = 0
        hours.forEach((h) => {
          if (h.company_id !== c.id) return
          const y = parseYear(h.report_month)
          const v = Number(h.total_hours ?? 0)
          total += v
          if (y === year) thisYear += v
          if (y === year - 1) lastYear += v
        })
        return { company: c, thisYear, lastYear, total }
      })
    return out.sort((a, b) => b.thisYear - a.thisYear || a.company.company_name.localeCompare(b.company.company_name))
  }, [companies, hours, year, statusFilter])

  const totalThisYear = rows.reduce((sum, r) => sum + r.thisYear, 0)
  const totalLastYear = rows.reduce((sum, r) => sum + r.lastYear, 0)

  if (chapterLoading || loading) {
    return <div style={{ padding: '32px', fontSize: '13px', color: '#64748B' }}>Loading…</div>
  }

  return (
    <div className="page-content-wide" style={{ maxWidth: '1080px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', margin: 0 }}>Service Charge</h2>
        <p style={{ fontSize: '13px', color: '#64748B', margin: '6px 0 0' }}>Per-company hours summary used as the basis for service-charge calculation.</p>
      </div>

      {loadError && <div style={errorBox}>{loadError}</div>}

      <div style={{ ...card }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>Year</span>
            <select value={year} onChange={(e) => setYear(parseInt(e.target.value))} style={{ ...inputStyle, width: 'auto', fontSize: '12px', padding: '4px 8px' }}>
              {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
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
          <div style={{ display: 'flex', gap: '24px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{year} Total</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A' }}>{Math.round(totalThisYear).toLocaleString()}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{year - 1} Total</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#94A3B8' }}>{Math.round(totalLastYear).toLocaleString()}</div>
            </div>
          </div>
        </div>

        {rows.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>
            {companies.length === 0 ? 'No companies in the directory yet.' : 'No companies match the filter.'}
          </div>
        ) : (
          <div className="table-scroll">
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '480px' }}>
            <thead>
              <tr>
                <th style={thStyle} scope="col">Company</th>
                <th style={thStyle} scope="col">Status</th>
                <th style={{ ...thStyle, textAlign: 'right' }} scope="col">{year} Hours</th>
                <th style={{ ...thStyle, textAlign: 'right' }} scope="col">{year - 1} Hours</th>
                <th style={{ ...thStyle, textAlign: 'right' }} scope="col">All-Time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ company, thisYear, lastYear, total }) => {
                const delta = thisYear - lastYear
                return (
                  <tr key={company.id}>
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 600, color: '#0F172A' }}>{company.company_name}</span>
                      {company.city && <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>{company.city}</div>}
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px',
                        background: company.status === 'Active' ? '#f0fdf4' : '#F8FAFC',
                        color: company.status === 'Active' ? '#059669' : '#64748B'
                      }}>{company.status}</span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: thisYear > 0 ? '#0F172A' : '#CBD5E1' }}>
                      {thisYear > 0 ? Math.round(thisYear).toLocaleString() : '—'}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#64748B' }}>
                      {lastYear > 0 ? Math.round(lastYear).toLocaleString() : '—'}
                      {lastYear > 0 && thisYear > 0 && (
                        <span style={{ marginLeft: '6px', fontSize: '11px', color: delta >= 0 ? '#059669' : '#dc2626' }}>
                          {delta >= 0 ? '+' : ''}{Math.round(delta / lastYear * 100)}%
                        </span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#64748B' }}>
                      {total > 0 ? Math.round(total).toLocaleString() : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <div style={{ marginTop: '16px', fontSize: '12px', color: '#94A3B8', lineHeight: 1.6 }}>
        Hours-based service-charge math is intentionally not applied here. Once the chapter confirms
        the current tier caps, base rate, and discount structure, those numbers will be added on top of
        this summary view.
      </div>
    </div>
  )
}
