import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useUserSettings } from '../lib/useUserSettings'
import { useToast } from '../lib/toast'
import { describeError } from '../lib/errors'
import ConfirmDialog from '../lib/ConfirmDialog'
import { inputStyle, btnPrimary, btnSecondary, btnDanger, card, labelStyle, errorBox, formatDate } from '../lib/ui'
import ComparisonSheet from '../components/comparison/ComparisonSheet'
import type {
  ID,
  NegotiationCycle,
  NegotiationStatus,
  LocalUnion,
  NegotiationSession,
  SessionAttendee,
  AttendeeRole,
  Proposal,
  ProposalStatus,
  ProposalCategory,
  ProposedBy,
  ProposalPosition,
  PositionSide
} from '../lib/types'

type Tab = 'overview' | 'sessions' | 'proposals' | 'comparison'

const NEG_STATUSES: NegotiationStatus[] = ['Active', 'Settled', 'Archived']

const STATUS_COLORS: Record<NegotiationStatus, { bg: string; color: string; border: string }> = {
  Active:   { bg: '#f0fdf4', color: '#059669', border: '#bbf7d0' },
  Settled:  { bg: '#EEF2FF', color: '#4F46E5', border: '#C7D2FE' },
  Archived: { bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' }
}

const PROPOSAL_STATUSES: ProposalStatus[] = ['Open', 'TA', 'Withdrawn', 'Rejected']

const PROPOSAL_STATUS_COLORS: Record<ProposalStatus, { bg: string; color: string; border: string }> = {
  Open:      { bg: '#EEF2FF', color: '#4F46E5', border: '#C7D2FE' },
  TA:        { bg: '#f0fdf4', color: '#059669', border: '#bbf7d0' },
  Withdrawn: { bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' },
  Rejected:  { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' }
}

// ─── NegotiationDetail ────────────────────────────────────────────────────────

export default function NegotiationDetail({ negotiationId, onBack }: {
  negotiationId: ID
  onBack: () => void
}): React.JSX.Element {
  const { effectiveChapterId, applyChapterFilter } = useUserSettings()
  const toast = useToast()
  const [cycle, setCycle] = useState<NegotiationCycle | null>(null)
  const [unions, setUnions] = useState<LocalUnion[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  useEffect(() => {
    let cancelled = false

    void Promise.all([
      // The cycle is identified by its own UUID; RLS scopes it to the right
      // chapter automatically. Admins see across chapters.
      supabase.from('negotiation_cycles').select('*').eq('id', negotiationId).single(),
      applyChapterFilter(supabase.from('local_unions').select('*').order('local_number'))
    ]).then(([cycleRes, unionsRes]: [{ data: unknown; error: unknown }, { data: unknown; error: unknown }]) => {
      if (cancelled) return
      if (cycleRes.error) {
        setLoadError(describeError(cycleRes.error, 'Could not load negotiation.'))
      } else {
        setCycle(cycleRes.data as NegotiationCycle)
      }
      if (!unionsRes.error) setUnions((unionsRes.data ?? []) as LocalUnion[])
      setLoading(false)
    })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [negotiationId, effectiveChapterId])

  if (loading) return <div style={{ padding: '32px', fontSize: '13px', color: '#64748B' }}>Loading…</div>
  if (loadError || !cycle) return <div style={{ padding: '32px' }}><div style={errorBox}>{loadError || 'Negotiation not found.'}</div></div>

  const isLocked = cycle.status === 'Archived'
  const sc = STATUS_COLORS[cycle.status]

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview',    label: 'Overview' },
    { id: 'sessions',    label: 'Session Log' },
    { id: 'proposals',   label: 'Proposals' },
    { id: 'comparison',  label: 'Comparison Sheet' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '16px 32px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <button
            onClick={onBack}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: '13px', padding: 0 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
            Negotiations
          </button>
          <span style={{ color: '#CBD5E1', fontSize: '13px' }}>/</span>
          <span style={{ fontSize: '13px', color: '#0F172A', fontWeight: 600 }}>{cycle.name}</span>
          <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
            {cycle.status}
          </span>
          {isLocked && (
            <span style={{ fontSize: '11px', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Archived — read only
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0' }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: '10px 18px', fontSize: '13px',
                fontWeight: activeTab === t.id ? 600 : 400,
                color: activeTab === t.id ? '#1E3A8A' : '#64748B',
                background: 'none', border: 'none',
                borderBottom: activeTab === t.id ? '2px solid #1E3A8A' : '2px solid transparent',
                cursor: 'pointer', marginBottom: '-1px', transition: 'color 0.15s'
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', background: '#F8FAFC' }}>
        {activeTab === 'overview'   && <OverviewTab cycle={cycle} unions={unions} onUpdate={setCycle} toastError={toast.error} toastSuccess={toast.success} />}
        {activeTab === 'sessions'   && <SessionsTab cycleId={cycle.id} isLocked={isLocked} />}
        {activeTab === 'proposals'  && <ProposalsTab cycleId={cycle.id} isLocked={isLocked} />}
        {activeTab === 'comparison' && <ComparisonSheet cycle={cycle} union={unions.find((u) => u.id === cycle.local_union_id) ?? null} />}
      </div>
    </div>
  )
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ cycle, unions, onUpdate, toastError, toastSuccess }: {
  cycle: NegotiationCycle
  unions: LocalUnion[]
  onUpdate: (n: NegotiationCycle) => void
  toastError: (m: string) => void
  toastSuccess: (m: string) => void
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    name: cycle.name,
    local_union_id: cycle.local_union_id,
    classification: cycle.classification,
    cba_expiration_date: cycle.cba_expiration_date ?? '',
    proposed_effective_date: cycle.proposed_effective_date ?? '',
    status: cycle.status,
    notes: cycle.notes ?? ''
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  async function handleSave(): Promise<void> {
    setSaveError('')
    if (!form.name.trim()) { setSaveError('Name is required.'); return }
    setSaving(true)
    const { data, error } = await supabase
      .from('negotiation_cycles')
      .update({
        name: form.name.trim(),
        local_union_id: form.local_union_id,
        classification: form.classification.trim() || 'Journeyman',
        cba_expiration_date: form.cba_expiration_date || null,
        proposed_effective_date: form.proposed_effective_date || null,
        status: form.status,
        notes: form.notes.trim() || null
      })
      .eq('id', cycle.id)
      .select()
      .single()
    setSaving(false)
    if (error || !data) {
      const msg = describeError(error, 'Could not save.')
      setSaveError(msg)
      toastError(msg)
      return
    }
    onUpdate(data as NegotiationCycle)
    setEditing(false)
    toastSuccess('Negotiation updated.')
  }

  function unionLabel(id: ID): string {
    const u = unions.find((x) => x.id === id)
    if (!u) return '—'
    return `Local ${u.local_number}${u.city ? ` — ${u.city}` : ''}`
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: '680px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <span style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A' }}>{cycle.name}</span>
        {!editing && <button style={btnSecondary} onClick={() => setEditing(true)}>Edit</button>}
      </div>

      {editing ? (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Name <span style={{ color: '#ef4444' }}>*</span></label>
              <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Local Union</label>
              <select style={inputStyle} value={form.local_union_id} onChange={(e) => setForm({ ...form, local_union_id: e.target.value })}>
                {unions.map((u) => <option key={u.id} value={u.id}>Local {u.local_number}{u.city ? ` — ${u.city}` : ''}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Classification</label>
              <input style={inputStyle} value={form.classification} onChange={(e) => setForm({ ...form, classification: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>CBA Expiration</label>
              <input type="date" style={inputStyle} value={form.cba_expiration_date} onChange={(e) => setForm({ ...form, cba_expiration_date: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Proposed Effective Date</label>
              <input type="date" style={inputStyle} value={form.proposed_effective_date} onChange={(e) => setForm({ ...form, proposed_effective_date: e.target.value })} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Status</label>
              <select style={inputStyle} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as NegotiationStatus })}>
                {NEG_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Notes</label>
            <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '80px' }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          {saveError && <div style={errorBox}>{saveError}</div>}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={{ ...btnPrimary, opacity: !form.name.trim() || saving ? 0.5 : 1 }} disabled={!form.name.trim() || saving} onClick={handleSave}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button style={btnSecondary} onClick={() => { setEditing(false); setSaveError('') }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <Field label="Local Union" value={unionLabel(cycle.local_union_id)} />
          <Field label="Classification" value={cycle.classification} />
          <Field label="CBA Expiration" value={formatDate(cycle.cba_expiration_date)} />
          <Field label="Proposed Effective Date" value={formatDate(cycle.proposed_effective_date)} />
          <Field label="Created" value={formatDate(cycle.created_at)} />
          {cycle.notes && (
            <div style={{ gridColumn: '1 / -1' }}>
              <FieldLabel>Notes</FieldLabel>
              <div style={{ fontSize: '14px', color: '#475569', whiteSpace: 'pre-wrap' }}>{cycle.notes}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '4px' }}>{children}</div>
}

function Field({ label, value }: { label: string; value: string | null }): React.JSX.Element {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div style={{ fontSize: '14px', color: value && value !== '—' ? '#0F172A' : '#CBD5E1' }}>{value || '—'}</div>
    </div>
  )
}

// ─── Sessions Tab ─────────────────────────────────────────────────────────────

function SessionsTab({ cycleId, isLocked }: { cycleId: ID; isLocked: boolean }): React.JSX.Element {
  const toast = useToast()
  const [sessions, setSessions] = useState<NegotiationSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ session_date: '', location: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [expanded, setExpanded] = useState<ID | null>(null)
  const [attendees, setAttendees] = useState<Record<ID, SessionAttendee[]>>({})
  const [editingSession, setEditingSession] = useState<NegotiationSession | null>(null)
  const [editForm, setEditForm] = useState({ session_date: '', location: '', notes: '' })

  // Delete dialogs
  const [confirmDeleteSession, setConfirmDeleteSession] = useState<NegotiationSession | null>(null)
  const [deletingSession, setDeletingSession] = useState(false)
  const [confirmDeleteAttendee, setConfirmDeleteAttendee] = useState<{ session: NegotiationSession; attendee: SessionAttendee } | null>(null)
  const [deletingAttendee, setDeletingAttendee] = useState(false)

  // Attendee form
  const [attForm, setAttForm] = useState({ name: '', role: 'Management' as AttendeeRole, title: '' })
  const [attSaving, setAttSaving] = useState(false)
  const [showAttForm, setShowAttForm] = useState<ID | null>(null)

  useEffect(() => {
    let cancelled = false
    void supabase
      .from('negotiation_sessions')
      .select('*')
      .eq('cycle_id', cycleId)
      .order('session_date', { ascending: false })
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          setError(describeError(err, 'Could not load sessions.'))
        } else {
          setSessions((data ?? []) as NegotiationSession[])
        }
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [cycleId])

  async function loadAttendees(sessionId: ID): Promise<void> {
    if (attendees[sessionId]) return
    const { data, error: err } = await supabase
      .from('session_attendees')
      .select('*')
      .eq('session_id', sessionId)
      .order('role')
      .order('name')
    if (err) {
      toast.error('Could not load attendees: ' + describeError(err))
      return
    }
    setAttendees((prev) => ({ ...prev, [sessionId]: (data ?? []) as SessionAttendee[] }))
  }

  function toggleExpand(sessionId: ID): void {
    if (expanded === sessionId) {
      setExpanded(null)
    } else {
      setExpanded(sessionId)
      void loadAttendees(sessionId)
    }
    setShowAttForm(null)
  }

  async function handleAddSession(): Promise<void> {
    setSaveError('')
    if (!form.session_date) { setSaveError('Date is required.'); return }
    setSaving(true)
    const { data, error: err } = await supabase
      .from('negotiation_sessions')
      .insert({ cycle_id: cycleId, session_date: form.session_date, location: form.location.trim() || null, notes: form.notes.trim() || null })
      .select()
      .single()
    setSaving(false)
    if (err || !data) {
      const msg = describeError(err, 'Could not save session.')
      setSaveError(msg)
      toast.error(msg)
      return
    }
    setSessions((prev) => [data as NegotiationSession, ...prev])
    setShowForm(false)
    setForm({ session_date: '', location: '', notes: '' })
    toast.success('Session added.')
  }

  async function handleSaveEdit(): Promise<void> {
    if (!editingSession || !editForm.session_date) return
    setSaving(true)
    const { data, error: err } = await supabase
      .from('negotiation_sessions')
      .update({ session_date: editForm.session_date, location: editForm.location.trim() || null, notes: editForm.notes.trim() || null })
      .eq('id', editingSession.id)
      .select()
      .single()
    setSaving(false)
    if (err || !data) {
      toast.error('Could not save: ' + describeError(err))
      return
    }
    setSessions((prev) => prev.map((s) => s.id === editingSession.id ? data as NegotiationSession : s))
    setEditingSession(null)
    toast.success('Session updated.')
  }

  async function handleDeleteSession(): Promise<void> {
    if (!confirmDeleteSession) return
    setDeletingSession(true)
    const { error: err } = await supabase.from('negotiation_sessions').delete().eq('id', confirmDeleteSession.id)
    setDeletingSession(false)
    if (err) {
      toast.error('Could not delete session: ' + describeError(err))
      return
    }
    setSessions((prev) => prev.filter((s) => s.id !== confirmDeleteSession.id))
    if (expanded === confirmDeleteSession.id) setExpanded(null)
    setConfirmDeleteSession(null)
    toast.success('Session deleted.')
  }

  async function handleAddAttendee(sessionId: ID): Promise<void> {
    if (!attForm.name.trim()) return
    setAttSaving(true)
    const { data, error: err } = await supabase
      .from('session_attendees')
      .insert({ session_id: sessionId, name: attForm.name.trim(), role: attForm.role, title: attForm.title.trim() || null })
      .select()
      .single()
    setAttSaving(false)
    if (err || !data) {
      toast.error('Could not add attendee: ' + describeError(err))
      return
    }
    setAttendees((prev) => ({ ...prev, [sessionId]: [...(prev[sessionId] ?? []), data as SessionAttendee] }))
    setAttForm({ name: '', role: 'Management', title: '' })
    setShowAttForm(null)
    toast.success('Attendee added.')
  }

  async function handleDeleteAttendee(): Promise<void> {
    if (!confirmDeleteAttendee) return
    setDeletingAttendee(true)
    const { session, attendee } = confirmDeleteAttendee
    const { error: err } = await supabase.from('session_attendees').delete().eq('id', attendee.id)
    setDeletingAttendee(false)
    if (err) {
      toast.error('Could not remove attendee: ' + describeError(err))
      return
    }
    setAttendees((prev) => ({ ...prev, [session.id]: (prev[session.id] ?? []).filter((a) => a.id !== attendee.id) }))
    setConfirmDeleteAttendee(null)
    toast.success('Attendee removed.')
  }

  if (loading) return <div style={{ padding: '24px', fontSize: '13px', color: '#64748B' }}>Loading…</div>

  return (
    <div style={{ padding: '24px 32px', maxWidth: '800px' }}>
      {error && <div style={errorBox}>{error}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
          {sessions.length} {sessions.length === 1 ? 'Session' : 'Sessions'}
        </div>
        {!isLocked && !showForm && (
          <button style={btnPrimary} onClick={() => setShowForm(true)}>+ Add Session</button>
        )}
      </div>

      {showForm && (
        <div style={{ ...card, borderColor: '#1E3A8A', borderWidth: '1.5px', marginBottom: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '16px' }}>New Session</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={labelStyle}>Date <span style={{ color: '#ef4444' }}>*</span></label>
              <input type="date" style={inputStyle} value={form.session_date} onChange={(e) => setForm({ ...form, session_date: e.target.value })} autoFocus />
            </div>
            <div>
              <label style={labelStyle}>Location</label>
              <input style={inputStyle} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Chapter office" />
            </div>
          </div>
          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Notes</label>
            <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          {saveError && <div style={errorBox}>{saveError}</div>}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={{ ...btnPrimary, opacity: !form.session_date || saving ? 0.5 : 1 }} disabled={!form.session_date || saving} onClick={handleAddSession}>
              {saving ? 'Saving…' : 'Add Session'}
            </button>
            <button style={btnSecondary} onClick={() => { setShowForm(false); setSaveError('') }}>Cancel</button>
          </div>
        </div>
      )}

      {sessions.length === 0 && !showForm ? (
        <div style={{ textAlign: 'center', padding: '60px 24px' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 16px', display: 'block' }} aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>No sessions yet</div>
          <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '20px' }}>Log your first bargaining session to start tracking progress.</div>
          {!isLocked && <button style={btnPrimary} onClick={() => setShowForm(true)}>Add First Session</button>}
        </div>
      ) : sessions.map((session) => (
        <div key={session.id} style={{ ...card, marginBottom: '10px' }}>
          {editingSession?.id === session.id ? (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={labelStyle}>Date</label>
                  <input type="date" style={inputStyle} value={editForm.session_date} onChange={(e) => setEditForm({ ...editForm, session_date: e.target.value })} />
                </div>
                <div>
                  <label style={labelStyle}>Location</label>
                  <input style={inputStyle} value={editForm.location} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} />
                </div>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>Notes</label>
                <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button style={btnPrimary} disabled={saving} onClick={handleSaveEdit}>{saving ? 'Saving…' : 'Save'}</button>
                <button style={btnSecondary} onClick={() => setEditingSession(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>{formatDate(session.session_date)}</div>
                  {session.location && <div style={{ fontSize: '13px', color: '#64748B', marginTop: '2px' }}>{session.location}</div>}
                  {session.notes && <div style={{ fontSize: '13px', color: '#475569', marginTop: '6px', whiteSpace: 'pre-wrap' }}>{session.notes}</div>}
                </div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <button
                    style={{ ...btnSecondary, fontSize: '12px', padding: '4px 10px' }}
                    onClick={() => toggleExpand(session.id)}
                  >
                    {expanded === session.id ? 'Hide' : 'Attendees'}
                  </button>
                  {!isLocked && (
                    <>
                      <button style={{ ...btnSecondary, fontSize: '12px', padding: '4px 10px' }} onClick={() => { setEditingSession(session); setEditForm({ session_date: session.session_date, location: session.location ?? '', notes: session.notes ?? '' }) }}>Edit</button>
                      <button style={{ ...btnDanger, fontSize: '12px', padding: '4px 10px' }} onClick={() => setConfirmDeleteSession(session)}>Delete</button>
                    </>
                  )}
                </div>
              </div>

              {expanded === session.id && (
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #F1F5F9' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748B' }}>Attendees</span>
                    {!isLocked && showAttForm !== session.id && (
                      <button style={{ ...btnSecondary, fontSize: '12px', padding: '4px 10px' }} onClick={() => setShowAttForm(session.id)}>+ Add</button>
                    )}
                  </div>

                  {showAttForm === session.id && (
                    <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                        <div>
                          <label style={labelStyle}>Name <span style={{ color: '#ef4444' }}>*</span></label>
                          <input style={inputStyle} value={attForm.name} autoFocus onChange={(e) => setAttForm({ ...attForm, name: e.target.value })} />
                        </div>
                        <div>
                          <label style={labelStyle}>Side</label>
                          <select style={inputStyle} value={attForm.role} onChange={(e) => setAttForm({ ...attForm, role: e.target.value as AttendeeRole })}>
                            <option>Management</option>
                            <option>Labor</option>
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Title</label>
                          <input style={inputStyle} value={attForm.title} onChange={(e) => setAttForm({ ...attForm, title: e.target.value })} placeholder="e.g. Chief Negotiator" />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button style={{ ...btnPrimary, fontSize: '12px', padding: '5px 12px', opacity: !attForm.name.trim() || attSaving ? 0.5 : 1 }} disabled={!attForm.name.trim() || attSaving} onClick={() => handleAddAttendee(session.id)}>
                          {attSaving ? 'Saving…' : 'Add'}
                        </button>
                        <button style={{ ...btnSecondary, fontSize: '12px', padding: '5px 10px' }} onClick={() => setShowAttForm(null)}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {(attendees[session.id] ?? []).length === 0 ? (
                    <div style={{ fontSize: '13px', color: '#94A3B8' }}>No attendees recorded.</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      {(['Management', 'Labor'] as const).map((role) => {
                        const sideAtts = (attendees[session.id] ?? []).filter((a) => a.role === role)
                        if (sideAtts.length === 0) return null
                        return (
                          <div key={role}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{role}</div>
                            {sideAtts.map((att) => (
                              <div key={att.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #F1F5F9' }}>
                                <div>
                                  <span style={{ fontSize: '13px', color: '#0F172A', fontWeight: 500 }}>{att.name}</span>
                                  {att.title && <span style={{ fontSize: '12px', color: '#94A3B8', marginLeft: '6px' }}>— {att.title}</span>}
                                </div>
                                {!isLocked && (
                                  <button aria-label={`Remove ${att.name}`} title={`Remove ${att.name}`} onClick={() => setConfirmDeleteAttendee({ session, attendee: att })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#CBD5E1', fontSize: '16px', padding: '2px 4px' }}>×</button>
                                )}
                              </div>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      ))}

      <ConfirmDialog
        open={confirmDeleteSession !== null}
        title="Delete session?"
        message={confirmDeleteSession ? `Delete the session on ${formatDate(confirmDeleteSession.session_date)}? Its attendees will also be removed. This cannot be undone.` : ''}
        confirmLabel="Delete"
        busy={deletingSession}
        onConfirm={handleDeleteSession}
        onCancel={() => setConfirmDeleteSession(null)}
      />

      <ConfirmDialog
        open={confirmDeleteAttendee !== null}
        title="Remove attendee?"
        message={confirmDeleteAttendee ? `Remove ${confirmDeleteAttendee.attendee.name} from this session?` : ''}
        confirmLabel="Remove"
        busy={deletingAttendee}
        onConfirm={handleDeleteAttendee}
        onCancel={() => setConfirmDeleteAttendee(null)}
      />
    </div>
  )
}

// ─── Proposals Tab ────────────────────────────────────────────────────────────

function ProposalsTab({ cycleId, isLocked }: { cycleId: ID; isLocked: boolean }): React.JSX.Element {
  const toast = useToast()
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [sessions, setSessions] = useState<NegotiationSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', category: 'Language' as ProposalCategory, article_reference: '', proposed_by: '' as '' | ProposedBy })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [expanded, setExpanded] = useState<ID | null>(null)
  const [positions, setPositions] = useState<Record<ID, ProposalPosition[]>>({})
  const [statusFilter, setStatusFilter] = useState<'all' | ProposalStatus>('all')

  // Delete dialogs
  const [confirmDeleteProposal, setConfirmDeleteProposal] = useState<Proposal | null>(null)
  const [deletingProposal, setDeletingProposal] = useState(false)
  const [confirmDeletePosition, setConfirmDeletePosition] = useState<{ proposal: Proposal; position: ProposalPosition } | null>(null)
  const [deletingPosition, setDeletingPosition] = useState(false)

  useEffect(() => {
    let cancelled = false

    void Promise.all([
      supabase.from('proposals').select('*').eq('cycle_id', cycleId).order('sort_order').order('created_at'),
      supabase.from('negotiation_sessions').select('*').eq('cycle_id', cycleId).order('session_date', { ascending: false })
    ]).then(([propRes, sessRes]) => {
      if (cancelled) return
      if (propRes.error) {
        setError(describeError(propRes.error, 'Could not load proposals.'))
      } else {
        setProposals((propRes.data ?? []) as Proposal[])
      }
      if (!sessRes.error) setSessions((sessRes.data ?? []) as NegotiationSession[])
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [cycleId])

  async function loadPositions(proposalId: ID): Promise<void> {
    if (positions[proposalId]) return
    const { data, error: err } = await supabase
      .from('proposal_positions')
      .select('*')
      .eq('proposal_id', proposalId)
      .order('position_date')
      .order('created_at')
    if (err) {
      toast.error('Could not load positions: ' + describeError(err))
      return
    }
    setPositions((prev) => ({ ...prev, [proposalId]: (data ?? []) as ProposalPosition[] }))
  }

  function toggleExpand(id: ID): void {
    if (expanded === id) setExpanded(null)
    else {
      setExpanded(id)
      void loadPositions(id)
    }
  }

  async function handleAddProposal(): Promise<void> {
    setSaveError('')
    if (!form.title.trim()) { setSaveError('Title is required.'); return }
    setSaving(true)
    const { data, error: err } = await supabase
      .from('proposals')
      .insert({
        cycle_id: cycleId,
        title: form.title.trim(),
        category: form.category,
        article_reference: form.article_reference.trim() || null,
        proposed_by: form.proposed_by || null,
        status: 'Open',
        sort_order: proposals.length
      })
      .select()
      .single()
    setSaving(false)
    if (err || !data) {
      const msg = describeError(err, 'Could not save proposal.')
      setSaveError(msg)
      toast.error(msg)
      return
    }
    setProposals((prev) => [...prev, data as Proposal])
    setShowForm(false)
    setForm({ title: '', category: 'Language', article_reference: '', proposed_by: '' })
    toast.success('Proposal added.')
  }

  async function handleStatusChange(proposal: Proposal, newStatus: ProposalStatus): Promise<void> {
    const { data, error: err } = await supabase
      .from('proposals')
      .update({ status: newStatus })
      .eq('id', proposal.id)
      .select()
      .single()
    if (err || !data) {
      toast.error('Could not update status: ' + describeError(err))
      return
    }
    setProposals((prev) => prev.map((p) => p.id === proposal.id ? data as Proposal : p))
    toast.success(`Marked ${newStatus}.`)
  }

  async function handleDeleteProposal(): Promise<void> {
    if (!confirmDeleteProposal) return
    setDeletingProposal(true)
    const { error: err } = await supabase.from('proposals').delete().eq('id', confirmDeleteProposal.id)
    setDeletingProposal(false)
    if (err) {
      toast.error('Could not delete: ' + describeError(err))
      return
    }
    setProposals((prev) => prev.filter((p) => p.id !== confirmDeleteProposal.id))
    if (expanded === confirmDeleteProposal.id) setExpanded(null)
    setConfirmDeleteProposal(null)
    toast.success('Proposal deleted.')
  }

  // Fixes the audit's "Add Position closure bug": this takes the form values as
  // arguments so it operates on the current input from the proposal that fired
  // it, not on whatever stale `posForm` state the parent last set.
  async function handleAddPosition(
    proposalId: ID,
    values: { side: PositionSide; session_id: ID | null; position_text: string }
  ): Promise<void> {
    const text = values.position_text.trim()
    if (!text) return
    const { data, error: err } = await supabase
      .from('proposal_positions')
      .insert({
        proposal_id: proposalId,
        session_id: values.session_id,
        side: values.side,
        position_text: text
      })
      .select()
      .single()
    if (err || !data) {
      toast.error('Could not save position: ' + describeError(err))
      return
    }
    setPositions((prev) => ({ ...prev, [proposalId]: [...(prev[proposalId] ?? []), data as ProposalPosition] }))
    toast.success('Position added.')
  }

  async function handleDeletePosition(): Promise<void> {
    if (!confirmDeletePosition) return
    setDeletingPosition(true)
    const { proposal, position } = confirmDeletePosition
    const { error: err } = await supabase.from('proposal_positions').delete().eq('id', position.id)
    setDeletingPosition(false)
    if (err) {
      toast.error('Could not delete position: ' + describeError(err))
      return
    }
    setPositions((prev) => ({ ...prev, [proposal.id]: (prev[proposal.id] ?? []).filter((p) => p.id !== position.id) }))
    setConfirmDeletePosition(null)
    toast.success('Position removed.')
  }

  const filtered = proposals.filter((p) => statusFilter === 'all' || p.status === statusFilter)
  const open = filtered.filter((p) => p.status === 'Open')
  const resolved = filtered.filter((p) => p.status === 'TA' || p.status === 'Rejected' || p.status === 'Withdrawn')

  if (loading) return <div style={{ padding: '24px', fontSize: '13px', color: '#64748B' }}>Loading…</div>

  return (
    <div style={{ padding: '24px 32px', maxWidth: '900px' }}>
      {error && <div style={errorBox}>{error}</div>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {(['all', ...PROPOSAL_STATUSES] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: '5px 12px', fontSize: '12px', fontWeight: 500, borderRadius: '20px', cursor: 'pointer',
                background: statusFilter === s ? '#1E3A8A' : '#F8FAFC',
                color: statusFilter === s ? '#fff' : '#64748B',
                border: statusFilter === s ? '1px solid #1E3A8A' : '1px solid #E2E8F0'
              }}
            >
              {s === 'all' ? `All (${proposals.length})` : `${s} (${proposals.filter((p) => p.status === s).length})`}
            </button>
          ))}
        </div>
        {!isLocked && !showForm && (
          <button style={btnPrimary} onClick={() => setShowForm(true)}>+ Add Proposal</button>
        )}
      </div>

      {showForm && (
        <div style={{ ...card, borderColor: '#1E3A8A', borderWidth: '1.5px', marginBottom: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '16px' }}>New Proposal</div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={labelStyle}>Title <span style={{ color: '#ef4444' }}>*</span></label>
              <input style={inputStyle} value={form.title} autoFocus onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Health & Welfare" />
            </div>
            <div>
              <label style={labelStyle}>Article #</label>
              <input style={inputStyle} value={form.article_reference} onChange={(e) => setForm({ ...form, article_reference: e.target.value })} placeholder="e.g. Art. 12" />
            </div>
            <div>
              <label style={labelStyle}>Category</label>
              <select style={inputStyle} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ProposalCategory })}>
                <option value="Language">Language</option>
                <option value="Economic">Economic</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Proposed By</label>
              <select style={inputStyle} value={form.proposed_by} onChange={(e) => setForm({ ...form, proposed_by: e.target.value as '' | ProposedBy })}>
                <option value="">—</option>
                <option value="NECA">NECA</option>
                <option value="IBEW">IBEW</option>
              </select>
            </div>
          </div>
          {saveError && <div style={errorBox}>{saveError}</div>}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={{ ...btnPrimary, opacity: !form.title.trim() || saving ? 0.5 : 1 }} disabled={!form.title.trim() || saving} onClick={handleAddProposal}>
              {saving ? 'Saving…' : 'Add Proposal'}
            </button>
            <button style={btnSecondary} onClick={() => { setShowForm(false); setSaveError('') }}>Cancel</button>
          </div>
        </div>
      )}

      {proposals.length === 0 && !showForm ? (
        <div style={{ textAlign: 'center', padding: '60px 24px' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 16px', display: 'block' }} aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>No proposals yet</div>
          <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '20px' }}>Add contract articles or items being negotiated.</div>
          {!isLocked && <button style={btnPrimary} onClick={() => setShowForm(true)}>Add First Proposal</button>}
        </div>
      ) : (
        <>
          {open.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              {open.map((p) => (
                <ProposalCard
                  key={p.id}
                  proposal={p}
                  sessions={sessions}
                  positions={positions[p.id]}
                  expanded={expanded === p.id}
                  isLocked={isLocked}
                  onToggle={() => toggleExpand(p.id)}
                  onStatusChange={(s) => handleStatusChange(p, s)}
                  onDelete={() => setConfirmDeleteProposal(p)}
                  onAddPosition={(values) => handleAddPosition(p.id, values)}
                  onDeletePosition={(pos) => setConfirmDeletePosition({ proposal: p, position: pos })}
                />
              ))}
            </div>
          )}
          {resolved.length > 0 && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
                Resolved Proposals
              </div>
              {resolved.map((p) => (
                <ProposalCard
                  key={p.id}
                  proposal={p}
                  sessions={sessions}
                  positions={positions[p.id]}
                  expanded={expanded === p.id}
                  isLocked={isLocked}
                  onToggle={() => toggleExpand(p.id)}
                  onStatusChange={(s) => handleStatusChange(p, s)}
                  onDelete={() => setConfirmDeleteProposal(p)}
                  onAddPosition={(values) => handleAddPosition(p.id, values)}
                  onDeletePosition={(pos) => setConfirmDeletePosition({ proposal: p, position: pos })}
                />
              ))}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmDeleteProposal !== null}
        title="Delete proposal?"
        message={confirmDeleteProposal ? `Delete "${confirmDeleteProposal.title}"? All its positions will be removed. This cannot be undone.` : ''}
        confirmLabel="Delete"
        busy={deletingProposal}
        onConfirm={handleDeleteProposal}
        onCancel={() => setConfirmDeleteProposal(null)}
      />

      <ConfirmDialog
        open={confirmDeletePosition !== null}
        title="Delete position?"
        message="Remove this position from the proposal? This cannot be undone."
        confirmLabel="Delete"
        busy={deletingPosition}
        onConfirm={handleDeletePosition}
        onCancel={() => setConfirmDeletePosition(null)}
      />
    </div>
  )
}

// ─── Proposal Card ────────────────────────────────────────────────────────────

interface ProposalCardProps {
  proposal: Proposal
  sessions: NegotiationSession[]
  positions: ProposalPosition[] | undefined
  expanded: boolean
  isLocked: boolean
  onToggle: () => void
  onStatusChange: (s: ProposalStatus) => void
  onDelete: () => void
  onAddPosition: (values: { side: PositionSide; session_id: ID | null; position_text: string }) => void | Promise<void>
  onDeletePosition: (pos: ProposalPosition) => void
}

function ProposalCard({ proposal, sessions, positions, expanded, isLocked, onToggle, onStatusChange, onDelete, onAddPosition, onDeletePosition }: ProposalCardProps): React.JSX.Element {
  // Local-to-this-card form state. This is the audit's closure bug fix: every
  // card owns its own input, so typing in one card and clicking Add on a
  // different card cannot send the wrong text.
  const [showPosForm, setShowPosForm] = useState(false)
  const [posForm, setPosForm] = useState<{ side: PositionSide; session_id: string; position_text: string }>({
    side: 'Management', session_id: '', position_text: ''
  })
  const [posSaving, setPosSaving] = useState(false)

  const sc = PROPOSAL_STATUS_COLORS[proposal.status]
  const mgmtPositions = (positions ?? []).filter((p) => p.side === 'Management')
  const laborPositions = (positions ?? []).filter((p) => p.side === 'Labor')

  async function submitPosition(): Promise<void> {
    if (!posForm.position_text.trim()) return
    setPosSaving(true)
    await onAddPosition({
      side: posForm.side,
      session_id: posForm.session_id ? posForm.session_id : null,
      position_text: posForm.position_text
    })
    setPosSaving(false)
    setPosForm({ side: 'Management', session_id: '', position_text: '' })
    setShowPosForm(false)
  }

  return (
    <div style={{ ...card, marginBottom: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
            {proposal.article_reference && (
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#94A3B8' }}>{proposal.article_reference}</span>
            )}
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>{proposal.title}</span>
            <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
              {proposal.status}
            </span>
            <span style={{ fontSize: '11px', color: '#94A3B8' }}>{proposal.category}</span>
            {proposal.proposed_by && <span style={{ fontSize: '11px', color: '#94A3B8' }}>· by {proposal.proposed_by}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center' }}>
          <button style={{ ...btnSecondary, fontSize: '12px', padding: '4px 10px' }} onClick={onToggle}>
            {expanded ? 'Collapse' : 'Positions'}
          </button>
          {!isLocked && (
            <>
              <select
                value={proposal.status}
                onChange={(e) => onStatusChange(e.target.value as ProposalStatus)}
                style={{ ...inputStyle, width: 'auto', fontSize: '12px', padding: '4px 8px' }}
                aria-label="Change status"
              >
                {PROPOSAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button style={{ ...btnDanger, fontSize: '12px', padding: '4px 10px' }} onClick={onDelete}>Delete</button>
            </>
          )}
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #F1F5F9' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '14px' }}>
            {(['Management', 'Labor'] as const).map((side) => {
              const sidePositions = side === 'Management' ? mgmtPositions : laborPositions
              return (
                <div key={side}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>{side}</div>
                  {sidePositions.length === 0 ? (
                    <div style={{ fontSize: '12px', color: '#CBD5E1' }}>No positions recorded.</div>
                  ) : sidePositions.map((pos) => {
                    const sess = sessions.find((s) => s.id === pos.session_id)
                    return (
                      <div key={pos.id} style={{ padding: '8px 10px', background: '#F8FAFC', borderRadius: '6px', marginBottom: '6px', position: 'relative' }}>
                        {sess && <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '3px' }}>{formatDate(sess.session_date)}</div>}
                        <div style={{ fontSize: '13px', color: '#0F172A', whiteSpace: 'pre-wrap' }}>{pos.position_text}</div>
                        {!isLocked && (
                          <button aria-label="Delete position" title="Delete position" onClick={() => onDeletePosition(pos)} style={{ position: 'absolute', top: '6px', right: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#CBD5E1', fontSize: '14px', lineHeight: 1 }}>×</button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>

          {!isLocked && (
            showPosForm ? (
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                  <div>
                    <label style={labelStyle}>Side</label>
                    <select style={inputStyle} value={posForm.side} onChange={(e) => setPosForm({ ...posForm, side: e.target.value as PositionSide })}>
                      <option>Management</option>
                      <option>Labor</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Session <span style={{ fontWeight: 400, color: '#94A3B8' }}>(optional)</span></label>
                    <select style={inputStyle} value={posForm.session_id} onChange={(e) => setPosForm({ ...posForm, session_id: e.target.value })}>
                      <option value="">— Not linked —</option>
                      {sessions.map((s) => <option key={s.id} value={s.id}>{formatDate(s.session_date)}{s.location ? ` — ${s.location}` : ''}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom: '10px' }}>
                  <label style={labelStyle}>Position Text <span style={{ color: '#ef4444' }}>*</span></label>
                  <textarea
                    style={{ ...inputStyle, resize: 'vertical', minHeight: '70px' }}
                    value={posForm.position_text}
                    autoFocus
                    onChange={(e) => setPosForm({ ...posForm, position_text: e.target.value })}
                    placeholder="Describe the proposal or counter-proposal…"
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button style={{ ...btnPrimary, fontSize: '12px', padding: '5px 12px', opacity: !posForm.position_text.trim() || posSaving ? 0.5 : 1 }} disabled={!posForm.position_text.trim() || posSaving} onClick={submitPosition}>
                    {posSaving ? 'Saving…' : 'Add Position'}
                  </button>
                  <button style={{ ...btnSecondary, fontSize: '12px', padding: '5px 10px' }} onClick={() => { setShowPosForm(false); setPosForm({ side: 'Management', session_id: '', position_text: '' }) }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button style={{ ...btnSecondary, fontSize: '12px', padding: '5px 12px' }} onClick={() => setShowPosForm(true)}>+ Add Position</button>
            )
          )}
        </div>
      )}
    </div>
  )
}
