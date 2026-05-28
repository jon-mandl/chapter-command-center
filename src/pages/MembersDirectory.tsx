import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useChapter } from '../lib/useChapter'
import { useToast } from '../lib/toast'
import { describeError } from '../lib/errors'
import ConfirmDialog from '../lib/ConfirmDialog'
import { inputStyle, labelStyle, btnPrimary, btnSecondary, btnDanger, card, errorBox } from '../lib/ui'
import type { MemberCompany, CompanyStatus, ID } from '../lib/types'

const STATUS_COLORS: Record<CompanyStatus, { bg: string; color: string }> = {
  Active:   { bg: '#f0fdf4', color: '#059669' },
  Inactive: { bg: '#F8FAFC', color: '#64748B' }
}

type FormState = {
  company_name: string
  contact_name: string
  contact_email: string
  contact_phone: string
  address: string
  city: string
  state: string
  zip: string
  status: CompanyStatus
  notes: string
}

const EMPTY_FORM: FormState = {
  company_name: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  status: 'Active',
  notes: ''
}

function formFromCompany(c: MemberCompany): FormState {
  return {
    company_name: c.company_name,
    contact_name: c.contact_name ?? '',
    contact_email: c.contact_email ?? '',
    contact_phone: c.contact_phone ?? '',
    address: c.address ?? '',
    city: c.city ?? '',
    state: c.state ?? '',
    zip: c.zip ?? '',
    status: c.status,
    notes: c.notes ?? ''
  }
}

function payloadFromForm(form: FormState): Omit<MemberCompany, 'id' | 'chapter_id' | 'created_at' | 'updated_at'> {
  return {
    company_name: form.company_name.trim(),
    contact_name: form.contact_name.trim() || null,
    contact_email: form.contact_email.trim() || null,
    contact_phone: form.contact_phone.trim() || null,
    address: form.address.trim() || null,
    city: form.city.trim() || null,
    state: form.state.trim() || null,
    zip: form.zip.trim() || null,
    status: form.status,
    notes: form.notes.trim() || null
  }
}

