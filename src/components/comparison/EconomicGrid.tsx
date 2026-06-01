// EconomicGrid — "Wages & Fringes" tab of the Comparison Sheet.
// Shows one row per Economic proposal with Current / Union / Management positions.
import React, { useState, useEffect } from 'react'
import type { Proposal, ProposalPosition, NegotiationSession } from '../../lib/types'
import { COLS, toSheetStatus, formatValue, formatDelta, formatHrDelta, type EconFmt, type SheetStatus } from '../../lib/comparison-utils'
import { PriorityFlag, StatusPill, ExpandedDetail, ColHeader, type FilterValue } from './primitives'

// ─── Types ────────────────────────────────────────────────────────────────────

// One row in the economic grid — derived from a Proposal + its positions.
interface EconRow {
  proposal: Proposal
  sheetStatus: SheetStatus
  // Latest position amounts per side (null if none recorded yet)
  currentAmount: number | null  // most recent Management amount (baseline)
  unionAmount: number | null    // most recent Labor amount
  mgmtAmount: number | null     // most recent Management amount (same as current)
  // The unit string from the most recent position, used for display
  unit: string | null
  fmt: EconFmt
  // Most recent position text per side (for rationale fallback)
  unionText: string | null
  mgmtText: string | null
  // Session label for last movement
  lastSessionDate: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Guess a display format from the unit string stored in proposal_positions.
function inferFmt(unit: string | null): EconFmt {
  if (!unit) return 'usd'
  const u = unit.toLowerCase()
  if (u.includes('%')) return 'pct'
  if (u.includes('/wk') || u.includes('day')) return 'usdDay'
  if (u.includes('hr') && !u.includes('$')) return 'hrs'
  if (u.includes('mi')) return 'mi'
  return 'usd'
}

// Build EconRow objects from proposals + their loaded positions.
function buildRows(
  proposals: Proposal[],
  positions: Record<string, ProposalPosition[]>,
  sessions: NegotiationSession[]
): EconRow[] {
  return proposals
    .filter((p) => p.category === 'Economic')
    .map((p) => {
      const allPos = positions[p.id] ?? []
      const mgmtPos = allPos.filter((x) => x.side === 'Management').sort((a, b) => b.position_date.localeCompare(a.position_date))
      const laborPos = allPos.filter((x) => x.side === 'Labor').sort((a, b) => b.position_date.localeCompare(a.position_date))

      const latestMgmt = mgmtPos[0] ?? null
      const latestLabor = laborPos[0] ?? null

      // For "last movement" — find the most recent position of either side
      const allSorted = [...allPos].sort((a, b) => b.position_date.localeCompare(a.position_date))
      const lastPos = allSorted[0] ?? null
      const lastSession = lastPos?.session_id ? sessions.find((s) => s.id === lastPos.session_id) : null

      const unit = latestMgmt?.unit ?? latestLabor?.unit ?? null
      const fmt = inferFmt(unit)

      return {
        proposal: p,
        sheetStatus: toSheetStatus(p.status),
        currentAmount: latestMgmt?.amount ?? null,
        unionAmount: latestLabor?.amount ?? null,
        mgmtAmount: latestMgmt?.amount ?? null,
        unit,
        fmt,
        unionText: latestLabor?.position_text ?? null,
        mgmtText: latestMgmt?.position_text ?? null,
        lastSessionDate: lastSession?.session_date ?? null,
      }
    })
}

// ─── Sort logic ───────────────────────────────────────────────────────────────

type SortMode = 'article' | 'gap' | 'status'

function gapScore(row: EconRow): number {
  if (row.unionAmount == null || row.mgmtAmount == null) return -1
  return Math.abs(row.unionAmount - row.mgmtAmount)
}

const STATUS_RANK: Record<SheetStatus, number> = { open: 0, tabled: 1, agreed: 2 }

// ─── Component ────────────────────────────────────────────────────────────────

interface EconomicGridProps {
  proposals: Proposal[]
  positions: Record<string, ProposalPosition[]>
  sessions: NegotiationSession[]
  filter: FilterValue
  onLoadPositions: (proposalId: string) => void
}

export default function EconomicGrid({ proposals, positions, sessions, filter, onLoadPositions }: EconomicGridProps): React.JSX.Element {
  const [sort, setSort] = useState<SortMode>('article')
  const [openRow, setOpenRow] = useState<string | null>(null)

  // Close accordion when filter changes
  useEffect(() => { setOpenRow(null) }, [filter])

  const econProposals = proposals.filter((p) => p.category === 'Economic')

  // Trigger position loading for all economic proposals on mount
  useEffect(() => {
    econProposals.forEach((p) => { onLoadPositions(p.id) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposals])

  const allRows = buildRows(econProposals, positions, sessions)
  const passFilter = (r: EconRow) => filter === 'all' || r.sheetStatus === filter

  // Build the ordered row list based on sort mode
  type DisplayRow =
    | { kind: 'divider'; article: string; count: number; key: string }
    | { kind: 'item'; row: EconRow; key: string }

  let displayRows: DisplayRow[] = []

  if (sort === 'article') {
    // Group by article_reference
    const byArticle = new Map<string, EconRow[]>()
    allRows.forEach((r) => {
      const art = r.proposal.article_reference ?? 'Other'
      if (!byArticle.has(art)) byArticle.set(art, [])
      byArticle.get(art)!.push(r)
    })
    byArticle.forEach((rows, art) => {
      const filtered = rows.filter(passFilter)
      if (!filtered.length) return
      displayRows.push({ kind: 'divider', article: art, count: rows.length, key: `d-${art}` })
      filtered.forEach((row) => displayRows.push({ kind: 'item', row, key: row.proposal.id }))
    })
  } else {
    const flat = allRows.filter(passFilter)
    if (sort === 'gap') {
      flat.sort((a, b) => gapScore(b) - gapScore(a))
    } else {
      flat.sort((a, b) => STATUS_RANK[a.sheetStatus] - STATUS_RANK[b.sheetStatus])
    }
    displayRows = flat.map((row) => ({ kind: 'item', row, key: row.proposal.id }))
  }

  function toggleRow(id: string): void {
    setOpenRow(openRow === id ? null : id)
  }

  const thBase: React.CSSProperties = {
    padding: '8px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748B',
    borderBottom: '1px solid #E2E8F0', background: '#fff', verticalAlign: 'bottom',
  }

  const SortBtn = ({ id, label }: { id: SortMode; label: string }) => (
    <button
      onClick={() => setSort(id)}
      style={{
        padding: '5px 11px', fontSize: 12, fontWeight: sort === id ? 600 : 500,
        color: sort === id ? '#1E3A8A' : '#64748B',
        background: sort === id ? '#EFF6FF' : '#fff',
        border: `1px solid ${sort === id ? '#BFD3F2' : '#E2E8F0'}`,
        borderRadius: 6, cursor: 'pointer',
      }}
    >{label}</button>
  )

  return (
    <div>
      {/* Sort toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 28px', background: '#fff', borderBottom: '1px solid #F1F5F9' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8' }}>Sort</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <SortBtn id="article" label="By article" />
            <SortBtn id="gap" label="Largest gap" />
            <SortBtn id="status" label="By status" />
          </div>
        </div>
        <span style={{ fontSize: 12, color: '#94A3B8' }}>Click any row to see rationale &amp; movement</span>
      </div>

      {/* Table */}
      <div style={{ padding: '16px 28px 28px' }}>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '26%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '15%' }} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" style={thBase}>Item</th>
                <ColHeader col={COLS.cur} sub="in effect" />
                <ColHeader col={COLS.uni} sub="proposal" />
                <ColHeader col={COLS.mgmt} sub="counter" />
                <th scope="col" style={thBase}>Δ cost / hr</th>
                <th scope="col" style={thBase}>Status</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: '32px', textAlign: 'center', fontSize: 13, color: '#94A3B8' }}>
                    No economic items match this filter.
                  </td>
                </tr>
              )}
              {displayRows.map((r) => {
                if (r.kind === 'divider') {
                  return (
                    <tr key={r.key}>
                      <td colSpan={6} style={{ padding: '9px 14px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#475569' }}>{r.article}</span>
                        <span style={{ fontSize: 11, color: '#94A3B8', marginLeft: 8 }}>{r.count} {r.count === 1 ? 'item' : 'items'}</span>
                      </td>
                    </tr>
                  )
                }

                const { row } = r
                const { proposal: p, sheetStatus, currentAmount, unionAmount, mgmtAmount, fmt } = row
                const isOpen = openRow === p.id

                // Deltas vs current (Management baseline)
                const uniDelta = (unionAmount != null && currentAmount != null)
                  ? formatDelta(unionAmount - currentAmount, fmt)
                  : null
                const mgmtDelta = (mgmtAmount != null && currentAmount != null)
                  ? formatDelta(mgmtAmount - currentAmount, fmt)
                  : null

                // $/hr cost deltas — we use the raw amount difference as the cost delta
                // when unit is $/hr. For other unit types we show "work rule".
                const isHrUnit = row.unit === '$/hr'
                const costU = (isHrUnit && unionAmount != null && currentAmount != null) ? unionAmount - currentAmount : null
                const costM = (isHrUnit && mgmtAmount != null && currentAmount != null) ? mgmtAmount - currentAmount : null

                // Build "last movement" text from the latest position
                const movement = row.lastSessionDate
                  ? `Last movement: ${new Date(row.lastSessionDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                  : row.mgmtText ?? row.unionText ?? null

                return (
                  <React.Fragment key={r.key}>
                    <tr
                      onClick={() => toggleRow(p.id)}
                      style={{ cursor: 'pointer', background: isOpen ? '#FBFCFE' : '#fff' }}
                    >
                      {/* Item name */}
                      <td style={{ padding: '9px 14px', borderBottom: isOpen ? 'none' : '1px solid #F1F5F9', verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {p.priority && <PriorityFlag />}
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{p.title}</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
                          {p.article_reference && `${p.article_reference} · `}
                          {row.unit ?? '$/hr'}
                          {p.proposed_by && ` · ${p.proposed_by} proposal`}
                        </div>
                      </td>

                      {/* Current (Management baseline) */}
                      <td style={{ padding: '9px 14px', background: COLS.cur.bg, borderLeft: `1px solid ${COLS.cur.line}`, borderRight: `1px solid ${COLS.cur.line}`, borderBottom: isOpen ? 'none' : '1px solid #F1F5F9' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                          {currentAmount != null ? formatValue(currentAmount, fmt) : '—'}
                        </div>
                      </td>

                      {/* Union */}
                      <td style={{ padding: '9px 14px', background: COLS.uni.bg, borderLeft: `1px solid ${COLS.uni.line}`, borderRight: `1px solid ${COLS.uni.line}`, borderBottom: isOpen ? 'none' : '1px solid #F1F5F9' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: COLS.uni.accent, fontVariantNumeric: 'tabular-nums' }}>
                          {unionAmount != null ? formatValue(unionAmount, fmt) : '—'}
                        </div>
                        {uniDelta && <div style={{ fontSize: 11, color: COLS.uni.accent, marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>{uniDelta}</div>}
                      </td>

                      {/* Management */}
                      <td style={{ padding: '9px 14px', background: COLS.mgmt.bg, borderLeft: `1px solid ${COLS.mgmt.line}`, borderRight: `1px solid ${COLS.mgmt.line}`, borderBottom: isOpen ? 'none' : '1px solid #F1F5F9' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: COLS.mgmt.accent, fontVariantNumeric: 'tabular-nums' }}>
                          {mgmtAmount != null ? formatValue(mgmtAmount, fmt) : '—'}
                        </div>
                        {mgmtDelta && <div style={{ fontSize: 11, color: COLS.mgmt.accent, marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>{mgmtDelta}</div>}
                      </td>

                      {/* Δ cost / hr */}
                      <td style={{ padding: '9px 14px', borderBottom: isOpen ? 'none' : '1px solid #F1F5F9', verticalAlign: 'top' }}>
                        {costU == null && costM == null ? (
                          <span style={{ fontSize: 12, color: '#94A3B8' }}>work rule</span>
                        ) : (
                          <div style={{ fontVariantNumeric: 'tabular-nums' }}>
                            <div style={{ fontSize: 12, color: COLS.uni.accent, fontWeight: 600 }}>U {formatHrDelta(costU)}</div>
                            <div style={{ fontSize: 12, color: COLS.mgmt.accent, fontWeight: 600, marginTop: 1 }}>M {formatHrDelta(costM)}</div>
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td style={{ padding: '9px 14px', borderBottom: isOpen ? 'none' : '1px solid #F1F5F9', verticalAlign: 'top' }}>
                        <StatusPill status={sheetStatus} />
                      </td>
                    </tr>

                    {/* Expanded detail */}
                    {isOpen && (
                      <tr>
                        <td colSpan={6} style={{ padding: '0 14px 14px', background: '#FBFCFE', borderBottom: '1px solid #F1F5F9' }}>
                          <ExpandedDetail note={p.notes} movement={movement} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
