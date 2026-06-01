import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useUserSettings } from '../lib/useUserSettings'
import { useToast } from '../lib/toast'
import { describeError } from '../lib/errors'
import ConfirmDialog from '../lib/ConfirmDialog'
import {
  STORAGE_BUCKETS,
  buildStoragePath,
  createSignedDownloadUrl,
  formatBytes,
  validateUpload
} from '../lib/storage'
import { inputStyle, labelStyle, btnPrimary, btnSecondary, btnDanger, card, errorBox, formatDate } from '../lib/ui'
import type { Grievance, GrievanceDocument, GrievanceStage, MemberCompany, LocalUnion, ID } from '../lib/types'

const STAGES: GrievanceStage[] = ['Filed', 'LMC', 'CIR', 'Arbitration', 'Closed', 'Withdrawn']

const STAGE_COLORS: Record<GrievanceStage, { bg: string; color: string; border: string }> = {
  Filed:       { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  LMC:         { bg: '#fff7ed', color: '#ea580c', border: '#fed7aa' },
  CIR:         { bg: '#fefce8', color: '#ca8a04', border: '#fef08a' },
  Arbitration: { bg: '#fefce8', color: '#a16207', border: '#fde68a' },
  Closed:      { bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' },
  Withdrawn:   { bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' }
}

const ACTIVE_STAGES: GrievanceStage[] = ['Filed', 'LMC', 'CIR', 'Arbitration']
const TERMINAL_STAGES: GrievanceStage[] = ['Closed', 'Withdrawn']

type GrievanceForm = {
  title: string
  grievance_number: string
  employer_id: string
  local_union_id: string
  filed_date: string
  stage: GrievanceStage
  description: string
  resolution: string
  resolved_date: string
}

const TODAY_ISO = new Date().toISOString().slice(0, 10)

const EMPTY_FORM: GrievanceForm = {
  title: '',
  grievance_number: '',
  employer_id: '',
  local_union_id: '',
  filed_date: TODAY_ISO,
  stage: 'Filed',
  description: '',
  resolution: '',
  resolved_date: ''
}

function formFromGrievance(g: Grievance): GrievanceForm {
  return {
    title: g.title,
    grievance_number: g.grievance_number ?? '',
    employer_id: g.employer_id ?? '',
    local_union_id: g.local_union_id ?? '',
    filed_date: g.filed_date,
    stage: g.stage,
    description: g.description ?? '',
    resolution: g.resolution ?? '',
    resolved_date: g.resolved_date ?? ''
  }
}

export default function Grievances(): React.JSX.Element {
  const { effectiveChapterId, applyChapterFilter, loading: chapterLoading } = useUserSettings()
  const toast = useToast()
  const [grievances, setGrievances] = useState<Grievance[]>([])
  const [companies, setCompanies] = useState<MemberCompany[]>([])
  const [unions, setUnions] = useState<LocalUnion[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [selectedId, setSelectedId] = useState<ID | null>(null)
  const [mode, setMode] = useState<'view' | 'edit' | 'create'>('view')
  const [form, setForm] = useState<GrievanceForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [stageFilter, setStageFilter] = useState<'all' | 'active' | 'resolved' | GrievanceStage>('active')
  const [search, setSearch] = useState('')

  const [confirmDelete, setConfirmDelete] = useState<Grievance | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [confirmStageChange, setConfirmStageChange] = useState<{ grievance: Grievance; newStage: GrievanceStage } | null>(null)
  const [changingStage, setChangingStage] = useState(false)

  const [confirmLockToggle, setConfirmLockToggle] = useState<Grievance | null>(null)
  const [togglingLock, setTogglingLock] = useState(false)

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      applyChapterFilter(supabase.from('grievances').select('*').order('filed_date', { ascending: false })),
      applyChapterFilter(supabase.from('member_companies').select('*').order('company_name')),
      applyChapterFilter(supabase.from('local_unions').select('*').order('local_number'))
    ]).then(([gRes, cRes, uRes]: [{ data: unknown; error: unknown }, { data: unknown; error: unknown }, { data: unknown; error: unknown }]) => {
      if (cancelled) return
      if (gRes.error) {
        setLoadError(describeError(gRes.error, 'Could not load grievances.'))
      } else {
        setGrievances((gRes.data ?? []) as Grievance[])
      }
      if (cRes.error) toast.error('Could not load companies: ' + describeError(cRes.error))
      else setCompanies((cRes.data ?? []) as MemberCompany[])
      if (uRes.error) toast.error('Could not load local unions: ' + describeError(uRes.error))
      else setUnions((uRes.data ?? []) as LocalUnion[])
      setLoading(false)
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveChapterId])

  const selected = grievances.find((g) => g.id === selectedId) ?? null

  function companyName(id: ID | null): string {
    if (!id) return '—'
    return companies.find((c) => c.id === id)?.company_name ?? '(unknown)'
  }

  function unionLabel(id: ID | null): string {
    if (!id) return '—'
    const u = unions.find((x) => x.id === id)
    return u ? `Local ${u.local_number}` : '(unknown)'
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return grievances.filter((g) => {
      // stage filter
      if (stageFilter === 'active' && !ACTIVE_STAGES.includes(g.stage)) return false
      if (stageFilter === 'resolved' && !TERMINAL_STAGES.includes(g.stage)) return false
      if (STAGES.includes(stageFilter as GrievanceStage) && g.stage !== stageFilter) return false
      // search
      if (term) {
        const hay = [g.title, g.grievance_number, g.employer_name, companyName(g.employer_id)].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(term)) return false
      }
      return true
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grievances, stageFilter, search, companies])

  function startCreate(): void {
    setMode('create')
    setSelectedId(null)
    setForm({ ...EMPTY_FORM, filed_date: TODAY_ISO })
    setSaveError('')
  }

  function startEdit(): void {
    if (!selected) return
    setForm(formFromGrievance(selected))
    setMode('edit')
    setSaveError('')
  }

  function selectGrievance(id: ID): void {
    setSelectedId(id)
    setMode('view')
    setSaveError('')
  }

  async function handleSave(): Promise<void> {
    setSaveError('')
    if (mode === 'create' && !effectiveChapterId) {
      setSaveError('Select a specific chapter from the sidebar before filing a grievance.')
      return
    }
    const title = form.title.trim()
    if (!title) { setSaveError('Title is required.'); return }
    if (!form.filed_date) { setSaveError('Filed date is required.'); return }

    setSaving(true)
    const employer = form.employer_id ? companies.find((c) => c.id === form.employer_id) : null
    const payload = {
      title,
      grievance_number: form.grievance_number.trim() || null,
      employer_id: form.employer_id || null,
      // mirror the employer's name onto the grievance so the row remains
      // readable even if the company is later deleted.
      employer_name: employer?.company_name ?? null,
      local_union_id: form.local_union_id || null,
      filed_date: form.filed_date,
      stage: form.stage,
      description: form.description.trim() || null,
      resolution: form.resolution.trim() || null,
      resolved_date: form.resolved_date || null
    }

    if (mode === 'create') {
      const { data, error: err } = await supabase
        .from('grievances')
        .insert({ ...payload, chapter_id: effectiveChapterId })
        .select()
        .single()
      setSaving(false)
      if (err || !data) {
        const msg = describeError(err, 'Could not create grievance.')
        setSaveError(msg); toast.error(msg)
        return
      }
      const created = data as Grievance
      setGrievances((prev) => [created, ...prev])
      setSelectedId(created.id)
      setMode('view')
      toast.success('Grievance filed.')
      return
    }

    if (!selected) { setSaving(false); return }
    const { data, error: err } = await supabase
      .from('grievances')
      .update(payload)
      .eq('id', selected.id)
      .select()
      .single()
    setSaving(false)
    if (err || !data) {
      const msg = describeError(err, 'Could not save changes.')
      setSaveError(msg); toast.error(msg)
      return
    }
    const updated = data as Grievance
    setGrievances((prev) => prev.map((g) => g.id === updated.id ? updated : g))
    setMode('view')
    toast.success('Grievance updated.')
  }

  async function handleDelete(): Promise<void> {
    if (!confirmDelete) return
    setDeleting(true)
    const { error: err } = await supabase
      .from('grievances')
      .delete()
      .eq('id', confirmDelete.id)
    setDeleting(false)
    if (err) {
      toast.error('Could not delete: ' + describeError(err))
      return
    }
    setGrievances((prev) => prev.filter((g) => g.id !== confirmDelete.id))
    if (selectedId === confirmDelete.id) setSelectedId(null)
    setConfirmDelete(null)
    toast.success('Grievance deleted.')
  }

  async function handleStageChange(): Promise<void> {
    if (!confirmStageChange) return
    setChangingStage(true)
    const { grievance, newStage } = confirmStageChange
    const updates: Partial<Grievance> = { stage: newStage }
    if (TERMINAL_STAGES.includes(newStage) && !grievance.resolved_date) {
      updates.resolved_date = TODAY_ISO
    }
    if (ACTIVE_STAGES.includes(newStage) && grievance.resolved_date) {
      updates.resolved_date = null
    }
    const { data, error: err } = await supabase
      .from('grievances')
      .update(updates)
      .eq('id', grievance.id)
      .select()
      .single()
    setChangingStage(false)
    if (err || !data) {
      toast.error('Could not update stage: ' + describeError(err))
      return
    }
    const updated = data as Grievance
    setGrievances((prev) => prev.map((g) => g.id === updated.id ? updated : g))
    setConfirmStageChange(null)
    toast.success(`Stage changed to ${newStage}.`)
  }

  async function handleLockToggle(): Promise<void> {
    if (!confirmLockToggle) return
    setTogglingLock(true)
    const target = !confirmLockToggle.is_locked
    const { data, error: err } = await supabase
      .from('grievances')
      .update({ is_locked: target })
      .eq('id', confirmLockToggle.id)
      .select()
      .single()
    setTogglingLock(false)
    if (err || !data) {
      toast.error('Could not change lock: ' + describeError(err))
      return
    }
    const updated = data as Grievance
    setGrievances((prev) => prev.map((g) => g.id === updated.id ? updated : g))
    setConfirmLockToggle(null)
    toast.success(target ? 'Grievance locked.' : 'Grievance unlocked.')
  }

  const counts = useMemoCounts(grievances)

  if (chapterLoading || loading) {
    return <div style={{ padding: '32px', fontSize: '13px', color: '#64748B' }}>Loading…</div>
  }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      {/* Left: list */}
      <div style={{ width: '380px', flexShrink: 0, borderRight: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', background: '#fff' }}>
        <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid #E2E8F0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>Grievances</span>
            <button style={{ ...btnPrimary, fontSize: '12px', padding: '5px 12px' }} onClick={startCreate}>+ File</button>
          </div>
          <input
            style={inputStyle}
            placeholder="Search by title, number, employer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search grievances"
          />
          <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
            {([
              { id: 'active' as const,    label: `Active (${counts.active})` },
              { id: 'resolved' as const,  label: `Resolved (${counts.resolved})` },
              { id: 'all' as const,       label: `All (${grievances.length})` }
            ]).map((f) => (
              <button
                key={f.id}
                onClick={() => setStageFilter(f.id)}
                style={{
                  padding: '4px 10px', fontSize: '11px', fontWeight: 500, borderRadius: '20px', cursor: 'pointer',
                  background: stageFilter === f.id ? '#1E3A8A' : '#F8FAFC',
                  color: stageFilter === f.id ? '#fff' : '#64748B',
                  border: stageFilter === f.id ? '1px solid #1E3A8A' : '1px solid #E2E8F0'
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadError && <div style={{ ...errorBox, margin: '12px 16px' }}>{loadError}</div>}
          {filtered.length === 0 ? (
            grievances.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 12px', display: 'block' }} aria-hidden="true">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>No grievances filed</div>
                <div style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.5, marginBottom: '16px' }}>
                  Use this tracker to log disputes, follow them through each step of the grievance procedure, and attach supporting documents.
                </div>
                <button style={{ ...btnPrimary, fontSize: '12px', padding: '6px 14px' }} onClick={startCreate}>+ File First Grievance</button>
              </div>
            ) : (
              <div style={{ padding: '24px 20px', color: '#94A3B8', fontSize: '13px', textAlign: 'center' }}>
                No grievances match your filters.
              </div>
            )
          ) : filtered.map((g) => {
            const sc = STAGE_COLORS[g.stage]
            const isSelected = g.id === selectedId
            return (
              <button
                key={g.id}
                onClick={() => selectGrievance(g.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '12px 20px', borderBottom: '1px solid #F1F5F9',
                  background: isSelected ? '#EEF2FF' : 'none',
                  border: 'none', borderLeft: isSelected ? '3px solid #1E3A8A' : '3px solid transparent',
                  cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {g.grievance_number ? `#${g.grievance_number} · ` : ''}{g.title}
                  </span>
                  <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '20px', flexShrink: 0, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>{g.stage}</span>
                </div>
                <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
                  {[companyName(g.employer_id) !== '—' ? companyName(g.employer_id) : null, formatDate(g.filed_date)].filter(Boolean).join(' · ')}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Right: detail / edit / create */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
        {mode === 'create' || (mode === 'edit' && selected) ? (
          <GrievanceForm
            heading={mode === 'create' ? 'New Grievance' : `Edit ${selected?.title ?? ''}`}
            form={form}
            setForm={setForm}
            companies={companies}
            unions={unions}
            saving={saving}
            saveError={saveError}
            onSave={handleSave}
            onCancel={() => { setMode('view'); setSaveError(''); if (!selected) setSelectedId(null) }}
          />
        ) : selected ? (
          <GrievanceDetail
            grievance={selected}
            companyName={companyName(selected.employer_id)}
            unionLabel={unionLabel(selected.local_union_id)}
            onEdit={startEdit}
            onDelete={() => setConfirmDelete(selected)}
            onStageChange={(s) => setConfirmStageChange({ grievance: selected, newStage: s })}
            onLockToggle={() => setConfirmLockToggle(selected)}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: '80px 24px' }}>
            {grievances.length === 0 ? (
              <>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 14px', display: 'block' }} aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>Track every grievance from filing to resolution</div>
                <div style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.6, maxWidth: '360px', margin: '0 auto 20px' }}>
                  Log the dispute, record the employer and local union, then advance it through each step — LMC, CIR, Arbitration — attaching documents along the way.
                </div>
                <button style={btnPrimary} onClick={startCreate}>File First Grievance</button>
              </>
            ) : (
              <div style={{ color: '#94A3B8', fontSize: '13px' }}>
                Select a grievance on the left, or{' '}
                <button onClick={startCreate} style={{ background: 'none', border: 'none', color: '#1E3A8A', cursor: 'pointer', padding: 0, fontSize: '13px', fontWeight: 600 }}>file a new one</button>.
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete grievance?"
        message={confirmDelete ? `Delete "${confirmDelete.title}"? This cannot be undone. Use Close or Withdraw instead if you want to keep the record.` : ''}
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      <ConfirmDialog
        open={confirmStageChange !== null}
        title={`Change stage to ${confirmStageChange?.newStage ?? ''}?`}
        message={
          confirmStageChange
            ? TERMINAL_STAGES.includes(confirmStageChange.newStage)
              ? `Marking this grievance ${confirmStageChange.newStage}. Today's date will be recorded as the resolved date if it isn't already set.`
              : `Moving this grievance to ${confirmStageChange.newStage}.`
            : ''
        }
        confirmLabel="Change stage"
        destructive={false}
        busy={changingStage}
        onConfirm={handleStageChange}
        onCancel={() => setConfirmStageChange(null)}
      />

      <ConfirmDialog
        open={confirmLockToggle !== null}
        title={confirmLockToggle?.is_locked ? 'Unlock grievance?' : 'Lock grievance?'}
        message={
          confirmLockToggle?.is_locked
            ? 'Unlocking allows further edits and stage changes.'
            : 'Locking prevents further edits and stage changes until unlocked. Use this once a grievance is finalised.'
        }
        confirmLabel={confirmLockToggle?.is_locked ? 'Unlock' : 'Lock'}
        destructive={false}
        busy={togglingLock}
        onConfirm={handleLockToggle}
        onCancel={() => setConfirmLockToggle(null)}
      />
    </div>
  )
}

function useMemoCounts(grievances: Grievance[]): { active: number; resolved: number } {
  return useMemo(() => {
    let active = 0, resolved = 0
    grievances.forEach((g) => {
      if (ACTIVE_STAGES.includes(g.stage)) active++
      else if (TERMINAL_STAGES.includes(g.stage)) resolved++
    })
    return { active, resolved }
  }, [grievances])
}

function GrievanceForm({ heading, form, setForm, companies, unions, saving, saveError, onSave, onCancel }: {
  heading: string
  form: GrievanceForm
  setForm: (f: GrievanceForm) => void
  companies: MemberCompany[]
  unions: LocalUnion[]
  saving: boolean
  saveError: string
  onSave: () => void
  onCancel: () => void
}): React.JSX.Element {
  function update<K extends keyof GrievanceForm>(key: K, value: GrievanceForm[K]): void {
    setForm({ ...form, [key]: value })
  }

  const isTerminal = TERMINAL_STAGES.includes(form.stage)

  return (
    <div style={{ ...card, maxWidth: '720px' }}>
      <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '20px' }}>{heading}</div>

      <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '12px', marginBottom: '14px' }}>
        <div>
          <label style={labelStyle}>Title <span style={{ color: '#ef4444' }}>*</span></label>
          <input style={inputStyle} value={form.title} autoFocus onChange={(e) => update('title', e.target.value)} placeholder="Brief summary of the dispute" />
        </div>
        <div>
          <label style={labelStyle}>Number</label>
          <input style={inputStyle} value={form.grievance_number} onChange={(e) => update('grievance_number', e.target.value)} placeholder="e.g. 2026-014" />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
        <div>
          <label style={labelStyle}>Employer</label>
          <select style={inputStyle} value={form.employer_id} onChange={(e) => update('employer_id', e.target.value)}>
            <option value="">— None —</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Local Union</label>
          <select style={inputStyle} value={form.local_union_id} onChange={(e) => update('local_union_id', e.target.value)}>
            <option value="">— None —</option>
            {unions.map((u) => <option key={u.id} value={u.id}>Local {u.local_number}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
        <div>
          <label style={labelStyle}>Filed Date <span style={{ color: '#ef4444' }}>*</span></label>
          <input type="date" style={inputStyle} value={form.filed_date} onChange={(e) => update('filed_date', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Stage</label>
          <select style={inputStyle} value={form.stage} onChange={(e) => update('stage', e.target.value as GrievanceStage)}>
            {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {isTerminal && (
          <div>
            <label style={labelStyle}>Resolved Date</label>
            <input type="date" style={inputStyle} value={form.resolved_date} onChange={(e) => update('resolved_date', e.target.value)} />
          </div>
        )}
      </div>

      <div style={{ marginBottom: '14px' }}>
        <label style={labelStyle}>Description</label>
        <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '80px' }} value={form.description} onChange={(e) => update('description', e.target.value)} placeholder="What happened, contract provisions cited, parties involved…" />
      </div>

      {isTerminal && (
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Resolution</label>
          <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }} value={form.resolution} onChange={(e) => update('resolution', e.target.value)} placeholder="How was it resolved?" />
        </div>
      )}

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

function GrievanceDetail({ grievance, companyName, unionLabel, onEdit, onDelete, onStageChange, onLockToggle }: {
  grievance: Grievance
  companyName: string
  unionLabel: string
  onEdit: () => void
  onDelete: () => void
  onStageChange: (s: GrievanceStage) => void
  onLockToggle: () => void
}): React.JSX.Element {
  const sc = STAGE_COLORS[grievance.stage]
  const locked = grievance.is_locked

  return (
    <div style={{ maxWidth: '760px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
            {grievance.grievance_number ? `#${grievance.grievance_number} · ` : ''}{grievance.title}
          </h2>
          <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>{grievance.stage}</span>
          {locked && (
            <span style={{ fontSize: '11px', color: '#94A3B8', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Locked
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button style={btnSecondary} onClick={onLockToggle}>{locked ? 'Unlock' : 'Lock'}</button>
          {!locked && <button style={btnSecondary} onClick={onEdit}>Edit</button>}
          {!locked && <button style={btnDanger} onClick={onDelete}>Delete</button>}
        </div>
      </div>

      {/* Stage progress */}
      <div style={{ ...card, marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '12px' }}>Stage</div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {STAGES.map((s) => {
            const isCurrent = s === grievance.stage
            const colors = STAGE_COLORS[s]
            return (
              <button
                key={s}
                disabled={locked || isCurrent}
                onClick={() => onStageChange(s)}
                style={{
                  padding: '5px 12px', fontSize: '12px', fontWeight: 500, borderRadius: '20px',
                  cursor: locked || isCurrent ? 'default' : 'pointer',
                  background: isCurrent ? colors.bg : '#fff',
                  color: isCurrent ? colors.color : '#64748B',
                  border: `1px solid ${isCurrent ? colors.border : '#E2E8F0'}`,
                  opacity: locked && !isCurrent ? 0.4 : 1
                }}
              >
                {s}
              </button>
            )
          })}
        </div>
      </div>

      <div style={card}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <Detail label="Employer" value={companyName !== '—' ? companyName : grievance.employer_name} />
          <Detail label="Local Union" value={unionLabel !== '—' ? unionLabel : null} />
          <Detail label="Filed" value={formatDate(grievance.filed_date)} />
          <Detail label="Resolved" value={grievance.resolved_date ? formatDate(grievance.resolved_date) : null} />
        </div>
        {grievance.description && (
          <>
            <div style={{ height: '1px', background: '#F1F5F9', margin: '16px 0' }} />
            <DetailLabel>Description</DetailLabel>
            <div style={{ fontSize: '13px', color: '#475569', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{grievance.description}</div>
          </>
        )}
        {grievance.resolution && (
          <>
            <div style={{ height: '1px', background: '#F1F5F9', margin: '16px 0' }} />
            <DetailLabel>Resolution</DetailLabel>
            <div style={{ fontSize: '13px', color: '#475569', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{grievance.resolution}</div>
          </>
        )}
      </div>

      <GrievanceAttachments grievanceId={grievance.id} locked={locked} />
    </div>
  )
}

// ── Grievance Attachments ────────────────────────────────────────────────────

function GrievanceAttachments({ grievanceId, locked }: { grievanceId: ID; locked: boolean }): React.JSX.Element {
  const toast = useToast()
  const [docs, setDocs] = useState<GrievanceDocument[]>([])
  const [docsLoadedFor, setDocsLoadedFor] = useState<ID | null>(null)

  const [showUpload, setShowUpload] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const [confirmDelete, setConfirmDelete] = useState<GrievanceDocument | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!grievanceId) return
    const target = grievanceId
    let cancelled = false
    void supabase
      .from('grievance_documents')
      .select('*')
      .eq('grievance_id', target)
      .order('uploaded_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          toast.error('Could not load attachments: ' + describeError(err))
          setDocs([])
        } else {
          setDocs((data ?? []) as GrievanceDocument[])
        }
        setDocsLoadedFor(target)
      })
    return () => { cancelled = true }
  }, [grievanceId, toast])

  const loading = docsLoadedFor !== grievanceId

  function pickFile(f: File | null): void {
    setUploadError('')
    setFile(f)
    if (f && !displayName.trim()) setDisplayName(f.name)
  }

  async function handleUpload(): Promise<void> {
    if (!file) return
    setUploadError('')
    const name = displayName.trim() || file.name
    if (!name) { setUploadError('Display name is required.'); return }

    const v = validateUpload(file, 'grievanceDocuments')
    if (v) { setUploadError(v.message); return }

    setUploading(true)
    const path = buildStoragePath(grievanceId, file.name)
    const { error: uploadErr } = await supabase.storage
      .from(STORAGE_BUCKETS.grievanceDocuments.name)
      .upload(path, file, { contentType: file.type || undefined, upsert: false })
    if (uploadErr) {
      setUploading(false)
      const msg = describeError(uploadErr, 'Upload failed.')
      setUploadError(msg)
      toast.error(msg)
      return
    }

    const { data, error: dbErr } = await supabase
      .from('grievance_documents')
      .insert({
        grievance_id: grievanceId,
        file_name: name,
        file_path: path,
        file_size: file.size,
        mime_type: file.type || null
      })
      .select()
      .single()
    if (dbErr || !data) {
      await supabase.storage.from(STORAGE_BUCKETS.grievanceDocuments.name).remove([path])
      setUploading(false)
      const msg = describeError(dbErr, 'Saved the file, but could not record it. Try again.')
      setUploadError(msg)
      toast.error(msg)
      return
    }

    setUploading(false)
    setDocs((prev) => [data as GrievanceDocument, ...prev])
    setFile(null)
    setDisplayName('')
    setShowUpload(false)
    toast.success('Attachment uploaded.')
  }

  async function handleDownload(doc: GrievanceDocument): Promise<void> {
    const { url, error } = await createSignedDownloadUrl('grievanceDocuments', doc.file_path)
    if (error || !url) {
      toast.error('Could not generate download link: ' + (error ?? 'unknown error'))
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function handleDelete(): Promise<void> {
    if (!confirmDelete) return
    setDeleting(true)
    const { error: dbErr } = await supabase
      .from('grievance_documents')
      .delete()
      .eq('id', confirmDelete.id)
    if (dbErr) {
      setDeleting(false)
      toast.error('Could not delete: ' + describeError(dbErr))
      return
    }
    const { error: storageErr } = await supabase.storage
      .from(STORAGE_BUCKETS.grievanceDocuments.name)
      .remove([confirmDelete.file_path])
    setDeleting(false)
    if (storageErr) {
      toast.error('Attachment removed, but the file could not be deleted from storage. ' + describeError(storageErr))
    } else {
      toast.success('Attachment deleted.')
    }
    setDocs((prev) => prev.filter((d) => d.id !== confirmDelete.id))
    setConfirmDelete(null)
  }

  return (
    <div style={{ ...card, marginTop: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', gap: '12px' }}>
        <div>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>Attachments</span>
          {!loading && (
            <span style={{ fontSize: '12px', color: '#64748B', marginLeft: '8px' }}>({docs.length})</span>
          )}
        </div>
        {!locked && !showUpload && (
          <button style={{ ...btnPrimary, fontSize: '12px', padding: '5px 12px' }} onClick={() => setShowUpload(true)}>+ Upload</button>
        )}
      </div>

      {showUpload && (
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px', marginBottom: '14px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', marginBottom: '12px' }}>Upload Attachment</div>
          <div style={{ marginBottom: '10px' }}>
            <label style={labelStyle}>File <span style={{ color: '#ef4444' }}>*</span></label>
            <input type="file" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} style={{ fontSize: '13px' }} aria-label="Choose grievance attachment to upload" />
            {file && (
              <div style={{ fontSize: '12px', color: '#64748B', marginTop: '6px' }}>
                {file.name} · {formatBytes(file.size)}{file.type ? ` · ${file.type}` : ''}
              </div>
            )}
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label style={labelStyle}>Display Name</label>
            <input style={inputStyle} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Defaults to the file name" />
          </div>
          {uploadError && <div style={errorBox}>{uploadError}</div>}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={{ ...btnPrimary, fontSize: '12px', padding: '5px 12px', opacity: !file || uploading ? 0.5 : 1 }} disabled={!file || uploading} onClick={handleUpload}>
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
            <button style={{ ...btnSecondary, fontSize: '12px', padding: '5px 12px' }} disabled={uploading} onClick={() => { setShowUpload(false); setFile(null); setDisplayName(''); setUploadError('') }}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: '13px', color: '#64748B', padding: '8px 0' }}>Loading attachments…</div>
      ) : docs.length === 0 ? (
        <div style={{ fontSize: '13px', color: '#94A3B8', padding: '8px 0' }}>No attachments yet.</div>
      ) : docs.map((d) => (
        <div key={d.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid #F1F5F9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <div style={{ minWidth: 0 }}>
              <button onClick={() => handleDownload(d)} style={{ background: 'none', border: 'none', padding: 0, color: '#1E3A8A', fontWeight: 600, fontSize: '13px', cursor: 'pointer', textAlign: 'left' }}>
                {d.file_name}
              </button>
              <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
                {formatBytes(d.file_size)} · uploaded {formatDate(d.uploaded_at.slice(0, 10))}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            <button style={{ ...btnSecondary, fontSize: '12px', padding: '4px 10px' }} onClick={() => handleDownload(d)}>Download</button>
            {!locked && <button style={{ ...btnDanger, fontSize: '12px', padding: '4px 10px' }} onClick={() => setConfirmDelete(d)}>Delete</button>}
          </div>
        </div>
      ))}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete attachment?"
        message={confirmDelete ? `Delete "${confirmDelete.file_name}"? This removes both the file and the record. This cannot be undone.` : ''}
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}

function DetailLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '4px' }}>{children}</div>
}

function Detail({ label, value }: { label: string; value: string | null }): React.JSX.Element {
  return (
    <div>
      <DetailLabel>{label}</DetailLabel>
      <div style={{ fontSize: '14px', color: value ? '#0F172A' : '#CBD5E1' }}>{value || '—'}</div>
    </div>
  )
}
