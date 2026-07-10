import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useUserSettings } from '../lib/useUserSettings'
import { useToast } from '../lib/toast'
import { describeError } from '../lib/errors'
import ConfirmDialog from '../lib/ConfirmDialog'
import { inputStyle, btnPrimary, btnSecondary, btnDanger, card, labelStyle, errorBox, formatDate, NEG_STATUS_COLORS, localUnionLabel } from '../lib/ui'
import { loadCycleStats } from '../lib/negotiations'
import type { CycleProposalCounts, CycleSessionSummary } from '../lib/negotiations'
import ComparisonSheet from '../components/comparison/ComparisonSheet'
import CloseOutModal from '../components/CloseOutModal'
import ExportReportModal from '../components/ExportReportModal'
import {
  STORAGE_BUCKETS,
  buildStoragePath,
  createSignedDownloadUrl,
  formatBytes,
  validateUpload
} from '../lib/storage'
import type {
  ID,
  NegotiationCycle,
  LocalUnion,
  NegotiationSession,
  SessionAttendee,
  AttendeeRole,
  Proposal,
  ProposalStatus,
  ProposalCategory,
  ProposedBy,
  ProposalPosition,
  PositionSide,
  NegotiationDocument,
  NegotiationDocumentRole
} from '../lib/types'

type Tab = 'dashboard' | 'sessions' | 'proposals' | 'comparison' | 'documents'

const PROPOSAL_STATUSES: ProposalStatus[] = ['Open', 'TA', 'Withdrawn', 'Rejected']

