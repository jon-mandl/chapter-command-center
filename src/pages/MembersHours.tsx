import { Fragment, useEffect, useMemo, useState } from 'react'
import { supabase, HOURS_QUERY_MAX } from '../lib/supabase'
import { useUserSettings } from '../lib/useUserSettings'
import { useToast } from '../lib/toast'
import { describeError } from '../lib/errors'
import ConfirmDialog from '../lib/ConfirmDialog'
import ImportHoursModal from './ImportHoursModal'
import { inputStyle, labelStyle, btnPrimary, btnSecondary, btnDanger, card, errorBox, thStyle, tdStyle, formatMoney } from '../lib/ui'
import type { WorkforceHours, MemberCompany, LocalUnion, ID } from '../lib/types'

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function firstOfMonthIso(year: number, month: number): string {
  // month: 1..12
  const m = String(month).padStart(2, '0')
  return `${year}-${m}-01`
}

function parseReportMonth(iso: string): { year: number; month: number } {
  // workforce_hours.report_month is a Postgres date — comes back as "YYYY-MM-DD"
  const [y, m] = iso.split('-').map((s) => parseInt(s, 10))
  return { year: y, month: m }
}

type FormState = {
  year: number
  month: number
  company_id: string
  local_union_id: string
  total_hours: string
  gross_payroll: string
  classification: string
}

const TODAY = new Date()
const DEFAULT_YEAR = TODAY.getFullYear()
const DEFAULT_MONTH = TODAY.getMonth() + 1

const EMPTY_FORM: FormState = {
  year: DEFAULT_YEAR,
  month: DEFAULT_MONTH,
  company_id: '',
  local_union_id: '',
  total_hours: '',
  gross_payroll: '',
  classification: ''
}

