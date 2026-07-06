// ComparisonSheet — main shell for the Negotiation Comparison Sheet.
// Owns mode + filter state; fetches proposals and positions from Supabase;
// renders the header, summary strip, filter tabs, and the active grid.
import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { describeError } from '../../lib/errors'
import { useToast } from '../../lib/toast'
import { toSheetStatus, formatMoney, COLS, type SheetStatus } from '../../lib/comparison-utils'
import { NEG_STATUS_COLORS } from '../../lib/ui'
import { ModeToggle, FilterTabs, Pill, type ComparisonMode, type FilterValue } from './primitives'
import EconomicGrid from './EconomicGrid'
import LanguageGrid from './LanguageGrid'
import type { ID, NegotiationCycle, LocalUnion, Proposal, ProposalPosition, NegotiationSession } from '../../lib/types'

// ─── Props ────────────────────────────────────────────────────────────────────

interface ComparisonSheetProps {
  cycle: NegotiationCycle
  union: LocalUnion | null
}

// ─── Summary strip (economic mode) ───────────────────────────────────────────

// Fallback compensated hours per year when the negotiation cycle doesn't
// specify annual_hours. Matches the form placeholder shown in the Overview tab.
const DEFAULT_ANNUAL_HOURS = 1800

function EconSummary({ proposals, annualHours }: {
  proposals: Proposal[]
  annualHours: number | null
  positions?: Record<string, ProposalPosition[]>
}): React.JSX.Element {
  const econProps = proposals.filter((p) => p.category === 'Economic')

  const counts = { total: econProps.length, open: 0, agreed: 0, tabled: 0 }
  econProps.forEach((p) => { counts[toSheetStatus(p.status)]++ })

  // Rollup: sum directly from the cost_union / cost_mgmt fields stored on each proposal
  let unionHr = 0, mgmtHr = 0
  econProps.forEach((p) => {
    if (p.cost_union != null) unionHr += p.cost_union
    if (p.cost_mgmt != null) mgmtHr += p.cost_mgmt
  })
  const gapHr = Math.abs(unionHr - mgmtHr)

  const Count = ({ n, label, color }: { n: number; label: string; color: string }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
      <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color }}>{label}</span>
    </div>
  )

  const CostTile = ({ col, value, sub }: { col: { label: string; accent: string; bg: string; line: string }; value: string; sub: string }) => (
    <div style={{ flex: 1, minWidth: 0, padding: '12px 16px', borderRadius: 8, background: col.bg, border: `1px solid ${col.line}` }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: col.accent, marginBottom: 6 }}>{col.label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>{sub}</div>
    </div>
  )

  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'stretch', marginTop: 18, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: 24, alignItems: 'center', padding: '4px 4px 4px 0' }}>
        <Count n={counts.total} label="Items" color="#64748B" />
        <div style={{ width: 1, alignSelf: 'stretch', background: '#E2E8F0' }} />
        <Count n={counts.open} label="Open" color="#1E3A8A" />
        <Count n={counts.agreed} label="Agreed" color="#059669" />
        <Count n={counts.tabled} label="Tabled" color="#64748B" />
      </div>
      <div style={{ width: 1, alignSelf: 'stretch', background: '#E2E8F0' }} />
      <div style={{ flex: 1, minWidth: 360 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748B' }}>Package cost · per compensated hour</span>
          {gapHr > 0 && <span style={{ fontSize: 12, color: '#92400E', fontWeight: 600 }}>Parties {formatMoney(gapHr * (annualHours ?? DEFAULT_ANNUAL_HOURS))}/yr apart (est.)</span>}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <CostTile col={COLS.uni} value={unionHr > 0 ? `+$${unionHr.toFixed(2)}` : '—'} sub="union ask vs. current" />
          <CostTile col={COLS.mgmt} value={mgmtHr > 0 ? `+$${mgmtHr.toFixed(2)}` : '—'} sub="mgmt offer vs. current" />
          <CostTile col={{ label: 'Gap', accent: '#0F172A', bg: '#fff', line: '#CBD5E1' }} value={gapHr > 0 ? `$${gapHr.toFixed(2)}` : '—'} sub="distance to close" />
        </div>
      </div>
    </div>
  )
}

// ─── Language summary (language mode) ────────────────────────────────────────

function LangSummary({ proposals }: {
  proposals: Proposal[]
  positions?: Record<string, ProposalPosition[]>
}): React.JSX.Element {
  const langProps = proposals.filter((p) => p.category === 'Language')

  const counts = { total: langProps.length, open: 0, agreed: 0, tabled: 0, fresh: 0, mgmtOnly: 0, unionOnly: 0 }
  langProps.forEach((p) => {
    counts[toSheetStatus(p.status)]++
    if (p.current_text == null && p.current_language == null) counts.fresh++
    if (p.mgmt_change && !p.union_change) counts.mgmtOnly++
    if (p.union_change && !p.mgmt_change) counts.unionOnly++
  })

  const Count = ({ n, label, color }: { n: number; label: string; color: string }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
      <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color }}>{label}</span>
    </div>
  )

  const Tile = ({ n, label, col }: { n: number; label: string; col: { accent: string; bg: string; line: string } }) => (
    <div style={{ flex: 1, padding: '12px 16px', borderRadius: 8, background: col.bg, border: `1px solid ${col.line}` }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{n}</div>
      <div style={{ fontSize: 12, color: col.accent, marginTop: 5, fontWeight: 600 }}>{label}</div>
    </div>
  )

  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'stretch', marginTop: 18, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: 24, alignItems: 'center', padding: '4px 4px 4px 0' }}>
        <Count n={counts.total} label="Provisions" color="#64748B" />
        <div style={{ width: 1, alignSelf: 'stretch', background: '#E2E8F0' }} />
        <Count n={counts.open} label="Open" color="#1E3A8A" />
        <Count n={counts.agreed} label="Agreed" color="#059669" />
        <Count n={counts.tabled} label="Tabled" color="#64748B" />
      </div>
      <div style={{ width: 1, alignSelf: 'stretch', background: '#E2E8F0' }} />
      <div style={{ flex: 1, minWidth: 360 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748B', marginBottom: 8 }}>Where the changes are</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Tile n={counts.fresh} label="New clauses" col={{ accent: '#475569', bg: '#F8FAFC', line: '#E2E8F0' }} />
          <Tile n={counts.mgmtOnly} label="Management-only changes" col={COLS.mgmt} />
          <Tile n={counts.unionOnly} label="Union-only changes" col={COLS.uni} />
        </div>
      </div>
    </div>
  )
}

