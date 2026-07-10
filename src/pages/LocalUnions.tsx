import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useUserSettings } from '../lib/useUserSettings'
import { useToast } from '../lib/toast'
import { describeError } from '../lib/errors'
import ConfirmDialog from '../lib/ConfirmDialog'
import { inputStyle, labelStyle, btnPrimary, btnSecondary, btnDanger, card, errorBox, formatDate, thStyle, tdStyle } from '../lib/ui'
import { US_STATES_50 } from '../lib/usStates'
import ImportLocalUnionsModal from './ImportLocalUnionsModal'
import type {
  LocalUnion,
  WagePackage,
  WageComponent,
  WageComponentCategory,
  WageComponentUnit,
  ID
} from '../lib/types'

const CATEGORIES: WageComponentCategory[] = ['wage', 'benefit', 'industry_fund']
const UNITS: WageComponentUnit[] = ['$/hr', '% of gross']

const CATEGORY_LABEL: Record<WageComponentCategory, string> = {
  wage: 'Wage', benefit: 'Fringe Benefit', industry_fund: 'Industry Fund'
}

const CATEGORY_COLORS: Record<WageComponentCategory, { bg: string; color: string }> = {
  wage:          { bg: '#EEF2FF', color: '#4F46E5' },
  benefit:       { bg: '#f0fdf4', color: '#059669' },
  industry_fund: { bg: '#fff7ed', color: '#ea580c' }
}

type UnionForm = { local_number: string; city: string; state: string }
const EMPTY_UNION: UnionForm = { local_number: '', city: '', state: '' }

type PackageForm = { effective_date: string; expiration_date: string }
const EMPTY_PACKAGE: PackageForm = { effective_date: '', expiration_date: '' }

type ComponentForm = {
  component_name: string
  category: WageComponentCategory
  amount: string
  unit: WageComponentUnit
  notes: string
}
const EMPTY_COMPONENT: ComponentForm = {
  component_name: '', category: 'wage', amount: '', unit: '$/hr', notes: ''
}

