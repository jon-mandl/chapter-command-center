import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useOrg } from '../lib/useOrg'
import { inputStyle, btnPrimary, btnSecondary, btnDanger, card, labelStyle, errorBox, formatDate } from '../lib/ui'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Negotiation {
  id: number
  name: string
  bargaining_unit: string
  local_number: string | null
  local_union_id: number | null
  contract_expiration_date: string | null
  status: string
  notes: string | null
  created_at: string
}

interface LocalUnion {
  id: number
  local_number: string
  charter_city: string | null
}

interface Session {
  id: number
  negotiation_id: number
  date: string
  location: string | null
  notes: string | null
  created_at: string
}

interface Attendee {
  id: number
  session_id: number
  name: string
  side: 'Management' | 'Labor'
  role: string | null
}

interface Proposal {
  id: number
  negotiation_id: number
  title: string
  article_number: string | null
  article_title: string | null
  status: 'open' | 'ta' | 'rejected' | 'reopened'
  language_vs_economic: 'Language' | 'Economic' | null
  original_language: string | null
  created_at: string
}

interface ProposalPosition {
  id: number
  proposal_id: number
  session_id: number | null
  side: 'Management' | 'Labor'
  position_text: string
  created_at: string
}

type Tab = 'overview' | 'sessions' | 'proposals'

// ─── Status config ─────────────────────────────────────────────────────────────

const NEG_STATUSES = ['Scheduling', 'Negotiating', 'Deadlocked', 'Closed']

const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  Scheduling:  { bg: '#EEF2FF', color: '#4F46E5', border: '#C7D2FE' },
  Negotiating: { bg: '#f0fdf4', color: '#059669', border: '#bbf7d0' },
  Deadlocked:  { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  Closed:      { bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' }
}

const PROPOSAL_STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  open:     { bg: '#EEF2FF', color: '#4F46E5', border: '#C7D2FE' },
  ta:       { bg: '#f0fdf4', color: '#059669', border: '#bbf7d0' },
  rejected: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  reopened: { bg: '#fff7ed', color: '#ea580c', border: '#fed7aa' }
}

const PROPOSAL_STATUS_LABELS: Record<string, string> = {
  open: 'Open', ta: 'TA', rejected: 'Rejected', reopened: 'Reopened'
}

// ─── Session Log Tab ──────────────────────────────────────────────────────────