export default function MembersDirectory(): React.JSX.Element {
  const { chapterId, loading: chapterLoading } = useChapter()
  const toast = useToast()
  const [companies, setCompanies] = useState<MemberCompany[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | CompanyStatus>('all')

  const [selectedId, setSelectedId] = useState<ID | null>(null)
  const [mode, setMode] = useState<'view' | 'edit' | 'create'>('view')
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [confirmDelete, setConfirmDelete] = useState<MemberCompany | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!chapterId) return
    let cancelled = false
    void supabase
      .from('member_companies')
      .select('*')
      .eq('chapter_id', chapterId)
      .order('company_name')
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          setLoadError(describeError(err, 'Could not load companies.'))
        } else {
          setCompanies((data ?? []) as MemberCompany[])
        }
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [chapterId])

  const selected = companies.find((c) => c.id === selectedId) ?? null

  function selectCompany(id: ID): void {
    setSelectedId(id)
    setMode('view')
    setSaveError('')
  }

  function startCreate(): void {
    setSelectedId(null)
    setMode('create')
    setForm(EMPTY_FORM)
    setSaveError('')
  }

  function startEdit(): void {
    if (!selected) return
    setForm(formFromCompany(selected))
    setMode('edit')
    setSaveError('')
  }

  async function handleSave(): Promise<void> {
    if (!chapterId) return
    setSaveError('')
    const name = form.company_name.trim()
    if (!name) { setSaveError('Company name is required.'); return }
    if (form.contact_email.trim() && !form.contact_email.includes('@')) {
      setSaveError('Contact email looks invalid.')
      return
    }

    setSaving(true)
    const payload = payloadFromForm(form)
    if (mode === 'create') {
      const { data, error: err } = await supabase
        .from('member_companies')
        .insert({ ...payload, chapter_id: chapterId })
        .select()
        .single()
      setSaving(false)
      if (err || !data) {
        const msg = describeError(err, 'Could not create company.')
        setSaveError(msg)
        toast.error(msg)
        return
      }
      const created = data as MemberCompany
      setCompanies((prev) => [...prev, created].sort((a, b) => a.company_name.localeCompare(b.company_name)))
      setSelectedId(created.id)
      setMode('view')
      toast.success('Company added.')
      return
    }

    // edit
    if (!selected) { setSaving(false); return }
    const { data, error: err } = await supabase
      .from('member_companies')
      .update(payload)
      .eq('id', selected.id)
      .eq('chapter_id', chapterId)
      .select()
      .single()
    setSaving(false)
    if (err || !data) {
      const msg = describeError(err, 'Could not save changes.')
      setSaveError(msg)
      toast.error(msg)
      return
    }
    const updated = data as MemberCompany
    setCompanies((prev) => prev.map((c) => c.id === updated.id ? updated : c).sort((a, b) => a.company_name.localeCompare(b.company_name)))
    setMode('view')
    toast.success('Company updated.')
  }

  async function handleDelete(): Promise<void> {
    if (!confirmDelete || !chapterId) return
    setDeleting(true)
    const { error: err } = await supabase
      .from('member_companies')
      .delete()
      .eq('id', confirmDelete.id)
      .eq('chapter_id', chapterId)
    setDeleting(false)
    if (err) {
      toast.error('Could not delete: ' + describeError(err))
      return
    }
    setCompanies((prev) => prev.filter((c) => c.id !== confirmDelete.id))
    if (selectedId === confirmDelete.id) setSelectedId(null)
    setConfirmDelete(null)
    toast.success('Company deleted.')
  }

  if (chapterLoading || loading) {
    return <div style={{ padding: '32px', fontSize: '13px', color: '#64748B' }}>Loading…</div>
  }

  const term = search.trim().toLowerCase()
  const filtered = companies.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (!term) return true
    return (
      c.company_name.toLowerCase().includes(term) ||
      (c.contact_name?.toLowerCase().includes(term) ?? false) ||
      (c.city?.toLowerCase().includes(term) ?? false)
    )
  })

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      {/* Left: list */}
      <div style={{ width: '360px', flexShrink: 0, borderRight: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', background: '#fff' }}>
        <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid #E2E8F0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>Companies</span>
            <button style={{ ...btnPrimary, fontSize: '12px', padding: '5px 12px' }} onClick={startCreate}>+ Add</button>
          </div>
          <input
            style={inputStyle}
            placeholder="Search by name, contact, city…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search companies"
          />
          <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
            {(['all', 'Active', 'Inactive'] as const).map((s) => (
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
                {s === 'all' ? `All (${companies.length})` : `${s} (${companies.filter((c) => c.status === s).length})`}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadError && <div style={{ ...errorBox, margin: '12px 16px' }}>{loadError}</div>}
          {filtered.length === 0 ? (
            <div style={{ padding: '24px 20px', color: '#94A3B8', fontSize: '13px', textAlign: 'center' }}>
              {companies.length === 0 ? 'No companies yet.' : 'No companies match your filters.'}
            </div>
          ) : filtered.map((c) => {
            const sc = STATUS_COLORS[c.status]
            const isSelected = c.id === selectedId
            return (
              <button
                key={c.id}
                onClick={() => selectCompany(c.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '12px 20px', borderBottom: '1px solid #F1F5F9',
                  background: isSelected ? '#EEF2FF' : 'none',
                  border: 'none', borderLeft: isSelected ? '3px solid #1E3A8A' : '3px solid transparent',
                  cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.company_name}</span>
                  <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '20px', flexShrink: 0, background: sc.bg, color: sc.color }}>{c.status}</span>
                </div>
                {(c.contact_name || c.city) && (
                  <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
                    {[c.contact_name, c.city].filter(Boolean).join(' · ')}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Right: detail / edit / create */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
        {mode === 'create' || (mode === 'edit' && selected) ? (
          <CompanyForm
            heading={mode === 'create' ? 'New Company' : `Edit ${selected?.company_name ?? ''}`}
            form={form}
            setForm={setForm}
            saving={saving}
            saveError={saveError}
            onSave={handleSave}
            onCancel={() => { setMode(selected ? 'view' : 'view'); setSaveError(''); if (!selected) setSelectedId(null) }}
          />
        ) : selected ? (
          <CompanyDetail
            company={selected}
            onEdit={startEdit}
            onDelete={() => setConfirmDelete(selected)}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: '80px 24px', color: '#94A3B8', fontSize: '13px' }}>
            Select a company on the left, or{' '}
            <button onClick={startCreate} style={{ background: 'none', border: 'none', color: '#1E3A8A', cursor: 'pointer', padding: 0, fontSize: '13px', fontWeight: 600 }}>add a new one</button>.
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete company?"
        message={confirmDelete ? `Delete "${confirmDelete.company_name}"? This cannot be undone. Hours and grievances linked to this company will not be deleted but will lose their company link.` : ''}
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}

function CompanyForm({ heading, form, setForm, saving, saveError, onSave, onCancel }: {
  heading: string
  form: FormState
  setForm: (f: FormState) => void
  saving: boolean
  saveError: string
  onSave: () => void
  onCancel: () => void
}): React.JSX.Element {
  function update<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm({ ...form, [key]: value })
  }

  return (
    <div style={{ ...card, maxWidth: '680px' }}>
      <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '20px' }}>{heading}</div>

      <div style={{ marginBottom: '14px' }}>
        <label style={labelStyle}>Company Name <span style={{ color: '#ef4444' }}>*</span></label>
        <input style={inputStyle} value={form.company_name} autoFocus onChange={(e) => update('company_name', e.target.value)} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
        <div>
          <label style={labelStyle}>Status</label>
          <select style={inputStyle} value={form.status} onChange={(e) => update('status', e.target.value as CompanyStatus)}>
            <option>Active</option>
            <option>Inactive</option>
          </select>
        </div>
      </div>

      <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', marginTop: '8px' }}>Primary Contact</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
        <div>
          <label style={labelStyle}>Name</label>
          <input style={inputStyle} value={form.contact_name} onChange={(e) => update('contact_name', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Email</label>
          <input type="email" style={inputStyle} value={form.contact_email} onChange={(e) => update('contact_email', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Phone</label>
          <input style={inputStyle} value={form.contact_phone} onChange={(e) => update('contact_phone', e.target.value)} />
        </div>
      </div>

      <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Address</div>
      <div style={{ marginBottom: '12px' }}>
        <label style={labelStyle}>Street</label>
        <input style={inputStyle} value={form.address} onChange={(e) => update('address', e.target.value)} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
        <div>
          <label style={labelStyle}>City</label>
          <input style={inputStyle} value={form.city} onChange={(e) => update('city', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>State</label>
          <input style={inputStyle} value={form.state} onChange={(e) => update('state', e.target.value)} maxLength={2} placeholder="CA" />
        </div>
        <div>
          <label style={labelStyle}>ZIP</label>
          <input style={inputStyle} value={form.zip} onChange={(e) => update('zip', e.target.value)} maxLength={10} />
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>Notes</label>
        <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '70px' }} value={form.notes} onChange={(e) => update('notes', e.target.value)} />
      </div>

      {saveError && <div style={errorBox}>{saveError}</div>}

      <div style={{ display: 'flex', gap: '8px' }}>
        <button style={{ ...btnPrimary, opacity: saving ? 0.5 : 1 }} disabled={saving} onClick={onSave}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button style={btnSecondary} disabled={saving} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function CompanyDetail({ company, onEdit, onDelete }: {
  company: MemberCompany
  onEdit: () => void
  onDelete: () => void
}): React.JSX.Element {
  const sc = STATUS_COLORS[company.status]
  const addressLine = [company.address, [company.city, company.state].filter(Boolean).join(', '), company.zip].filter(Boolean).join(', ')

  return (
    <div style={{ maxWidth: '680px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', margin: 0 }}>{company.company_name}</h2>
          <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', background: sc.bg, color: sc.color }}>{company.status}</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={btnSecondary} onClick={onEdit}>Edit</button>
          <button style={btnDanger} onClick={onDelete}>Delete</button>
        </div>
      </div>

      <div style={card}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <Detail label="Contact Name" value={company.contact_name} />
          <Detail label="Email" value={company.contact_email} link={company.contact_email ? `mailto:${company.contact_email}` : undefined} />
          <Detail label="Phone" value={company.contact_phone} />
          <Detail label="Address" value={addressLine || null} />
        </div>
        {company.notes && (
          <>
            <div style={{ height: '1px', background: '#F1F5F9', margin: '16px 0' }} />
            <div>
              <DetailLabel>Notes</DetailLabel>
              <div style={{ fontSize: '13px', color: '#475569', whiteSpace: 'pre-wrap' }}>{company.notes}</div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function DetailLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '4px' }}>{children}</div>
}

function Detail({ label, value, link }: { label: string; value: string | null; link?: string }): React.JSX.Element {
  return (
    <div>
      <DetailLabel>{label}</DetailLabel>
      {value ? (
        link ? (
          <a href={link} style={{ fontSize: '14px', color: '#1E3A8A', textDecoration: 'none' }}>{value}</a>
        ) : (
          <div style={{ fontSize: '14px', color: '#0F172A' }}>{value}</div>
        )
      ) : (
        <div style={{ fontSize: '14px', color: '#CBD5E1' }}>—</div>
      )}
    </div>
  )
}
