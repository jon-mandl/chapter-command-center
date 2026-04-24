import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useOrg } from '../lib/useOrg'
import { inputStyle, labelStyle, btnPrimary, btnSecondary, errorBox } from '../lib/ui'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MemberCompany { id: number; company_name: string }
interface LocalUnion { id: number; local_number: string; charter_city: string | null }

interface Grievance {
  id: number
  case_number: string
  company_id: number | null
  local_union_id: number | null
  employer_name: string | null
  agreement_section: string | null
  description: string
  date_filed: string
  status: string
  notes: string | null
  locked: number
}

interface TimelineEntry {
  id: number
  from_status: string | null
  to_status: string
  note: string | null
  changed_at: string
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  filed:      'Filed',
  lmc:        'Labor-Management Committee',
  cir:        'CIR / Arbitration',
  closed:     'Resolved / Closed',
  withdrawn:  'Withdrawn'
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  filed:     { bg: '#EFF6FF', text: '#1E3A8A' },
  lmc:       { bg: '#FFFBEB', text: '#92400E' },
  cir:       { bg: '#FFF7ED', text: '#9A3412' },
  closed:    { bg: '#F0FDF4', text: '#166534' },
  withdrawn: { bg: '#F8FAFC', text: '#475569' }
}

const STAGES = [
  { key: 'filed',  label: 'Filed' },
  { key: 'lmc',    label: 'LMC' },
  { key: 'cir',    label: 'CIR' },
  { key: 'closed', label: 'Closed' }
]

const STAGE_ORDER = ['filed', 'lmc', 'cir', 'closed']

function stageIndex(status: string): number {
  return STAGE_ORDER.indexOf(status)
}