const PROPOSAL_STATUS_COLORS: Record<ProposalStatus, { bg: string; color: string; border: string }> = {
  Open:      { bg: '#EEF2FF', color: '#4F46E5', border: '#C7D2FE' },
  TA:        { bg: '#f0fdf4', color: '#059669', border: '#bbf7d0' },
  Withdrawn: { bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' },
  Rejected:  { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' }
}

const UNIT_OPTIONS = ['$/hr', '$/day', '%', 'hrs/day', 'miles', 'ratio'] as const
type UnitOption = typeof UNIT_OPTIONS[number]

function unitToFormat(unit: UnitOption): string {
  switch (unit) {
    case '$/hr':    return 'usd'
    case '$/day':   return 'usdDay'
    case '%':       return 'pct'
    case 'hrs/day': return 'hrs'
    case 'miles':   return 'mi'
    case 'ratio':   return 'ratio'
  }
}

// Round to 2 decimals — avoids float artifacts when adding an increase to a base value.
function round2(v: number): number {
  return Math.round(v * 100) / 100
}

function fmtUnitVal(v: number, unit: UnitOption): string {
  if (unit === '%') return `${round2(v)}%`
  if (unit === '$/hr' || unit === '$/day') return `$${v.toFixed(2)}`
  return `${round2(v)} ${unit}`
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
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')

  const [showCloseOut, setShowCloseOut] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [confirmReopen, setConfirmReopen] = useState(false)
  const [lifecycleBusy, setLifecycleBusy] = useState(false)
  const [showReport, setShowReport] = useState(false)

  async function handleArchive(): Promise<void> {
    if (!cycle) return
    setLifecycleBusy(true)
    const { data, error } = await supabase
      .from('negotiation_cycles')
      .update({ status: 'Archived' })
      .eq('id', cycle.id)
      .select()
      .single()
    setLifecycleBusy(false)
    if (error || !data) {
      toast.error('Could not archive: ' + describeError(error))
      return
    }
    setCycle(data as NegotiationCycle)
    setConfirmArchive(false)
    toast.success('Negotiation archived.')
  }

  async function handleReopen(): Promise<void> {
    if (!cycle) return
    setLifecycleBusy(true)
    const { data, error } = await supabase
      .from('negotiation_cycles')
      .update({ status: 'Active', settled_date: null, final_agreement_document_id: null })
      .eq('id', cycle.id)
      .select()
      .single()
    setLifecycleBusy(false)
    if (error || !data) {
      toast.error('Could not reopen: ' + describeError(error))
      return
    }
    setCycle(data as NegotiationCycle)
    setConfirmReopen(false)
    toast.success('Negotiation reopened for editing.')
  }

  useEffect(() => {
    let cancelled = false

    void Promise.all([
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

  // Settled and Archived are both read-only; Reopen unlocks.
  const isLocked = cycle.status !== 'Active'
  const sc = NEG_STATUS_COLORS[cycle.status]

  const TABS: { id: Tab; label: string }[] = [
    { id: 'dashboard',   label: 'Dashboard' },
    { id: 'sessions',    label: 'Session Log' },
    { id: 'proposals',   label: 'Proposals' },
    { id: 'comparison',  label: 'Comparison Sheet' },
    { id: 'documents',   label: 'Documents' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '16px 16px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
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
              {cycle.status === 'Settled'
                ? `Settled${cycle.settled_date ? ` ${formatDate(cycle.settled_date)}` : ''} — locked`
                : 'Archived — locked'}
            </span>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              style={{ ...btnSecondary, fontSize: '12px', padding: '5px 12px' }}
              onClick={() => setShowReport(true)}
            >
              Export Report
            </button>
            {cycle.status === 'Active' && (
              <button
                style={{ ...btnPrimary, fontSize: '12px', padding: '5px 12px' }}
                onClick={() => setShowCloseOut(true)}
              >
                Close Out…
              </button>
            )}
            {cycle.status === 'Settled' && (
              <button
                style={{ ...btnSecondary, fontSize: '12px', padding: '5px 12px' }}
                onClick={() => setConfirmArchive(true)}
              >
                Archive
              </button>
            )}
            {isLocked && (
              <button
                style={{ ...btnSecondary, fontSize: '12px', padding: '5px 12px' }}
                onClick={() => setConfirmReopen(true)}
              >
                Reopen
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0', overflowX: 'auto' }}>
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
        {activeTab === 'dashboard'  && <DashboardTab cycle={cycle} unions={unions} isLocked={isLocked} onUpdate={setCycle} onTabChange={setActiveTab} />}
        {activeTab === 'sessions'   && <SessionsTab cycleId={cycle.id} isLocked={isLocked} />}
        {activeTab === 'proposals'  && <ProposalsTab cycleId={cycle.id} isLocked={isLocked} />}
        {activeTab === 'comparison' && <ComparisonSheet cycle={cycle} union={unions.find((u) => u.id === cycle.local_union_id) ?? null} />}
        {activeTab === 'documents'  && <DocumentsTab cycleId={cycle.id} chapterId={cycle.chapter_id} isLocked={isLocked} />}
      </div>

      {showCloseOut && (
        <CloseOutModal
          cycle={cycle}
          onCancel={() => setShowCloseOut(false)}
          onClosedOut={(updated) => {
            setCycle(updated)
            setShowCloseOut(false)
            toast.success('Negotiation settled and locked.')
          }}
        />
      )}

      {showReport && (
        <ExportReportModal
          cycle={cycle}
          union={unions.find((u) => u.id === cycle.local_union_id) ?? null}
          onClose={() => setShowReport(false)}
        />
      )}

      <ConfirmDialog
        open={confirmArchive}
        title="Archive negotiation?"
        message={`Move "${cycle.name}" to the archive? It stays fully viewable and remains locked. You can reopen it at any time.`}
        confirmLabel="Archive"
        destructive={false}
        busy={lifecycleBusy}
        onConfirm={handleArchive}
        onCancel={() => setConfirmArchive(false)}
      />

      <ConfirmDialog
        open={confirmReopen}
        title="Reopen negotiation?"
        message={`Unlock "${cycle.name}" for editing? Its settlement date will be cleared until it is closed out again.`}
        confirmLabel="Reopen"
        destructive={false}
        busy={lifecycleBusy}
        onConfirm={handleReopen}
        onCancel={() => setConfirmReopen(false)}
      />
    </div>
  )
}

// ─── Dashboard Tab ────────────────────────────────────────────────────────────

function ProgressBar({ value, total, color }: { value: number; total: number; color: string }): React.JSX.Element {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100)
  return (
    <div style={{ height: '8px', background: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '4px', transition: 'width 0.4s' }} />
    </div>
  )
}

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }): React.JSX.Element {
  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '18px 20px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '28px', fontWeight: 700, color: accent ?? '#0F172A', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>{sub}</div>}
    </div>
  )
}

function DashboardTab({ cycle, unions, isLocked, onUpdate, onTabChange }: {
  cycle: NegotiationCycle
  unions: LocalUnion[]
  isLocked: boolean
  onUpdate: (n: NegotiationCycle) => void
  onTabChange: (t: Tab) => void
}): React.JSX.Element {
  const toast = useToast()
  const [proposals, setProposals] = useState<CycleProposalCounts | null>(null)
  const [sessions, setSessions] = useState<CycleSessionSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // Edit Details (folded in from the former Overview tab)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    name: '', local_union_id: '', neca_chapter_division: '',
    cba_expiration_date: '', proposed_effective_date: '',
    unit_size: '', annual_hours: '', notes: ''
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    let cancelled = false
    void loadCycleStats(cycle.id).then(({ stats, error }) => {
      if (cancelled) return
      if (error || !stats) {
        setLoadError(error ?? 'Could not load stats.')
        setLoading(false)
        return
      }
      setProposals(stats.proposals)
      setSessions(stats.sessions)
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [cycle.id])

  function startEdit(): void {
    setForm({
      name: cycle.name,
      local_union_id: cycle.local_union_id,
      neca_chapter_division: cycle.neca_chapter_division ?? '',
      cba_expiration_date: cycle.cba_expiration_date ?? '',
      proposed_effective_date: cycle.proposed_effective_date ?? '',
      unit_size: cycle.unit_size?.toString() ?? '',
      annual_hours: cycle.annual_hours?.toString() ?? '',
      notes: cycle.notes ?? ''
    })
    setSaveError('')
    setEditing(true)
  }

  async function handleSave(): Promise<void> {
    setSaveError('')
    if (!form.name.trim()) { setSaveError('Name is required.'); return }
    setSaving(true)
    const { data, error } = await supabase
      .from('negotiation_cycles')
      .update({
        name: form.name.trim(),
        local_union_id: form.local_union_id,
        neca_chapter_division: form.neca_chapter_division.trim() || null,
        cba_expiration_date: form.cba_expiration_date || null,
        proposed_effective_date: form.proposed_effective_date || null,
        unit_size: form.unit_size ? parseInt(form.unit_size, 10) : null,
        annual_hours: form.annual_hours ? parseInt(form.annual_hours, 10) : null,
        notes: form.notes.trim() || null
      })
      .eq('id', cycle.id)
      .select()
      .single()
    setSaving(false)
    if (error || !data) {
      const msg = describeError(error, 'Could not save.')
      setSaveError(msg)
      toast.error(msg)
      return
    }
    onUpdate(data as NegotiationCycle)
    setEditing(false)
    toast.success('Negotiation updated.')
  }

  if (loading) return <div style={{ padding: '32px', fontSize: '13px', color: '#64748B' }}>Loading…</div>
  if (loadError) return <div style={{ padding: '32px' }}><div style={errorBox}>{loadError}</div></div>

  const taRate = proposals && proposals.total > 0 ? Math.round((proposals.ta / proposals.total) * 100) : 0
  const resolvedTotal = (proposals?.ta ?? 0) + (proposals?.withdrawn ?? 0) + (proposals?.rejected ?? 0)

  return (
    <div className="page-content">
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', margin: '0 0 4px' }}>Negotiation Dashboard</h2>
        <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>At-a-glance summary of progress for {cycle.name}.</p>
      </div>

      {/* Top stat row */}
      <div className="grid-stats" style={{ marginBottom: '24px' }}>
        <StatCard label="Total Proposals" value={proposals?.total ?? 0} />
        <StatCard label="Tentatively Agreed" value={proposals?.ta ?? 0} accent="#059669" sub={`${taRate}% of all proposals`} />
        <StatCard label="Still Open" value={proposals?.open ?? 0} accent="#4F46E5" />
        <StatCard label="Sessions Held" value={sessions?.total ?? 0} sub={sessions?.lastDate ? `Last: ${formatDate(sessions.lastDate)}` : undefined} />
      </div>

      {/* Agreement progress bar */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '20px 24px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>Overall Agreement Progress</span>
          <span style={{ fontSize: '13px', color: '#64748B' }}>{taRate}% agreed</span>
        </div>
        <ProgressBar value={proposals?.ta ?? 0} total={proposals?.total ?? 0} color="#059669" />
        <div style={{ display: 'flex', gap: '20px', marginTop: '12px', flexWrap: 'wrap' }}>
          {([
            { label: 'Agreed (TA)', count: proposals?.ta ?? 0, color: '#059669', bg: '#f0fdf4' },
            { label: 'Open', count: proposals?.open ?? 0, color: '#4F46E5', bg: '#EEF2FF' },
            { label: 'Withdrawn', count: proposals?.withdrawn ?? 0, color: '#64748B', bg: '#F8FAFC' },
            { label: 'Rejected', count: proposals?.rejected ?? 0, color: '#dc2626', bg: '#fef2f2' },
          ]).map(({ label, count, color, bg }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748B' }}>
              <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '2px', background: bg, border: `1px solid ${color}`, flexShrink: 0 }} />
              <span style={{ color, fontWeight: 600 }}>{count}</span> {label}
            </div>
          ))}
        </div>
      </div>

      {/* Two-column detail cards */}
      <div className="grid-2col" style={{ marginBottom: '16px' }}>
        {/* Proposal breakdown */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '20px 24px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', marginBottom: '14px' }}>Proposals by Type</div>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '5px' }}>
              <span style={{ color: '#475569' }}>Economic</span>
              <span style={{ fontWeight: 600, color: '#0F172A' }}>{proposals?.economic ?? 0}</span>
            </div>
            <ProgressBar value={proposals?.economic ?? 0} total={proposals?.total ?? 0} color="#4F46E5" />
          </div>
          <div style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '5px' }}>
              <span style={{ color: '#475569' }}>Language</span>
              <span style={{ fontWeight: 600, color: '#0F172A' }}>{proposals?.language ?? 0}</span>
            </div>
            <ProgressBar value={proposals?.language ?? 0} total={proposals?.total ?? 0} color="#0891b2" />
          </div>
          {(proposals?.priority ?? 0) > 0 && (
            <div style={{ paddingTop: '12px', borderTop: '1px solid #F1F5F9', fontSize: '12px', color: '#64748B' }}>
              <span style={{ fontWeight: 600, color: '#B8952A' }}>{proposals?.priority}</span> priority item{proposals?.priority !== 1 ? 's' : ''} flagged
            </div>
          )}
        </div>

        {/* Sessions summary */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '20px 24px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', marginBottom: '14px' }}>Sessions Summary</div>
          <div className="grid-2col" style={{ marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '4px' }}>Sessions Held</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#0F172A' }}>{sessions?.total ?? 0}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '4px' }}>Total Attendees</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#0F172A' }}>{sessions?.attendeeCount ?? 0}</div>
            </div>
          </div>
          {sessions?.lastDate && (
            <div style={{ paddingTop: '12px', borderTop: '1px solid #F1F5F9', fontSize: '12px', color: '#64748B' }}>
              Last session: <span style={{ fontWeight: 600, color: '#0F172A' }}>{formatDate(sessions.lastDate)}</span>
            </div>
          )}
          {(sessions?.total ?? 0) === 0 && (
            <div style={{ fontSize: '12px', color: '#94A3B8' }}>No sessions recorded yet.</div>
          )}
        </div>
      </div>

      {/* Details — view + edit, folded in from the former Overview tab */}
      {editing ? (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '20px 24px', marginBottom: '16px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '16px' }}>Edit Details</div>
          <div className="grid-2col" style={{ marginBottom: '14px' }}>
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
              <label style={labelStyle}>NECA Chapter / Division</label>
              <input style={inputStyle} value={form.neca_chapter_division} onChange={(e) => setForm({ ...form, neca_chapter_division: e.target.value })} placeholder="e.g. Western Pennsylvania NECA" />
            </div>
            <div>
              <label style={labelStyle}>CBA Expiration</label>
              <input type="date" style={inputStyle} value={form.cba_expiration_date} onChange={(e) => setForm({ ...form, cba_expiration_date: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Proposed Effective Date</label>
              <input type="date" style={inputStyle} value={form.proposed_effective_date} onChange={(e) => setForm({ ...form, proposed_effective_date: e.target.value })} />
            </div>
          </div>

          <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '14px', marginBottom: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Economic Parameters</div>
            <div className="grid-2col">
              <div>
                <label style={labelStyle}>Bargaining Unit Size</label>
                <input style={inputStyle} type="number" min="1" value={form.unit_size} onChange={(e) => setForm({ ...form, unit_size: e.target.value })} placeholder="e.g. 240" />
              </div>
              <div>
                <label style={labelStyle}>Avg Compensated Hours / Member / Year</label>
                <input style={inputStyle} type="number" min="1" value={form.annual_hours} onChange={(e) => setForm({ ...form, annual_hours: e.target.value })} placeholder="e.g. 1800" />
              </div>
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
        <>
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '20px 24px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>Details</span>
              {!isLocked && <button style={{ ...btnSecondary, fontSize: '12px', padding: '5px 12px' }} onClick={startEdit}>Edit Details</button>}
            </div>
            <div className="grid-3col" style={{ rowGap: '16px' }}>
              <MetaField label="Local Union" value={localUnionLabel(unions.find((u) => u.id === cycle.local_union_id))} />
              <MetaField label="NECA Chapter / Division" value={cycle.neca_chapter_division} />
              <MetaField label="CBA Expiration" value={cycle.cba_expiration_date ? formatDate(cycle.cba_expiration_date) : null} />
              <MetaField label="Proposed Effective Date" value={cycle.proposed_effective_date ? formatDate(cycle.proposed_effective_date) : null} />
              {cycle.settled_date && <MetaField label="Settled" value={formatDate(cycle.settled_date)} />}
              <MetaField label="Bargaining Unit Size" value={cycle.unit_size ? `${cycle.unit_size.toLocaleString()} members` : null} />
              <MetaField label="Avg Hours / Member / Year" value={cycle.annual_hours ? cycle.annual_hours.toLocaleString() : null} />
            </div>
          </div>

          {cycle.notes && (
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '20px 24px', marginBottom: '16px' }}>
              <EyebrowLabel>Notes</EyebrowLabel>
              <div style={{ fontSize: '14px', color: '#475569', whiteSpace: 'pre-wrap', marginTop: '4px' }}>{cycle.notes}</div>
            </div>
          )}
        </>
      )}

      {/* Quick-nav shortcuts */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {([
          { label: 'View Proposals', tab: 'proposals' as Tab },
          { label: 'View Sessions', tab: 'sessions' as Tab },
          { label: 'Comparison Sheet', tab: 'comparison' as Tab },
        ]).map(({ label, tab }) => (
          <button key={tab} onClick={() => onTabChange(tab)} style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 500, background: '#fff', color: '#1E3A8A', border: '1px solid #CBD5E1', borderRadius: '6px', cursor: 'pointer' }}>
            {label} →
          </button>
        ))}
      </div>

      {/* Resolved tally note */}
      {resolvedTotal > 0 && (
        <div style={{ marginTop: '16px', fontSize: '12px', color: '#94A3B8', lineHeight: 1.6 }}>
          {resolvedTotal} proposal{resolvedTotal !== 1 ? 's' : ''} resolved (TA, Withdrawn, or Rejected) and no longer active.
        </div>
      )}
    </div>
  )
}

