import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useOrg } from '../lib/useOrg'
import { inputStyle, btnPrimary, btnSecondary, btnDanger, labelStyle, thStyle, tdStyle } from '../lib/ui'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Company {
  id: number
  company_name: string
  neca_id: string | null
  mailing_address: string | null
  phone: string | null
  email: string | null
  status: 'active' | 'inactive' | 'suspended'
  is_member: number
  date_joined: string | null
  notes: string | null
  letter_of_assent_type: string | null
}

interface Rep {
  id: number
  company_id: number
  name: string
  title: string | null
  phone: string | null
  email: string | null
}

const emptyCompany = {
  company_name: '',
  neca_id: '',
  mailing_address: '',
  phone: '',
  email: '',
  status: 'active' as 'active' | 'inactive' | 'suspended',
  is_member: 0 as 0 | 1,
  date_joined: '',
  notes: '',
  letter_of_assent_type: '' as string
}

const LOA_OPTIONS = ['', 'Letter of Assent A', 'Letter of Assent B', 'Letter of Assent C']

const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  active:    { bg: '#f0fdf4', color: '#059669', border: '#bbf7d0' },
  inactive:  { bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' },
  suspended: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' }
}

function StatusBadge({ status }: { status: string }): React.JSX.Element {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS.inactive
  return (
    <span style={{
      fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px',
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      textTransform: 'capitalize'
    }}>
      {status}
    </span>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function MembersDirectory(): React.JSX.Element {
  const { orgId, loading: orgLoading } = useOrg()
  const [companies, setCompanies] = useState<Company[]>([])
  const [selected, setSelected] = useState<Company | null>(null)
  const [reps, setReps] = useState<Rep[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // List filters
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive' | 'suspended'>('all')

  // Add company form
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState(emptyCompany)
  const [addError, setAddError] = useState('')
  const [addSaving, setAddSaving] = useState(false)
  const [newlyCreated, setNewlyCreated] = useState<Company | null>(null)

  // Step 2 rep form (after company created)
  const [step2Rep, setStep2Rep] = useState({ name: '', title: '', phone: '', email: '' })
  const [step2Saving, setStep2Saving] = useState(false)

  // Edit company
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState(emptyCompany)
  const [editError, setEditError] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  // Rep management in detail panel
  const [showAddRep, setShowAddRep] = useState(false)
  const [editingRep, setEditingRep] = useState<Rep | null>(null)
  const [repForm, setRepForm] = useState({ name: '', title: '', phone: '', email: '' })
  const [repSaving, setRepSaving] = useState(false)
  const [repError, setRepError] = useState('')

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!orgId) return
    supabase
      .from('member_companies')
      .select('*')
      .eq('org_id', orgId)
      .order('company_name')
      .then(({ data, error: err }) => {
        if (err) setError('Could not load companies. Please try again.')
        else setCompanies((data as Company[]) ?? [])
        setLoading(false)
      })
  }, [orgId])

  useEffect(() => {
    if (!selected) { setReps([]); return }
    supabase
      .from('member_representatives')
      .select('*')
      .eq('company_id', selected.id)
      .order('name')
      .then(({ data }) => setReps((data as Rep[]) ?? []))
  }, [selected])

  function openDetail(company: Company): void {
    setSelected(company)
    setEditing(false)
    setShowAddRep(false)
    setEditingRep(null)
    setRepError('')
    setEditError('')
    setConfirmDelete(false)
  }

  function closeDetail(): void {
    setSelected(null)
    setEditing(false)
    setShowAddRep(false)
    setEditingRep(null)
    setConfirmDelete(false)
  }

  function startEdit(): void {
    if (!selected) return
    setEditForm({
      company_name: selected.company_name,
      neca_id: selected.neca_id ?? '',
      mailing_address: selected.mailing_address ?? '',
      phone: selected.phone ?? '',
      email: selected.email ?? '',
      status: selected.status,
      is_member: selected.is_member as 0 | 1,
      date_joined: selected.date_joined ?? '',
      notes: selected.notes ?? '',
      letter_of_assent_type: selected.letter_of_assent_type ?? ''
    })
    setEditing(true)
    setEditError('')
  }

  async function handleAddCompany(): Promise<void> {
    if (!orgId || !addForm.company_name.trim()) return
    if (addForm.is_member && !addForm.neca_id.trim()) {
      setAddError('NECA ID is required for Association Members.')
      return
    }
    setAddSaving(true)
    setAddError('')
    const { data, error: err } = await supabase
      .from('member_companies')
      .insert({
        org_id: orgId,
        company_name: addForm.company_name.trim(),
        neca_id: addForm.neca_id.trim() || null,
        mailing_address: addForm.mailing_address.trim() || null,
        phone: addForm.phone.trim() || null,
        email: addForm.email.trim() || null,
        status: addForm.status,
        is_member: addForm.is_member,
        date_joined: addForm.date_joined || null,
        notes: addForm.notes.trim() || null,
        letter_of_assent_type: addForm.letter_of_assent_type || null
      })
      .select()
      .single()
    if (err) {
      setAddError('Could not add company. Please try again.')
    } else {
      const created = data as Company
      setCompanies((prev) => [...prev, created].sort((a, b) => a.company_name.localeCompare(b.company_name)))
      setNewlyCreated(created)
      setStep2Rep({ name: '', title: '', phone: '', email: '' })
    }
    setAddSaving(false)
  }

  async function handleStep2SaveRep(): Promise<void> {
    if (!newlyCreated || !step2Rep.name.trim()) return
    setStep2Saving(true)
    await supabase.from('member_representatives').insert({
      company_id: newlyCreated.id,
      name: step2Rep.name.trim(),
      title: step2Rep.title.trim() || null,
      phone: step2Rep.phone.trim() || null,
      email: step2Rep.email.trim() || null
    })
    setNewlyCreated(null)
    setShowAdd(false)
    setAddForm(emptyCompany)
    setStep2Saving(false)
  }

  async function handleSaveEdit(): Promise<void> {
    if (!selected || !editForm.company_name.trim()) return
    if (editForm.is_member && !editForm.neca_id.trim()) {
      setEditError('NECA ID is required for Association Members.')
      return
    }
    setEditSaving(true)
    setEditError('')
    const { data, error: err } = await supabase
      .from('member_companies')
      .update({
        company_name: editForm.company_name.trim(),
        neca_id: editForm.neca_id.trim() || null,
        mailing_address: editForm.mailing_address.trim() || null,
        phone: editForm.phone.trim() || null,
        email: editForm.email.trim() || null,
        status: editForm.status,
        is_member: editForm.is_member,
        date_joined: editForm.date_joined || null,
        notes: editForm.notes.trim() || null,
        letter_of_assent_type: editForm.letter_of_assent_type || null
      })
      .eq('id', selected.id)
      .select()
      .single()
    if (err) {
      setEditError('Could not save changes. Please try again.')
    } else {
      const updated = data as Company
      setCompanies((prev) => prev.map((c) => c.id === updated.id ? updated : c).sort((a, b) => a.company_name.localeCompare(b.company_name)))
      setSelected(updated)
      setEditing(false)
    }
    setEditSaving(false)
  }

  async function handleDeleteCompany(): Promise<void> {
    if (!selected) return
    setDeleting(true)
    const { error: err } = await supabase.from('member_companies').delete().eq('id', selected.id)
    if (err) {
      setEditError('Could not delete company. Please try again.')
      setConfirmDelete(false)
    } else {
      setCompanies((prev) => prev.filter((c) => c.id !== selected.id))
      closeDetail()
    }
    setDeleting(false)
  }

  async function handleSaveRep(): Promise<void> {
    if (!selected || !repForm.name.trim()) return
    setRepSaving(true)
    setRepError('')
    if (editingRep) {
      const { data, error: err } = await supabase
        .from('member_representatives')
        .update({ name: repForm.name.trim(), title: repForm.title.trim() || null, phone: repForm.phone.trim() || null, email: repForm.email.trim() || null })
        .eq('id', editingRep.id)
        .select()
        .single()
      if (err) { setRepError('Could not save. Please try again.') }
      else { setReps((prev) => prev.map((r) => r.id === editingRep.id ? data as Rep : r)); setEditingRep(null) }
    } else {
      const { data, error: err } = await supabase
        .from('member_representatives')
        .insert({ company_id: selected.id, name: repForm.name.trim(), title: repForm.title.trim() || null, phone: repForm.phone.trim() || null, email: repForm.email.trim() || null })
        .select()
        .single()
      if (err) { setRepError('Could not add rep. Please try again.') }
      else { setReps((prev) => [...prev, data as Rep]); setShowAddRep(false) }
    }
    setRepForm({ name: '', title: '', phone: '', email: '' })
    setRepSaving(false)
  }

  async function handleDeleteRep(rep: Rep): Promise<void> {
    setRepError('')
    const { error: err } = await supabase.from('member_representatives').delete().eq('id', rep.id)
    if (err) setRepError('Could not remove rep. Please try again.')
    else setReps((prev) => prev.filter((r) => r.id !== rep.id))
  }

  const filtered = companies.filter((c) => {
    const matchSearch = c.company_name.toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus === 'all' || c.status === filterStatus
    return matchSearch && matchStatus
  })

  if (orgLoading || loading) {
    return <div style={{ padding: '32px', fontSize: '13px', color: '#64748B' }}>Loading…</div>
  }

  return (
    <div style={{ display: 'flex', height: '100%', position: 'relative' }}>
      {/* Main list */}
      <div style={{ flex: 1, padding: '28px 32px', overflowY: 'auto', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0F172A', margin: 0 }}>Employer Directory</h1>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0' }}>
              {companies.length} {companies.length === 1 ? 'employer' : 'employers'}
            </p>
          </div>
          <button style={btnPrimary} onClick={() => { setShowAdd(true); setAddForm(emptyCompany); setNewlyCreated(null); setAddError('') }}>
            Add Company
          </button>
        </div>

        {error && <div style={{ marginBottom: '16px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '13px' }}>{error}</div>}

        {/* Add company — step 1 */}
        {showAdd && !newlyCreated && (
          <div style={{ background: '#fff', border: '1.5px solid #1E3A8A', borderRadius: '8px', padding: '20px', marginBottom: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '16px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '50%', background: '#1E3A8A', color: '#fff', fontSize: '12px', fontWeight: 700, marginRight: '8px' }}>1</span>
              Company Details
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={labelStyle}>Company Name <span style={{ color: '#ef4444' }}>*</span></label>
                <input style={inputStyle} value={addForm.company_name} onChange={(e) => setAddForm({ ...addForm, company_name: e.target.value })} autoFocus />
              </div>
              <div>
                <label style={labelStyle}>
                  NECA ID # <span style={{ fontWeight: 400, color: '#94A3B8' }}>(members only{addForm.is_member ? ' — required' : ''})</span>
                </label>
                <input
                  style={{ ...inputStyle, borderColor: addForm.is_member && !addForm.neca_id.trim() ? '#fca5a5' : undefined }}
                  value={addForm.neca_id}
                  placeholder="e.g. 1064247"
                  onChange={(e) => setAddForm({ ...addForm, neca_id: e.target.value })}
                />
              </div>
              <div>
                <label style={labelStyle}>Status</label>
                <select style={inputStyle} value={addForm.status} onChange={(e) => setAddForm({ ...addForm, status: e.target.value as 'active' | 'inactive' | 'suspended' })}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input style={inputStyle} value={addForm.phone} onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input type="email" style={inputStyle} value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Date Joined</label>
                <input type="date" style={inputStyle} value={addForm.date_joined} onChange={(e) => setAddForm({ ...addForm, date_joined: e.target.value })} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Mailing Address</label>
                <input style={inputStyle} value={addForm.mailing_address} onChange={(e) => setAddForm({ ...addForm, mailing_address: e.target.value })} />
              </div>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={addForm.is_member === 1} onChange={(e) => setAddForm({ ...addForm, is_member: e.target.checked ? 1 : 0 })} style={{ width: '15px', height: '15px' }} />
                Association Member <span style={{ fontWeight: 400, color: '#94A3B8' }}>(leave unchecked for Signatory Non-Member)</span>
              </label>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Letter of Assent Type</label>
              <select style={{ ...inputStyle, maxWidth: '260px' }} value={addForm.letter_of_assent_type} onChange={(e) => setAddForm({ ...addForm, letter_of_assent_type: e.target.value })}>
                <option value="">None</option>
                {LOA_OPTIONS.filter(Boolean).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Notes</label>
              <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }} value={addForm.notes} onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })} />
            </div>
            {addError && <div style={{ fontSize: '13px', color: '#dc2626', marginBottom: '10px' }}>{addError}</div>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={{ ...btnPrimary, opacity: !addForm.company_name.trim() || addSaving ? 0.5 : 1 }} disabled={!addForm.company_name.trim() || addSaving} onClick={handleAddCompany}>
                {addSaving ? 'Adding…' : 'Next: Add Contact'}
              </button>
              <button style={btnSecondary} onClick={() => { setShowAdd(false); setAddError('') }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Add company — step 2: add rep */}
        {showAdd && newlyCreated && (
          <div style={{ background: '#fff', border: '1.5px solid #1E3A8A', borderRadius: '8px', padding: '20px', marginBottom: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '50%', background: '#1E3A8A', color: '#fff', fontSize: '12px', fontWeight: 700, marginRight: '8px' }}>2</span>
              Add Contact Person
            </div>
            <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '16px', paddingLeft: '30px' }}>
              {newlyCreated.company_name} was added. Add a contact now or skip and come back later.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={labelStyle}>Name <span style={{ color: '#ef4444' }}>*</span></label>
                <input style={inputStyle} value={step2Rep.name} onChange={(e) => setStep2Rep({ ...step2Rep, name: e.target.value })} autoFocus />
              </div>
              <div>
                <label style={labelStyle}>Title</label>
                <input style={inputStyle} value={step2Rep.title} onChange={(e) => setStep2Rep({ ...step2Rep, title: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input style={inputStyle} value={step2Rep.phone} onChange={(e) => setStep2Rep({ ...step2Rep, phone: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input type="email" style={inputStyle} value={step2Rep.email} onChange={(e) => setStep2Rep({ ...step2Rep, email: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={{ ...btnPrimary, opacity: !step2Rep.name.trim() || step2Saving ? 0.5 : 1 }} disabled={!step2Rep.name.trim() || step2Saving} onClick={handleStep2SaveRep}>
                {step2Saving ? 'Saving…' : 'Save & Finish'}
              </button>
              <button style={btnSecondary} onClick={() => { setNewlyCreated(null); setShowAdd(false); setAddForm(emptyCompany) }}>Skip for Now</button>
            </div>
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search by company name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, width: '260px' }}
          />
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['all', 'active', 'inactive', 'suspended'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                style={{
                  padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
                  border: '1px solid', borderColor: filterStatus === s ? '#1E3A8A' : '#E2E8F0',
                  background: filterStatus === s ? '#EEF2FF' : '#fff',
                  color: filterStatus === s ? '#1E3A8A' : '#64748B', textTransform: 'capitalize'
                }}
              >
                {s === 'all' ? 'All' : s}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '64px 24px', textAlign: 'center' }}>
              {companies.length === 0 ? (
                <>
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 16px', display: 'block' }}>
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>No employers yet</div>
                  <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '20px' }}>Add your first employer to start tracking contacts and member hours.</div>
                  <button style={btnPrimary} onClick={() => setShowAdd(true)}>Add First Company</button>
                </>
              ) : (
                <div style={{ fontSize: '14px', color: '#64748B' }}>No companies match your search.</div>
              )}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th scope="col" style={thStyle}>Company</th>
                  <th scope="col" style={thStyle}>Type</th>
                  <th scope="col" style={thStyle}>Status</th>
                  <th scope="col" style={thStyle}>Phone</th>
                  <th scope="col" style={thStyle}>Email</th>
                  <th scope="col" style={{ ...thStyle, textAlign: 'right' as const }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => openDetail(c)}
                    style={{ cursor: 'pointer', background: selected?.id === c.id ? '#EEF2FF' : 'transparent' }}
                    onMouseEnter={(e) => { if (selected?.id !== c.id) (e.currentTarget as HTMLTableRowElement).style.background = '#F8FAFC' }}
                    onMouseLeave={(e) => { if (selected?.id !== c.id) (e.currentTarget as HTMLTableRowElement).style.background = 'transparent' }}
                  >
                    <td style={{ ...tdStyle, fontWeight: 500 }}>{c.company_name}</td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px', background: c.is_member ? '#EEF2FF' : '#F8FAFC', color: c.is_member ? '#1E3A8A' : '#64748B', border: `1px solid ${c.is_member ? '#C7D2FE' : '#E2E8F0'}` }}>
                        {c.is_member ? 'Member' : 'Signatory'}
                      </span>
                    </td>
                    <td style={tdStyle}><StatusBadge status={c.status} /></td>
                    <td style={{ ...tdStyle, color: '#64748B' }}>{c.phone ?? '—'}</td>
                    <td style={{ ...tdStyle, color: '#64748B' }}>{c.email ?? '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' as const, color: '#94A3B8' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18 15 12 9 6"/></svg>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <>
          <div onClick={closeDetail} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.15)', zIndex: 100 }} />
          <div role="dialog" aria-modal="true" aria-labelledby="company-detail-title" style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: '500px',
            background: '#fff', borderLeft: '1px solid #E2E8F0',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.08)', zIndex: 101,
            overflowY: 'auto', display: 'flex', flexDirection: 'column'
          }}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div id="company-detail-title" style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>{selected.company_name}</div>
                <StatusBadge status={selected.status} />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {!editing && <button style={btnSecondary} onClick={startEdit}>Edit</button>}
                <button aria-label="Close" title="Close" style={{ ...btnSecondary, fontSize: '18px', lineHeight: 1, padding: '5px 10px' }} onClick={closeDetail}>×</button>
              </div>
            </div>

            <div style={{ padding: '20px 24px', flex: 1 }}>
              {editing ? (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div>
                      <label style={labelStyle}>Company Name <span style={{ color: '#ef4444' }}>*</span></label>
                      <input style={inputStyle} value={editForm.company_name} onChange={(e) => setEditForm({ ...editForm, company_name: e.target.value })} />
                    </div>
                    <div>
                      <label style={labelStyle}>NECA ID #</label>
                      <input style={inputStyle} value={editForm.neca_id} onChange={(e) => setEditForm({ ...editForm, neca_id: e.target.value })} />
                    </div>
                    <div>
                      <label style={labelStyle}>Status</label>
                      <select style={inputStyle} value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value as 'active' | 'inactive' | 'suspended' })}>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="suspended">Suspended</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Phone</label>
                      <input style={inputStyle} value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
                    </div>
                    <div>
                      <label style={labelStyle}>Email</label>
                      <input type="email" style={inputStyle} value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                    </div>
                    <div>
                      <label style={labelStyle}>Date Joined</label>
                      <input type="date" style={inputStyle} value={editForm.date_joined} onChange={(e) => setEditForm({ ...editForm, date_joined: e.target.value })} />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={labelStyle}>Mailing Address</label>
                      <input style={inputStyle} value={editForm.mailing_address} onChange={(e) => setEditForm({ ...editForm, mailing_address: e.target.value })} />
                    </div>
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={editForm.is_member === 1} onChange={(e) => setEditForm({ ...editForm, is_member: e.target.checked ? 1 : 0 })} style={{ width: '15px', height: '15px' }} />
                      Association Member
                    </label>
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={labelStyle}>Letter of Assent Type</label>
                    <select style={{ ...inputStyle, maxWidth: '260px' }} value={editForm.letter_of_assent_type} onChange={(e) => setEditForm({ ...editForm, letter_of_assent_type: e.target.value })}>
                      <option value="">None</option>
                      {LOA_OPTIONS.filter(Boolean).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>Notes</label>
                    <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
                  </div>
                  {editError && <div style={{ fontSize: '13px', color: '#dc2626', marginBottom: '10px' }}>{editError}</div>}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button style={{ ...btnPrimary, opacity: !editForm.company_name.trim() || editSaving ? 0.5 : 1 }} disabled={!editForm.company_name.trim() || editSaving} onClick={handleSaveEdit}>
                      {editSaving ? 'Saving…' : 'Save Changes'}
                    </button>
                    <button style={btnSecondary} onClick={() => { setEditing(false); setEditError('') }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div>
                  {/* Type badge */}
                  <div style={{ marginBottom: '16px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, padding: '3px 10px', borderRadius: '999px', background: selected.is_member ? '#EEF2FF' : '#F8FAFC', color: selected.is_member ? '#1E3A8A' : '#64748B', border: `1px solid ${selected.is_member ? '#C7D2FE' : '#E2E8F0'}` }}>
                      {selected.is_member ? 'Association Member' : 'Signatory Non-Member'}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                    {[
                      { label: 'NECA ID #', value: selected.neca_id },
                      { label: 'Phone', value: selected.phone },
                      { label: 'Email', value: selected.email },
                      { label: 'Date Joined', value: selected.date_joined },
                      { label: 'Mailing Address', value: selected.mailing_address },
                      { label: 'Letter of Assent', value: selected.letter_of_assent_type }
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '3px' }}>{label}</div>
                        <div style={{ fontSize: '13px', color: value ? '#0F172A' : '#CBD5E1' }}>{value || '—'}</div>
                      </div>
                    ))}
                  </div>
                  {selected.notes && (
                    <div style={{ marginBottom: '20px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '3px' }}>Notes</div>
                      <div style={{ fontSize: '13px', color: '#475569', whiteSpace: 'pre-wrap' }}>{selected.notes}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Representatives section */}
              <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '20px', marginTop: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748B' }}>Contacts / Representatives</div>
                  {!showAddRep && !editingRep && (
                    <button style={{ ...btnSecondary, fontSize: '12px', padding: '5px 10px' }} onClick={() => { setShowAddRep(true); setRepForm({ name: '', title: '', phone: '', email: '' }); setRepError('') }}>
                      + Add
                    </button>
                  )}
                </div>

                {(showAddRep || editingRep) && (
                  <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px', marginBottom: '12px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                      <div>
                        <label style={labelStyle}>Name <span style={{ color: '#ef4444' }}>*</span></label>
                        <input style={inputStyle} value={repForm.name} onChange={(e) => setRepForm({ ...repForm, name: e.target.value })} autoFocus />
                      </div>
                      <div>
                        <label style={labelStyle}>Title</label>
                        <input style={inputStyle} value={repForm.title} onChange={(e) => setRepForm({ ...repForm, title: e.target.value })} />
                      </div>
                      <div>
                        <label style={labelStyle}>Phone</label>
                        <input style={inputStyle} value={repForm.phone} onChange={(e) => setRepForm({ ...repForm, phone: e.target.value })} />
                      </div>
                      <div>
                        <label style={labelStyle}>Email</label>
                        <input type="email" style={inputStyle} value={repForm.email} onChange={(e) => setRepForm({ ...repForm, email: e.target.value })} />
                      </div>
                    </div>
                    {repError && <div style={{ fontSize: '12px', color: '#dc2626', marginBottom: '8px' }}>{repError}</div>}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button style={{ ...btnPrimary, fontSize: '12px', padding: '6px 12px', opacity: !repForm.name.trim() || repSaving ? 0.5 : 1 }} disabled={!repForm.name.trim() || repSaving} onClick={handleSaveRep}>
                        {repSaving ? 'Saving…' : editingRep ? 'Save' : 'Add'}
                      </button>
                      <button style={{ ...btnSecondary, fontSize: '12px', padding: '6px 10px' }} onClick={() => { setShowAddRep(false); setEditingRep(null); setRepError('') }}>Cancel</button>
                    </div>
                  </div>
                )}

                {reps.length === 0 ? (
                  <div style={{ fontSize: '13px', color: '#94A3B8', padding: '8px 0' }}>No contacts added yet.</div>
                ) : (
                  reps.map((rep) => (
                    <div key={rep.id} style={{ padding: '10px 12px', background: '#F8FAFC', borderRadius: '7px', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>{rep.name}</div>
                          {rep.title && <div style={{ fontSize: '12px', color: '#64748B' }}>{rep.title}</div>}
                          {rep.phone && <div style={{ fontSize: '12px', color: '#64748B' }}>{rep.phone}</div>}
                          {rep.email && <div style={{ fontSize: '12px', color: '#64748B' }}>{rep.email}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                          <button style={{ ...btnSecondary, fontSize: '11px', padding: '4px 8px' }} onClick={() => { setEditingRep(rep); setRepForm({ name: rep.name, title: rep.title ?? '', phone: rep.phone ?? '', email: rep.email ?? '' }); setShowAddRep(false) }}>Edit</button>
                          <button style={{ ...btnDanger, fontSize: '11px', padding: '4px 8px' }} onClick={() => handleDeleteRep(rep)}>Remove</button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Delete section */}
              {!editing && (
                <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '20px', marginTop: '12px' }}>
                  {editError && <div style={{ fontSize: '13px', color: '#dc2626', marginBottom: '10px' }}>{editError}</div>}
                  {confirmDelete ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '13px', color: '#64748B' }}>Delete this company?</span>
                      <button style={{ ...btnDanger, fontSize: '12px', padding: '5px 12px' }} disabled={deleting} onClick={handleDeleteCompany}>{deleting ? 'Deleting…' : 'Yes, Delete'}</button>
                      <button style={{ ...btnSecondary, fontSize: '12px', padding: '5px 10px' }} onClick={() => setConfirmDelete(false)}>Cancel</button>
                    </div>
                  ) : (
                    <button style={btnDanger} onClick={() => setConfirmDelete(true)}>Delete Company</button>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