function SessionsTab({ negotiationId, isLocked }: { negotiationId: number; isLocked: boolean }): React.JSX.Element {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ date: '', location: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [attendees, setAttendees] = useState<Record<number, Attendee[]>>({})
  const [editingSession, setEditingSession] = useState<Session | null>(null)
  const [editForm, setEditForm] = useState({ date: '', location: '', notes: '' })
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

  // Attendee form state
  const [attForm, setAttForm] = useState({ name: '', side: 'Management' as 'Management' | 'Labor', role: '' })
  const [attSaving, setAttSaving] = useState(false)
  const [showAttForm, setShowAttForm] = useState<number | null>(null)

  useEffect(() => {
    supabase
      .from('sessions')
      .select('*')
      .eq('negotiation_id', negotiationId)
      .order('date', { ascending: false })
      .then(({ data, error: err }) => {
        if (err) setError('Could not load sessions.')
        else setSessions((data as Session[]) ?? [])
        setLoading(false)
      })
  }, [negotiationId])

  async function loadAttendees(sessionId: number): Promise<void> {
    if (attendees[sessionId]) return
    const { data } = await supabase.from('attendees').select('*').eq('session_id', sessionId).order('side').order('name')
    setAttendees((prev) => ({ ...prev, [sessionId]: (data as Attendee[]) ?? [] }))
  }

  function toggleExpand(sessionId: number): void {
    if (expanded === sessionId) {
      setExpanded(null)
    } else {
      setExpanded(sessionId)
      loadAttendees(sessionId)
    }
    setShowAttForm(null)
  }

  async function handleAddSession(): Promise<void> {
    if (!form.date) { setSaveError('Date is required.'); return }
    setSaving(true)
    setSaveError('')
    const { data, error: err } = await supabase
      .from('sessions')
      .insert({ negotiation_id: negotiationId, date: form.date, location: form.location.trim() || null, notes: form.notes.trim() || null })
      .select()
      .single()
    if (err) { setSaveError('Could not save session. Please try again.') }
    else { setSessions((prev) => [data as Session, ...prev]); setShowForm(false); setForm({ date: '', location: '', notes: '' }) }
    setSaving(false)
  }

  async function handleSaveEdit(): Promise<void> {
    if (!editingSession || !editForm.date) return
    setSaving(true)
    const { data, error: err } = await supabase
      .from('sessions')
      .update({ date: editForm.date, location: editForm.location.trim() || null, notes: editForm.notes.trim() || null })
      .eq('id', editingSession.id)
      .select()
      .single()
    if (!err && data) {
      setSessions((prev) => prev.map((s) => s.id === editingSession.id ? data as Session : s))
      setEditingSession(null)
    }
    setSaving(false)
  }

  async function handleDeleteSession(id: number): Promise<void> {
    const { error: err } = await supabase.from('sessions').delete().eq('id', id)
    if (!err) {
      setSessions((prev) => prev.filter((s) => s.id !== id))
      setExpanded(null)
      setConfirmDelete(null)
    }
  }

  async function handleAddAttendee(sessionId: number): Promise<void> {
    if (!attForm.name.trim()) return
    setAttSaving(true)
    const { data, error: err } = await supabase
      .from('attendees')
      .insert({ session_id: sessionId, name: attForm.name.trim(), side: attForm.side, role: attForm.role.trim() || null })
      .select()
      .single()
    if (!err && data) {
      setAttendees((prev) => ({ ...prev, [sessionId]: [...(prev[sessionId] ?? []), data as Attendee] }))
      setAttForm({ name: '', side: 'Management', role: '' })
      setShowAttForm(null)
    }
    setAttSaving(false)
  }

  async function handleDeleteAttendee(sessionId: number, attId: number): Promise<void> {
    await supabase.from('attendees').delete().eq('id', attId)
    setAttendees((prev) => ({ ...prev, [sessionId]: (prev[sessionId] ?? []).filter((a) => a.id !== attId) }))
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
              <input type="date" style={inputStyle} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} autoFocus />
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
            <button style={{ ...btnPrimary, opacity: !form.date || saving ? 0.5 : 1 }} disabled={!form.date || saving} onClick={handleAddSession}>
              {saving ? 'Saving…' : 'Add Session'}
            </button>
            <button style={btnSecondary} onClick={() => { setShowForm(false); setSaveError('') }}>Cancel</button>
          </div>
        </div>
      )}

      {sessions.length === 0 && !showForm ? (
        <div style={{ textAlign: 'center', padding: '60px 24px' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 16px', display: 'block' }}>
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
                  <input type="date" style={inputStyle} value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} />
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
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>{formatDate(session.date)}</div>
                  {session.location && <div style={{ fontSize: '13px', color: '#64748B', marginTop: '2px' }}>{session.location}</div>}
                  {session.notes && <div style={{ fontSize: '13px', color: '#475569', marginTop: '6px', whiteSpace: 'pre-wrap' }}>{session.notes}</div>}
                </div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <button
                    style={{ ...btnSecondary, fontSize: '12px', padding: '4px 10px' }}
                    onClick={() => { toggleExpand(session.id) }}
                  >
                    {expanded === session.id ? 'Hide' : 'Attendees'}
                  </button>
                  {!isLocked && (
                    <>
                      <button style={{ ...btnSecondary, fontSize: '12px', padding: '4px 10px' }} onClick={() => { setEditingSession(session); setEditForm({ date: session.date, location: session.location ?? '', notes: session.notes ?? '' }) }}>Edit</button>
                      {confirmDelete === session.id ? (
                        <>
                          <button style={{ ...btnDanger, fontSize: '12px', padding: '4px 10px' }} onClick={() => handleDeleteSession(session.id)}>Yes, Delete</button>
                          <button style={{ ...btnSecondary, fontSize: '12px', padding: '4px 10px' }} onClick={() => setConfirmDelete(null)}>Cancel</button>
                        </>
                      ) : (
                        <button style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '12px', padding: '4px 8px' }} onClick={() => setConfirmDelete(session.id)}>Delete</button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Attendees panel */}
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
                          <select style={inputStyle} value={attForm.side} onChange={(e) => setAttForm({ ...attForm, side: e.target.value as 'Management' | 'Labor' })}>
                            <option>Management</option>
                            <option>Labor</option>
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Role</label>
                          <input style={inputStyle} value={attForm.role} onChange={(e) => setAttForm({ ...attForm, role: e.target.value })} placeholder="e.g. Chief Negotiator" />
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
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      {(['Management', 'Labor'] as const).map((side) => {
                        const sideAtts = (attendees[session.id] ?? []).filter((a) => a.side === side)
                        if (sideAtts.length === 0) return null
                        return (
                          <div key={side}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{side}</div>
                            {sideAtts.map((att) => (
                              <div key={att.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #F1F5F9' }}>
                                <div>
                                  <span style={{ fontSize: '13px', color: '#0F172A', fontWeight: 500 }}>{att.name}</span>
                                  {att.role && <span style={{ fontSize: '12px', color: '#94A3B8', marginLeft: '6px' }}>— {att.role}</span>}
                                </div>
                                {!isLocked && (
                                  <button aria-label={`Remove ${att.name}`} title={`Remove ${att.name}`} onClick={() => handleDeleteAttendee(session.id, att.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#CBD5E1', fontSize: '14px', padding: '2px 4px' }}>×</button>
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
    </div>
  )
}

// ─── Open Items Tab ───────────────────────────────────────────────────────────

function ProposalsTab({ negotiationId, isLocked }: { negotiationId: number; isLocked: boolean }): React.JSX.Element {
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', article_number: '', article_title: '', language_vs_economic: '' as '' | 'Language' | 'Economic' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [positions, setPositions] = useState<Record<number, ProposalPosition[]>>({})
  const [posForm, setPosForm] = useState({ side: 'Management' as 'Management' | 'Labor', session_id: '' as string, position_text: '' })
  const [posSaving, setPosSaving] = useState(false)
  const [showPosForm, setShowPosForm] = useState<number | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'ta' | 'rejected' | 'reopened'>('all')

  useEffect(() => {
    Promise.all([
      supabase.from('proposals').select('*').eq('negotiation_id', negotiationId).order('created_at'),
      supabase.from('sessions').select('id, date, location').eq('negotiation_id', negotiationId).order('date', { ascending: false })
    ]).then(([propRes, sessRes]) => {
      if (propRes.error) setError('Could not load open items.')
      else setProposals((propRes.data as Proposal[]) ?? [])
      setSessions((sessRes.data as Session[]) ?? [])
      setLoading(false)
    })
  }, [negotiationId])

  async function loadPositions(proposalId: number): Promise<void> {
    if (positions[proposalId]) return
    const { data } = await supabase.from('proposal_positions').select('*').eq('proposal_id', proposalId).order('created_at')
    setPositions((prev) => ({ ...prev, [proposalId]: (data as ProposalPosition[]) ?? [] }))
  }

  function toggleExpand(id: number): void {
    if (expanded === id) { setExpanded(null) }
    else { setExpanded(id); loadPositions(id); setShowPosForm(null) }
  }

  async function handleAddProposal(): Promise<void> {
    if (!form.title.trim()) { setSaveError('Title is required.'); return }
    setSaving(true)
    setSaveError('')
    const { data, error: err } = await supabase
      .from('proposals')
      .insert({
        negotiation_id: negotiationId,
        title: form.title.trim(),
        article_number: form.article_number.trim() || null,
        article_title: form.article_title.trim() || null,
        language_vs_economic: form.language_vs_economic || null,
        status: 'open'
      })
      .select()
      .single()
    if (err) { setSaveError('Could not save. Please try again.') }
    else { setProposals((prev) => [...prev, data as Proposal]); setShowForm(false); setForm({ title: '', article_number: '', article_title: '', language_vs_economic: '' }) }
    setSaving(false)
  }

  async function handleStatusChange(proposal: Proposal, newStatus: Proposal['status']): Promise<void> {
    const { data, error: err } = await supabase
      .from('proposals')
      .update({ status: newStatus })
      .eq('id', proposal.id)
      .select()
      .single()
    if (!err && data) setProposals((prev) => prev.map((p) => p.id === proposal.id ? data as Proposal : p))
  }

  async function handleDeleteProposal(id: number): Promise<void> {
    const { error: err } = await supabase.from('proposals').delete().eq('id', id)
    if (!err) { setProposals((prev) => prev.filter((p) => p.id !== id)); setExpanded(null) }
  }

  async function handleAddPosition(proposalId: number): Promise<void> {
    if (!posForm.position_text.trim()) return
    setPosSaving(true)
    const { data, error: err } = await supabase
      .from('proposal_positions')
      .insert({
        proposal_id: proposalId,
        session_id: posForm.session_id ? parseInt(posForm.session_id) : null,
        side: posForm.side,
        position_text: posForm.position_text.trim()
      })
      .select()
      .single()
    if (!err && data) {
      setPositions((prev) => ({ ...prev, [proposalId]: [...(prev[proposalId] ?? []), data as ProposalPosition] }))
      setPosForm({ side: 'Management', session_id: '', position_text: '' })
      setShowPosForm(null)
    }
    setPosSaving(false)
  }

  async function handleDeletePosition(proposalId: number, posId: number): Promise<void> {
    await supabase.from('proposal_positions').delete().eq('id', posId)
    setPositions((prev) => ({ ...prev, [proposalId]: (prev[proposalId] ?? []).filter((p) => p.id !== posId) }))
  }

  const filtered = proposals.filter((p) => statusFilter === 'all' || p.status === statusFilter)
  const open = filtered.filter((p) => p.status === 'open' || p.status === 'reopened')
  const resolved = filtered.filter((p) => p.status === 'ta' || p.status === 'rejected')

  if (loading) return <div style={{ padding: '24px', fontSize: '13px', color: '#64748B' }}>Loading…</div>

  return (
    <div style={{ padding: '24px 32px', maxWidth: '900px' }}>
      {error && <div style={errorBox}>{error}</div>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {(['all', 'open', 'ta', 'rejected', 'reopened'] as const).map((s) => (
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
              {s === 'all' ? `All (${proposals.length})` : `${PROPOSAL_STATUS_LABELS[s]} (${proposals.filter((p) => p.status === s).length})`}
            </button>
          ))}
        </div>
        {!isLocked && !showForm && (
          <button style={btnPrimary} onClick={() => setShowForm(true)}>+ Add Open Item</button>
        )}
      </div>

      {showForm && (
        <div style={{ ...card, borderColor: '#1E3A8A', borderWidth: '1.5px', marginBottom: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '16px' }}>New Open Item</div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={labelStyle}>Title <span style={{ color: '#ef4444' }}>*</span></label>
              <input style={inputStyle} value={form.title} autoFocus onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Health & Welfare" />
            </div>
            <div>
              <label style={labelStyle}>Article #</label>
              <input style={inputStyle} value={form.article_number} onChange={(e) => setForm({ ...form, article_number: e.target.value })} placeholder="e.g. 12" />
            </div>
            <div>
              <label style={labelStyle}>Type</label>
              <select style={inputStyle} value={form.language_vs_economic} onChange={(e) => setForm({ ...form, language_vs_economic: e.target.value as '' | 'Language' | 'Economic' })}>
                <option value="">— Select —</option>
                <option value="Language">Language</option>
                <option value="Economic">Economic</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Article Title</label>
            <input style={inputStyle} value={form.article_title} onChange={(e) => setForm({ ...form, article_title: e.target.value })} placeholder="e.g. Wages and Fringe Benefits" />
          </div>
          {saveError && <div style={errorBox}>{saveError}</div>}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={{ ...btnPrimary, opacity: !form.title.trim() || saving ? 0.5 : 1 }} disabled={!form.title.trim() || saving} onClick={handleAddProposal}>
              {saving ? 'Saving…' : 'Add Item'}
            </button>
            <button style={btnSecondary} onClick={() => { setShowForm(false); setSaveError('') }}>Cancel</button>
          </div>
        </div>
      )}

      {proposals.length === 0 && !showForm ? (
        <div style={{ textAlign: 'center', padding: '60px 24px' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 16px', display: 'block' }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>No open items yet</div>
          <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '20px' }}>Add contract articles or items being negotiated.</div>
          {!isLocked && <button style={btnPrimary} onClick={() => setShowForm(true)}>Add First Item</button>}
        </div>
      ) : (
        <>
          {open.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              {open.map((p) => <ProposalCard key={p.id} proposal={p} sessions={sessions} positions={positions[p.id]} expanded={expanded === p.id} isLocked={isLocked} onToggle={() => toggleExpand(p.id)} onStatusChange={(s) => handleStatusChange(p, s)} onDelete={() => handleDeleteProposal(p.id)} onAddPosition={(text, side, sessId) => { setPosForm({ side, session_id: sessId, position_text: text }); handleAddPosition(p.id) }} showPosForm={showPosForm === p.id} onShowPosForm={() => setShowPosForm(p.id)} onHidePosForm={() => setShowPosForm(null)} posForm={posForm} setPosForm={setPosForm} posSaving={posSaving} onDeletePosition={(posId) => handleDeletePosition(p.id, posId)} />)}
            </div>
          )}
          {resolved.length > 0 && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
                Resolved Items
              </div>
              {resolved.map((p) => <ProposalCard key={p.id} proposal={p} sessions={sessions} positions={positions[p.id]} expanded={expanded === p.id} isLocked={isLocked} onToggle={() => toggleExpand(p.id)} onStatusChange={(s) => handleStatusChange(p, s)} onDelete={() => handleDeleteProposal(p.id)} onAddPosition={(text, side, sessId) => { setPosForm({ side, session_id: sessId, position_text: text }); handleAddPosition(p.id) }} showPosForm={showPosForm === p.id} onShowPosForm={() => setShowPosForm(p.id)} onHidePosForm={() => setShowPosForm(null)} posForm={posForm} setPosForm={setPosForm} posSaving={posSaving} onDeletePosition={(posId) => handleDeletePosition(p.id, posId)} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Proposal Card ────────────────────────────────────────────────────────────

function ProposalCard({ proposal, sessions, positions, expanded, isLocked, onToggle, onStatusChange, onDelete, onAddPosition, showPosForm, onShowPosForm, onHidePosForm, posForm, setPosForm, posSaving, onDeletePosition }: {
  proposal: Proposal
  sessions: Session[]
  positions: ProposalPosition[] | undefined
  expanded: boolean
  isLocked: boolean
  onToggle: () => void
  onStatusChange: (s: Proposal['status']) => void
  onDelete: () => void
  onAddPosition: (text: string, side: 'Management' | 'Labor', sessId: string) => void
  showPosForm: boolean
  onShowPosForm: () => void
  onHidePosForm: () => void
  posForm: { side: 'Management' | 'Labor'; session_id: string; position_text: string }
  setPosForm: (f: { side: 'Management' | 'Labor'; session_id: string; position_text: string }) => void
  posSaving: boolean
  onDeletePosition: (posId: number) => void
}): React.JSX.Element {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const sc = PROPOSAL_STATUS_COLORS[proposal.status]

  const mgmtPositions = (positions ?? []).filter((p) => p.side === 'Management')
  const laborPositions = (positions ?? []).filter((p) => p.side === 'Labor')

  return (
    <div style={{ ...card, marginBottom: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
            {proposal.article_number && (
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#94A3B8' }}>Art. {proposal.article_number}</span>
            )}
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>{proposal.title}</span>
            <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
              {PROPOSAL_STATUS_LABELS[proposal.status]}
            </span>
            {proposal.language_vs_economic && (
              <span style={{ fontSize: '11px', color: '#94A3B8' }}>{proposal.language_vs_economic}</span>
            )}
          </div>
          {proposal.article_title && <div style={{ fontSize: '12px', color: '#64748B' }}>{proposal.article_title}</div>}
        </div>
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center' }}>
          <button style={{ ...btnSecondary, fontSize: '12px', padding: '4px 10px' }} onClick={onToggle}>
            {expanded ? 'Collapse' : 'Positions'}
          </button>
          {!isLocked && (
            <>
              <select
                value={proposal.status}
                onChange={(e) => onStatusChange(e.target.value as Proposal['status'])}
                style={{ ...inputStyle, width: 'auto', fontSize: '12px', padding: '4px 8px' }}
                aria-label="Change status"
              >
                <option value="open">Open</option>
                <option value="ta">TA</option>
                <option value="rejected">Rejected</option>
                <option value="reopened">Reopened</option>
              </select>
              {confirmDelete ? (
                <>
                  <button style={{ ...btnDanger, fontSize: '12px', padding: '4px 10px' }} onClick={onDelete}>Yes</button>
                  <button style={{ ...btnSecondary, fontSize: '12px', padding: '4px 10px' }} onClick={() => setConfirmDelete(false)}>No</button>
                </>
              ) : (
                <button style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '12px', padding: '4px 8px' }} onClick={() => setConfirmDelete(true)}>Delete</button>
              )}
            </>
          )}
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #F1F5F9' }}>
          {/* Side-by-side positions */}
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
                        {sess && <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '3px' }}>{formatDate(sess.date)}</div>}
                        <div style={{ fontSize: '13px', color: '#0F172A', whiteSpace: 'pre-wrap' }}>{pos.position_text}</div>
                        {!isLocked && (
                          <button aria-label="Delete position" title="Delete position" onClick={() => onDeletePosition(pos.id)} style={{ position: 'absolute', top: '6px', right: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#CBD5E1', fontSize: '14px', lineHeight: 1 }}>×</button>
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
                    <select style={inputStyle} value={posForm.side} onChange={(e) => setPosForm({ ...posForm, side: e.target.value as 'Management' | 'Labor' })}>
                      <option>Management</option>
                      <option>Labor</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Session <span style={{ fontWeight: 400, color: '#94A3B8' }}>(optional)</span></label>
                    <select style={inputStyle} value={posForm.session_id} onChange={(e) => setPosForm({ ...posForm, session_id: e.target.value })}>
                      <option value="">— Not linked —</option>
                      {sessions.map((s) => <option key={s.id} value={s.id}>{formatDate(s.date)}{s.location ? ` — ${s.location}` : ''}</option>)}
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
                  <button style={{ ...btnPrimary, fontSize: '12px', padding: '5px 12px', opacity: !posForm.position_text.trim() || posSaving ? 0.5 : 1 }} disabled={!posForm.position_text.trim() || posSaving} onClick={() => onAddPosition(posForm.position_text, posForm.side, posForm.session_id)}>
                    {posSaving ? 'Saving…' : 'Add Position'}
                  </button>
                  <button style={{ ...btnSecondary, fontSize: '12px', padding: '5px 10px' }} onClick={onHidePosForm}>Cancel</button>
                </div>
              </div>
            ) : (
              <button style={{ ...btnSecondary, fontSize: '12px', padding: '5px 12px' }} onClick={onShowPosForm}>+ Add Position</button>
            )
          )}
        </div>
      )}
    </div>
  )
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ negotiation, localUnions, onUpdate }: {
  negotiation: Negotiation
  localUnions: LocalUnion[]
  onUpdate: (n: Negotiation) => void
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    name: negotiation.name,
    local_union_id: negotiation.local_union_id ? String(negotiation.local_union_id) : '',
    contract_expiration_date: negotiation.contract_expiration_date ?? '',
    status: negotiation.status,
    notes: negotiation.notes ?? ''
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  async function handleSave(): Promise<void> {
    if (!form.name.trim()) return
    setSaving(true)
    setSaveError('')
    const selectedUnion = localUnions.find((l) => l.id === parseInt(form.local_union_id))
    const { data, error: err } = await supabase
      .from('negotiations')
      .update({
        name: form.name.trim(),
        local_union_id: form.local_union_id ? parseInt(form.local_union_id) : null,
        local_number: selectedUnion?.local_number ?? null,
        contract_expiration_date: form.contract_expiration_date || null,
        status: form.status,
        notes: form.notes.trim() || null
      })
      .eq('id', negotiation.id)
      .select()
      .single()
    if (err) { setSaveError('Could not save. Please try again.') }
    else { onUpdate(data as Negotiation); setEditing(false) }
    setSaving(false)
  }

  const sc = STATUS_COLORS[negotiation.status] ?? STATUS_COLORS['Closed']

  return (
    <div style={{ padding: '28px 32px', maxWidth: '680px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A' }}>{negotiation.name}</span>
          <span style={{ fontSize: '12px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
            {negotiation.status}
          </span>
        </div>
        {!editing && <button style={btnSecondary} onClick={() => setEditing(true)}>Edit</button>}
      </div>

      {editing ? (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Negotiation Name <span style={{ color: '#ef4444' }}>*</span></label>
              <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Local Union</label>
              <select style={inputStyle} value={form.local_union_id} onChange={(e) => setForm({ ...form, local_union_id: e.target.value })}>
                <option value="">— None —</option>
                {localUnions.map((l) => <option key={l.id} value={l.id}>Local {l.local_number}{l.charter_city ? ` — ${l.charter_city}` : ''}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Contract Expiration Date</label>
              <input type="date" style={inputStyle} value={form.contract_expiration_date} onChange={(e) => setForm({ ...form, contract_expiration_date: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <select style={inputStyle} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
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
          {[
            { label: 'Local Union', value: negotiation.local_number ? `Local ${negotiation.local_number}` : null },
            { label: 'Contract Expiration', value: formatDate(negotiation.contract_expiration_date) },
            { label: 'Created', value: formatDate(negotiation.created_at) }
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '4px' }}>{label}</div>
              <div style={{ fontSize: '14px', color: value ? '#0F172A' : '#CBD5E1' }}>{value || '—'}</div>
            </div>
          ))}
          {negotiation.notes && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '4px' }}>Notes</div>
              <div style={{ fontSize: '14px', color: '#475569', whiteSpace: 'pre-wrap' }}>{negotiation.notes}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── NegotiationDetail ────────────────────────────────────────────────────────

export default function NegotiationDetail({ negotiationId, onBack }: {
  negotiationId: number
  onBack: () => void
}): React.JSX.Element {
  const { orgId } = useOrg()
  const [negotiation, setNegotiation] = useState<Negotiation | null>(null)
  const [localUnions, setLocalUnions] = useState<LocalUnion[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  useEffect(() => {
    if (!orgId) return
    Promise.all([
      supabase.from('negotiations').select('*').eq('id', negotiationId).eq('org_id', orgId).single(),
      supabase.from('local_unions').select('id, local_number, charter_city').eq('org_id', orgId).order('local_number')
    ]).then(([negRes, luRes]) => {
      if (negRes.error) setLoadError('Could not load negotiation.')
      else setNegotiation(negRes.data as Negotiation)
      setLocalUnions((luRes.data as LocalUnion[]) ?? [])
      setLoading(false)
    })
  }, [negotiationId, orgId])

  if (loading) return <div style={{ padding: '32px', fontSize: '13px', color: '#64748B' }}>Loading…</div>
  if (loadError || !negotiation) return <div style={{ padding: '32px' }}><div style={errorBox}>{loadError || 'Negotiation not found.'}</div></div>

  const isLocked = negotiation.status === 'Closed'
  const sc = STATUS_COLORS[negotiation.status] ?? STATUS_COLORS['Closed']

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview',  label: 'Overview' },
    { id: 'sessions',  label: 'Session Log' },
    { id: 'proposals', label: 'Open Items' }
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
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
          <span style={{ fontSize: '13px', color: '#0F172A', fontWeight: 600 }}>{negotiation.name}</span>
          <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
            {negotiation.status}
          </span>
          {isLocked && (
            <span style={{ fontSize: '11px', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Locked — read only
            </span>
          )}
        </div>

        {/* Tab bar */}
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

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#F8FAFC' }}>
        {activeTab === 'overview'  && <OverviewTab negotiation={negotiation} localUnions={localUnions} onUpdate={setNegotiation} />}
        {activeTab === 'sessions'  && <SessionsTab negotiationId={negotiationId} isLocked={isLocked} />}
        {activeTab === 'proposals' && <ProposalsTab negotiationId={negotiationId} isLocked={isLocked} />}
      </div>
    </div>
  )
}