// ─── Main shell ───────────────────────────────────────────────────────────────

export default function ComparisonSheet({ cycle, union }: ComparisonSheetProps): React.JSX.Element {
  const toast = useToast()
  const [mode, setMode] = useState<ComparisonMode>('econ')
  const [filter, setFilter] = useState<FilterValue>('all')
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [positions, setPositions] = useState<Record<ID, ProposalPosition[]>>({})
  const [sessions, setSessions] = useState<NegotiationSession[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // Reset filter when mode switches
  useEffect(() => { setFilter('all') }, [mode])

  // Load proposals + sessions on mount
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void Promise.all([
      supabase.from('proposals').select('*').eq('cycle_id', cycle.id).order('sort_order').order('created_at'),
      supabase.from('negotiation_sessions').select('*').eq('cycle_id', cycle.id).order('session_date', { ascending: false }),
    ]).then(([propRes, sessRes]) => {
      if (cancelled) return
      if (propRes.error) {
        setLoadError(describeError(propRes.error, 'Could not load proposals.'))
      } else {
        setProposals((propRes.data ?? []) as Proposal[])
      }
      if (!sessRes.error) setSessions((sessRes.data ?? []) as NegotiationSession[])
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [cycle.id])

  // Lazily load positions for a proposal (called by child grids)
  const handleLoadPositions = useCallback(async (proposalId: ID): Promise<void> => {
    if (positions[proposalId]) return
    const { data, error } = await supabase
      .from('proposal_positions')
      .select('*')
      .eq('proposal_id', proposalId)
      .order('position_date')
      .order('created_at')
    if (error) {
      toast.error('Could not load positions: ' + describeError(error))
      return
    }
    setPositions((prev) => ({ ...prev, [proposalId]: (data ?? []) as ProposalPosition[] }))
  }, [positions, toast])

  // Counts for filter tabs — derived from active mode's proposals
  function getCounts(): { total: number; open: number; agreed: number; tabled: number } {
    const relevant = proposals.filter((p) => mode === 'econ' ? p.category === 'Economic' : p.category === 'Language')
    const c = { total: relevant.length, open: 0, agreed: 0, tabled: 0 }
    relevant.forEach((p) => {
      const s = toSheetStatus(p.status) as SheetStatus
      c[s]++
    })
    return c
  }

  if (loading) return <div style={{ padding: '32px', fontSize: 13, color: '#64748B' }}>Loading comparison data…</div>
  if (loadError) return <div style={{ padding: '32px', fontSize: 13, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, margin: 28 }}>{loadError}</div>

  const counts = getCounts()
  const localLabel = union ? `Local ${union.local_number}` : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '20px 28px 18px', flexShrink: 0 }}>
        {/* Eyebrow + title row */}
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748B', marginBottom: 6 }}>
            Negotiation Comparison Sheet
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', margin: 0, letterSpacing: '-0.01em' }}>{cycle.name}</h2>
            {localLabel && <Pill tone="info">{localLabel}</Pill>}
          </div>
        </div>

        {/* Meta row */}
        <div style={{ display: 'flex', gap: 18, fontSize: 13, color: '#64748B', marginBottom: 16, flexWrap: 'wrap' }}>
          {cycle.cba_expiration_date && (
            <span>Agreement expires {new Date(cycle.cba_expiration_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
          )}
          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: NEG_STATUS_COLORS[cycle.status].bg, color: NEG_STATUS_COLORS[cycle.status].color, border: `1px solid ${NEG_STATUS_COLORS[cycle.status].border}` }}>
            {cycle.status}
          </span>
        </div>

        {/* Mode toggle + description */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <ModeToggle mode={mode} onChange={setMode} />
          <span style={{ fontSize: 12, color: '#94A3B8' }}>
            {mode === 'econ' ? 'Economic terms — dollar values per item' : 'Contract language — clause text, side by side'}
          </span>
        </div>

        {/* Mode-specific summary strip */}
        {mode === 'econ'
          ? <EconSummary proposals={proposals} annualHours={cycle.annual_hours} />
          : <LangSummary proposals={proposals} />
        }
      </div>

      {/* Filter tabs */}
      <FilterTabs value={filter} onChange={setFilter} counts={counts} />

      {/* Grid body */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#F8FAFC' }}>
        {mode === 'econ' ? (
          <EconomicGrid
            proposals={proposals}
            positions={positions}
            sessions={sessions}
            filter={filter}
            onLoadPositions={handleLoadPositions}
          />
        ) : (
          <LanguageGrid
            proposals={proposals}
            positions={positions}
            sessions={sessions}
            filter={filter}
            onLoadPositions={handleLoadPositions}
          />
        )}
      </div>
    </div>
  )
}
