import { useEffect, useState, useCallback } from 'react'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { supabase } from '../lib/supabase'
import { useOrg } from '../lib/useOrg'
import { inputStyle, labelStyle, btnPrimary, btnSecondary, btnDanger, errorBox } from '../lib/ui'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LocalUnion {
  id: number
  local_number: string
  charter_city: string | null
  business_manager: string | null
  phone: string | null
  email: string | null
  mailing_address: string | null
}

interface PackageRates {
  id: number
  local_union_id: number | null
  effective_date: string | null
  base_wage: number
  health_welfare: number; health_welfare_mode: number
  supplemental_health_welfare: number; supplemental_health_welfare_mode: number
  pension: number; pension_mode: number
  annuity: number; annuity_mode: number
  four_oh_one_k: number; four_oh_one_k_mode: number
  unemployment: number; unemployment_mode: number
  jatc: number; jatc_mode: number
  neca_service_charge: number; neca_service_charge_mode: number
  admin_maintenance_fund: number; admin_maintenance_fund_mode: number
  lmcc: number; lmcc_mode: number
  nlmcc: number
  other1_label: string | null; other1_amount: number; other1_mode: number
  other2_label: string | null; other2_amount: number; other2_mode: number
  other3_label: string | null; other3_amount: number; other3_mode: number
}

interface WageTier {
  id: number
  label: string
  amount: number
  mode: number
  sort_order: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FUND_LABEL_DEFAULTS: Record<string, string> = {
  health_welfare:              'Health & Welfare',
  supplemental_health_welfare: 'Supplemental Health & Welfare',
  pension:                     'Pension',
  annuity:                     'Annuity',
  four_oh_one_k:               '401(k)',
  unemployment:                'Unemployment',
  jatc:                        'JATC',
  neca_service_charge:         'NECA Service Charge',
  admin_maintenance_fund:      'Administrative Maintenance Fund',
  lmcc:                        'LMCC',
  nlmcc:                       'NLMCC'
}

const FUND_KEY_ORDER = Object.keys(FUND_LABEL_DEFAULTS)

const PIE_COLORS = [
  '#2563eb', '#7c3aed', '#0891b2', '#16a34a', '#d97706',
  '#dc2626', '#db2777', '#0d9488', '#4f46e5', '#ea580c',
  '#65a30d', '#0369a1', '#9333ea', '#b45309', '#be123c', '#047857'
]

const emptyRates: Omit<PackageRates, 'id'> = {
  local_union_id: null, effective_date: null,
  base_wage: 0,
  health_welfare: 0, health_welfare_mode: 0,
  supplemental_health_welfare: 0, supplemental_health_welfare_mode: 0,
  pension: 0, pension_mode: 0,
  annuity: 0, annuity_mode: 0,
  four_oh_one_k: 0, four_oh_one_k_mode: 0,
  unemployment: 0, unemployment_mode: 0,
  jatc: 0, jatc_mode: 0,
  neca_service_charge: 0, neca_service_charge_mode: 0,
  admin_maintenance_fund: 0, admin_maintenance_fund_mode: 0,
  lmcc: 0, lmcc_mode: 0,
  nlmcc: 0.01,
  other1_label: null, other1_amount: 0, other1_mode: 0,
  other2_label: null, other2_amount: 0, other2_mode: 0,
  other3_label: null, other3_amount: 0, other3_mode: 0
}

const emptyUnion = { local_number: '', charter_city: '', business_manager: '', phone: '', email: '', mailing_address: '' }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolve(amount: number, mode: number, baseWage: number): number {
  return mode === 1 ? baseWage * (amount / 100) : amount
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

// ─── Shared sub-components ────────────────────────────────────────────────────

const sectionHead: React.CSSProperties = { fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }
const divider: React.CSSProperties = { borderTop: '1px solid #f0f0f0', paddingTop: '20px', marginTop: '20px' }
const readonlyStyle: React.CSSProperties = { ...inputStyle, background: '#F8FAFC', color: '#94A3B8', cursor: 'default' }

function ModeToggle({ mode, onToggle }: { mode: number; onToggle: () => void }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', border: '1px solid #CBD5E1', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }}>
      <button type="button" onClick={() => mode !== 0 && onToggle()} style={{ padding: '0 10px', fontSize: '12px', fontWeight: 600, border: 'none', cursor: mode === 0 ? 'default' : 'pointer', background: mode === 0 ? '#1E3A8A' : '#fff', color: mode === 0 ? '#fff' : '#6b7280', height: '36px' }}>$</button>
      <button type="button" onClick={() => mode !== 1 && onToggle()} style={{ padding: '0 10px', fontSize: '12px', fontWeight: 600, border: 'none', borderLeft: '1px solid #CBD5E1', cursor: mode === 1 ? 'default' : 'pointer', background: mode === 1 ? '#1E3A8A' : '#fff', color: mode === 1 ? '#fff' : '#6b7280', height: '36px' }}>%</button>
    </div>
  )
}

function FringeField({ label, amountKey, modeKey, rates, onNum, onToggle }: {
  label: string
  amountKey: keyof Omit<PackageRates, 'id'>
  modeKey: keyof Omit<PackageRates, 'id'>
  rates: Omit<PackageRates, 'id'>
  onNum: (field: keyof Omit<PackageRates, 'id'>, value: string) => void
  onToggle: (modeField: keyof Omit<PackageRates, 'id'>) => void
}): React.JSX.Element {
  const amount = rates[amountKey] as number
  const mode = rates[modeKey] as number
  const resolved = resolve(amount, mode, rates.base_wage)
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <input type="number" step={mode === 1 ? '0.001' : '0.0001'} min="0" value={amount || ''} onChange={(e) => onNum(amountKey, e.target.value)} style={inputStyle} />
        <ModeToggle mode={mode} onToggle={() => onToggle(modeKey)} />
      </div>
      {mode === 1 && <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>= ${resolved.toFixed(4)}/hr</div>}
    </div>
  )
}

