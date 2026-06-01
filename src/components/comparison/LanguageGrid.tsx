// LanguageGrid — "Contract Language" tab of the Comparison Sheet.
// Shows one card per Language proposal with three columns of clause text.
import React, { useState, useEffect } from 'react'
import type { Proposal, ProposalPosition, NegotiationSession } from '../../lib/types'
import { COLS, toSheetStatus, type SheetStatus } from '../../lib/comparison-utils'
import { PriorityFlag, StatusPill, type FilterValue } from './primitives'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LangRow {
  proposal: Proposal
  sheetStatus: SheetStatus
  currentText: string | null          // proposal.current_language
  unionText: string | null            // latest Labor position_text
  unionChanged: boolean               // any Labor position exists
  mgmtText: string | null             // latest Management position_text
  mgmtChanged: boolean                // any Management position exists
  lastSessionDate: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildLangRows(
  proposals: Proposal[],
  positions: Record<string, ProposalPosition[]>,
  sessions: NegotiationSession[]
): LangRow[] {
  return proposals
    .filter((p) => p.category === 'Language')
    .map((p) => {
      const allPos = positions[p.id] ?? []
      const mgmtPos = allPos.filter((x) => x.side === 'Management').sort((a, b) => b.position_date.localeCompare(a.position_date))
      const laborPos = allPos.filter((x) => x.side === 'Labor').sort((a, b) => b.position_date.localeCompare(a.position_date))

      const allSorted = [...allPos].sort((a, b) => b.position_date.localeCompare(a.position_date))
      const lastPos = allSorted[0] ?? null
      const lastSession = lastPos?.session_id ? sessions.find((s) => s.id === lastPos.session_id) : null

      return {
        proposal: p,
        sheetStatus: toSheetStatus(p.status),
        currentText: p.current_language,
        unionText: laborPos[0]?.position_text ?? null,
        unionChanged: laborPos.length > 0,
        mgmtText: mgmtPos[0]?.position_text ?? null,
        mgmtChanged: mgmtPos.length > 0,
        lastSessionDate: lastSession?.session_date ?? null,
      }
    })
}

// Group by article_reference
function groupByArticle(rows: LangRow[]): { article: string; rows: LangRow[] }[] {
  const map = new Map<string, LangRow[]>()
  rows.forEach((r) => {
    const art = r.proposal.article_reference ?? 'General'
    if (!map.has(art)) map.set(art, [])
    map.get(art)!.push(r)
  })
  return Array.from(map.entries()).map(([article, rows]) => ({ article, rows }))
}

// ─── Column cell ─────────────────────────────────────────────────────────────

function LangCol({ col, kind, text, changed }: {
  col: typeof COLS[keyof typeof COLS]
  kind: 'current' | 'union' | 'mgmt'
  text: string | null
  changed: boolean
}): React.JSX.Element {
  let body: string
  let tag: string
  let tagFilled = false
  let muted = false

  if (kind === 'current') {
    if (text == null) {
      body = 'No current language — this is a new clause.'
      tag = 'New Clause'
      muted = true
    } else {
      body = text
      tag = 'In Effect'
    }
  } else {
    if (!changed || !text) {
      body = 'No change proposed — accepts current language.'
      tag = 'No Change'
      muted = true
    } else {
      body = text
      tag = kind === 'union' ? 'Union Change' : 'Mgmt Change'
      tagFilled = true
    }
  }

  return (
    <div style={{
      background: col.bg, borderLeft: `1px solid ${col.line}`,
      padding: '12px 16px 14px', display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: col.accent }}>{col.label}</span>
        <span style={{
          fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
          padding: '2px 7px', borderRadius: 999,
          color: tagFilled ? '#fff' : col.accent,
          background: tagFilled ? col.accent : 'transparent',
          border: tagFilled ? 'none' : `1px solid ${col.line}`,
          opacity: muted ? 0.7 : 1,
        }}>{tag}</span>
      </div>
      <p style={{
        fontSize: 13, lineHeight: 1.55, margin: 0,
        color: muted ? '#94A3B8' : '#1E293B',
        fontStyle: muted ? 'italic' : 'normal',
      }}>{body}</p>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

interface LanguageGridProps {
  proposals: Proposal[]
  positions: Record<string, ProposalPosition[]>
  sessions: NegotiationSession[]
  filter: FilterValue
  onLoadPositions: (proposalId: string) => void
}

export default function LanguageGrid({ proposals, positions, sessions, filter, onLoadPositions }: LanguageGridProps): React.JSX.Element {
  const [openCard, setOpenCard] = useState<string | null>(null)

  useEffect(() => { setOpenCard(null) }, [filter])

  const langProposals = proposals.filter((p) => p.category === 'Language')

  useEffect(() => {
    langProposals.forEach((p) => { onLoadPositions(p.id) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposals])

  const allRows = buildLangRows(langProposals, positions, sessions)
  const passFilter = (r: LangRow) => filter === 'all' || r.sheetStatus === filter
  const groups = groupByArticle(allRows)

  return (
    <div style={{ padding: '18px 28px 32px' }}>
      {groups.map(({ article, rows }) => {
        const filtered = rows.filter(passFilter)
        if (!filtered.length) return null
        return (
          <div key={article} style={{ marginBottom: 22 }}>
            {/* Article heading */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #E2E8F0' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{article}</span>
              <span style={{ fontSize: 11, color: '#94A3B8' }}>{filtered.length} {filtered.length === 1 ? 'provision' : 'provisions'}</span>
            </div>

            {filtered.map((row) => {
              const { proposal: p } = row
              const isOpen = openCard === p.id

              const movement = row.lastSessionDate
                ? `Last movement: ${new Date(row.lastSessionDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                : null

              return (
                <div
                  key={p.id}
                  style={{
                    background: '#fff',
                    border: `1px solid ${isOpen ? '#CBD5E1' : '#E2E8F0'}`,
                    borderRadius: 8, overflow: 'hidden', marginBottom: 12,
                  }}
                >
                  {/* Card header */}
                  <div
                    onClick={() => setOpenCard(isOpen ? null : p.id)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                      padding: '11px 16px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                      {p.priority && <PriorityFlag />}
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{p.title}</span>
                      {p.article_reference && <span style={{ fontSize: 11, color: '#94A3B8' }}>§ {p.article_reference}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      <StatusPill status={row.sheetStatus} />
                      <span style={{ fontSize: 11, color: '#94A3B8', width: 54, textAlign: 'right' }}>{isOpen ? 'Hide' : 'Notes'}</span>
                    </div>
                  </div>

                  {/* Three language columns */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
                    <LangCol col={COLS.cur} kind="current" text={row.currentText} changed={row.currentText != null} />
                    <LangCol col={COLS.uni} kind="union" text={row.unionText} changed={row.unionChanged} />
                    <LangCol col={COLS.mgmt} kind="mgmt" text={row.mgmtText} changed={row.mgmtChanged} />
                  </div>

                  {/* Expanded drafting note */}
                  {isOpen && (
                    <div style={{ display: 'flex', gap: 28, padding: '14px 16px', borderTop: '1px solid #E2E8F0', background: '#FBFCFE' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8', marginBottom: 5 }}>Drafting note</div>
                        <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.5, margin: 0 }}>{p.notes || '—'}</p>
                      </div>
                      {movement && (
                        <div style={{ width: 260, flexShrink: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8', marginBottom: 5 }}>Last movement</div>
                          <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.5, margin: 0 }}>{movement}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}

      {groups.every(({ rows }) => !rows.filter((r) => filter === 'all' || r.sheetStatus === filter).length) && (
        <div style={{ textAlign: 'center', padding: '48px 24px', fontSize: 13, color: '#94A3B8' }}>
          No language provisions match this filter.
        </div>
      )}
    </div>
  )
}