function StatusBadge({ status }: { status: string }): React.JSX.Element {
  const c = STATUS_COLORS[status] ?? { bg: '#F8FAFC', text: '#475569' }
  return (
    <span style={{ display: 'inline-block', fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', background: c.bg, color: c.text }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

function GrievanceTimeline({ entries }: { entries: TimelineEntry[] }): React.JSX.Element {
  if (entries.length === 0) {
    return <div style={{ fontSize: '12px', color: '#8896A5', fontStyle: 'italic' }}>No status changes recorded yet.</div>
  }

  function formatDateTime(str: string): string {
    const d = new Date(str)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  return (
    <div style={{ position: 'relative', paddingLeft: '20px' }}>
      <div style={{ position: 'absolute', left: '6px', top: '8px', bottom: '8px', width: '2px', background: '#E4E6E9' }} />
      {entries.map((entry, i) => (
        <div key={entry.id} style={{ position: 'relative', marginBottom: i < entries.length - 1 ? '14px' : 0 }}>
          <div style={{
            position: 'absolute', left: '-17px', top: '3px',
            width: '10px', height: '10px', borderRadius: '50%',
            background: i === 0 ? '#1E3A8A' : '#8896A5',
            border: '2px solid #fff', boxShadow: '0 0 0 1px #E4E6E9'
          }} />
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#0F172A' }}>
            {entry.from_status
              ? `${STATUS_LABELS[entry.from_status] ?? entry.from_status} → ${STATUS_LABELS[entry.to_status] ?? entry.to_status}`
              : `Filed as ${STATUS_LABELS[entry.to_status] ?? entry.to_status}`}
          </div>
          <div style={{ fontSize: '11px', color: '#8896A5', marginTop: '1px' }}>{formatDateTime(entry.changed_at)}</div>
          {entry.note && <div style={{ fontSize: '12px', color: '#64748B', marginTop: '3px', fontStyle: 'italic' }}>{entry.note}</div>}
        </div>
      ))}
    </div>
  )
}

// ─── Grievance Form ───────────────────────────────────────────────────────────

interface GrievanceFormState {
  case_number: string
  company_id: number | ''
  local_union_id: number | ''
  agreement_section: string
  description: string
  date_filed: string
  notes: string
}

function GrievanceForm({ form, setForm, companies, localUnions, onSave, onCancel, onAddCompany }: {
  form: GrievanceFormState
  setForm: React.Dispatch<React.SetStateAction<GrievanceFormState>>
  companies: MemberCompany[]
  localUnions: LocalUnion[]
  onSave: () => void
  onCancel: () => void
  onAddCompany?: () => void
}): React.JSX.Element {
  const [submitted, setSubmitted] = useState(false)
  const [companySearch, setCompanySearch] = useState(() => {
    if (!form.company_id) return ''
    return companies.find((c) => c.id === form.company_id)?.company_name ?? ''
  })
  const [companyOpen, setCompanyOpen] = useState(false)

  useEffect(() => {
    if (!form.company_id) { setCompanySearch(''); return }
    const match = companies.find((c) => c.id === form.company_id)
    if (match) setCompanySearch(match.company_name)
  }, [form.company_id, companies])

  const companyMatches = companySearch.trim()
    ? companies.filter((c) => c.company_name.toLowerCase().includes(companySearch.toLowerCase()))
    : companies

  const errors = {
    case_number: !form.case_number.trim(),
    date_filed: !form.date_filed,
    company_id: !form.company_id,
    description: !form.description.trim()
  }

  function handleAttemptSave(): void {
    setSubmitted(true)
    if (!Object.values(errors).some(Boolean)) onSave()
  }

  function fieldBorder(hasError: boolean): React.CSSProperties {
    return hasError ? { ...inputStyle, borderColor: '#dc2626' } : inputStyle
  }

  const errStyle: React.CSSProperties = { fontSize: '11px', color: '#dc2626', marginTop: '3px' }
  const fieldStyle: React.CSSProperties = { marginBottom: '12px' }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div style={fieldStyle}>
          <label style={labelStyle}>Case Number *</label>
          <input style={fieldBorder(submitted && errors.case_number)} value={form.case_number} onChange={(e) => setForm((p) => ({ ...p, case_number: e.target.value }))} placeholder="e.g. 2024-001" />
          {submitted && errors.case_number && <div style={errStyle}>Required.</div>}
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Date Filed *</label>
          <input type="date" style={fieldBorder(submitted && errors.date_filed)} value={form.date_filed} onChange={(e) => setForm((p) => ({ ...p, date_filed: e.target.value }))} />
          {submitted && errors.date_filed && <div style={errStyle}>Required.</div>}
        </div>

        <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Employer *</label>
            {onAddCompany && (
              <button onClick={onAddCompany} style={{ fontSize: '11px', fontWeight: 600, color: '#1E3A8A', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                + Add New Company
              </button>
            )}
          </div>
          <div style={{ position: 'relative' }}>
            <input
              style={fieldBorder(submitted && errors.company_id)}
              value={companySearch}
              onChange={(e) => { setCompanySearch(e.target.value); setForm((p) => ({ ...p, company_id: '' })); setCompanyOpen(true) }}
              onFocus={() => setCompanyOpen(true)}
              onBlur={() => setTimeout(() => setCompanyOpen(false), 150)}
              placeholder="Type to search companies..."
            />
            {companyOpen && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: '#fff', border: '1px solid #CBD5E1', borderRadius: '6px', boxShadow: '0 4px 12px rgba(15,23,42,0.08)', maxHeight: '200px', overflowY: 'auto', marginTop: '2px' }}>
                {companyMatches.length === 0 ? (
                  <div style={{ padding: '10px 12px', fontSize: '12px', color: '#8896A5' }}>No companies match.</div>
                ) : (
                  companyMatches.map((c) => (
                    <button key={c.id} onMouseDown={() => { setForm((p) => ({ ...p, company_id: c.id })); setCompanySearch(c.company_name); setCompanyOpen(false) }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', borderBottom: '1px solid #F1F5F9', background: form.company_id === c.id ? '#EFF6FF' : 'transparent', color: '#0F172A', fontSize: '13px', cursor: 'pointer' }}>
                      {c.company_name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          {submitted && errors.company_id && <div style={errStyle}>Required.</div>}
        </div>

        <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Local Union</label>
          <select style={inputStyle} value={form.local_union_id} onChange={(e) => setForm((p) => ({ ...p, local_union_id: e.target.value ? Number(e.target.value) : '' }))}>
            <option value="">-- None --</option>
            {localUnions.map((l) => (
              <option key={l.id} value={l.id}>Local {l.local_number}{l.charter_city ? ` — ${l.charter_city}` : ''}</option>
            ))}
          </select>
        </div>

        <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Agreement Section</label>
          <input style={inputStyle} value={form.agreement_section} onChange={(e) => setForm((p) => ({ ...p, agreement_section: e.target.value }))} placeholder="e.g. Section 1.06" />
        </div>

        <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Description *</label>
          <textarea style={{ ...fieldBorder(submitted && errors.description), minHeight: '80px', resize: 'vertical' }} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Describe the nature of the grievance..." />
          {submitted && errors.description && <div style={errStyle}>Required.</div>}
        </div>

        <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Notes</label>
          <textarea style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Optional internal notes..." />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
        <button onClick={handleAttemptSave} style={btnPrimary}>Save</button>
        <button onClick={onCancel} style={btnSecondary}>Cancel</button>
      </div>
    </div>
  )
}

// ─── Add Company Modal ────────────────────────────────────────────────────────

function AddCompanyModal({ orgId, onCreated, onClose }: {
  orgId: string
  onCreated: (company: MemberCompany) => void
  onClose: () => void
}): React.JSX.Element {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed) { setError('Company name is required.'); return }
    setSaving(true)
    const { data, error: err } = await supabase.from('member_companies').insert({
      org_id: orgId,
      company_name: trimmed,
      status: 'active',
      is_member: 1,
      discount_tier: 'none'
    }).select('id, company_name').single()

    if (err) { setError('Could not add company. Please try again.'); setSaving(false); return }
    onCreated(data as MemberCompany)
  }

  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: '8px', padding: '24px', width: '360px', boxShadow: '0 4px 24px rgba(15,23,42,0.12)' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>Add Member Company</h3>
        <p style={{ fontSize: '12px', color: '#64748B', marginBottom: '16px' }}>You can fill in full details later from the Member Hub.</p>
        <label style={labelStyle}>Company Name *</label>
        <input style={{ ...inputStyle, marginBottom: error ? '4px' : '16px' }} value={name} onChange={(e) => { setName(e.target.value); setError('') }} placeholder="e.g. Acme Electric" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }} />
        {error && <div style={{ fontSize: '11px', color: '#dc2626', marginBottom: '12px' }}>{error}</div>}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Add Company'}</button>
          <button onClick={onClose} style={btnSecondary}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Grievances Page ─────────────────────────────────────────────────────

function blankForm(): GrievanceFormState {
  return {
    case_number: '',
    company_id: '',
    local_union_id: '',
    agreement_section: '',
    description: '',
    date_filed: new Date().toISOString().slice(0, 10),
    notes: ''
  }
}

export default function Grievances(): React.JSX.Element {
  const { orgId, loading: orgLoading } = useOrg()
  const [grievances, setGrievances] = useState<Grievance[]>([])
  const [companies, setCompanies] = useState<MemberCompany[]>([])
  const [localUnions, setLocalUnions] = useState<LocalUnion[]>([])
  const [selected, setSelected] = useState<Grievance | null>(null)
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [editing, setEditing] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmCloseEarly, setConfirmCloseEarly] = useState(false)
  const [showAddCompany, setShowAddCompany] = useState(false)
  const [form, setForm] = useState<GrievanceFormState>(blankForm())
  const [actionError, setActionError] = useState('')

  const loadGrievances = useCallback(async () => {
    if (!orgId) return
    const { data, error } = await supabase.from('grievances').select('*').eq('org_id', orgId).order('date_filed', { ascending: false })
    if (!error && data) setGrievances(data as Grievance[])
    else setActionError('Could not load grievances.')
  }, [orgId])

  useEffect(() => {
    if (!orgId) return
    loadGrievances()
    supabase.from('member_companies').select('id, company_name').eq('org_id', orgId).order('company_name').then(({ data }) => { if (data) setCompanies(data as MemberCompany[]) })
    supabase.from('local_unions').select('id, local_number, charter_city').eq('org_id', orgId).order('local_number').then(({ data }) => { if (data) setLocalUnions(data as LocalUnion[]) })
  }, [orgId, loadGrievances])

  async function loadTimeline(grievanceId: number): Promise<void> {
    const { data } = await supabase.from('grievance_timeline').select('*').eq('grievance_id', grievanceId).order('changed_at', { ascending: false })
    setTimeline((data as TimelineEntry[]) ?? [])
  }

  async function selectGrievance(g: Grievance): Promise<void> {
    setSelected(g)
    setEditing(false)
    setShowNew(false)
    setConfirmDelete(false)
    setConfirmCloseEarly(false)
    await loadTimeline(g.id)
  }

  async function handleSaveNew(): Promise<void> {
    if (!orgId) return
    setActionError('')
    const { data, error } = await supabase.from('grievances').insert({
      org_id: orgId,
      case_number: form.case_number.trim(),
      company_id: form.company_id || null,
      local_union_id: form.local_union_id || null,
      agreement_section: form.agreement_section.trim() || null,
      description: form.description.trim(),
      date_filed: form.date_filed,
      notes: form.notes.trim() || null,
      status: 'filed',
      locked: 0
    }).select().single()

    if (error) { setActionError('Could not create grievance. Please try again.'); return }

    // Record initial timeline entry
    await supabase.from('grievance_timeline').insert({ org_id: orgId, grievance_id: (data as Grievance).id, from_status: null, to_status: 'filed' })

    await loadGrievances()
    setShowNew(false)
    setSelected(data as Grievance)
    await loadTimeline((data as Grievance).id)
  }

  async function handleSaveEdit(): Promise<void> {
    if (!selected || !orgId) return
    setActionError('')
    const { data, error } = await supabase.from('grievances').update({
      case_number: form.case_number.trim(),
      company_id: form.company_id || null,
      local_union_id: form.local_union_id || null,
      agreement_section: form.agreement_section.trim() || null,
      description: form.description.trim(),
      date_filed: form.date_filed,
      notes: form.notes.trim() || null
    }).eq('id', selected.id).select().single()

    if (error) { setActionError('Could not save changes. Please try again.'); return }
    await loadGrievances()
    setSelected(data as Grievance)
    setEditing(false)
  }

  async function updateStatus(g: Grievance, newStatus: string): Promise<void> {
    if (!orgId) return
    setActionError('')
    const { data, error } = await supabase.from('grievances').update({ status: newStatus }).eq('id', g.id).select().single()
    if (error) { setActionError('Could not update status.'); return }
    await supabase.from('grievance_timeline').insert({ org_id: orgId, grievance_id: g.id, from_status: g.status, to_status: newStatus })
    await loadGrievances()
    setSelected(data as Grievance)
    await loadTimeline(g.id)
    setConfirmCloseEarly(false)
  }

  async function handleToggleLock(g: Grievance): Promise<void> {
    setActionError('')
    const { data, error } = await supabase.from('grievances').update({ locked: g.locked ? 0 : 1 }).eq('id', g.id).select().single()
    if (error) { setActionError('Could not change lock status.'); return }
    await loadGrievances()
    setSelected(data as Grievance)
  }

  async function handleDelete(): Promise<void> {
    if (!selected) return
    setActionError('')
    const { error } = await supabase.from('grievances').delete().eq('id', selected.id)
    if (error) { setActionError('Could not delete grievance.'); return }
    await loadGrievances()
    setSelected(null)
    setConfirmDelete(false)
    setTimeline([])
  }

  const handleCompanyCreated = useCallback((company: MemberCompany) => {
    setCompanies((prev) => [...prev, company].sort((a, b) => a.company_name.localeCompare(b.company_name)))
    setForm((prev) => ({ ...prev, company_id: company.id }))
    setShowAddCompany(false)
  }, [])

  function getCompanyName(g: Grievance): string {
    if (g.company_id) {
      const c = companies.find((c) => c.id === g.company_id)
      if (c) return c.company_name
    }
    return g.employer_name ?? 'Unknown'
  }

  const filtered = grievances.filter((g) => {
    const matchSearch = g.case_number.toLowerCase().includes(search.toLowerCase()) || getCompanyName(g).toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus === 'all' || g.status === filterStatus
    return matchSearch && matchStatus
  })

  const filterButtons = [
    { key: 'all', label: 'All' },
    { key: 'filed', label: 'Filed' },
    { key: 'lmc', label: 'LMC' },
    { key: 'cir', label: 'CIR' },
    { key: 'closed', label: 'Closed' },
    { key: 'withdrawn', label: 'Withdrawn' }
  ]

  if (orgLoading) return <div style={{ padding: '32px', fontSize: '13px', color: '#64748B' }}>Loading…</div>

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

      {/* ── Left: List ── */}
      <div style={{ width: '320px', minWidth: '320px', borderRight: '1px solid #E4E6E9', display: 'flex', flexDirection: 'column', background: '#fff', height: '100%' }}>
        <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid #E4E6E9' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', margin: 0 }}>Grievance Cases</h2>
            <button onClick={() => { setShowNew(true); setSelected(null); setEditing(false); setForm(blankForm()) }}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', background: '#1E3A8A', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New
            </button>
          </div>
          <input type="text" placeholder="Search cases..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...inputStyle, marginBottom: '8px' }} />
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {filterButtons.map((b) => (
              <button key={b.key} onClick={() => setFilterStatus(b.key)} style={{ padding: '3px 8px', fontSize: '11px', fontWeight: 500, borderRadius: '4px', border: '1px solid', borderColor: filterStatus === b.key ? '#1E3A8A' : '#CBD5E1', background: filterStatus === b.key ? '#EFF6FF' : '#fff', color: filterStatus === b.key ? '#1E3A8A' : '#4A5568', cursor: 'pointer' }}>{b.label}</button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center' }}>
              {grievances.length === 0 ? (
                <>
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 16px', display: 'block' }} aria-hidden="true">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>No grievances filed</div>
                  <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '20px' }}>File your first grievance to start tracking cases.</div>
                  <button onClick={() => { setShowNew(true); setSelected(null); setForm(blankForm()) }} style={btnPrimary}>File First Grievance</button>
                </>
              ) : (
                <div style={{ fontSize: '13px', color: '#8896A5' }}>No grievances match this filter.</div>
              )}
            </div>
          ) : (
            filtered.map((g) => {
              const isActive = selected?.id === g.id
              const c = STATUS_COLORS[g.status] ?? STATUS_COLORS.filed
              return (
                <button key={g.id} onClick={() => selectGrievance(g)} style={{ width: '100%', textAlign: 'left', padding: '12px 13px', border: 'none', borderBottom: '1px solid #E4E6E9', borderLeft: isActive ? '3px solid #1E3A8A' : '3px solid transparent', background: isActive ? '#EFF6FF' : 'transparent', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>{g.case_number}</span>
                    <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '20px', background: c.bg, color: c.text, whiteSpace: 'nowrap' }}>{STATUS_LABELS[g.status] ?? g.status}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748B' }}>{getCompanyName(g)}</div>
                  <div style={{ fontSize: '11px', color: '#8896A5', marginTop: '2px' }}>{g.date_filed}</div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── Right: Detail ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: '#F8FAFC' }}>
        {actionError && (
          <div style={{ ...errorBox, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <span>{actionError}</span>
            <button aria-label="Dismiss error" onClick={() => setActionError('')} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '16px', padding: '0 4px', lineHeight: 1, flexShrink: 0 }}>×</button>
          </div>
        )}

        {/* New form */}
        {showNew && orgId && (
          <div style={{ maxWidth: '640px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '16px' }}>New Grievance</h3>
            <GrievanceForm form={form} setForm={setForm} companies={companies} localUnions={localUnions} onSave={handleSaveNew} onCancel={() => setShowNew(false)} onAddCompany={() => setShowAddCompany(true)} />
          </div>
        )}

        {/* Detail panel */}
        {selected && !showNew && (
          <div style={{ maxWidth: '640px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: 0 }}>{selected.case_number}</h3>
                <div style={{ fontSize: '13px', color: '#64748B', marginTop: '2px' }}>{getCompanyName(selected)}</div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <StatusBadge status={selected.status} />
                {!selected.locked && (
                  <button onClick={() => { setEditing(true); setForm({ case_number: selected.case_number, company_id: selected.company_id ?? '', local_union_id: selected.local_union_id ?? '', agreement_section: selected.agreement_section ?? '', description: selected.description, date_filed: selected.date_filed, notes: selected.notes ?? '' }) }}
                    style={{ padding: '5px 10px', fontSize: '12px', fontWeight: 500, border: '1px solid #CBD5E1', borderRadius: '4px', background: '#fff', color: '#64748B', cursor: 'pointer' }}>Edit</button>
                )}
                <button onClick={() => handleToggleLock(selected)}
                  style={{ padding: '5px 10px', fontSize: '12px', fontWeight: 500, border: '1px solid #CBD5E1', borderRadius: '4px', background: selected.locked ? '#FFFBEB' : '#fff', color: selected.locked ? '#92400E' : '#64748B', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
                  {selected.locked ? 'Locked' : 'Lock'}
                </button>
              </div>
            </div>

            {/* Edit form */}
            {editing ? (
              <GrievanceForm form={form} setForm={setForm} companies={companies} localUnions={localUnions} onSave={handleSaveEdit} onCancel={() => setEditing(false)} />
            ) : (
              <>
                {/* Stage progression */}
                {selected.status !== 'withdrawn' && (
                  <div style={{ marginBottom: '24px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748B', borderBottom: '1px solid #E4E6E9', paddingBottom: '8px', marginBottom: '16px' }}>
                      Status Progression
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      {STAGES.map((stage, i) => {
                        const currentIdx = stageIndex(selected.status)
                        const isDone = i <= currentIdx
                        const isCurrent = i === currentIdx
                        return (
                          <div key={stage.key} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                            <div style={{ flex: 1, textAlign: 'center' }}>
                              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: isDone ? '#1E3A8A' : '#E4E6E9', border: isCurrent ? '3px solid #1E3A8A' : '2px solid transparent', margin: '0 auto 4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {isDone && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>}
                              </div>
                              <div style={{ fontSize: '10px', fontWeight: isCurrent ? 700 : 400, color: isDone ? '#1E3A8A' : '#8896A5' }}>{stage.label}</div>
                            </div>
                            {i < STAGES.length - 1 && <div style={{ height: '2px', flex: 2, background: i < currentIdx ? '#1E3A8A' : '#E4E6E9', marginBottom: '18px' }} />}
                          </div>
                        )
                      })}
                    </div>

                    {!selected.locked && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '14px' }}>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {stageIndex(selected.status) < STAGE_ORDER.length - 1 && stageIndex(selected.status) >= 0 && (
                            <button onClick={() => updateStatus(selected, STAGE_ORDER[stageIndex(selected.status) + 1])} style={{ ...btnPrimary, padding: '6px 14px', fontSize: '12px' }}>
                              Advance to {STAGES[stageIndex(selected.status) + 1]?.label}
                            </button>
                          )}
                          {(selected.status === 'filed' || selected.status === 'lmc') && (
                            <button onClick={() => setConfirmCloseEarly(true)} style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 500, background: '#fff', color: '#166534', border: '1px solid #86EFAC', borderRadius: '6px', cursor: 'pointer' }}>
                              Resolve Here
                            </button>
                          )}
                          <button onClick={() => updateStatus(selected, 'withdrawn')} style={{ ...btnSecondary, padding: '6px 14px', fontSize: '12px' }}>Mark Withdrawn</button>
                        </div>
                        {confirmCloseEarly && (
                          <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: '6px', padding: '10px 14px', fontSize: '12px', color: '#166534', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span>Resolve and close at current stage?</span>
                            <button onClick={() => updateStatus(selected, 'closed')} style={{ padding: '4px 10px', fontSize: '11px', fontWeight: 600, background: '#166534', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Yes, Resolve</button>
                            <button onClick={() => setConfirmCloseEarly(false)} style={{ ...btnSecondary, padding: '4px 10px', fontSize: '11px' }}>Cancel</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Withdrawn banner */}
                {selected.status === 'withdrawn' && (
                  <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                    This grievance has been withdrawn.
                    {!selected.locked && (
                      <button onClick={() => updateStatus(selected, 'filed')} style={{ marginLeft: 'auto', fontSize: '11px', color: '#1E3A8A', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Reopen</button>
                    )}
                  </div>
                )}

                {/* Case details */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748B', borderBottom: '1px solid #E4E6E9', paddingBottom: '8px', marginBottom: '16px' }}>Case Details</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>Case Number</div>
                      <div style={{ fontSize: '13px', color: '#0F172A' }}>{selected.case_number}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>Date Filed</div>
                      <div style={{ fontSize: '13px', color: '#0F172A' }}>{selected.date_filed}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>Employer</div>
                      <div style={{ fontSize: '13px', color: '#0F172A' }}>{getCompanyName(selected)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>Local Union</div>
                      <div style={{ fontSize: '13px', color: '#0F172A' }}>
                        {selected.local_union_id ? (() => { const lu = localUnions.find((l) => l.id === selected.local_union_id); return lu ? `Local ${lu.local_number}${lu.charter_city ? ` — ${lu.charter_city}` : ''}` : '—' })() : '—'}
                      </div>
                    </div>
                    {selected.agreement_section && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>Agreement Section</div>
                        <div style={{ fontSize: '13px', color: '#0F172A' }}>{selected.agreement_section}</div>
                      </div>
                    )}
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>Description</div>
                      <div style={{ fontSize: '13px', color: '#0F172A', whiteSpace: 'pre-wrap' }}>{selected.description}</div>
                    </div>
                    {selected.notes && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>Notes</div>
                        <div style={{ fontSize: '13px', color: '#64748B', whiteSpace: 'pre-wrap' }}>{selected.notes}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Timeline */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748B', borderBottom: '1px solid #E4E6E9', paddingBottom: '8px', marginBottom: '16px' }}>Status History</div>
                  <GrievanceTimeline entries={timeline} />
                </div>

                {/* Delete */}
                {!selected.locked && (
                  <div style={{ marginTop: '8px' }}>
                    {!confirmDelete ? (
                      <button onClick={() => setConfirmDelete(true)} style={{ fontSize: '12px', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Delete this grievance</button>
                    ) : (
                      <div style={{ padding: '12px 14px', background: '#FFF1F2', border: '1px solid #FECDD3', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#9F1239' }}>
                        <span>Delete this grievance permanently?</span>
                        <button onClick={handleDelete} style={{ padding: '4px 12px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>Delete</button>
                        <button onClick={() => setConfirmDelete(false)} style={{ fontSize: '12px', color: '#64748B', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Empty state */}
        {!selected && !showNew && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60%', flexDirection: 'column', gap: '12px', color: '#8896A5' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
              <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
            </svg>
            <div style={{ fontSize: '13px' }}>Select a grievance or file a new one</div>
            <button onClick={() => { setShowNew(true); setSelected(null); setForm(blankForm()) }} style={btnPrimary}>+ File New Grievance</button>
          </div>
        )}
      </div>

      {showAddCompany && orgId && (
        <AddCompanyModal orgId={orgId} onCreated={handleCompanyCreated} onClose={() => setShowAddCompany(false)} />
      )}
    </div>
  )
}