// ─── Info Tab ─────────────────────────────────────────────────────────────────

function InfoTab({ union, orgId, onDeleted, onUpdated }: {
  union: LocalUnion
  orgId: string
  onDeleted: () => void
  onUpdated: (u: LocalUnion) => void
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [form, setForm] = useState(emptyUnion)
  const [actionError, setActionError] = useState('')
  const [fundLabels, setFundLabels] = useState<Record<string, string>>({ ...FUND_LABEL_DEFAULTS })
  const [savingLabels, setSavingLabels] = useState(false)
  const [labelsSaved, setLabelsSaved] = useState(false)

  useEffect(() => {
    // Load fund labels from org_settings
    supabase.from('org_settings').select('key, value').eq('org_id', orgId).like('key', `fund_label_${union.id}_%`)
      .then(({ data }) => {
        if (!data) return
        const labels: Record<string, string> = { ...FUND_LABEL_DEFAULTS }
        data.forEach((row) => {
          const fundKey = row.key.replace(`fund_label_${union.id}_`, '')
          if (fundKey && row.value) labels[fundKey] = row.value
        })
        setFundLabels(labels)
      })
  }, [union.id, orgId])

  function startEdit(): void {
    setForm({ local_number: union.local_number, charter_city: union.charter_city ?? '', business_manager: union.business_manager ?? '', phone: union.phone ?? '', email: union.email ?? '', mailing_address: union.mailing_address ?? '' })
    setEditing(true)
  }

  async function handleUpdate(): Promise<void> {
    if (!form.local_number.trim()) return
    setActionError('')
    const { data, error } = await supabase.from('local_unions').update({
      local_number: form.local_number.trim(),
      charter_city: form.charter_city.trim() || null,
      business_manager: form.business_manager.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      mailing_address: form.mailing_address.trim() || null
    }).eq('id', union.id).select().single()
    if (error) { setActionError('Could not save changes. Please try again.'); return }
    onUpdated(data as LocalUnion)
    setEditing(false)
  }

  async function handleDelete(): Promise<void> {
    setActionError('')
    const { error } = await supabase.from('local_unions').delete().eq('id', union.id)
    if (error) { setActionError('Could not delete local union.'); setConfirmDelete(false); return }
    onDeleted()
  }

  async function handleSaveLabels(): Promise<void> {
    setSavingLabels(true)
    const upserts = Object.entries(fundLabels).map(([key, value]) => ({
      org_id: orgId,
      key: `fund_label_${union.id}_${key}`,
      value
    }))
    const { error } = await supabase.from('org_settings').upsert(upserts, { onConflict: 'org_id,key' })
    setSavingLabels(false)
    if (error) { setActionError('Failed to save labels.'); return }
    setLabelsSaved(true)
    setTimeout(() => setLabelsSaved(false), 3000)
  }

  return (
    <div style={{ maxWidth: '540px' }}>
      {actionError && <div style={{ ...errorBox, display: 'flex', justifyContent: 'space-between' }}><span>{actionError}</span><button onClick={() => setActionError('')} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '16px' }}>×</button></div>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
          Local {union.local_number}
          {union.charter_city && <span style={{ fontWeight: 400, color: '#64748B', marginLeft: '8px', fontSize: '15px' }}>{union.charter_city}</span>}
        </h2>
        {!editing && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={startEdit} style={btnSecondary}>Edit</button>
            <button onClick={() => setConfirmDelete(true)} style={btnDanger}>Delete</button>
          </div>
        )}
      </div>

      {confirmDelete && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#dc2626', marginBottom: '10px' }}>Delete Local {union.local_number}? This cannot be undone.</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleDelete} style={{ ...btnDanger, background: '#dc2626', color: '#fff', border: 'none' }}>Yes, Delete</button>
            <button onClick={() => setConfirmDelete(false)} style={btnSecondary}>Cancel</button>
          </div>
        </div>
      )}

      {editing ? (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Local Number *</label>
            <input style={inputStyle} value={form.local_number} onChange={(e) => setForm((f) => ({ ...f, local_number: e.target.value }))} />
          </div>
          <div><label style={labelStyle}>Charter City</label><input style={inputStyle} value={form.charter_city} onChange={(e) => setForm((f) => ({ ...f, charter_city: e.target.value }))} /></div>
          <div><label style={labelStyle}>Business Manager</label><input style={inputStyle} value={form.business_manager} onChange={(e) => setForm((f) => ({ ...f, business_manager: e.target.value }))} /></div>
          <div><label style={labelStyle}>Phone</label><input style={inputStyle} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
          <div><label style={labelStyle}>Email</label><input style={inputStyle} type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
          <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Mailing Address</label><textarea rows={3} value={form.mailing_address} onChange={(e) => setForm((f) => ({ ...f, mailing_address: e.target.value }))} style={{ ...inputStyle, resize: 'vertical' }} /></div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '10px' }}>
            <button onClick={handleUpdate} style={btnPrimary}>Save Changes</button>
            <button onClick={() => setEditing(false)} style={btnSecondary}>Cancel</button>
          </div>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {[{ label: 'Business Manager', value: union.business_manager }, { label: 'Phone', value: union.phone }, { label: 'Email', value: union.email }, { label: 'Charter City', value: union.charter_city }].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{label}</div>
                <div style={{ fontSize: '13px', color: value ? '#0F172A' : '#CBD5E1' }}>{value || '—'}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Mailing Address</div>
            <div style={{ fontSize: '13px', color: union.mailing_address ? '#0F172A' : '#CBD5E1', whiteSpace: 'pre-line' }}>{union.mailing_address || '—'}</div>
          </div>
        </div>
      )}

      {/* Fund Labels */}
      <div style={{ marginTop: '28px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '24px' }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>Fund Labels</div>
        <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 16px' }}>Customize fund names for this local union.</p>
        {labelsSaved && <div style={{ marginBottom: '12px', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: 500, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>Labels saved.</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          {FUND_KEY_ORDER.map((key) => (
            <div key={key}>
              <label style={labelStyle}>{FUND_LABEL_DEFAULTS[key]}</label>
              <input type="text" value={fundLabels[key] ?? ''} onChange={(e) => setFundLabels((prev) => ({ ...prev, [key]: e.target.value }))} placeholder={FUND_LABEL_DEFAULTS[key]} style={inputStyle} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleSaveLabels} disabled={savingLabels} style={{ ...btnPrimary, opacity: savingLabels ? 0.7 : 1 }}>{savingLabels ? 'Saving…' : 'Save Labels'}</button>
          <button onClick={() => setFundLabels({ ...FUND_LABEL_DEFAULTS })} style={btnSecondary}>Reset to Defaults</button>
        </div>
      </div>
    </div>
  )
}

// ─── Wage Packages Tab ────────────────────────────────────────────────────────

function WagePackagesTab({ localUnion, orgId }: { localUnion: LocalUnion; orgId: string }): React.JSX.Element {
  const [rates, setRates] = useState<Omit<PackageRates, 'id'>>({ ...emptyRates })
  const [fundLabels, setFundLabels] = useState<Record<string, string>>({ ...FUND_LABEL_DEFAULTS })
  const [wageTiers, setWageTiers] = useState<WageTier[]>([])
  const [existingDates, setExistingDates] = useState<string[]>([])
  const [selectedDate, setSelectedDate] = useState<string>('new')
  const [newDateInput, setNewDateInput] = useState(todayIso())
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [actionError, setActionError] = useState('')

  const activeDate = selectedDate === 'new' ? newDateInput : selectedDate

  useEffect(() => {
    // Load existing dates
    supabase.from('package_rates').select('effective_date').eq('local_union_id', localUnion.id).eq('org_id', orgId).order('effective_date', { ascending: false })
      .then(({ data }) => {
        const dates = (data ?? []).map((r) => r.effective_date).filter(Boolean) as string[]
        setExistingDates(dates)
        if (dates.length > 0) setSelectedDate(dates[0])
      })

    // Load fund labels
    supabase.from('org_settings').select('key, value').eq('org_id', orgId).like('key', `fund_label_${localUnion.id}_%`)
      .then(({ data }) => {
        if (!data) return
        const labels: Record<string, string> = { ...FUND_LABEL_DEFAULTS }
        data.forEach((row) => { const k = row.key.replace(`fund_label_${localUnion.id}_`, ''); if (k && row.value) labels[k] = row.value })
        setFundLabels(labels)
      })

    // Load wage tiers
    supabase.from('wage_tiers').select('*').eq('local_union_id', localUnion.id).eq('org_id', orgId).order('sort_order')
      .then(({ data }) => { if (data) setWageTiers(data as WageTier[]) })
  }, [localUnion.id, orgId])

  useEffect(() => {
    if (selectedDate === 'new') { setRates({ ...emptyRates }); return }
    supabase.from('package_rates').select('*').eq('local_union_id', localUnion.id).eq('org_id', orgId).eq('effective_date', selectedDate).single()
      .then(({ data }) => { if (data) setRates(data as Omit<PackageRates, 'id'>); else setRates({ ...emptyRates }) })
  }, [localUnion.id, orgId, selectedDate])

  function handleNum(field: keyof Omit<PackageRates, 'id'>, value: string): void {
    setRates((prev) => ({ ...prev, [field]: parseFloat(value) || 0 }))
  }
  function handleStr(field: keyof Omit<PackageRates, 'id'>, value: string): void {
    setRates((prev) => ({ ...prev, [field]: value || null }))
  }
  function handleToggle(modeField: keyof Omit<PackageRates, 'id'>): void {
    setRates((prev) => ({ ...prev, [modeField]: prev[modeField] === 0 ? 1 : 0 }))
  }

  async function handleSave(): Promise<void> {
    if (!activeDate) { setActionError('Please enter an effective date before saving.'); return }
    setSaving(true)
    setActionError('')

    const payload = { ...rates, org_id: orgId, local_union_id: localUnion.id, effective_date: activeDate, nlmcc: 0.01 }

    // Check if record exists for this date
    const { data: existing } = await supabase.from('package_rates').select('id').eq('local_union_id', localUnion.id).eq('org_id', orgId).eq('effective_date', activeDate).single()

    const { error } = existing
      ? await supabase.from('package_rates').update(payload).eq('id', existing.id)
      : await supabase.from('package_rates').insert(payload)

    if (error) { setActionError('Could not save wage package. Please try again.'); setSaving(false); return }

    const { data: updatedDates } = await supabase.from('package_rates').select('effective_date').eq('local_union_id', localUnion.id).eq('org_id', orgId).order('effective_date', { ascending: false })
    const dates = (updatedDates ?? []).map((r) => r.effective_date).filter(Boolean) as string[]
    setExistingDates(dates)
    setSelectedDate(activeDate)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function handleAddTier(): Promise<void> {
    const { data, error } = await supabase.from('wage_tiers').insert({ org_id: orgId, local_union_id: localUnion.id, label: 'New Classification', amount: 0, mode: 1, sort_order: wageTiers.length }).select().single()
    if (!error && data) setWageTiers((prev) => [...prev, data as WageTier])
  }

  const handleTierChange = useCallback((id: number, field: keyof WageTier, value: string | number): void => {
    setWageTiers((prev) => prev.map((t) => t.id === id ? { ...t, [field]: value } : t))
  }, [])

  async function handleTierBlur(tier: WageTier): Promise<void> {
    await supabase.from('wage_tiers').update({ label: tier.label, amount: tier.amount, mode: tier.mode }).eq('id', tier.id)
  }

  async function handleDeleteTier(id: number): Promise<void> {
    const { error } = await supabase.from('wage_tiers').delete().eq('id', id)
    if (!error) setWageTiers((prev) => prev.filter((t) => t.id !== id))
  }

  const nebf = rates.base_wage * 0.03

  return (
    <div style={{ maxWidth: '760px' }}>
      {/* Date selector */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '16px 20px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', flexShrink: 0 }}>Effective Date</div>
        <select value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: '180px' }}>
          {existingDates.map((d) => <option key={d} value={d}>{d}</option>)}
          <option value="new">+ New Entry</option>
        </select>
        {selectedDate === 'new' && (
          <>
            <input type="date" value={newDateInput} onChange={(e) => setNewDateInput(e.target.value)} style={{ ...inputStyle, width: 'auto' }} />
            <span style={{ fontSize: '12px', color: '#64748B' }}>Enter rates below and save to create this entry.</span>
          </>
        )}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '28px' }}>
        {/* Base Wage */}
        <div style={sectionHead}>Journeyman Wages</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Base Wage ($/hr)</label>
            <input type="number" step="0.0001" min="0" value={rates.base_wage || ''} onChange={(e) => handleNum('base_wage', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>NEBF <span style={{ fontWeight: 400, color: '#94A3B8' }}>(auto: base wage × 3%)</span></label>
            <input type="text" readOnly value={`$${nebf.toFixed(4)}/hr`} style={readonlyStyle} />
          </div>
        </div>

        {/* Wage Tiers */}
        <div style={divider}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={sectionHead}>Wage Classifications</div>
            <button onClick={handleAddTier} style={{ padding: '5px 12px', background: '#fff', color: '#1E3A8A', border: '1px solid #1E3A8A', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>+ Add Classification</button>
          </div>
          <p style={{ fontSize: '12px', color: '#94A3B8', margin: '-4px 0 14px' }}>Enter as % of base wage (e.g. 110 = 110%) or switch to $ for flat rate.</p>
          {wageTiers.length === 0 && <div style={{ color: '#94A3B8', fontSize: '13px', padding: '8px 0' }}>No classifications added yet.</div>}
          {wageTiers.map((tier) => {
            const resolvedWage = tier.mode === 1 ? rates.base_wage * (tier.amount / 100) : tier.amount
            return (
              <div key={tier.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '10px' }}>
                <div style={{ flex: '0 0 200px' }}>
                  <input type="text" value={tier.label} onChange={(e) => handleTierChange(tier.id, 'label', e.target.value)} onBlur={() => handleTierBlur(tier)} style={inputStyle} placeholder="Classification name" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input type="number" step={tier.mode === 1 ? '0.1' : '0.0001'} min="0" value={tier.amount || ''} onChange={(e) => handleTierChange(tier.id, 'amount', parseFloat(e.target.value) || 0)} onBlur={() => handleTierBlur(tier)} style={inputStyle} />
                    <ModeToggle mode={tier.mode} onToggle={() => { const updated = { ...tier, mode: tier.mode === 0 ? 1 : 0 }; handleTierChange(tier.id, 'mode', updated.mode); handleTierBlur(updated) }} />
                  </div>
                  {tier.mode === 1 && rates.base_wage > 0 && <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>= ${resolvedWage.toFixed(4)}/hr</div>}
                </div>
                <button onClick={() => handleDeleteTier(tier.id)} aria-label="Remove classification" title="Remove classification" style={{ padding: '8px', background: 'none', border: '1px solid #E2E8F0', borderRadius: '6px', cursor: 'pointer', color: '#94A3B8', flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                </button>
              </div>
            )
          })}
        </div>

        {/* Fringe Benefits */}
        <div style={divider}>
          <div style={sectionHead}>Fringe Benefits</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <FringeField label={fundLabels['health_welfare']} amountKey="health_welfare" modeKey="health_welfare_mode" rates={rates} onNum={handleNum} onToggle={handleToggle} />
            <FringeField label={fundLabels['supplemental_health_welfare']} amountKey="supplemental_health_welfare" modeKey="supplemental_health_welfare_mode" rates={rates} onNum={handleNum} onToggle={handleToggle} />
            <FringeField label={fundLabels['pension']} amountKey="pension" modeKey="pension_mode" rates={rates} onNum={handleNum} onToggle={handleToggle} />
            <FringeField label={fundLabels['annuity']} amountKey="annuity" modeKey="annuity_mode" rates={rates} onNum={handleNum} onToggle={handleToggle} />
            <FringeField label={fundLabels['four_oh_one_k']} amountKey="four_oh_one_k" modeKey="four_oh_one_k_mode" rates={rates} onNum={handleNum} onToggle={handleToggle} />
            <FringeField label={fundLabels['unemployment']} amountKey="unemployment" modeKey="unemployment_mode" rates={rates} onNum={handleNum} onToggle={handleToggle} />
            <FringeField label={fundLabels['jatc']} amountKey="jatc" modeKey="jatc_mode" rates={rates} onNum={handleNum} onToggle={handleToggle} />
            <FringeField label={fundLabels['neca_service_charge']} amountKey="neca_service_charge" modeKey="neca_service_charge_mode" rates={rates} onNum={handleNum} onToggle={handleToggle} />
            <FringeField label={fundLabels['admin_maintenance_fund']} amountKey="admin_maintenance_fund" modeKey="admin_maintenance_fund_mode" rates={rates} onNum={handleNum} onToggle={handleToggle} />
            <FringeField label={fundLabels['lmcc']} amountKey="lmcc" modeKey="lmcc_mode" rates={rates} onNum={handleNum} onToggle={handleToggle} />
            <div>
              <label style={labelStyle}>{fundLabels['nlmcc']} <span style={{ fontWeight: 400, color: '#94A3B8' }}>(locked at $0.01)</span></label>
              <input type="text" readOnly value="$0.01/hr" style={readonlyStyle} />
            </div>
          </div>
        </div>

        {/* Other Items */}
        <div style={divider}>
          <div style={sectionHead}>Other Items</div>
          {([1, 2, 3] as const).map((n) => {
            const labelKey = `other${n}_label` as keyof Omit<PackageRates, 'id'>
            const amountKey = `other${n}_amount` as keyof Omit<PackageRates, 'id'>
            const modeKey = `other${n}_mode` as keyof Omit<PackageRates, 'id'>
            const mode = rates[modeKey] as number
            const amount = rates[amountKey] as number
            const resolved = resolve(amount, mode, rates.base_wage)
            return (
              <div key={n} style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'flex-start' }}>
                <div style={{ flex: '0 0 50%' }}>
                  {n === 1 && <label style={labelStyle}>Description</label>}
                  <input type="text" value={(rates[labelKey] as string) || ''} onChange={(e) => handleStr(labelKey, e.target.value)} placeholder={`Other item ${n}`} style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  {n === 1 && <label style={labelStyle}>Amount</label>}
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input type="number" step={mode === 1 ? '0.001' : '0.0001'} min="0" value={amount || ''} onChange={(e) => handleNum(amountKey, e.target.value)} style={inputStyle} />
                    <ModeToggle mode={mode} onToggle={() => handleToggle(modeKey)} />
                  </div>
                  {mode === 1 && <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>= ${resolved.toFixed(4)}/hr</div>}
                </div>
              </div>
            )
          })}
        </div>

        {actionError && <div style={errorBox}>{actionError}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
          <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving…' : 'Save Rates'}</button>
          {saved && (
            <span style={{ fontSize: '13px', color: '#166534', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '5px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
              Saved
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Analysis Tab ─────────────────────────────────────────────────────────────

function AnalysisTab({ localUnion, orgId }: { localUnion: LocalUnion; orgId: string }): React.JSX.Element {
  const [rates, setRates] = useState<Omit<PackageRates, 'id'>>({ ...emptyRates })
  const [fundLabels, setFundLabels] = useState<Record<string, string>>({ ...FUND_LABEL_DEFAULTS })

  useEffect(() => {
    supabase.from('package_rates').select('*').eq('local_union_id', localUnion.id).eq('org_id', orgId).order('effective_date', { ascending: false }).limit(1).single()
      .then(({ data }) => { if (data) setRates(data as Omit<PackageRates, 'id'>) })
    supabase.from('org_settings').select('key, value').eq('org_id', orgId).like('key', `fund_label_${localUnion.id}_%`)
      .then(({ data }) => {
        if (!data) return
        const labels: Record<string, string> = { ...FUND_LABEL_DEFAULTS }
        data.forEach((row) => { const k = row.key.replace(`fund_label_${localUnion.id}_`, ''); if (k && row.value) labels[k] = row.value })
        setFundLabels(labels)
      })
  }, [localUnion.id, orgId])

  const bw = rates.base_wage
  const nebf = bw * 0.03
  const hw    = resolve(rates.health_welfare, rates.health_welfare_mode, bw)
  const shw   = resolve(rates.supplemental_health_welfare, rates.supplemental_health_welfare_mode, bw)
  const pen   = resolve(rates.pension, rates.pension_mode, bw)
  const ann   = resolve(rates.annuity, rates.annuity_mode, bw)
  const k401  = resolve(rates.four_oh_one_k, rates.four_oh_one_k_mode, bw)
  const unemp = resolve(rates.unemployment, rates.unemployment_mode, bw)
  const jatc  = resolve(rates.jatc, rates.jatc_mode, bw)
  const neca  = resolve(rates.neca_service_charge, rates.neca_service_charge_mode, bw)
  const amf   = resolve(rates.admin_maintenance_fund, rates.admin_maintenance_fund_mode, bw)
  const lmcc  = resolve(rates.lmcc, rates.lmcc_mode, bw)
  const nlmcc = 0.01
  const ot1   = rates.other1_label ? resolve(rates.other1_amount, rates.other1_mode, bw) : 0
  const ot2   = rates.other2_label ? resolve(rates.other2_amount, rates.other2_mode, bw) : 0
  const ot3   = rates.other3_label ? resolve(rates.other3_amount, rates.other3_mode, bw) : 0

  const rows = [
    { label: 'Base Wage', amount: bw },
    { label: 'NEBF (auto)', amount: nebf },
    { label: fundLabels['health_welfare'], amount: hw },
    { label: fundLabels['supplemental_health_welfare'], amount: shw },
    { label: fundLabels['pension'], amount: pen },
    { label: fundLabels['annuity'], amount: ann },
    { label: fundLabels['four_oh_one_k'], amount: k401 },
    { label: fundLabels['unemployment'], amount: unemp },
    { label: fundLabels['jatc'], amount: jatc },
    { label: fundLabels['neca_service_charge'], amount: neca },
    { label: fundLabels['admin_maintenance_fund'], amount: amf },
    { label: fundLabels['lmcc'], amount: lmcc },
    { label: fundLabels['nlmcc'], amount: nlmcc },
    ...(rates.other1_label ? [{ label: rates.other1_label, amount: ot1 }] : []),
    ...(rates.other2_label ? [{ label: rates.other2_label, amount: ot2 }] : []),
    ...(rates.other3_label ? [{ label: rates.other3_label, amount: ot3 }] : [])
  ]

  const total = rows.reduce((s, r) => s + r.amount, 0)
  const fringes = total - bw - nebf
  const pieData = rows.filter((r) => r.amount > 0).map((r) => ({ name: r.label, value: parseFloat(r.amount.toFixed(4)) }))

  const thS: React.CSSProperties = { padding: '8px 12px', fontSize: '11px', fontWeight: 600, color: '#64748B', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #E2E8F0' }
  const tdS: React.CSSProperties = { padding: '9px 12px', fontSize: '13px', color: '#0F172A', borderBottom: '1px solid #F1F5F9' }
  const tdR: React.CSSProperties = { ...tdS, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

  if (total === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '40vh' }}>
        <div style={{ textAlign: 'center', color: '#94A3B8' }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 12px', display: 'block' }} aria-hidden="true"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#64748B', marginBottom: '4px' }}>No package rates entered yet</div>
          <div style={{ fontSize: '13px' }}>Enter rates in the Wage Packages tab to see analysis here.</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '900px' }}>
      <div style={{ background: '#1e3a5f', borderRadius: '10px', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: '32px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Journeyman Total Package</span>
          <span style={{ fontSize: '22px', fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{fmt(total)}/hr</span>
        </div>
        <div style={{ width: '1px', height: '28px', background: 'rgba(255,255,255,0.15)' }} />
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          <div><div style={{ fontSize: '10px', color: '#93c5fd', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Base Wage</div><div style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0' }}>{fmt(bw)}/hr</div></div>
          <div><div style={{ fontSize: '10px', color: '#93c5fd', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fringes</div><div style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0' }}>{fmt(fringes + nebf)}/hr</div></div>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '24px' }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '20px' }}>Journeyman Package Summary</div>
        <div style={{ display: 'flex', gap: '32px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 300px', minWidth: '260px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th scope="col" style={thS}>Category</th>
                  <th scope="col" style={{ ...thS, textAlign: 'right' }}>$/hr</th>
                  <th scope="col" style={{ ...thS, textAlign: 'right' }}>% of Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    <td style={tdS}>{row.label}</td>
                    <td style={tdR}>${row.amount.toFixed(4)}</td>
                    <td style={tdR}>{total > 0 ? ((row.amount / total) * 100).toFixed(1) + '%' : '—'}</td>
                  </tr>
                ))}
                <tr style={{ background: '#F8FAFC' }}>
                  <td style={{ ...tdS, fontWeight: 700, borderTop: '2px solid #E2E8F0' }}>Total Package</td>
                  <td style={{ ...tdR, fontWeight: 700, borderTop: '2px solid #E2E8F0' }}>${total.toFixed(4)}</td>
                  <td style={{ ...tdR, fontWeight: 700, borderTop: '2px solid #E2E8F0' }}>100%</td>
                </tr>
              </tbody>
            </table>
          </div>
          {pieData.length > 0 && (
            <div style={{ flex: '1 1 300px', minWidth: '280px' }}>
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="45%" outerRadius={110} dataKey="value">
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value) => typeof value === 'number' ? `$${value.toFixed(4)}/hr` : value} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'info' | 'wage-packages' | 'analysis'

export default function LocalUnions(): React.JSX.Element {
  const { orgId, loading: orgLoading } = useOrg()
  const [unions, setUnions] = useState<LocalUnion[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('info')
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState(emptyUnion)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const loadUnions = useCallback(async () => {
    if (!orgId) return
    const { data } = await supabase.from('local_unions').select('*').eq('org_id', orgId).order('local_number')
    if (data) {
      setUnions(data as LocalUnion[])
      if (data.length > 0 && selectedId === null) setSelectedId((data[0] as LocalUnion).id)
    }
  }, [orgId, selectedId])

  useEffect(() => { loadUnions() }, [loadUnions])

  async function handleCreate(): Promise<void> {
    if (!newForm.local_number.trim() || !orgId) return
    setCreating(true)
    setCreateError('')
    const { data, error } = await supabase.from('local_unions').insert({
      org_id: orgId,
      local_number: newForm.local_number.trim(),
      charter_city: newForm.charter_city.trim() || null,
      business_manager: newForm.business_manager.trim() || null,
      phone: newForm.phone.trim() || null,
      email: newForm.email.trim() || null,
      mailing_address: newForm.mailing_address.trim() || null
    }).select().single()
    setCreating(false)
    if (error) { setCreateError('Could not create local union. Please try again.'); return }
    setUnions((prev) => [...prev, data as LocalUnion])
    setSelectedId((data as LocalUnion).id)
    setShowNew(false)
    setNewForm(emptyUnion)
  }

  const selected = unions.find((u) => u.id === selectedId) ?? null
  const TABS: { id: Tab; label: string }[] = [
    { id: 'info', label: 'Info' },
    { id: 'wage-packages', label: 'Wage Packages' },
    { id: 'analysis', label: 'Analysis' }
  ]

  if (orgLoading) return <div style={{ padding: '32px', fontSize: '13px', color: '#64748B' }}>Loading…</div>

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Left list */}
      <div style={{ width: '220px', minWidth: '220px', borderRight: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>
        <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>Local Unions</div>
          <button onClick={() => { setShowNew(true); setSelectedId(null); setNewForm(emptyUnion) }} style={{ padding: '4px 10px', background: '#1E3A8A', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>+ Add</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {unions.length === 0 && !showNew && (
            <div style={{ padding: '32px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748B', marginBottom: '4px' }}>No local unions yet</div>
              <div style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '14px' }}>Add a local union to manage wage packages.</div>
              <button onClick={() => setShowNew(true)} style={btnPrimary}>Add Local Union</button>
            </div>
          )}
          {unions.map((u) => {
            const isSelected = selectedId === u.id && !showNew
            return (
              <button key={u.id} onClick={() => { setSelectedId(u.id); setActiveTab('info'); setShowNew(false) }}
                style={{ width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: '7px', border: 'none', cursor: 'pointer', marginBottom: '2px', background: isSelected ? '#EFF6FF' : 'transparent', color: isSelected ? '#1E3A8A' : '#0F172A' }}>
                <div style={{ fontWeight: 600, fontSize: '13px' }}>Local {u.local_number}</div>
                {u.charter_city && <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>{u.charter_city}</div>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Right detail */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {showNew && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '32px 36px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', margin: '0 0 20px' }}>New Local Union</h2>
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', maxWidth: '540px' }}>
              <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Local Number *</label><input style={inputStyle} value={newForm.local_number} onChange={(e) => setNewForm((f) => ({ ...f, local_number: e.target.value }))} placeholder="e.g. 26" autoFocus /></div>
              <div><label style={labelStyle}>Charter City</label><input style={inputStyle} value={newForm.charter_city} onChange={(e) => setNewForm((f) => ({ ...f, charter_city: e.target.value }))} /></div>
              <div><label style={labelStyle}>Business Manager</label><input style={inputStyle} value={newForm.business_manager} onChange={(e) => setNewForm((f) => ({ ...f, business_manager: e.target.value }))} /></div>
              <div><label style={labelStyle}>Phone</label><input style={inputStyle} value={newForm.phone} onChange={(e) => setNewForm((f) => ({ ...f, phone: e.target.value }))} /></div>
              <div><label style={labelStyle}>Email</label><input style={inputStyle} type="email" value={newForm.email} onChange={(e) => setNewForm((f) => ({ ...f, email: e.target.value }))} /></div>
            </div>
            {createError && <div style={{ ...errorBox, maxWidth: '540px', marginTop: '10px' }}>{createError}</div>}
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button onClick={handleCreate} disabled={creating} style={{ ...btnPrimary, opacity: creating ? 0.7 : 1 }}>{creating ? 'Creating…' : 'Save'}</button>
              <button onClick={() => { setShowNew(false); setCreateError('') }} style={btnSecondary}>Cancel</button>
            </div>
          </div>
        )}

        {!showNew && selected && orgId && (
          <>
            <div style={{ borderBottom: '1px solid #E2E8F0', background: '#fff', padding: '0 36px', display: 'flex', flexShrink: 0 }}>
              {TABS.map((tab) => {
                const isActive = activeTab === tab.id
                return (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: '14px 16px', fontSize: '13px', fontWeight: isActive ? 600 : 400, color: isActive ? '#1E3A8A' : '#6b7280', background: 'none', border: 'none', borderBottom: isActive ? '2px solid #1E3A8A' : '2px solid transparent', cursor: 'pointer', marginBottom: '-1px' }}>
                    {tab.label}
                  </button>
                )
              })}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '32px 36px' }}>
              {activeTab === 'info' && <InfoTab key={selected.id} union={selected} orgId={orgId} onDeleted={() => { setSelectedId(null); loadUnions() }} onUpdated={(u) => { setUnions((prev) => prev.map((x) => x.id === u.id ? u : x)) }} />}
              {activeTab === 'wage-packages' && <WagePackagesTab key={selected.id} localUnion={selected} orgId={orgId} />}
              {activeTab === 'analysis' && <AnalysisTab key={selected.id} localUnion={selected} orgId={orgId} />}
            </div>
          </>
        )}

        {!showNew && !selected && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 14px', display: 'block' }} aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#64748B', marginBottom: '4px' }}>No local unions yet</div>
              <div style={{ fontSize: '13px', color: '#94A3B8' }}>Click "+ Add" to create your first local union.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