export default function LocalUnions(): React.JSX.Element {
  const { effectiveChapterId, applyChapterFilter, isAdmin, loading: chapterLoading } = useUserSettings()
  const toast = useToast()
  const [unions, setUnions] = useState<LocalUnion[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selectedId, setSelectedId] = useState<ID | null>(null)
  const [showImport, setShowImport] = useState(false)

  // Union create/edit
  const [showUnionForm, setShowUnionForm] = useState(false)
  const [editingUnion, setEditingUnion] = useState<LocalUnion | null>(null)
  const [unionForm, setUnionForm] = useState<UnionForm>(EMPTY_UNION)
  const [savingUnion, setSavingUnion] = useState(false)
  const [unionError, setUnionError] = useState('')

  const [confirmDeleteUnion, setConfirmDeleteUnion] = useState<LocalUnion | null>(null)
  const [deletingUnion, setDeletingUnion] = useState(false)

  // Packages for selected union
  const [packages, setPackages] = useState<WagePackage[]>([])
  const [packagesLoadedFor, setPackagesLoadedFor] = useState<ID | null>(null)
  const [selectedPackageId, setSelectedPackageId] = useState<ID | null>(null)

  const [showPackageForm, setShowPackageForm] = useState(false)
  const [editingPackage, setEditingPackage] = useState<WagePackage | null>(null)
  const [packageForm, setPackageForm] = useState<PackageForm>(EMPTY_PACKAGE)
  const [savingPackage, setSavingPackage] = useState(false)
  const [packageError, setPackageError] = useState('')

  const [confirmDeletePackage, setConfirmDeletePackage] = useState<WagePackage | null>(null)
  const [deletingPackage, setDeletingPackage] = useState(false)

  // Components for selected package
  const [components, setComponents] = useState<WageComponent[]>([])
  const [componentsLoadedFor, setComponentsLoadedFor] = useState<ID | null>(null)

  const [showComponentForm, setShowComponentForm] = useState(false)
  const [editingComponent, setEditingComponent] = useState<WageComponent | null>(null)
  const [componentForm, setComponentForm] = useState<ComponentForm>(EMPTY_COMPONENT)
  const [savingComponent, setSavingComponent] = useState(false)
  const [componentError, setComponentError] = useState('')

  const [confirmDeleteComponent, setConfirmDeleteComponent] = useState<WageComponent | null>(null)
  const [deletingComponent, setDeletingComponent] = useState(false)

  // Load unions (also called after an import to pick up new rows)
  async function loadUnions(): Promise<void> {
    const { data, error: err } = await applyChapterFilter(
      supabase.from('local_unions').select('*').order('local_number')
    ) as { data: unknown; error: unknown }
    if (err) {
      setLoadError(describeError(err, 'Could not load local unions.'))
    } else {
      setLoadError('')
      setUnions((data ?? []) as LocalUnion[])
    }
    setLoading(false)
  }

  useEffect(() => {
    // loadUnions only sets state after its awaited queries resolve, so this
    // cannot cascade synchronous renders — the rule can't see past the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadUnions()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveChapterId])

  // Load packages for selected union
  useEffect(() => {
    if (!selectedId) return
    const target = selectedId
    let cancelled = false
    void supabase
      .from('wage_packages')
      .select('*')
      .eq('local_union_id', target)
      .order('effective_date', { ascending: false, nullsFirst: false })
      .order('classification')
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          toast.error('Could not load wage packages: ' + describeError(err))
          setPackages([])
        } else {
          setPackages((data ?? []) as WagePackage[])
        }
        setPackagesLoadedFor(target)
      })
    return () => { cancelled = true }
  }, [selectedId, toast])

  // Load components for selected package
  useEffect(() => {
    if (!selectedPackageId) return
    const target = selectedPackageId
    let cancelled = false
    void supabase
      .from('wage_components')
      .select('*')
      .eq('wage_package_id', target)
      .order('sort_order')
      .order('created_at')
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          toast.error('Could not load components: ' + describeError(err))
          setComponents([])
        } else {
          setComponents((data ?? []) as WageComponent[])
        }
        setComponentsLoadedFor(target)
      })
    return () => { cancelled = true }
  }, [selectedPackageId, toast])

  const selectedUnion = unions.find((u) => u.id === selectedId) ?? null
  const selectedPackage = packages.find((p) => p.id === selectedPackageId) ?? null

  const packagesLoading = selectedId !== null && packagesLoadedFor !== selectedId
  const componentsLoading = selectedPackageId !== null && componentsLoadedFor !== selectedPackageId

  function selectUnion(id: ID): void {
    if (id !== selectedId) {
      setPackages([])
      setSelectedPackageId(null)
      setComponents([])
    }
    setSelectedId(id)
  }

  function selectPackage(id: ID): void {
    if (id !== selectedPackageId) setComponents([])
    setSelectedPackageId(id)
  }

  // ── Union CRUD ─────────────────────────────────────────────────────────────
  function startCreateUnion(): void {
    setEditingUnion(null)
    setUnionForm(EMPTY_UNION)
    setUnionError('')
    setShowUnionForm(true)
  }

  function startEditUnion(u: LocalUnion): void {
    setEditingUnion(u)
    setUnionForm({
      local_number: String(u.local_number),
      city: u.city ?? '',
      state: u.state ?? ''
    })
    setUnionError('')
    setShowUnionForm(true)
  }

  async function handleSaveUnion(): Promise<void> {
    setUnionError('')
    const trimmed = unionForm.local_number.trim()
    const num = parseInt(trimmed, 10)
    if (!trimmed || Number.isNaN(num) || num <= 0) {
      setUnionError('Local number must be a positive integer.')
      return
    }
    if (!editingUnion && !effectiveChapterId) {
      setUnionError('Select a specific chapter from the sidebar before adding a local union.')
      return
    }
    setSavingUnion(true)

    const payload = {
      local_number: num,
      city: unionForm.city.trim() || null,
      state: unionForm.state.trim() || null
    }

    if (editingUnion) {
      const { data, error: err } = await supabase
        .from('local_unions')
        .update(payload)
        .eq('id', editingUnion.id)
        .select()
        .single()
      setSavingUnion(false)
      if (err || !data) {
        const msg = describeError(err, 'Could not save local union.')
        setUnionError(msg); toast.error(msg)
        return
      }
      const updated = data as LocalUnion
      setUnions((prev) => prev.map((u) => u.id === updated.id ? updated : u).sort((a, b) => a.local_number - b.local_number))
      setShowUnionForm(false)
      toast.success('Local union updated.')
      return
    }

    const { data, error: err } = await supabase
      .from('local_unions')
      .insert({ ...payload, chapter_id: effectiveChapterId })
      .select()
      .single()
    setSavingUnion(false)
    if (err || !data) {
      const msg = describeError(err, 'Could not create local union.')
      setUnionError(msg); toast.error(msg)
      return
    }
    const created = data as LocalUnion
    setUnions((prev) => [...prev, created].sort((a, b) => a.local_number - b.local_number))
    setSelectedId(created.id)
    setShowUnionForm(false)
    toast.success('Local union created.')
  }

  async function handleDeleteUnion(): Promise<void> {
    if (!confirmDeleteUnion) return
    setDeletingUnion(true)
    const { error: err } = await supabase
      .from('local_unions')
      .delete()
      .eq('id', confirmDeleteUnion.id)
    setDeletingUnion(false)
    if (err) {
      toast.error('Could not delete: ' + describeError(err))
      return
    }
    setUnions((prev) => prev.filter((u) => u.id !== confirmDeleteUnion.id))
    if (selectedId === confirmDeleteUnion.id) {
      setSelectedId(null)
      setPackages([])
      setSelectedPackageId(null)
      setComponents([])
    }
    setConfirmDeleteUnion(null)
    toast.success('Local union deleted.')
  }

  // ── Package CRUD ───────────────────────────────────────────────────────────
  function startCreatePackage(): void {
    setEditingPackage(null)
    setPackageForm(EMPTY_PACKAGE)
    setPackageError('')
    setShowPackageForm(true)
  }

  function startEditPackage(p: WagePackage): void {
    setEditingPackage(p)
    setPackageForm({
      effective_date: p.effective_date ?? '',
      expiration_date: p.expiration_date ?? ''
    })
    setPackageError('')
    setShowPackageForm(true)
  }

  async function handleSavePackage(): Promise<void> {
    if (!selectedId) return
    setPackageError('')
    setSavingPackage(true)

    // Classification is no longer entered in the UI — new packages take the
    // database default ('Journeyman'); edits leave the stored value alone.
    const payload = {
      effective_date: packageForm.effective_date || null,
      expiration_date: packageForm.expiration_date || null
    }

    if (editingPackage) {
      const { data, error: err } = await supabase
        .from('wage_packages')
        .update(payload)
        .eq('id', editingPackage.id)
        .select()
        .single()
      setSavingPackage(false)
      if (err || !data) {
        const msg = describeError(err, 'Could not save package.')
        setPackageError(msg); toast.error(msg)
        return
      }
      const updated = data as WagePackage
      setPackages((prev) => prev.map((p) => p.id === updated.id ? updated : p))
      setShowPackageForm(false)
      toast.success('Wage package updated.')
      return
    }

    const { data, error: err } = await supabase
      .from('wage_packages')
      .insert({ ...payload, local_union_id: selectedId })
      .select()
      .single()
    setSavingPackage(false)
    if (err || !data) {
      const msg = describeError(err, 'Could not create package.')
      setPackageError(msg); toast.error(msg)
      return
    }
    const created = data as WagePackage
    setPackages((prev) => [created, ...prev])
    setSelectedPackageId(created.id)
    setShowPackageForm(false)
    toast.success('Wage package created.')
  }

  async function handleDeletePackage(): Promise<void> {
    if (!confirmDeletePackage) return
    setDeletingPackage(true)
    const { error: err } = await supabase
      .from('wage_packages')
      .delete()
      .eq('id', confirmDeletePackage.id)
    setDeletingPackage(false)
    if (err) {
      toast.error('Could not delete package: ' + describeError(err))
      return
    }
    setPackages((prev) => prev.filter((p) => p.id !== confirmDeletePackage.id))
    if (selectedPackageId === confirmDeletePackage.id) {
      setSelectedPackageId(null)
      setComponents([])
    }
    setConfirmDeletePackage(null)
    toast.success('Wage package deleted.')
  }

  // ── Component CRUD ─────────────────────────────────────────────────────────
  function startCreateComponent(): void {
    setEditingComponent(null)
    setComponentForm(EMPTY_COMPONENT)
    setComponentError('')
    setShowComponentForm(true)
  }

  function startEditComponent(c: WageComponent): void {
    setEditingComponent(c)
    setComponentForm({
      component_name: c.component_name,
      category: c.category,
      amount: String(c.amount),
      unit: c.unit,
      notes: c.notes ?? ''
    })
    setComponentError('')
    setShowComponentForm(true)
  }

  async function handleSaveComponent(): Promise<void> {
    if (!selectedPackageId) return
    setComponentError('')
    const name = componentForm.component_name.trim()
    if (!name) { setComponentError('Name is required.'); return }
    const amt = Number(componentForm.amount)
    if (componentForm.amount.trim() === '' || Number.isNaN(amt)) {
      setComponentError('Amount must be a number.')
      return
    }
    setSavingComponent(true)

    const payload = {
      component_name: name,
      category: componentForm.category,
      amount: amt,
      unit: componentForm.unit,
      notes: componentForm.notes.trim() || null
    }

    if (editingComponent) {
      const { data, error: err } = await supabase
        .from('wage_components')
        .update(payload)
        .eq('id', editingComponent.id)
        .select()
        .single()
      setSavingComponent(false)
      if (err || !data) {
        const msg = describeError(err, 'Could not save component.')
        setComponentError(msg); toast.error(msg)
        return
      }
      const updated = data as WageComponent
      setComponents((prev) => prev.map((c) => c.id === updated.id ? updated : c))
      setShowComponentForm(false)
      toast.success('Component updated.')
      return
    }

    const { data, error: err } = await supabase
      .from('wage_components')
      .insert({ ...payload, wage_package_id: selectedPackageId, sort_order: components.length })
      .select()
      .single()
    setSavingComponent(false)
    if (err || !data) {
      const msg = describeError(err, 'Could not add component.')
      setComponentError(msg); toast.error(msg)
      return
    }
    const created = data as WageComponent
    setComponents((prev) => [...prev, created])
    setShowComponentForm(false)
    toast.success('Component added.')
  }

  async function handleDeleteComponent(): Promise<void> {
    if (!confirmDeleteComponent) return
    setDeletingComponent(true)
    const { error: err } = await supabase
      .from('wage_components')
      .delete()
      .eq('id', confirmDeleteComponent.id)
    setDeletingComponent(false)
    if (err) {
      toast.error('Could not delete component: ' + describeError(err))
      return
    }
    setComponents((prev) => prev.filter((c) => c.id !== confirmDeleteComponent.id))
    setConfirmDeleteComponent(null)
    toast.success('Component removed.')
  }

  // ── Derived totals ─────────────────────────────────────────────────────────
  const componentTotals = useMemo(() => {
    let wage = 0, benefit = 0, industryFund = 0
    components.forEach((c) => {
      // Only sum $/hr items for the headline total; mixing units would be misleading.
      if (c.unit !== '$/hr') return
      const v = Number(c.amount ?? 0)
      if (c.category === 'wage') wage += v
      else if (c.category === 'benefit') benefit += v
      else if (c.category === 'industry_fund') industryFund += v
    })
    return { wage, benefit, industryFund, gross: wage + benefit + industryFund }
  }, [components])

  if (chapterLoading || loading) {
    return <div style={{ padding: '32px', fontSize: '13px', color: '#64748B' }}>Loading…</div>
  }

  return (
    <div className="split-panel">
      {/* Left: union list */}
      <div className="split-panel-list" style={{ width: '260px' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>Local Unions</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            {isAdmin && (
              <button
                style={{ ...btnSecondary, fontSize: '12px', padding: '5px 10px', opacity: effectiveChapterId ? 1 : 0.5 }}
                disabled={!effectiveChapterId}
                title={effectiveChapterId ? 'Import local unions and wage data from Excel' : 'Select a specific chapter from the sidebar first'}
                onClick={() => setShowImport(true)}
              >
                Import
              </button>
            )}
            <button style={{ ...btnPrimary, fontSize: '12px', padding: '5px 12px' }} onClick={startCreateUnion}>+ Add</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadError && <div style={{ ...errorBox, margin: '12px 16px' }}>{loadError}</div>}
          {unions.length === 0 ? (
            <div style={{ padding: '24px 20px', color: '#94A3B8', fontSize: '13px', textAlign: 'center' }}>No local unions yet.</div>
          ) : unions.map((u) => {
            const isSelected = u.id === selectedId
            return (
              <button
                key={u.id}
                onClick={() => selectUnion(u.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '12px 20px', borderBottom: '1px solid #F1F5F9',
                  background: isSelected ? '#EEF2FF' : 'none',
                  border: 'none', borderLeft: isSelected ? '3px solid #1E3A8A' : '3px solid transparent',
                  cursor: 'pointer'
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>Local {u.local_number}</div>
                {(u.city || u.state) && (
                  <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
                    {[u.city, u.state].filter(Boolean).join(', ')}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Right: detail */}
      <div className="split-panel-detail" style={{ padding: '28px 32px' }}>
        {showUnionForm ? (
          <div style={{ ...card, maxWidth: '600px', borderColor: '#1E3A8A', borderWidth: '1.5px' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '20px' }}>
              {editingUnion ? `Edit Local ${editingUnion.local_number}` : 'New Local Union'}
            </div>
            <div className="grid-form-1-1-1" style={{ marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>Local Number <span style={{ color: '#ef4444' }}>*</span></label>
                <input
                  type="text"
                  inputMode="numeric"
                  style={inputStyle}
                  value={unionForm.local_number}
                  autoFocus
                  onChange={(e) => setUnionForm({ ...unionForm, local_number: e.target.value.replace(/\D/g, '') })}
                  placeholder="e.g. 11"
                />
              </div>
              <div>
                <label style={labelStyle}>City</label>
                <input style={inputStyle} value={unionForm.city} onChange={(e) => setUnionForm({ ...unionForm, city: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>State</label>
                <select style={inputStyle} value={unionForm.state} onChange={(e) => setUnionForm({ ...unionForm, state: e.target.value })}>
                  <option value="">— Select —</option>
                  {US_STATES_50.map((s) => <option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}
                </select>
              </div>
            </div>
            {unionError && <div style={errorBox}>{unionError}</div>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={{ ...btnPrimary, opacity: savingUnion ? 0.5 : 1 }} disabled={savingUnion} onClick={handleSaveUnion}>
                {savingUnion ? 'Saving…' : 'Save'}
              </button>
              <button style={btnSecondary} disabled={savingUnion} onClick={() => setShowUnionForm(false)}>Cancel</button>
            </div>
          </div>
        ) : selectedUnion ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                  Local {selectedUnion.local_number}
                </h2>
                {(selectedUnion.city || selectedUnion.state) && (
                  <p style={{ fontSize: '13px', color: '#64748B', margin: '6px 0 0' }}>{[selectedUnion.city, selectedUnion.state].filter(Boolean).join(', ')}</p>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button style={btnSecondary} onClick={() => startEditUnion(selectedUnion)}>Edit</button>
                <button style={btnDanger} onClick={() => setConfirmDeleteUnion(selectedUnion)}>Delete</button>
              </div>
            </div>

            {/* Packages list */}
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                  Wage Packages {packagesLoading ? '' : `(${packages.length})`}
                </span>
                {!showPackageForm && (
                  <button style={{ ...btnPrimary, fontSize: '12px', padding: '5px 12px' }} onClick={startCreatePackage}>+ Add Package</button>
                )}
              </div>

              {showPackageForm && (
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px', marginBottom: '14px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', marginBottom: '12px' }}>
                    {editingPackage ? 'Edit Wage Package' : 'New Wage Package'}
                  </div>
                  <div className="grid-2col" style={{ marginBottom: '10px' }}>
                    <div>
                      <label style={labelStyle}>Effective</label>
                      <input type="date" style={inputStyle} value={packageForm.effective_date} autoFocus onChange={(e) => setPackageForm({ ...packageForm, effective_date: e.target.value })} />
                    </div>
                    <div>
                      <label style={labelStyle}>Expires</label>
                      <input type="date" style={inputStyle} value={packageForm.expiration_date} onChange={(e) => setPackageForm({ ...packageForm, expiration_date: e.target.value })} />
                    </div>
                  </div>
                  {packageError && <div style={errorBox}>{packageError}</div>}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button style={{ ...btnPrimary, fontSize: '12px', padding: '5px 12px', opacity: savingPackage ? 0.5 : 1 }} disabled={savingPackage} onClick={handleSavePackage}>
                      {savingPackage ? 'Saving…' : 'Save'}
                    </button>
                    <button style={{ ...btnSecondary, fontSize: '12px', padding: '5px 12px' }} disabled={savingPackage} onClick={() => setShowPackageForm(false)}>Cancel</button>
                  </div>
                </div>
              )}

              {packagesLoading ? (
                <div style={{ fontSize: '13px', color: '#64748B', padding: '12px 0' }}>Loading packages…</div>
              ) : packages.length === 0 ? (
                <div style={{ fontSize: '13px', color: '#94A3B8', padding: '12px 0' }}>No wage packages yet for this local.</div>
              ) : packages.map((p) => {
                const isSelected = p.id === selectedPackageId
                return (
                  <div
                    key={p.id}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '8px',
                      border: '1px solid',
                      borderColor: isSelected ? '#1E3A8A' : '#F1F5F9',
                      background: isSelected ? '#F8FAFC' : '#fff',
                      marginBottom: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px'
                    }}
                    onClick={() => selectPackage(p.id)}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>{p.classification}</div>
                      <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
                        {p.effective_date ? `Effective ${formatDate(p.effective_date)}` : 'No effective date'}
                        {p.expiration_date ? ` → ${formatDate(p.expiration_date)}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                      <button style={{ ...btnSecondary, fontSize: '12px', padding: '4px 10px' }} onClick={() => startEditPackage(p)}>Edit</button>
                      <button style={{ ...btnDanger, fontSize: '12px', padding: '4px 10px' }} onClick={() => setConfirmDeletePackage(p)}>Delete</button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Components for selected package */}
            {selectedPackage && (
              <div style={{ ...card, marginTop: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', gap: '12px', flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                      {selectedPackage.classification} Wage Package
                    </span>
                    {componentsLoading ? null : (
                      <span style={{ fontSize: '12px', color: '#64748B', marginLeft: '8px' }}>
                        ({components.length})
                      </span>
                    )}
                  </div>
                  {!showComponentForm && (
                    <button style={{ ...btnPrimary, fontSize: '12px', padding: '5px 12px' }} onClick={startCreateComponent}>+ Add Component</button>
                  )}
                </div>

                {showComponentForm && (
                  <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px', marginBottom: '14px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', marginBottom: '12px' }}>
                      {editingComponent ? `Edit ${editingComponent.component_name}` : 'New Component'}
                    </div>
                    <div className="grid-form-1-1-1" style={{ marginBottom: '10px' }}>
                      <div>
                        <label style={labelStyle}>Name <span style={{ color: '#ef4444' }}>*</span></label>
                        <input style={inputStyle} value={componentForm.component_name} autoFocus onChange={(e) => setComponentForm({ ...componentForm, component_name: e.target.value })} placeholder="e.g. Base Wage" />
                      </div>
                      <div>
                        <label style={labelStyle}>Category</label>
                        <select style={inputStyle} value={componentForm.category} onChange={(e) => setComponentForm({ ...componentForm, category: e.target.value as WageComponentCategory })}>
                          {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Unit</label>
                        <select style={inputStyle} value={componentForm.unit} onChange={(e) => setComponentForm({ ...componentForm, unit: e.target.value as WageComponentUnit })}>
                          {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="grid-2col" style={{ marginBottom: '10px' }}>
                      <div>
                        <label style={labelStyle}>Amount <span style={{ color: '#ef4444' }}>*</span></label>
                        <input type="number" step="0.0001" style={inputStyle} value={componentForm.amount} onChange={(e) => setComponentForm({ ...componentForm, amount: e.target.value })} />
                      </div>
                      <div>
                        <label style={labelStyle}>Notes</label>
                        <input style={inputStyle} value={componentForm.notes} onChange={(e) => setComponentForm({ ...componentForm, notes: e.target.value })} />
                      </div>
                    </div>
                    {componentError && <div style={errorBox}>{componentError}</div>}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button style={{ ...btnPrimary, fontSize: '12px', padding: '5px 12px', opacity: savingComponent ? 0.5 : 1 }} disabled={savingComponent} onClick={handleSaveComponent}>
                        {savingComponent ? 'Saving…' : 'Save'}
                      </button>
                      <button style={{ ...btnSecondary, fontSize: '12px', padding: '5px 12px' }} disabled={savingComponent} onClick={() => setShowComponentForm(false)}>Cancel</button>
                    </div>
                  </div>
                )}

                {componentsLoading ? (
                  <div style={{ fontSize: '13px', color: '#64748B', padding: '12px 0' }}>Loading components…</div>
                ) : components.length === 0 ? (
                  <div style={{ fontSize: '13px', color: '#94A3B8', padding: '12px 0' }}>No components in this package yet.</div>
                ) : (
                  <>
                    <div className="table-scroll">
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
                      <thead>
                        <tr>
                          <th style={thStyle} scope="col">Name</th>
                          <th style={thStyle} scope="col">Category</th>
                          <th style={{ ...thStyle, textAlign: 'right' }} scope="col">Amount</th>
                          <th style={thStyle} scope="col">Unit</th>
                          <th style={{ ...thStyle, width: '160px' }} scope="col"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {components.map((c) => {
                          const cc = CATEGORY_COLORS[c.category]
                          return (
                            <tr key={c.id}>
                              <td style={tdStyle}>{c.component_name}</td>
                              <td style={tdStyle}>
                                <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', background: cc.bg, color: cc.color }}>{CATEGORY_LABEL[c.category]}</span>
                              </td>
                              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>
                                {Number(c.amount).toFixed(4)}
                              </td>
                              <td style={tdStyle}>{c.unit}</td>
                              <td style={{ ...tdStyle, textAlign: 'right' }}>
                                <button style={{ ...btnSecondary, fontSize: '12px', padding: '4px 10px', marginRight: '6px' }} onClick={() => startEditComponent(c)}>Edit</button>
                                <button style={{ ...btnDanger, fontSize: '12px', padding: '4px 10px' }} onClick={() => setConfirmDeleteComponent(c)}>Delete</button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    </div>

                    {/* Totals — only meaningful for $/hr items */}
                    <div className="grid-stats" style={{ marginTop: '14px', padding: '12px 14px', background: '#F8FAFC', borderRadius: '8px' }}>
                      <Total label="Wages ($/hr)" value={componentTotals.wage} />
                      <Total label="Fringe Benefits ($/hr)" value={componentTotals.benefit} />
                      <Total label="Industry Funds ($/hr)" value={componentTotals.industryFund} />
                      <Total label="Total Package ($/hr)" value={componentTotals.gross} bold />
                    </div>
                    <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '8px' }}>
                      Totals sum only $/hr components. % of gross lines are listed but not totaled.
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '80px 24px', color: '#94A3B8', fontSize: '13px' }}>
            Select a local union on the left, or{' '}
            <button onClick={startCreateUnion} style={{ background: 'none', border: 'none', color: '#1E3A8A', cursor: 'pointer', padding: 0, fontSize: '13px', fontWeight: 600 }}>add one</button>.
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDeleteUnion !== null}
        title="Delete local union?"
        message={confirmDeleteUnion ? `Delete Local ${confirmDeleteUnion.local_number}? All of its wage packages and components will be deleted, along with any negotiations linked to this local (including their sessions, proposals, and documents). Grievances will remain but lose their link to this local. This cannot be undone.` : ''}
        confirmLabel="Delete"
        busy={deletingUnion}
        onConfirm={handleDeleteUnion}
        onCancel={() => setConfirmDeleteUnion(null)}
      />

      <ConfirmDialog
        open={confirmDeletePackage !== null}
        title="Delete wage package?"
        message={confirmDeletePackage ? `Delete the ${confirmDeletePackage.classification} package? All its components will be removed. This cannot be undone.` : ''}
        confirmLabel="Delete"
        busy={deletingPackage}
        onConfirm={handleDeletePackage}
        onCancel={() => setConfirmDeletePackage(null)}
      />

      <ConfirmDialog
        open={confirmDeleteComponent !== null}
        title="Delete component?"
        message={confirmDeleteComponent ? `Delete ${confirmDeleteComponent.component_name}? This cannot be undone.` : ''}
        confirmLabel="Delete"
        busy={deletingComponent}
        onConfirm={handleDeleteComponent}
        onCancel={() => setConfirmDeleteComponent(null)}
      />

      {showImport && effectiveChapterId && (
        <ImportLocalUnionsModal
          chapterId={effectiveChapterId}
          existingUnions={unions}
          onClose={() => setShowImport(false)}
          onImported={() => {
            // Refresh the list; the modal closes itself on success and stays
            // open (showing the error) after a partial failure.
            setSelectedId(null)
            setPackages([])
            setSelectedPackageId(null)
            setComponents([])
            void loadUnions()
          }}
        />
      )}
    </div>
  )
}

function Total({ label, value, bold }: { label: string; value: number; bold?: boolean }): React.JSX.Element {
  return (
    <div>
      <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: bold ? '16px' : '14px', fontWeight: bold ? 700 : 600, color: '#0F172A' }}>${value.toFixed(4)}</div>
    </div>
  )
}
