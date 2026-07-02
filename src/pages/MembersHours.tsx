import { useEffect, useMemo, useState } from 'react'
import { supabase, HOURS_QUERY_MAX } from '../lib/supabase'
import { useUserSettings } from '../lib/useUserSettings'
import { useToast } from '../lib/toast'
import { describeError } from '../lib/errors'
import ConfirmDialog from '../lib/ConfirmDialog'
import { inputStyle, labelStyle, btnPrimary, btnSecondary, btnDanger, card, errorBox, thStyle, tdStyle } from '../lib/ui'
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
  const [companyFilter, setCompanyFilter] = useState<string>('all')

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<WorkforceHours | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [confirmDelete, setConfirmDelete] = useState<WorkforceHours | null>(null)
  const [deleting, setDeleting] = useState(false)

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

  function companyName(id: ID | null): string {
    if (!id) return '—'
    return companies.find((c) => c.id === id)?.company_name ?? '(unknown)'
  }

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

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const { year } = parseReportMonth(r.report_month)
      if (year !== yearFilter) return false
      if (companyFilter !== 'all' && r.company_id !== companyFilter) return false
      return true
    })
  }, [rows, yearFilter, companyFilter])

  const monthlyTotals = useMemo(() => {
    const totals = Array.from({ length: 12 }, () => 0)
    filtered.forEach((r) => {
      const { month } = parseReportMonth(r.report_month)
      totals[month - 1] += Number(r.total_hours ?? 0)
    })
    return totals
  }, [filtered])

  const yearTotal = monthlyTotals.reduce((sum, h) => sum + h, 0)

  function startCreate(): void {
    setEditing(null)
    setForm(EMPTY_FORM)
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

    setSaving(true)
    const payload = {
      chapter_id: effectiveChapterId,
      report_month: firstOfMonthIso(form.year, form.month),
      total_hours: hours,
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
        {!showForm && <button style={btnPrimary} onClick={startCreate}>+ Add Entry</button>}
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

      {/* Summary card */}
      <div style={{ ...card, marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>Monthly Summary</span>
            <select value={yearFilter} onChange={(e) => setYearFilter(parseInt(e.target.value))} style={{ ...inputStyle, width: 'auto', fontSize: '12px', padding: '4px 8px' }}>
              {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} style={{ ...inputStyle, width: 'auto', fontSize: '12px', padding: '4px 8px' }}>
              <option value="all">All companies</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </select>
          </div>
          <span style={{ fontSize: '13px', color: '#64748B' }}>
            <strong style={{ color: '#0F172A', fontSize: '15px' }}>{Math.round(yearTotal).toLocaleString()}</strong> hours in {yearFilter}
          </span>
        </div>
        <div className="table-scroll">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '4px', minWidth: '600px' }}>
          {MONTH_LABELS.map((label, i) => {
            const total = monthlyTotals[i]
            return (
              <div key={label} style={{ textAlign: 'center', padding: '8px 4px', background: total > 0 ? '#EEF2FF' : '#F8FAFC', borderRadius: '6px' }}>
                <div style={{ fontSize: '10px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: total > 0 ? '#0F172A' : '#CBD5E1', marginTop: '4px' }}>
                  {total > 0 ? Math.round(total).toLocaleString() : '—'}
                </div>
              </div>
            )
          })}
        </div>
        </div>
      </div>

      {/* Detail table */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #E2E8F0', fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>
          {filtered.length} {filtered.length === 1 ? 'Entry' : 'Entries'}
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>
            No hours recorded for this period.{' '}
            <button onClick={startCreate} style={{ background: 'none', border: 'none', color: '#1E3A8A', cursor: 'pointer', padding: 0, fontSize: '13px', fontWeight: 600 }}>Add an entry</button>
          </div>
        ) : (
          <div className="table-scroll">
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '540px' }}>
            <thead>
              <tr>
                <th style={thStyle} scope="col">Month</th>
                <th style={thStyle} scope="col">Company</th>
                <th style={thStyle} scope="col">Local Union</th>
                <th style={thStyle} scope="col">Classification</th>
                <th style={{ ...thStyle, textAlign: 'right' }} scope="col">Hours</th>
                <th style={{ ...thStyle, width: '160px' }} scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const { year, month } = parseReportMonth(r.report_month)
                return (
                  <tr key={r.id}>
                    <td style={tdStyle}>{MONTH_LABELS[month - 1]} {year}</td>
                    <td style={tdStyle}>{companyName(r.company_id)}</td>
                    <td style={tdStyle}>{unionLabel(r.local_union_id)}</td>
                    <td style={tdStyle}>{r.classification ?? '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{Math.round(Number(r.total_hours)).toLocaleString()}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <button style={{ ...btnSecondary, fontSize: '12px', padding: '4px 10px', marginRight: '6px' }} onClick={() => startEdit(r)}>Edit</button>
                      <button style={{ ...btnDanger, fontSize: '12px', padding: '4px 10px' }} onClick={() => setConfirmDelete(r)}>Delete</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

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