export default function MembersHours(): React.JSX.Element {
  const { effectiveChapterId, applyChapterFilter, loading: chapterLoading } = useUserSettings()
  const toast = useToast()
  const [rows, setRows] = useState<WorkforceHours[]>([])
  const [companies, setCompanies] = useState<MemberCompany[]>([])
  const [unions, setUnions] = useState<LocalUnion[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [yearFilter, setYearFilter] = useState<number>(DEFAULT_YEAR)
  const [companySearch, setCompanySearch] = useState('')
  // Which pivot cell's entries are expanded beneath its company row
  const [expandedCell, setExpandedCell] = useState<{ key: string; month: number } | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<WorkforceHours | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [confirmDelete, setConfirmDelete] = useState<WorkforceHours | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showImport, setShowImport] = useState(false)

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      applyChapterFilter(supabase.from('workforce_hours').select('*').order('report_month', { ascending: false })).range(0, HOURS_QUERY_MAX - 1),
      applyChapterFilter(supabase.from('member_companies').select('*').order('company_name')),
      applyChapterFilter(supabase.from('local_unions').select('*').order('local_number'))
    ]).then(([rowsRes, compRes, unionsRes]: [{ data: unknown; error: unknown }, { data: unknown; error: unknown }, { data: unknown; error: unknown }]) => {
      if (cancelled) return
      if (rowsRes.error) {
        setLoadError(describeError(rowsRes.error, 'Could not load hours.'))
      } else {
        const hoursRows = (rowsRes.data ?? []) as WorkforceHours[]
        setRows(hoursRows)
        // If we hit the ceiling, totals below would be silently incomplete —
        // warn instead of showing a wrong number.
        if (hoursRows.length >= HOURS_QUERY_MAX) {
          toast.error('This chapter has more hours records than can be shown at once; totals may be incomplete. Please contact support.')
        }
      }
      if (compRes.error) toast.error('Could not load companies: ' + describeError(compRes.error))
      else setCompanies((compRes.data ?? []) as MemberCompany[])
      if (unionsRes.error) toast.error('Could not load local unions: ' + describeError(unionsRes.error))
      else setUnions((unionsRes.data ?? []) as LocalUnion[])
      setLoading(false)
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveChapterId])

  function unionLabel(id: ID | null): string {
    if (!id) return '—'
    const u = unions.find((x) => x.id === id)
    return u ? `Local ${u.local_number}` : '(unknown)'
  }

  const availableYears = useMemo(() => {
    const years = new Set<number>([DEFAULT_YEAR])
    rows.forEach((r) => {
      const { year } = parseReportMonth(r.report_month)
      years.add(year)
    })
    return Array.from(years).sort((a, b) => b - a)
  }, [rows])

  const yearRows = useMemo(
    () => rows.filter((r) => parseReportMonth(r.report_month).year === yearFilter),
    [rows, yearFilter]
  )

  // One pivot row per company (plus one for entries with no company link):
  // per-month sums for the cells and the underlying rows for the expansion.
  interface PivotRow {
    key: string // company id, or 'unlinked'
    label: string
    monthSums: number[]
    monthEntries: WorkforceHours[][]
    total: number
  }

  const pivot = useMemo<PivotRow[]>(() => {
    const map = new Map<string, PivotRow>()
    yearRows.forEach((r) => {
      const key = r.company_id ?? 'unlinked'
      let row = map.get(key)
      if (!row) {
        row = {
          key,
          label: r.company_id
            ? (companies.find((c) => c.id === r.company_id)?.company_name ?? '(unknown company)')
            : 'Unlinked entries',
          monthSums: Array.from({ length: 12 }, () => 0),
          monthEntries: Array.from({ length: 12 }, () => [] as WorkforceHours[]),
          total: 0
        }
        map.set(key, row)
      }
      const { month } = parseReportMonth(r.report_month)
      if (month >= 1 && month <= 12) {
        const h = Number(r.total_hours ?? 0)
        row.monthSums[month - 1] += h
        row.monthEntries[month - 1].push(r)
        row.total += h
      }
    })
    return Array.from(map.values()).sort((a, b) => {
      if (a.key === 'unlinked') return 1
      if (b.key === 'unlinked') return -1
      return a.label.localeCompare(b.label)
    })
  }, [yearRows, companies])

  const searchTerm = companySearch.trim().toLowerCase()
  const visiblePivot = searchTerm
    ? pivot.filter((p) => p.label.toLowerCase().includes(searchTerm))
    : pivot

  const yearTotal = yearRows.reduce((sum, r) => sum + Number(r.total_hours ?? 0), 0)
  const footerTotals = Array.from({ length: 12 }, (_, m) =>
    visiblePivot.reduce((sum, p) => sum + p.monthSums[m], 0))
  const footerGrandTotal = footerTotals.reduce((sum, t) => sum + t, 0)

  function startCreate(): void {
    setEditing(null)
    setForm(EMPTY_FORM)
    setSaveError('')
    setShowForm(true)
  }

  // Cell click on an empty month: open the form prefilled for that slot.
  function startCreateFor(companyKey: string, month: number): void {
    setEditing(null)
    setForm({ ...EMPTY_FORM, year: yearFilter, month, company_id: companyKey === 'unlinked' ? '' : companyKey })
    setSaveError('')
    setShowForm(true)
  }

  function startEdit(row: WorkforceHours): void {
    const { year, month } = parseReportMonth(row.report_month)
    setEditing(row)
    setForm({
      year,
      month,
      company_id: row.company_id ?? '',
      local_union_id: row.local_union_id ?? '',
      total_hours: String(row.total_hours ?? ''),
      gross_payroll: row.gross_payroll == null ? '' : String(row.gross_payroll),
      classification: row.classification ?? ''
    })
    setSaveError('')
    setShowForm(true)
  }

  async function handleSave(): Promise<void> {
    setSaveError('')
    if (!editing && !effectiveChapterId) {
      setSaveError('Select a specific chapter from the sidebar before adding hours.')
      return
    }
    const hours = Number(form.total_hours)
    if (!form.total_hours.trim() || Number.isNaN(hours)) { setSaveError('Total hours must be a number.'); return }
    if (hours < 0) { setSaveError('Total hours cannot be negative.'); return }

    let grossPayroll: number | null = null
    if (form.gross_payroll.trim()) {
      grossPayroll = Number(form.gross_payroll)
      if (Number.isNaN(grossPayroll)) { setSaveError('Gross payroll must be a number.'); return }
      if (grossPayroll < 0) { setSaveError('Gross payroll cannot be negative.'); return }
    }

    setSaving(true)
    const payload = {
      chapter_id: effectiveChapterId,
      report_month: firstOfMonthIso(form.year, form.month),
      total_hours: hours,
      gross_payroll: grossPayroll,
      company_id: form.company_id || null,
      local_union_id: form.local_union_id || null,
      classification: form.classification.trim() || null
    }

    if (editing) {
      const { data, error: err } = await supabase
        .from('workforce_hours')
        .update(payload)
        .eq('id', editing.id)
        .select()
        .single()
      setSaving(false)
      if (err || !data) {
        const msg = describeError(err, 'Could not save.')
        setSaveError(msg)
        toast.error(msg)
        return
      }
      const updated = data as WorkforceHours
      setRows((prev) => prev.map((r) => r.id === updated.id ? updated : r).sort((a, b) => a.report_month < b.report_month ? 1 : -1))
      setShowForm(false)
      toast.success('Hours updated.')
      return
    }

    const { data, error: err } = await supabase
      .from('workforce_hours')
      .insert(payload)
      .select()
      .single()
    setSaving(false)
    if (err || !data) {
      const msg = describeError(err, 'Could not save.')
      setSaveError(msg)
      toast.error(msg)
      return
    }
    setRows((prev) => [data as WorkforceHours, ...prev])
    setShowForm(false)
    toast.success('Hours added.')
  }

  async function handleDelete(): Promise<void> {
    if (!confirmDelete) return
    setDeleting(true)
    const { error: err } = await supabase
      .from('workforce_hours')
      .delete()
      .eq('id', confirmDelete.id)
    setDeleting(false)
    if (err) {
      toast.error('Could not delete: ' + describeError(err))
      return
    }
    setRows((prev) => prev.filter((r) => r.id !== confirmDelete.id))
    setConfirmDelete(null)
    toast.success('Hours entry deleted.')
  }

  if (chapterLoading || loading) {
    return <div style={{ padding: '32px', fontSize: '13px', color: '#64748B' }}>Loading…</div>
  }

  return (
    <div className="page-content-wide" style={{ maxWidth: '1080px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', margin: 0 }}>Workforce Hours</h2>
          <p style={{ fontSize: '13px', color: '#64748B', margin: '6px 0 0' }}>Track monthly hours by company and local union.</p>
        </div>
        {!showForm && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              style={{ ...btnSecondary, opacity: effectiveChapterId ? 1 : 0.5 }}
              disabled={!effectiveChapterId}
              title={effectiveChapterId ? 'Import hours from Excel or CSV' : 'Select a specific chapter from the sidebar to import'}
              onClick={() => setShowImport(true)}
            >
              Import Hours
            </button>
            <button style={btnPrimary} onClick={startCreate}>+ Add Entry</button>
          </div>
        )}
      </div>

      {loadError && <div style={errorBox}>{loadError}</div>}

      {showForm && (
        <div style={{ ...card, borderColor: '#1E3A8A', borderWidth: '1.5px', marginBottom: '20px', maxWidth: '720px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '20px' }}>
            {editing ? 'Edit Hours Entry' : 'New Hours Entry'}
          </div>
          <div className="grid-3col" style={{ marginBottom: '14px' }}>
            <div>
              <label style={labelStyle}>Year <span style={{ color: '#ef4444' }}>*</span></label>
              <input type="number" style={inputStyle} value={form.year} onChange={(e) => setForm({ ...form, year: parseInt(e.target.value) || DEFAULT_YEAR })} min={2000} max={2100} />
            </div>
            <div>
              <label style={labelStyle}>Month <span style={{ color: '#ef4444' }}>*</span></label>
              <select style={inputStyle} value={form.month} onChange={(e) => setForm({ ...form, month: parseInt(e.target.value) })}>
                {MONTH_LABELS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Total Hours <span style={{ color: '#ef4444' }}>*</span></label>
              <input type="number" style={inputStyle} value={form.total_hours} onChange={(e) => setForm({ ...form, total_hours: e.target.value })} min={0} step={0.5} placeholder="0" />
            </div>
            <div>
              <label style={labelStyle}>Gross Payroll (GPEP) $</label>
              <input type="number" style={inputStyle} value={form.gross_payroll} onChange={(e) => setForm({ ...form, gross_payroll: e.target.value })} min={0} step={0.01} placeholder="Optional" />
            </div>
            <div>
              <label style={labelStyle}>Company</label>
              <select style={inputStyle} value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })}>
                <option value="">— None —</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Local Union</label>
              <select style={inputStyle} value={form.local_union_id} onChange={(e) => setForm({ ...form, local_union_id: e.target.value })}>
                <option value="">— None —</option>
                {unions.map((u) => <option key={u.id} value={u.id}>Local {u.local_number}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Classification</label>
              <input style={inputStyle} value={form.classification} onChange={(e) => setForm({ ...form, classification: e.target.value })} placeholder="e.g. Journeyman" />
            </div>
          </div>
          {saveError && <div style={errorBox}>{saveError}</div>}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={{ ...btnPrimary, opacity: saving ? 0.5 : 1 }} disabled={saving} onClick={handleSave}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button style={btnSecondary} disabled={saving} onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Company × month pivot */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>Hours by Company</span>
            <select
              value={yearFilter}
              onChange={(e) => { setYearFilter(parseInt(e.target.value)); setExpandedCell(null) }}
              style={{ ...inputStyle, width: 'auto', fontSize: '12px', padding: '4px 8px' }}
              aria-label="Year"
            >
              {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <input
              style={{ ...inputStyle, width: '200px', fontSize: '12px', padding: '4px 8px' }}
              placeholder="Search company…"
              value={companySearch}
              onChange={(e) => setCompanySearch(e.target.value)}
              aria-label="Search companies"
            />
          </div>
          <span style={{ fontSize: '13px', color: '#64748B' }}>
            <strong style={{ color: '#0F172A', fontSize: '15px' }}>{Math.round(yearTotal).toLocaleString()}</strong> hours in {yearFilter}
          </span>
        </div>
        {visiblePivot.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>
            {pivot.length === 0 ? (
              <>
                No hours recorded for {yearFilter}.{' '}
                <button onClick={startCreate} style={{ background: 'none', border: 'none', color: '#1E3A8A', cursor: 'pointer', padding: 0, fontSize: '13px', fontWeight: 600 }}>Add an entry</button>
              </>
            ) : 'No companies match your search.'}
          </div>
        ) : (
          <div className="table-scroll">
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1100px' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, position: 'sticky', left: 0, zIndex: 1 }} scope="col">Company</th>
                {MONTH_LABELS.map((m) => <th key={m} style={{ ...thStyle, textAlign: 'right' }} scope="col">{m}</th>)}
                <th style={{ ...thStyle, textAlign: 'right' }} scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {visiblePivot.map((p) => {
                const isRowExpanded = expandedCell?.key === p.key
                const openMonth = isRowExpanded && expandedCell ? expandedCell.month : null
                return (
                  <Fragment key={p.key}>
                    <tr>
                      <td style={{ ...tdStyle, position: 'sticky', left: 0, background: '#fff', zIndex: 1, fontWeight: 600, color: p.key === 'unlinked' ? '#64748B' : '#0F172A' }}>
                        {p.label}
                      </td>
                      {p.monthSums.map((sum, m) => {
                        const has = p.monthEntries[m].length > 0
                        const isOpen = openMonth === m
                        return (
                          <td key={m} style={{ ...tdStyle, padding: 0, textAlign: 'right' }}>
                            <button
                              onClick={() => {
                                if (has) setExpandedCell(isOpen ? null : { key: p.key, month: m })
                                else startCreateFor(p.key, m + 1)
                              }}
                              title={has ? 'View or edit this month’s entries' : 'Add hours for this month'}
                              aria-label={`${p.label}, ${MONTH_LABELS[m]} ${yearFilter}: ${has ? `${Math.round(sum).toLocaleString()} hours` : 'no hours'}`}
                              style={{
                                display: 'block', width: '100%', padding: '12px 16px', textAlign: 'right',
                                background: isOpen ? '#EEF2FF' : 'none', border: 'none', cursor: 'pointer',
                                fontSize: '13px', fontWeight: has ? 600 : 400, color: has ? '#0F172A' : '#CBD5E1'
                              }}
                            >
                              {has ? Math.round(sum).toLocaleString() : '—'}
                            </button>
                          </td>
                        )
                      })}
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{Math.round(p.total).toLocaleString()}</td>
                    </tr>
                    {isRowExpanded && openMonth != null && (
                      <tr>
                        <td colSpan={14} style={{ ...tdStyle, background: '#F8FAFC', padding: '12px 18px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '6px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }}>
                              {p.label} — {MONTH_LABELS[openMonth]} {yearFilter}
                            </span>
                            <button
                              style={{ ...btnSecondary, fontSize: '12px', padding: '3px 10px' }}
                              onClick={() => startCreateFor(p.key, openMonth + 1)}
                            >
                              + Add another entry
                            </button>
                          </div>
                          {p.monthEntries[openMonth].length === 0 ? (
                            <div style={{ fontSize: '13px', color: '#94A3B8' }}>No entries for this month.</div>
                          ) : p.monthEntries[openMonth].map((r) => (
                            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '6px 0', borderTop: '1px solid #F1F5F9', fontSize: '13px', flexWrap: 'wrap' }}>
                              <span style={{ color: '#475569', minWidth: '130px' }}>{r.classification ?? 'No classification'}</span>
                              <span style={{ color: '#64748B', minWidth: '90px' }}>{unionLabel(r.local_union_id)}</span>
                              <span style={{ fontWeight: 600, color: '#0F172A' }}>{Math.round(Number(r.total_hours)).toLocaleString()} hrs</span>
                              <span style={{ color: r.gross_payroll == null ? '#CBD5E1' : '#64748B' }}>{formatMoney(r.gross_payroll, false)} GPEP</span>
                              <span style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                                <button style={{ ...btnSecondary, fontSize: '12px', padding: '3px 10px' }} onClick={() => startEdit(r)}>Edit</button>
                                <button style={{ ...btnDanger, fontSize: '12px', padding: '3px 10px' }} onClick={() => setConfirmDelete(r)}>Delete</button>
                              </span>
                            </div>
                          ))}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ ...tdStyle, position: 'sticky', left: 0, zIndex: 1, background: '#F8FAFC', fontWeight: 700, borderTop: '2px solid #E2E8F0' }}>
                  {searchTerm ? 'Filtered total' : 'All companies'}
                </td>
                {footerTotals.map((t, m) => (
                  <td key={m} style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, background: '#F8FAFC', borderTop: '2px solid #E2E8F0', color: t > 0 ? '#0F172A' : '#CBD5E1' }}>
                    {t > 0 ? Math.round(t).toLocaleString() : '—'}
                  </td>
                ))}
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, background: '#F8FAFC', borderTop: '2px solid #E2E8F0' }}>
                  {Math.round(footerGrandTotal).toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>
          </div>
        )}
        <div style={{ padding: '10px 18px', borderTop: '1px solid #F1F5F9', fontSize: '11px', color: '#94A3B8' }}>
          Click a month cell to add hours or open that month’s entries for editing.
        </div>
      </div>

      {showImport && effectiveChapterId && (
        <ImportHoursModal
          chapterId={effectiveChapterId}
          companies={companies}
          existingHours={rows}
          onClose={() => setShowImport(false)}
          onImported={(inserted, updated) => {
            setRows((prev) => {
              const updatedById = new Map(updated.map((r) => [r.id, r]))
              const merged = prev.map((r) => updatedById.get(r.id) ?? r)
              return [...inserted, ...merged].sort((a, b) => a.report_month < b.report_month ? 1 : -1)
            })
          }}
        />
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete hours entry?"
        message={confirmDelete ? `Delete the ${(() => { const { year, month } = parseReportMonth(confirmDelete.report_month); return `${MONTH_LABELS[month - 1]} ${year}` })()} entry (${Math.round(Number(confirmDelete.total_hours))} hours)? This cannot be undone.` : ''}
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