// ─── Shared meta display components (used by the Dashboard tab) ──────────────

function EyebrowLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '4px' }}>{children}</div>
}

function MetaField({ label, value, onClick }: { label: string; value: string | null; onClick?: () => void }): React.JSX.Element {
  return (
    <div>
      <EyebrowLabel>{label}</EyebrowLabel>
      {onClick ? (
        <button
          onClick={onClick}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: '#1E3A8A', textDecoration: 'underline', textUnderlineOffset: '2px' }}
        >
          {value || '—'}
        </button>
      ) : (
        <div style={{ fontSize: '14px', fontWeight: 600, color: value ? '#0F172A' : '#CBD5E1' }}>{value || '—'}</div>
      )}
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

  const [confirmDeleteSession, setConfirmDeleteSession] = useState<NegotiationSession | null>(null)
  const [deletingSession, setDeletingSession] = useState(false)
  const [confirmDeleteAttendee, setConfirmDeleteAttendee] = useState<{ session: NegotiationSession; attendee: SessionAttendee } | null>(null)
  const [deletingAttendee, setDeletingAttendee] = useState(false)

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
    <div className="page-content">
      {error && <div style={errorBox}>{error}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
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
          <div className="grid-2col" style={{ marginBottom: '12px' }}>
            <div>
              <label style={labelStyle}>Session Date <span style={{ color: '#ef4444' }}>*</span></label>
              <input type="date" style={inputStyle} value={form.session_date} onChange={(e) => setForm({ ...form, session_date: e.target.value })} autoFocus />
            </div>
            <div>
              <label style={labelStyle}>Location</label>
              <input style={inputStyle} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. NECA Office, Zoom" />
            </div>
          </div>
          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Session Notes</label>
            <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Key topics, outcomes, or action items" />
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
              <div className="grid-2col" style={{ marginBottom: '12px' }}>
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
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>{formatDate(session.session_date)}</div>
                  {session.location && <div style={{ fontSize: '13px', color: '#64748B', marginTop: '2px' }}>Location: {session.location}</div>}
                  {session.notes && <div style={{ fontSize: '13px', color: '#475569', marginTop: '8px', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{session.notes}</div>}
                </div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <button
                    style={{ ...btnSecondary, fontSize: '12px', padding: '4px 10px' }}
                    onClick={() => toggleExpand(session.id)}
                  >
                    {expanded === session.id ? 'Hide Attendees' : 'Attendees'}
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
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Attendees</span>
                    {!isLocked && showAttForm !== session.id && (
                      <button style={{ ...btnSecondary, fontSize: '12px', padding: '4px 10px' }} onClick={() => setShowAttForm(session.id)}>+ Add Attendee</button>
                    )}
                  </div>

                  {showAttForm === session.id && (
                    <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                      <div className="grid-form-1-1-1" style={{ marginBottom: '10px' }}>
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
                    <div className="grid-2col">
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

type ProposalStep = 'list' | 'economic-form' | 'language-form'

interface EconFormState {
  title: string
  article_reference: string
  section: string
  unit: UnitOption
  current_value: string
  union_value: string
  mgmt_value: string
  no_mgmt_counter: boolean
  proposed_by: '' | ProposedBy
  cost_union: string
  cost_mgmt: string
  status: ProposalStatus
  priority: boolean
  rationale: string
  last_movement: string
}

interface LangFormState {
  title: string
  article_reference: string
  section: string
  no_current_language: boolean
  current_text: string
  union_no_change: boolean
  union_text: string
  mgmt_no_change: boolean
  mgmt_text: string
  status: ProposalStatus
  priority: boolean
  rationale: string
  last_movement: string
}

const defaultEconForm: EconFormState = {
  title: '', article_reference: '', section: '', unit: '$/hr',
  current_value: '', union_value: '', mgmt_value: '',
  no_mgmt_counter: false, proposed_by: '',
  cost_union: '', cost_mgmt: '',
  status: 'Open', priority: false, rationale: '', last_movement: ''
}

const defaultLangForm: LangFormState = {
  title: '', article_reference: '', section: '',
  no_current_language: false, current_text: '',
  union_no_change: true, union_text: '',
  mgmt_no_change: true, mgmt_text: '',
  status: 'Open', priority: false, rationale: '', last_movement: ''
}

function ProposalsTab({ cycleId, isLocked }: { cycleId: ID; isLocked: boolean }): React.JSX.Element {
  const toast = useToast()
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [sessions, setSessions] = useState<NegotiationSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [step, setStep] = useState<ProposalStep>('list')
  const [editingProposal, setEditingProposal] = useState<Proposal | null>(null)

  const [econForm, setEconForm] = useState<EconFormState>(defaultEconForm)
  const [langForm, setLangForm] = useState<LangFormState>(defaultLangForm)
  // How the union/management value inputs are interpreted: as the full new
  // amount, or as an increase added to the current value.
  const [econEntryMode, setEconEntryMode] = useState<'total' | 'increase'>('total')
  // Cost impact / rationale / last movement live behind a collapsed
  // "More options" toggle so the everyday form stays short.
  const [showMoreOptions, setShowMoreOptions] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [expanded, setExpanded] = useState<ID | null>(null)
  const [positions, setPositions] = useState<Record<ID, ProposalPosition[]>>({})
  const [statusFilter, setStatusFilter] = useState<'all' | ProposalStatus>('all')

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

  function cancelForm(): void {
    setStep('list')
    setEditingProposal(null)
    setEconForm(defaultEconForm)
    setLangForm(defaultLangForm)
    setEconEntryMode('total')
    setShowMoreOptions(false)
    setSaveError('')
  }

  function startCreateEcon(): void {
    setEditingProposal(null)
    setEconForm(defaultEconForm)
    setEconEntryMode('total')
    setShowMoreOptions(false)
    setSaveError('')
    setStep('economic-form')
  }

  function startCreateLang(): void {
    setEditingProposal(null)
    setLangForm(defaultLangForm)
    setSaveError('')
    setStep('language-form')
  }

  // Live hint under a union/management value input: shows the computed total
  // in increase mode, or the change vs current in total mode.
  function econHint(valueStr: string): React.JSX.Element | null {
    const cur = parseFloat(econForm.current_value)
    const val = parseFloat(valueStr)
    if (Number.isNaN(cur) || Number.isNaN(val)) return null
    let text: string
    if (econEntryMode === 'increase') {
      text = `= ${fmtUnitVal(round2(cur + val), econForm.unit)} total`
    } else {
      const d = round2(val - cur)
      text = d === 0 ? 'No change vs current' : `${d > 0 ? '+' : '−'}${fmtUnitVal(Math.abs(d), econForm.unit)} vs current`
    }
    return <div style={{ fontSize: '11px', color: '#1E3A8A', fontWeight: 600, marginTop: '4px' }}>{text}</div>
  }

  function startEditEcon(p: Proposal): void {
    setEconForm({
      title: p.title,
      article_reference: p.article_reference ?? '',
      section: p.section ?? '',
      unit: (p.unit as UnitOption) ?? '$/hr',
      current_value: p.current_value?.toString() ?? '',
      union_value: p.union_value?.toString() ?? '',
      mgmt_value: p.mgmt_value?.toString() ?? '',
      no_mgmt_counter: p.mgmt_value == null,
      proposed_by: p.proposed_by ?? '',
      cost_union: p.cost_union?.toString() ?? '',
      cost_mgmt: p.cost_mgmt?.toString() ?? '',
      status: p.status,
      priority: p.priority,
      rationale: p.rationale ?? '',
      last_movement: p.last_movement ?? ''
    })
    setEditingProposal(p)
    setEconEntryMode('total')
    // Auto-expand when the proposal already has data in the optional fields
    setShowMoreOptions(p.cost_union != null || p.cost_mgmt != null || !!p.rationale || !!p.last_movement)
    setStep('economic-form')
  }

  function startEditLang(p: Proposal): void {
    setLangForm({
      title: p.title,
      article_reference: p.article_reference ?? '',
      section: p.section ?? '',
      no_current_language: p.current_text == null,
      current_text: p.current_text ?? '',
      union_no_change: !p.union_change,
      union_text: p.union_text ?? '',
      mgmt_no_change: !p.mgmt_change,
      mgmt_text: p.mgmt_text ?? '',
      status: p.status,
      priority: p.priority,
      rationale: p.rationale ?? '',
      last_movement: p.last_movement ?? ''
    })
    setEditingProposal(p)
    setStep('language-form')
  }

  // Shared insert/update plumbing for both proposal forms.
  async function saveProposal(payload: Record<string, unknown>): Promise<void> {
    if (editingProposal) {
      const { data, error: err } = await supabase.from('proposals').update(payload).eq('id', editingProposal.id).select().single()
      setSaving(false)
      if (err || !data) { setSaveError(describeError(err, 'Could not save.')); toast.error('Could not save.'); return }
      setProposals((prev) => prev.map((p) => p.id === editingProposal.id ? data as Proposal : p))
      toast.success('Proposal updated.')
    } else {
      const { data, error: err } = await supabase.from('proposals').insert(payload).select().single()
      setSaving(false)
      if (err || !data) { setSaveError(describeError(err, 'Could not save.')); toast.error('Could not save.'); return }
      setProposals((prev) => [...prev, data as Proposal])
      toast.success('Proposal added.')
    }
    cancelForm()
  }

  async function handleSaveEcon(): Promise<void> {
    setSaveError('')
    if (!econForm.title.trim()) { setSaveError('Item name is required.'); return }
    if (!econForm.current_value) { setSaveError('Current value is required.'); return }
    if (!econForm.union_value) { setSaveError(econEntryMode === 'increase' ? 'Union increase is required.' : 'Union position is required.'); return }

    const cur = parseFloat(econForm.current_value)
    const unionRaw = parseFloat(econForm.union_value)
    const mgmtRaw = econForm.no_mgmt_counter ? null : (econForm.mgmt_value ? parseFloat(econForm.mgmt_value) : null)
    if (Number.isNaN(cur) || Number.isNaN(unionRaw) || (mgmtRaw !== null && Number.isNaN(mgmtRaw))) {
      setSaveError('Values must be numbers.')
      return
    }
    // In increase mode the inputs are deltas; store the computed totals so
    // every consumer (cards, comparison sheet, report) keeps working unchanged.
    const unionVal = econEntryMode === 'increase' ? round2(cur + unionRaw) : unionRaw
    const mgmtVal = mgmtRaw === null ? null : (econEntryMode === 'increase' ? round2(cur + mgmtRaw) : mgmtRaw)
    setSaving(true)

    const payload = {
      cycle_id: cycleId,
      title: econForm.title.trim(),
      category: 'Economic' as ProposalCategory,
      article_reference: econForm.article_reference.trim() || null,
      section: econForm.section.trim() || null,
      unit: econForm.unit,
      format: unitToFormat(econForm.unit),
      current_value: cur,
      union_value: unionVal,
      mgmt_value: mgmtVal,
      proposed_by: econForm.proposed_by || null,
      cost_union: econForm.cost_union ? parseFloat(econForm.cost_union) : null,
      cost_mgmt: econForm.cost_mgmt ? parseFloat(econForm.cost_mgmt) : null,
      status: econForm.status,
      priority: econForm.priority,
      rationale: econForm.rationale.trim() || null,
      last_movement: econForm.last_movement.trim() || null,
      sort_order: editingProposal ? editingProposal.sort_order : proposals.length
    }

    await saveProposal(payload)
  }

  async function handleSaveLang(): Promise<void> {
    setSaveError('')
    if (!langForm.title.trim()) { setSaveError('Provision name is required.'); return }
    setSaving(true)

    const payload = {
      cycle_id: cycleId,
      title: langForm.title.trim(),
      category: 'Language' as ProposalCategory,
      article_reference: langForm.article_reference.trim() || null,
      section: langForm.section.trim() || null,
      current_text: langForm.no_current_language ? null : (langForm.current_text.trim() || null),
      union_change: !langForm.union_no_change,
      union_text: !langForm.union_no_change ? (langForm.union_text.trim() || null) : null,
      mgmt_change: !langForm.mgmt_no_change,
      mgmt_text: !langForm.mgmt_no_change ? (langForm.mgmt_text.trim() || null) : null,
      status: langForm.status,
      priority: langForm.priority,
      rationale: langForm.rationale.trim() || null,
      last_movement: langForm.last_movement.trim() || null,
      sort_order: editingProposal ? editingProposal.sort_order : proposals.length
    }

    await saveProposal(payload)
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

  async function handleAddPosition(
    proposalId: ID,
    values: { side: PositionSide; session_id: ID | null; position_text: string }
  ): Promise<void> {
    const text = values.position_text.trim()
    if (!text) return
    const { data, error: err } = await supabase
      .from('proposal_positions')
      .insert({ proposal_id: proposalId, session_id: values.session_id, side: values.side, position_text: text })
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

  // ── Economic form ─────────────────────────────────────────────────────────
  if (step === 'economic-form') {
    const isEdit = editingProposal !== null
    return (
      <div className="page-content">
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '20px' }}>
          {isEdit ? 'Edit Economic Proposal' : 'New Economic Proposal'}
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '24px' }}>
          <div className="grid-2col" style={{ marginBottom: '14px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Item Name <span style={{ color: '#ef4444' }}>*</span></label>
              <input style={inputStyle} value={econForm.title} autoFocus onChange={(e) => setEconForm({ ...econForm, title: e.target.value })} placeholder="e.g. Base journeyman wage" />
            </div>
            <div>
              <label style={labelStyle}>Article</label>
              <input style={inputStyle} value={econForm.article_reference} onChange={(e) => setEconForm({ ...econForm, article_reference: e.target.value })} placeholder="e.g. Article 5" />
            </div>
            <div>
              <label style={labelStyle}>Section</label>
              <input style={inputStyle} value={econForm.section} onChange={(e) => setEconForm({ ...econForm, section: e.target.value })} placeholder="e.g. 5.01" />
            </div>
            <div>
              <label style={labelStyle}>Unit <span style={{ color: '#ef4444' }}>*</span></label>
              <select style={inputStyle} value={econForm.unit} onChange={(e) => setEconForm({ ...econForm, unit: e.target.value as UnitOption })}>
                {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Proposed By</label>
              <select style={inputStyle} value={econForm.proposed_by} onChange={(e) => setEconForm({ ...econForm, proposed_by: e.target.value as '' | ProposedBy })}>
                <option value="">—</option>
                <option value="Union">Union</option>
                <option value="Management">Management</option>
                <option value="Joint">Joint</option>
              </select>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '16px', marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>Positions</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '14px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', color: '#64748B' }}>Enter positions as:</span>
              {([['total', 'Total amount'], ['increase', 'Increase over current']] as const).map(([mode, label]) => (
                <label key={mode} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', color: '#475569' }}>
                  <input type="radio" name="econ-entry-mode" checked={econEntryMode === mode} onChange={() => setEconEntryMode(mode)} />
                  {label}
                </label>
              ))}
            </div>
            <div className="grid-2col" style={{ marginBottom: '14px' }}>
              <div>
                <label style={labelStyle}>Current Value <span style={{ color: '#ef4444' }}>*</span></label>
                <input style={inputStyle} type="number" step="any" value={econForm.current_value} onChange={(e) => setEconForm({ ...econForm, current_value: e.target.value })} placeholder="What the contract says now" />
              </div>
              <div>
                <label style={labelStyle}>{econEntryMode === 'increase' ? 'Union Proposed Increase' : 'Union Position'} <span style={{ color: '#ef4444' }}>*</span></label>
                <input
                  style={inputStyle}
                  type="number" step="any"
                  value={econForm.union_value}
                  onChange={(e) => setEconForm({ ...econForm, union_value: e.target.value })}
                  placeholder={econEntryMode === 'increase' ? 'e.g. 2.00' : "Union's proposed value"}
                />
                {econHint(econForm.union_value)}
              </div>
              <div>
                <label style={labelStyle}>{econEntryMode === 'increase' ? 'Management Proposed Increase' : 'Management Position'}</label>
                <input
                  style={{ ...inputStyle, opacity: econForm.no_mgmt_counter ? 0.4 : 1 }}
                  type="number" step="any"
                  value={econForm.no_mgmt_counter ? '' : econForm.mgmt_value}
                  disabled={econForm.no_mgmt_counter}
                  onChange={(e) => setEconForm({ ...econForm, mgmt_value: e.target.value })}
                  placeholder={econEntryMode === 'increase' ? 'e.g. 1.25' : "Management's counter"}
                />
                {!econForm.no_mgmt_counter && econHint(econForm.mgmt_value)}
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', cursor: 'pointer', fontSize: '12px', color: '#64748B' }}>
                  <input type="checkbox" checked={econForm.no_mgmt_counter} onChange={(e) => setEconForm({ ...econForm, no_mgmt_counter: e.target.checked, mgmt_value: '' })} />
                  No counter yet
                </label>
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '16px', marginBottom: '16px' }}>
            <div className="grid-2col">
              <div>
                <label style={labelStyle}>Status <span style={{ color: '#ef4444' }}>*</span></label>
                <select style={inputStyle} value={econForm.status} onChange={(e) => setEconForm({ ...econForm, status: e.target.value as ProposalStatus })}>
                  {PROPOSAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', paddingTop: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#475569' }}>
                  <input type="checkbox" checked={econForm.priority} onChange={(e) => setEconForm({ ...econForm, priority: e.target.checked })} />
                  Key issue (priority item)
                </label>
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '16px', marginBottom: '16px' }}>
            <button
              type="button"
              onClick={() => setShowMoreOptions((v) => !v)}
              aria-expanded={showMoreOptions}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '13px', fontWeight: 600, color: '#1E3A8A' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: showMoreOptions ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
                <polyline points="9 18 15 12 9 6"/>
              </svg>
              More options (cost impact, rationale, last movement)
            </button>
            {showMoreOptions && (
              <div style={{ marginTop: '14px' }}>
                <div className="grid-2col" style={{ marginBottom: '14px' }}>
                  <div>
                    <label style={labelStyle}>Union $/hr impact</label>
                    <input style={inputStyle} type="number" step="any" value={econForm.cost_union} onChange={(e) => setEconForm({ ...econForm, cost_union: e.target.value })} placeholder="e.g. 2.50" />
                  </div>
                  <div>
                    <label style={labelStyle}>Management $/hr impact</label>
                    <input style={inputStyle} type="number" step="any" value={econForm.cost_mgmt} onChange={(e) => setEconForm({ ...econForm, cost_mgmt: e.target.value })} placeholder="e.g. 1.25" />
                  </div>
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>Rationale</label>
                  <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }} value={econForm.rationale} onChange={(e) => setEconForm({ ...econForm, rationale: e.target.value })} placeholder="Union or management rationale for this position" />
                </div>
                <div>
                  <label style={labelStyle}>Last Movement</label>
                  <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '50px' }} value={econForm.last_movement} onChange={(e) => setEconForm({ ...econForm, last_movement: e.target.value })} placeholder="e.g. Mgmt moved +$0.25/hr at Mar 18 session" />
                </div>
              </div>
            )}
          </div>

          {saveError && <div style={errorBox}>{saveError}</div>}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              style={{ ...btnPrimary, opacity: saving ? 0.5 : 1 }}
              disabled={saving}
              onClick={handleSaveEcon}
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Proposal'}
            </button>
            <button style={btnSecondary} onClick={cancelForm}>Cancel</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Language form ─────────────────────────────────────────────────────────
  if (step === 'language-form') {
    const isEdit = editingProposal !== null
    return (
      <div className="page-content">
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '20px' }}>
          {isEdit ? 'Edit Language Proposal' : 'New Language Proposal'}
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '24px' }}>
          <div className="grid-2col" style={{ marginBottom: '14px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Provision Name <span style={{ color: '#ef4444' }}>*</span></label>
              <input style={inputStyle} value={langForm.title} autoFocus onChange={(e) => setLangForm({ ...langForm, title: e.target.value })} placeholder="e.g. Regular working hours" />
            </div>
            <div>
              <label style={labelStyle}>Article</label>
              <input style={inputStyle} value={langForm.article_reference} onChange={(e) => setLangForm({ ...langForm, article_reference: e.target.value })} placeholder="e.g. Article 4" />
            </div>
            <div>
              <label style={labelStyle}>Section</label>
              <input style={inputStyle} value={langForm.section} onChange={(e) => setLangForm({ ...langForm, section: e.target.value })} placeholder="e.g. 4.01" />
            </div>
          </div>

          <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '16px', marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Current Language</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#475569', marginBottom: '10px' }}>
              <input type="checkbox" checked={langForm.no_current_language} onChange={(e) => setLangForm({ ...langForm, no_current_language: e.target.checked, current_text: '' })} />
              No current language (this is a new clause)
            </label>
            {!langForm.no_current_language && (
              <textarea
                style={{ ...inputStyle, resize: 'vertical', minHeight: '80px' }}
                value={langForm.current_text}
                onChange={(e) => setLangForm({ ...langForm, current_text: e.target.value })}
                placeholder="Current contract text"
              />
            )}
          </div>

          <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '16px', marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#1E3A8A', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Union Position</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#475569' }}>
                <input type="radio" name="union-pos" checked={langForm.union_no_change} onChange={() => setLangForm({ ...langForm, union_no_change: true })} />
                No change proposed (accepts current language)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#475569' }}>
                <input type="radio" name="union-pos" checked={!langForm.union_no_change} onChange={() => setLangForm({ ...langForm, union_no_change: false })} />
                Proposes new/modified language
              </label>
              {!langForm.union_no_change && (
                <textarea
                  style={{ ...inputStyle, resize: 'vertical', minHeight: '80px', marginTop: '4px' }}
                  value={langForm.union_text}
                  onChange={(e) => setLangForm({ ...langForm, union_text: e.target.value })}
                  placeholder="Union's proposed language"
                />
              )}
            </div>
          </div>

          <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '16px', marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Management Position</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#475569' }}>
                <input type="radio" name="mgmt-pos" checked={langForm.mgmt_no_change} onChange={() => setLangForm({ ...langForm, mgmt_no_change: true })} />
                No change proposed (accepts current language)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#475569' }}>
                <input type="radio" name="mgmt-pos" checked={!langForm.mgmt_no_change} onChange={() => setLangForm({ ...langForm, mgmt_no_change: false })} />
                Proposes new/modified language
              </label>
              {!langForm.mgmt_no_change && (
                <textarea
                  style={{ ...inputStyle, resize: 'vertical', minHeight: '80px', marginTop: '4px' }}
                  value={langForm.mgmt_text}
                  onChange={(e) => setLangForm({ ...langForm, mgmt_text: e.target.value })}
                  placeholder="Management's proposed language"
                />
              )}
            </div>
          </div>

          <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '16px', marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '14px' }}>Status and Notes</div>
            <div className="grid-2col" style={{ marginBottom: '14px' }}>
              <div>
                <label style={labelStyle}>Status <span style={{ color: '#ef4444' }}>*</span></label>
                <select style={inputStyle} value={langForm.status} onChange={(e) => setLangForm({ ...langForm, status: e.target.value as ProposalStatus })}>
                  {PROPOSAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', paddingTop: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#475569' }}>
                  <input type="checkbox" checked={langForm.priority} onChange={(e) => setLangForm({ ...langForm, priority: e.target.checked })} />
                  Key issue (priority item)
                </label>
              </div>
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Drafting Note / Rationale</label>
              <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }} value={langForm.rationale} onChange={(e) => setLangForm({ ...langForm, rationale: e.target.value })} placeholder="Context for this provision" />
            </div>
            <div>
              <label style={labelStyle}>Last Movement</label>
              <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '50px' }} value={langForm.last_movement} onChange={(e) => setLangForm({ ...langForm, last_movement: e.target.value })} placeholder="e.g. Management opened the proposal Mar 18" />
            </div>
          </div>

          {saveError && <div style={errorBox}>{saveError}</div>}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              style={{ ...btnPrimary, opacity: saving ? 0.5 : 1 }}
              disabled={saving}
              onClick={handleSaveLang}
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Proposal'}
            </button>
            <button style={btnSecondary} onClick={cancelForm}>Cancel</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Proposal list ─────────────────────────────────────────────────────────
  return (
    <div className="page-content">
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
        {!isLocked && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={btnPrimary} onClick={startCreateEcon}>+ Economic Proposal</button>
            <button style={btnPrimary} onClick={startCreateLang}>+ Language Proposal</button>
          </div>
        )}
      </div>

      {proposals.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 24px' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 16px', display: 'block' }} aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>No proposals yet</div>
          <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '20px' }}>Add economic items or language provisions being negotiated.</div>
          {!isLocked && (
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <button style={btnPrimary} onClick={startCreateEcon}>+ Economic Proposal</button>
              <button style={btnPrimary} onClick={startCreateLang}>+ Language Proposal</button>
            </div>
          )}
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
                  onToggle={() => {
                    if (expanded === p.id) setExpanded(null)
                    else { setExpanded(p.id); void loadPositions(p.id) }
                  }}
                  onStatusChange={(s) => handleStatusChange(p, s)}
                  onDelete={() => setConfirmDeleteProposal(p)}
                  onEdit={() => p.category === 'Economic' ? startEditEcon(p) : startEditLang(p)}
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
                  onToggle={() => {
                    if (expanded === p.id) setExpanded(null)
                    else { setExpanded(p.id); void loadPositions(p.id) }
                  }}
                  onStatusChange={(s) => handleStatusChange(p, s)}
                  onDelete={() => setConfirmDeleteProposal(p)}
                  onEdit={() => p.category === 'Economic' ? startEditEcon(p) : startEditLang(p)}
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
  onEdit: () => void
  onAddPosition: (values: { side: PositionSide; session_id: ID | null; position_text: string }) => void | Promise<void>
  onDeletePosition: (pos: ProposalPosition) => void
}

