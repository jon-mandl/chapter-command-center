import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useOrg } from '../lib/useOrg'
import { inputStyle, btnPrimary, btnSecondary, labelStyle } from '../lib/ui'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Company {
  id: number
  company_name: string
  status: string
}

interface HoursEntry {
  id: number
  company_id: number
  company_name: string
  year: number
  month: number
  hours: number
  gpep: number | null
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// ─── Main Component ────────────────────────────────────────────────────────────

export default function MembersHours(): React.JSX.Element {
  const { orgId, loading: orgLoading } = useOrg()
  const [entries, setEntries] = useState<HoursEntry[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear())
  const [filterMonth, setFilterMonth] = useState<string>('all')
  const [filterCompany, setFilterCompany] = useState<string>('all')

  // Add / edit panel
  const [showPanel, setShowPanel] = useState(false)
  const [editingEntry, setEditingEntry] = useState<HoursEntry | null>(null)
  const [form, setForm] = useState({ company_id: '', year: String(new Date().getFullYear()), month: String(new Date().getMonth() + 1), hours: '', gpep: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (!orgId) return
    Promise.all([
      supabase
        .from('man_hours')
        .select('id, company_id, year, month, hours, gpep, member_companies(company_name)')
        .eq('org_id', orgId)
        .order('year', { ascending: false })
        .order('month', { ascending: false }),
      supabase
        .from('member_companies')
        .select('id, company_name, status')
        .eq('org_id', orgId)
        .order('company_name')
    ]).then(([hoursRes, companyRes]) => {
      const rawEntries = (hoursRes.data ?? []) as unknown as Array<{
        id: number; company_id: number; year: number; month: number; hours: number; gpep: number | null;
        member_companies: { company_name: string }[] | null
      }>
      setEntries(rawEntries.map((e) => ({
        id: e.id,
        company_id: e.company_id,
        company_name: e.member_companies?.[0]?.company_name ?? '—',
        year: e.year,
        month: e.month,
        hours: e.hours,
        gpep: e.gpep
      })))
      setCompanies((companyRes.data as Company[]) ?? [])
      setLoading(false)
    })
  }, [orgId])

  const activeCompanies = companies.filter((c) => c.status === 'active')

  const availableYears = (() => {
    const years = new Set(entries.map((e) => e.year))
    years.add(new Date().getFullYear())
    return Array.from(years).sort((a, b) => b - a)
  })()

  const filtered = entries.filter((e) => {
    if (e.year !== filterYear) return false
    if (filterMonth !== 'all' && String(e.month) !== filterMonth) return false
    if (filterCompany !== 'all' && String(e.company_id) !== filterCompany) return false
    return true
  })

  function openAdd(): void {
    setForm({ company_id: '', year: String(filterYear), month: String(new Date().getMonth() + 1), hours: '', gpep: '' })
    setEditingEntry(null)
    setFormError('')
    setShowPanel(true)
  }

  function openEdit(entry: HoursEntry): void {
    setForm({ company_id: String(entry.company_id), year: String(entry.year), month: String(entry.month), hours: String(entry.hours), gpep: entry.gpep != null ? String(entry.gpep) : '' })
    setEditingEntry(entry)
    setFormError('')
    setShowPanel(true)
  }

  function closePanel(): void {
    setShowPanel(false)
    setEditingEntry(null)
    setFormError('')
  }

  async function handleSave(): Promise<void> {
    if (!orgId || !form.company_id || !form.hours) {
      setFormError('Company and hours are required.')
      return
    }
    const hours = parseFloat(form.hours)
    if (isNaN(hours) || hours <= 0) { setFormError('Hours must be a number greater than 0.'); return }
    const gpepVal = form.gpep.trim() ? parseFloat(form.gpep.replace(/,/g, '')) : null
    if (form.gpep.trim() && (gpepVal === null || isNaN(gpepVal) || gpepVal < 0)) { setFormError('GPEP must be a valid dollar amount.'); return }

    setSaving(true)
    setFormError('')
    setError('')

    if (editingEntry) {
      const { data, error: err } = await supabase
        .from('man_hours')
        .update({ hours, gpep: gpepVal })
        .eq('id', editingEntry.id)
        .select('id, company_id, year, month, hours, gpep, member_companies(company_name)')
        .single()
      if (err) { setFormError('Could not save. Please try again.') }
      else {
        const raw = data as unknown as { id: number; company_id: number; year: number; month: number; hours: number; gpep: number | null; member_companies: { company_name: string }[] | null }
        const updated: HoursEntry = { id: raw.id, company_id: raw.company_id, company_name: raw.member_companies?.[0]?.company_name ?? '—', year: raw.year, month: raw.month, hours: raw.hours, gpep: raw.gpep }
        setEntries((prev) => prev.map((e) => e.id === updated.id ? updated : e))
        closePanel()
      }
    } else {
      const { data, error: err } = await supabase
        .from('man_hours')
        .insert({ org_id: orgId, company_id: parseInt(form.company_id), year: parseInt(form.year), month: parseInt(form.month), hours, gpep: gpepVal })
        .select('id, company_id, year, month, hours, gpep, member_companies(company_name)')
        .single()
      if (err) {
        if (err.code === '23505') setFormError('An entry for this company, year, and month already exists.')
        else setFormError('Could not save. Please try again.')
      } else {
        const raw = data as unknown as { id: number; company_id: number; year: number; month: number; hours: number; gpep: number | null; member_companies: { company_name: string }[] | null }
        const created: HoursEntry = { id: raw.id, company_id: raw.company_id, company_name: raw.member_companies?.[0]?.company_name ?? '—', year: raw.year, month: raw.month, hours: raw.hours, gpep: raw.gpep }
        setEntries((prev) => [created, ...prev])
        closePanel()
      }
    }
    setSaving(false)
  }

  async function handleDelete(entry: HoursEntry): Promise<void> {
    setError('')
    const { error: err } = await supabase.from('man_hours').delete().eq('id', entry.id)
    if (err) setError('Could not delete entry. Please try again.')
    else setEntries((prev) => prev.filter((e) => e.id !== entry.id))
  }

  const totalHours = filtered.reduce((sum, e) => sum + e.hours, 0)
  const gpepEntries = filtered.filter((e) => e.gpep != null)
  const totalGpep = gpepEntries.reduce((sum, e) => sum + (e.gpep ?? 0), 0)

  if (orgLoading || loading) {
    return <div style={{ padding: '32px', fontSize: '13px', color: '#64748B' }}>Loading…</div>
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: '960px', position: 'relative' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#0F172A', margin: 0 }}>Member Hours</h1>
          <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0' }}>Monthly hours reported by member companies</p>
        </div>
        <button style={btnPrimary} onClick={openAdd}>+ Add Entry</button>
      </div>

      {error && (
        <div style={{ marginBottom: '16px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {error}
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#94A3B8' }}>×</button>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', color: '#64748B' }}>Year:</span>
          <select value={filterYear} onChange={(e) => setFilterYear(parseInt(e.target.value))} style={{ ...inputStyle, width: 'auto', padding: '6px 10px' }}>
            {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', color: '#64748B' }}>Month:</span>
          <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} style={{ ...inputStyle, width: 'auto', padding: '6px 10px' }}>
            <option value="all">All Months</option>
            {MONTHS.map((m, i) => <option key={i + 1} value={String(i + 1)}>{m}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', color: '#64748B' }}>Company:</span>
          <select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)} style={{ ...inputStyle, width: 'auto', padding: '6px 10px', maxWidth: '220px' }}>
            <option value="all">All Companies</option>
            {companies.filter((c) => entries.some((e) => e.company_id === c.id && e.year === filterYear)).map((c) => (
              <option key={c.id} value={String(c.id)}>{c.company_name}</option>
            ))}
          </select>
        </div>
        {(filterMonth !== 'all' || filterCompany !== 'all') && (
          <button onClick={() => { setFilterMonth('all'); setFilterCompany('all') }} style={{ fontSize: '12px', color: '#64748B', background: 'none', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer' }}>
            Clear Filters
          </button>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '48px', textAlign: 'center', color: '#94A3B8', fontSize: '14px' }}>
          {entries.length === 0
            ? 'No entries yet. Add your first member hours record.'
            : `No entries for ${filterYear}${filterMonth !== 'all' ? ` — ${MONTHS[parseInt(filterMonth) - 1]}` : ''}.`}
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                <th scope="col" style={{ padding: '10px 16px', textAlign: 'left' as const, fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#64748B' }}>Company</th>
                <th scope="col" style={{ padding: '10px 16px', textAlign: 'left' as const, fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#64748B' }}>Month</th>
                <th scope="col" style={{ padding: '10px 16px', textAlign: 'right' as const, fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#64748B' }}>Hours</th>
                <th scope="col" style={{ padding: '10px 16px', textAlign: 'right' as const, fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#64748B' }}>GPEP</th>
                <th scope="col" style={{ padding: '10px 16px', textAlign: 'right' as const, fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#64748B' }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry, idx) => (
                <tr key={entry.id} style={{ borderBottom: idx < filtered.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                  <td style={{ padding: '10px 16px', color: '#0F172A', fontWeight: 500 }}>{entry.company_name}</td>
                  <td style={{ padding: '10px 16px', color: '#64748B' }}>{MONTHS[entry.month - 1]}</td>
                  <td style={{ padding: '10px 16px', color: '#0F172A', fontWeight: 600, textAlign: 'right' as const }}>{entry.hours.toLocaleString()}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'right' as const, color: entry.gpep != null ? '#0F172A' : '#CBD5E1' }}>
                    {entry.gpep != null ? `$${entry.gpep.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '—'}
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'right' as const, whiteSpace: 'nowrap' as const }}>
                    <button onClick={() => openEdit(entry)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1E3A8A', fontSize: '12px', fontWeight: 500, marginRight: '12px' }}>Edit</button>
                    <button onClick={() => handleDelete(entry)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '12px', fontWeight: 500 }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: '10px 16px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', fontSize: '12px', color: '#64748B', display: 'flex', justifyContent: 'flex-end', gap: '24px' }}>
            {gpepEntries.length > 0 && (
              <span>Total GPEP: <strong style={{ color: '#0F172A' }}>${totalGpep.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</strong></span>
            )}
            <span>Total Hours: <strong style={{ color: '#0F172A' }}>{totalHours.toLocaleString()}</strong></span>
          </div>
        </div>
      )}

      {/* Add / Edit slide-in panel */}
      {showPanel && (
        <>
          <div onClick={closePanel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 100 }} />
          <div role="dialog" aria-modal="true" aria-labelledby="hours-panel-title" style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: '400px',
            background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.1)',
            zIndex: 101, display: 'flex', flexDirection: 'column'
          }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 id="hours-panel-title" style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                {editingEntry ? 'Edit Entry' : 'Add Member Hours'}
              </h2>
              <button aria-label="Close" title="Close" onClick={closePanel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: '20px', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ padding: '20px 24px', flex: 1, overflowY: 'auto' }}>
              {formError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '10px 12px', color: '#dc2626', fontSize: '13px', marginBottom: '16px' }}>{formError}</div>}

              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>Company <span style={{ color: '#ef4444' }}>*</span></label>
                <select
                  value={form.company_id}
                  onChange={(e) => setForm({ ...form, company_id: e.target.value })}
                  disabled={!!editingEntry}
                  style={{ ...inputStyle, background: editingEntry ? '#F8FAFC' : '#fff' }}
                >
                  <option value="">Select a company…</option>
                  {activeCompanies.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                </select>
                {editingEntry && <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>Company cannot be changed after creation.</div>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={labelStyle}>Year</label>
                  <input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} disabled={!!editingEntry} min="2000" max="2100" style={{ ...inputStyle, background: editingEntry ? '#F8FAFC' : '#fff' }} />
                </div>
                <div>
                  <label style={labelStyle}>Month</label>
                  <select value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} disabled={!!editingEntry} style={{ ...inputStyle, background: editingEntry ? '#F8FAFC' : '#fff' }}>
                    {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>Hours <span style={{ color: '#ef4444' }}>*</span></label>
                <input type="number" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} min="0.1" step="0.5" placeholder="e.g. 1250" style={inputStyle} />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>GPEP <span style={{ fontWeight: 400, color: '#94A3B8' }}>(optional — Gross Productive Electrical Payroll)</span></label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748B', fontSize: '13px' }}>$</span>
                  <input type="text" value={form.gpep} onChange={(e) => setForm({ ...form, gpep: e.target.value })} placeholder="e.g. 1250000" style={{ ...inputStyle, paddingLeft: '22px' }} />
                </div>
              </div>
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={closePanel} style={btnSecondary}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.5 : 1 }}>
                {saving ? 'Saving…' : editingEntry ? 'Save Changes' : 'Add Entry'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