function ProposalCard({ proposal, sessions, positions, expanded, isLocked, onToggle, onStatusChange, onDelete, onEdit, onAddPosition, onDeletePosition }: ProposalCardProps): React.JSX.Element {
  const [showPosForm, setShowPosForm] = useState(false)
  const [posForm, setPosForm] = useState<{ side: PositionSide; session_id: string; position_text: string }>({
    side: 'Management', session_id: '', position_text: ''
  })
  const [posSaving, setPosSaving] = useState(false)

  const sc = PROPOSAL_STATUS_COLORS[proposal.status]
  const isEcon = proposal.category === 'Economic'
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

  // Economic quick summary
  function econSummary(): string | null {
    const cur = proposal.current_value
    const uni = proposal.union_value
    const mgmt = proposal.mgmt_value
    if (cur == null && uni == null) return null
    const fmt = (v: number | null) => v == null ? '—' : (proposal.unit === '%' ? `${v}%` : `$${v}`)
    const delta = (v: number | null): string => {
      if (v == null || cur == null) return ''
      const d = round2(v - cur)
      if (d === 0) return ''
      return ` (${d > 0 ? '+' : '−'}${fmt(Math.abs(d))})`
    }
    return `Current: ${fmt(cur)} → Union: ${fmt(uni)}${delta(uni)}${mgmt != null ? ` → Mgmt: ${fmt(mgmt)}${delta(mgmt)}` : ''}`
  }

  // Language quick summary
  function langSummary(): string {
    const u = proposal.union_change ? 'Change proposed' : 'No change'
    const m = proposal.mgmt_change ? 'Change proposed' : 'No change'
    return `Union: ${u} · Mgmt: ${m}`
  }

  return (
    <div style={{ ...card, marginBottom: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
            {/* Type badge */}
            <span style={{
              fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.04em',
              background: isEcon ? '#FFFBEB' : '#EFF6FF',
              color: isEcon ? '#92400E' : '#1E3A8A',
              border: isEcon ? '1px solid #FDE68A' : '1px solid #BFD3F2'
            }}>
              {proposal.category}
            </span>
            {proposal.article_reference && (
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#94A3B8' }}>
                {proposal.article_reference}{proposal.section ? ` · § ${proposal.section}` : ''}
              </span>
            )}
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>{proposal.title}</span>
            <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
              {proposal.status}
            </span>
            {proposal.priority && (
              <span
                aria-label="Key issue"
                title="Key issue"
                style={{ display: 'inline-block', width: 8, height: 8, background: '#92400E', transform: 'rotate(45deg)', borderRadius: 1, flexShrink: 0 }}
              />
            )}
          </div>
          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
            {isEcon ? (econSummary() ?? 'No values entered') : langSummary()}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center' }}>
          <button style={{ ...btnSecondary, fontSize: '12px', padding: '4px 10px' }} onClick={onToggle}>
            {expanded ? 'Collapse' : 'History'}
          </button>
          {!isLocked && (
            <>
              <button style={{ ...btnSecondary, fontSize: '12px', padding: '4px 10px' }} onClick={onEdit}>Edit</button>
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
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>Position History</div>
          <div className="grid-2col" style={{ marginBottom: '14px' }}>
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
                <div className="grid-2col" style={{ marginBottom: '10px' }}>
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
              <button style={{ ...btnSecondary, fontSize: '12px', padding: '5px 12px' }} onClick={() => setShowPosForm(true)}>+ Add Position Note</button>
            )
          )}
        </div>
      )}
    </div>
  )
}

// ─── Documents Tab ────────────────────────────────────────────────────────────

const DOC_ROLES: { value: NegotiationDocumentRole; label: string }[] = [
  { value: 'opening_letter',   label: 'Opening Letter' },
  { value: 'meeting_minutes',  label: 'Meeting Minutes' },
  { value: 'proposal',         label: 'Proposal' },
  { value: 'final_agreement',  label: 'Final Agreement' },
  { value: 'arbitration',      label: 'Arbitration' },
  { value: 'other',            label: 'Other' },
]

const ROLE_COLORS: Record<NegotiationDocumentRole, { bg: string; color: string; border: string }> = {
  opening_letter:  { bg: '#EEF2FF', color: '#4F46E5', border: '#C7D2FE' },
  meeting_minutes: { bg: '#f0fdf4', color: '#059669', border: '#bbf7d0' },
  proposal:        { bg: '#fff7ed', color: '#ea580c', border: '#fed7aa' },
  final_agreement: { bg: '#fefce8', color: '#ca8a04', border: '#fef08a' },
  arbitration:     { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  other:           { bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' },
}

function DocumentsTab({
  cycleId,
  chapterId,
  isLocked,
}: {
  cycleId: ID
  chapterId: ID
  isLocked: boolean
}): React.JSX.Element {
  const toast = useToast()
  const [docs, setDocs] = useState<NegotiationDocument[]>([])
  const [loadedFor, setLoadedFor] = useState<ID | null>(null)
  const [roleFilter, setRoleFilter] = useState<NegotiationDocumentRole | 'all'>('all')

  const [showUpload, setShowUpload] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<NegotiationDocumentRole>('other')
  const [notes, setNotes] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const [confirmDelete, setConfirmDelete] = useState<NegotiationDocument | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let cancelled = false
    void supabase
      .from('negotiation_documents')
      .select('*')
      .eq('cycle_id', cycleId)
      .order('uploaded_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          toast.error('Could not load documents: ' + describeError(err))
          setDocs([])
        } else {
          setDocs((data ?? []) as NegotiationDocument[])
        }
        setLoadedFor(cycleId)
      })
    return () => { cancelled = true }
  }, [cycleId, toast])

  const loading = loadedFor !== cycleId
  const filtered = roleFilter === 'all' ? docs : docs.filter((d) => d.role === roleFilter)

  function pickFile(f: File | null): void {
    setUploadError('')
    setFile(f)
    if (f && !displayName.trim()) setDisplayName(f.name)
  }

  async function handleUpload(): Promise<void> {
    if (!file) return
    setUploadError('')
    const name = displayName.trim() || file.name

    const v = validateUpload(file, 'negotiationDocuments')
    if (v) { setUploadError(v.message); return }

    setUploading(true)
    const path = buildStoragePath(cycleId, file.name)
    const { error: uploadErr } = await supabase.storage
      .from(STORAGE_BUCKETS.negotiationDocuments.name)
      .upload(path, file, { contentType: file.type || undefined, upsert: false })
    if (uploadErr) {
      setUploading(false)
      const msg = describeError(uploadErr, 'Upload failed.')
      setUploadError(msg)
      toast.error(msg)
      return
    }

    const { data, error: dbErr } = await supabase
      .from('negotiation_documents')
      .insert({
        cycle_id: cycleId,
        chapter_id: chapterId,
        file_name: name,
        file_path: path,
        file_size: file.size,
        mime_type: file.type || null,
        role,
        notes: notes.trim() || null,
      })
      .select()
      .single()
    if (dbErr || !data) {
      await supabase.storage.from(STORAGE_BUCKETS.negotiationDocuments.name).remove([path])
      setUploading(false)
      const msg = describeError(dbErr, 'Saved the file, but could not record it. Try again.')
      setUploadError(msg)
      toast.error(msg)
      return
    }

    setUploading(false)
    setDocs((prev) => [data as NegotiationDocument, ...prev])
    setFile(null)
    setDisplayName('')
    setRole('other')
    setNotes('')
    setShowUpload(false)
    toast.success('Document uploaded.')
  }

  async function handleDownload(doc: NegotiationDocument): Promise<void> {
    const { url, error } = await createSignedDownloadUrl('negotiationDocuments', doc.file_path)
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
      .from('negotiation_documents')
      .delete()
      .eq('id', confirmDelete.id)
    if (dbErr) {
      setDeleting(false)
      toast.error('Could not delete: ' + describeError(dbErr))
      return
    }
    const { error: storageErr } = await supabase.storage
      .from(STORAGE_BUCKETS.negotiationDocuments.name)
      .remove([confirmDelete.file_path])
    setDeleting(false)
    if (storageErr) {
      toast.error('Document removed, but the file could not be deleted from storage. ' + describeError(storageErr))
    } else {
      toast.success('Document deleted.')
    }
    setDocs((prev) => prev.filter((d) => d.id !== confirmDelete.id))
    setConfirmDelete(null)
  }

  return (
    <div style={{ padding: '24px', maxWidth: '960px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>Documents</div>
          <div style={{ fontSize: '13px', color: '#64748B', marginTop: '2px' }}>Opening letters, minutes, proposals, and agreements for this negotiation.</div>
        </div>
        {!isLocked && !showUpload && (
          <button style={{ ...btnPrimary, fontSize: '13px' }} onClick={() => setShowUpload(true)}>+ Upload Document</button>
        )}
      </div>

      {showUpload && (
        <div style={{ ...card, borderColor: '#1E3A8A', borderWidth: '1.5px', marginBottom: '24px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '16px' }}>Upload Document</div>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>File <span style={{ color: '#ef4444' }}>*</span></label>
            <input type="file" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} style={{ fontSize: '13px' }} aria-label="Choose negotiation document to upload" />
            {file && (
              <div style={{ fontSize: '12px', color: '#64748B', marginTop: '6px' }}>
                {file.name} · {formatBytes(file.size)}{file.type ? ` · ${file.type}` : ''}
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={labelStyle}>Display Name</label>
              <input style={inputStyle} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Defaults to the file name" />
            </div>
            <div>
              <label style={labelStyle}>Document Type</label>
              <select style={inputStyle} value={role} onChange={(e) => setRole(e.target.value as NegotiationDocumentRole)}>
                {DOC_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>Notes <span style={{ fontWeight: 400, color: '#94A3B8' }}>(optional)</span></label>
            <input style={inputStyle} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Session 3 — ratified draft" />
          </div>
          {uploadError && <div style={errorBox}>{uploadError}</div>}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              style={{ ...btnPrimary, fontSize: '13px', opacity: !file || uploading ? 0.5 : 1 }}
              disabled={!file || uploading}
              onClick={handleUpload}
            >
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
            <button
              style={{ ...btnSecondary, fontSize: '13px' }}
              disabled={uploading}
              onClick={() => { setShowUpload(false); setFile(null); setDisplayName(''); setRole('other'); setNotes(''); setUploadError('') }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setRoleFilter('all')}
          style={{ fontSize: '12px', padding: '4px 12px', borderRadius: '20px', border: '1px solid', cursor: 'pointer', background: roleFilter === 'all' ? '#1E3A8A' : '#fff', color: roleFilter === 'all' ? '#fff' : '#64748B', borderColor: roleFilter === 'all' ? '#1E3A8A' : '#E2E8F0' }}
        >
          All
        </button>
        {DOC_ROLES.map((r) => (
          <button
            key={r.value}
            onClick={() => setRoleFilter(r.value)}
            style={{ fontSize: '12px', padding: '4px 12px', borderRadius: '20px', border: '1px solid', cursor: 'pointer', background: roleFilter === r.value ? '#1E3A8A' : '#fff', color: roleFilter === r.value ? '#fff' : '#64748B', borderColor: roleFilter === r.value ? '#1E3A8A' : '#E2E8F0' }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ fontSize: '13px', color: '#64748B' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        docs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 24px' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 16px', display: 'block' }} aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#64748B', marginBottom: '8px' }}>No documents yet</div>
            <div style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '20px' }}>Upload opening letters, session minutes, proposals, and agreements to keep everything in one place.</div>
            {!isLocked && <button style={btnPrimary} onClick={() => setShowUpload(true)}>Upload First Document</button>}
          </div>
        ) : (
          <div style={{ fontSize: '13px', color: '#94A3B8', padding: '24px 0' }}>No documents match that filter.</div>
        )
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
          {filtered.map((doc, idx) => {
            const rc = ROLE_COLORS[doc.role]
            const roleLabel = DOC_ROLES.find((r) => r.value === doc.role)?.label ?? doc.role
            return (
              <div
                key={doc.id}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderTop: idx > 0 ? '1px solid #F1F5F9' : 'none', gap: '12px' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  <div style={{ minWidth: 0 }}>
                    <button
                      onClick={() => handleDownload(doc)}
                      style={{ background: 'none', border: 'none', padding: 0, color: '#1E3A8A', fontWeight: 600, fontSize: '13px', cursor: 'pointer', textAlign: 'left', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '400px' }}
                    >
                      {doc.file_name}
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, padding: '1px 7px', borderRadius: '20px', background: rc.bg, color: rc.color, border: `1px solid ${rc.border}` }}>
                        {roleLabel}
                      </span>
                      <span style={{ fontSize: '11px', color: '#94A3B8' }}>
                        {formatBytes(doc.file_size)} · {formatDate(doc.uploaded_at.slice(0, 10))}
                      </span>
                      {doc.notes && (
                        <span style={{ fontSize: '11px', color: '#64748B', fontStyle: 'italic' }}>{doc.notes}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <button
                    style={{ ...btnSecondary, fontSize: '12px', padding: '4px 10px' }}
                    onClick={() => handleDownload(doc)}
                  >
                    Download
                  </button>
                  {!isLocked && (
                    <button
                      style={{ ...btnDanger, fontSize: '12px', padding: '4px 10px' }}
                      onClick={() => setConfirmDelete(doc)}
                      aria-label={`Delete ${doc.file_name}`}
                      title={`Delete ${doc.file_name}`}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete Document"
        message={confirmDelete ? `Delete "${confirmDelete.file_name}"? This cannot be undone.` : ''}
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
