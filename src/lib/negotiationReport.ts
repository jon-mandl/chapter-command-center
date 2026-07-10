// Negotiation report builder — generates a self-contained, print-ready HTML
// document ("the book") for a negotiation cycle and writes it into a window
// the caller has already opened. The user saves it as PDF via the browser's
// print dialog.
//
// Two editions:
//   - member:    positions and outcomes only — no internal bargaining notes
//   - committee: adds rationale, last movement, cost impact, gap analysis,
//                and (optionally) the full position history appendix
//
// Every user-entered string is escaped via esc() before interpolation.

import { supabase } from './supabase'
import { describeError } from './errors'
import { formatDate, localUnionLabel } from './ui'
import { formatBytes } from './storage'
import type {
  NegotiationCycle,
  LocalUnion,
  Proposal,
  NegotiationSession,
  SessionAttendee,
  ProposalPosition,
  ID
} from './types'

export type ReportEdition = 'member' | 'committee'

export interface ReportSections {
  summary: boolean
  economic: boolean
  language: boolean
  sessions: boolean
  documents: boolean
  positionHistory: boolean // committee edition only
}

export const DEFAULT_REPORT_SECTIONS: ReportSections = {
  summary: true,
  economic: true,
  language: true,
  sessions: true,
  documents: true,
  positionHistory: false
}

interface ReportDocRow {
  id: ID
  file_name: string
  file_size: number | null
  role: string
  uploaded_at: string
}

const DOC_ROLE_LABELS: Record<string, string> = {
  opening_letter: 'Opening Letter',
  meeting_minutes: 'Meeting Minutes',
  proposal: 'Proposal',
  final_agreement: 'Final Agreement',
  arbitration: 'Arbitration',
  other: 'Other'
}

// HTML-escape a user string. Everything interpolated into the report that a
// user typed must pass through here (CLAUDE.md rule: sanitize all exports).
function esc(s: string | null | undefined): string {
  if (s == null) return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Multiline user text → escaped, with line breaks preserved by CSS.
function escBlock(s: string | null | undefined): string {
  return `<div class="prewrap">${esc(s)}</div>`
}

function fmtVal(v: number | null, unit: string | null): string {
  if (v == null) return '—'
  if (unit === '%') return `${v}%`
  if (unit === '$/hr') return `$${v.toFixed(2)}/hr`
  if (unit === '$/day') return `$${v.toFixed(2)}/day`
  return `${v}${unit ? ` ${esc(unit)}` : ''}`
}

// "(+$2.00)" change-vs-current annotation for a position value.
function fmtDelta(v: number | null, current: number | null, unit: string | null): string {
  if (v == null || current == null) return ''
  const d = Math.round((v - current) * 100) / 100
  if (d === 0) return ''
  const abs = Math.abs(d)
  const body = unit === '%' ? `${abs}%` : (unit === '$/hr' || unit === '$/day') ? `$${abs.toFixed(2)}` : `${abs}`
  return ` <span class="delta">(${d > 0 ? '+' : '−'}${body})</span>`
}

function statusBadge(status: string): string {
  return `<span class="badge badge-${esc(status.toLowerCase())}">${esc(status)}</span>`
}

const DEFAULT_ANNUAL_HOURS = 1800

// Fetch everything the report needs, build the HTML, and write it into `win`.
// Returns an error message, or null on success. The caller opens the window
// synchronously (inside the click handler) so pop-up blockers stay quiet.
export async function writeNegotiationReport(
  win: Window,
  cycle: NegotiationCycle,
  union: LocalUnion | null,
  edition: ReportEdition,
  sections: ReportSections
): Promise<string | null> {
  try {
    win.document.title = 'Building report…'

    const [chapterRes, propRes, sessRes, docsRes] = await Promise.all([
      supabase.from('chapters').select('name').eq('id', cycle.chapter_id).single(),
      supabase.from('proposals').select('*').eq('cycle_id', cycle.id).order('sort_order').order('created_at'),
      supabase.from('negotiation_sessions').select('*').eq('cycle_id', cycle.id).order('session_date'),
      supabase.from('negotiation_documents').select('id, file_name, file_size, role, uploaded_at').eq('cycle_id', cycle.id).order('uploaded_at')
    ])
    if (propRes.error) return describeError(propRes.error, 'Could not load proposals for the report.')
    if (sessRes.error) return describeError(sessRes.error, 'Could not load sessions for the report.')
    if (docsRes.error) return describeError(docsRes.error, 'Could not load documents for the report.')

    const chapterName = (chapterRes.data as { name: string } | null)?.name ?? ''
    const proposals = (propRes.data ?? []) as Proposal[]
    const sessions = (sessRes.data ?? []) as NegotiationSession[]
    const docs = (docsRes.data ?? []) as ReportDocRow[]

    let attendees: SessionAttendee[] = []
    if (sections.sessions && sessions.length > 0) {
      const { data, error } = await supabase
        .from('session_attendees')
        .select('*')
        .in('session_id', sessions.map((s) => s.id))
        .order('role')
        .order('name')
      if (error) return describeError(error, 'Could not load attendees for the report.')
      attendees = (data ?? []) as SessionAttendee[]
    }

    const includeInternal = edition === 'committee'
    let positions: ProposalPosition[] = []
    if (includeInternal && sections.positionHistory && proposals.length > 0) {
      const { data, error } = await supabase
        .from('proposal_positions')
        .select('*')
        .in('proposal_id', proposals.map((p) => p.id))
        .order('position_date')
        .order('created_at')
      if (error) return describeError(error, 'Could not load position history for the report.')
      positions = (data ?? []) as ProposalPosition[]
    }

    const html = buildHtml({ cycle, union, chapterName, proposals, sessions, attendees, docs, positions, edition, sections })

    win.document.open()
    win.document.write(html)
    win.document.close()
    win.focus()
    return null
  } catch (err) {
    return describeError(err, 'Could not build the report.')
  }
}

function buildHtml(args: {
  cycle: NegotiationCycle
  union: LocalUnion | null
  chapterName: string
  proposals: Proposal[]
  sessions: NegotiationSession[]
  attendees: SessionAttendee[]
  docs: ReportDocRow[]
  positions: ProposalPosition[]
  edition: ReportEdition
  sections: ReportSections
}): string {
  const { cycle, union, chapterName, proposals, sessions, attendees, docs, positions, edition, sections } = args
  const includeInternal = edition === 'committee'

  const econ = proposals.filter((p) => p.category === 'Economic')
  const lang = proposals.filter((p) => p.category === 'Language')
  const counts = {
    total: proposals.length,
    ta: proposals.filter((p) => p.status === 'TA').length,
    open: proposals.filter((p) => p.status === 'Open').length,
    withdrawn: proposals.filter((p) => p.status === 'Withdrawn').length,
    rejected: proposals.filter((p) => p.status === 'Rejected').length
  }
  const taRate = counts.total > 0 ? Math.round((counts.ta / counts.total) * 100) : 0

  const parts: string[] = []

  // ── Cover ──────────────────────────────────────────────────────────────────
  const metaRows: [string, string][] = [
    ['Local Union', esc(localUnionLabel(union))],
    ['Status', esc(cycle.status)]
  ]
  if (cycle.settled_date) metaRows.push(['Settled', esc(formatDate(cycle.settled_date))])
  if (cycle.cba_expiration_date) metaRows.push(['CBA Expiration', esc(formatDate(cycle.cba_expiration_date))])
  if (cycle.proposed_effective_date) metaRows.push(['Proposed Effective', esc(formatDate(cycle.proposed_effective_date))])
  if (cycle.unit_size) metaRows.push(['Bargaining Unit Size', `${cycle.unit_size.toLocaleString()} members`])
  if (cycle.neca_chapter_division) metaRows.push(['Chapter / Division', esc(cycle.neca_chapter_division)])

  parts.push(`
  <header class="cover">
    ${chapterName ? `<div class="eyebrow">${esc(chapterName)}</div>` : ''}
    <h1>${esc(cycle.name)}</h1>
    <div class="cover-sub">Negotiation Report — ${edition === 'member' ? 'Member Edition' : 'Committee Edition'}</div>
    ${includeInternal ? '<div class="internal-banner">COMMITTEE EDITION — contains internal bargaining notes. Not for general distribution.</div>' : ''}
    <table class="meta-table">
      ${metaRows.map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`).join('')}
    </table>
    <div class="generated">Generated ${esc(new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }))}</div>
  </header>`)

  // ── Summary ───────────────────────────────────────────────────────────────
  if (sections.summary) {
    parts.push(`
  <section>
    <h2>Negotiation Summary</h2>
    <div class="stat-row">
      <div class="stat"><div class="stat-n">${counts.total}</div><div class="stat-l">Total Items</div></div>
      <div class="stat"><div class="stat-n green">${counts.ta}</div><div class="stat-l">Tentatively Agreed</div></div>
      <div class="stat"><div class="stat-n blue">${counts.open}</div><div class="stat-l">Open</div></div>
      <div class="stat"><div class="stat-n gray">${counts.withdrawn + counts.rejected}</div><div class="stat-l">Withdrawn / Rejected</div></div>
      <div class="stat"><div class="stat-n">${sessions.length}</div><div class="stat-l">Sessions Held</div></div>
    </div>
    <div class="progress-wrap">
      <div class="progress-label"><span>Agreement progress</span><span>${taRate}% agreed</span></div>
      <div class="progress"><div class="progress-fill" style="width:${taRate}%"></div></div>
    </div>
    <p class="fine">TA = tentatively agreed by both parties, pending ratification. ${econ.length} economic item${econ.length !== 1 ? 's' : ''} and ${lang.length} language provision${lang.length !== 1 ? 's' : ''} in this negotiation.</p>
  </section>`)
  }

  // ── Economic items ────────────────────────────────────────────────────────
  if (sections.economic && econ.length > 0) {
    let gapBlock = ''
    if (includeInternal) {
      let unionHr = 0, mgmtHr = 0
      econ.forEach((p) => {
        if (p.cost_union != null) unionHr += p.cost_union
        if (p.cost_mgmt != null) mgmtHr += p.cost_mgmt
      })
      const gapHr = Math.abs(unionHr - mgmtHr)
      if (unionHr > 0 || mgmtHr > 0) {
        const annual = gapHr * (cycle.annual_hours ?? DEFAULT_ANNUAL_HOURS)
        gapBlock = `
    <div class="gap-box">
      <strong>Package cost per compensated hour:</strong>
      union ask +$${unionHr.toFixed(2)} · management offer +$${mgmtHr.toFixed(2)} · gap $${gapHr.toFixed(2)}/hr
      (≈ $${Math.round(annual).toLocaleString()}/yr per member${cycle.annual_hours ? '' : ` at ${DEFAULT_ANNUAL_HOURS} hrs`})
    </div>`
      }
    }

    parts.push(`
  <section class="break-before">
    <h2>Economic Items</h2>${gapBlock}
    <table class="data-table">
      <thead>
        <tr>
          <th scope="col">Item</th>
          <th scope="col">Current</th>
          <th scope="col">Union</th>
          <th scope="col">Management</th>
          ${includeInternal ? '<th scope="col">Cost U / M ($/hr)</th>' : ''}
          <th scope="col">Status</th>
        </tr>
      </thead>
      <tbody>
        ${econ.map((p) => {
          const ref = p.article_reference ? `<div class="ref">${esc(p.article_reference)}${p.section ? ` · § ${esc(p.section)}` : ''}</div>` : ''
          const noteBits: string[] = []
          if (includeInternal && p.rationale) noteBits.push(`<strong>Rationale:</strong> ${esc(p.rationale)}`)
          if (includeInternal && p.last_movement) noteBits.push(`<strong>Last movement:</strong> ${esc(p.last_movement)}`)
          const noteRow = noteBits.length > 0
            ? `<tr class="note-row"><td colspan="${includeInternal ? 6 : 5}">${noteBits.join(' &nbsp;·&nbsp; ')}</td></tr>`
            : ''
          return `
        <tr>
          <td>${p.priority ? '<span class="key-flag" title="Key issue">◆</span> ' : ''}<strong>${esc(p.title)}</strong>${ref}</td>
          <td class="num">${fmtVal(p.current_value, p.unit)}</td>
          <td class="num">${fmtVal(p.union_value, p.unit)}${fmtDelta(p.union_value, p.current_value, p.unit)}</td>
          <td class="num">${p.mgmt_value == null ? '<span class="dim">no counter</span>' : fmtVal(p.mgmt_value, p.unit) + fmtDelta(p.mgmt_value, p.current_value, p.unit)}</td>
          ${includeInternal ? `<td class="num">${p.cost_union != null ? `$${p.cost_union.toFixed(2)}` : '—'} / ${p.cost_mgmt != null ? `$${p.cost_mgmt.toFixed(2)}` : '—'}</td>` : ''}
          <td>${statusBadge(p.status)}</td>
        </tr>${noteRow}`
        }).join('')}
      </tbody>
    </table>
  </section>`)
  }

  // ── Language provisions ───────────────────────────────────────────────────
  if (sections.language && lang.length > 0) {
    parts.push(`
  <section class="break-before">
    <h2>Language Provisions</h2>
    ${lang.map((p) => {
      const ref = p.article_reference ? `<span class="ref">${esc(p.article_reference)}${p.section ? ` · § ${esc(p.section)}` : ''}</span>` : ''
      const current = p.current_text
        ? escBlock(p.current_text)
        : '<div class="dim">New clause — no current language.</div>'
      const unionPos = p.union_change
        ? (p.union_text ? escBlock(p.union_text) : '<div class="dim">Change proposed — text pending.</div>')
        : '<div class="dim">No change proposed.</div>'
      const mgmtPos = p.mgmt_change
        ? (p.mgmt_text ? escBlock(p.mgmt_text) : '<div class="dim">Change proposed — text pending.</div>')
        : '<div class="dim">No change proposed.</div>'
      const noteBits: string[] = []
      if (includeInternal && p.rationale) noteBits.push(`<strong>Rationale:</strong> ${esc(p.rationale)}`)
      if (includeInternal && p.last_movement) noteBits.push(`<strong>Last movement:</strong> ${esc(p.last_movement)}`)
      return `
    <div class="provision">
      <div class="provision-head">
        ${p.priority ? '<span class="key-flag" title="Key issue">◆</span> ' : ''}<strong>${esc(p.title)}</strong> ${ref} ${statusBadge(p.status)}
      </div>
      <div class="lang-grid">
        <div class="lang-col"><div class="lang-label">Current Language</div>${current}</div>
        <div class="lang-col union"><div class="lang-label">Union Position</div>${unionPos}</div>
        <div class="lang-col mgmt"><div class="lang-label">Management Position</div>${mgmtPos}</div>
      </div>
      ${noteBits.length > 0 ? `<div class="provision-notes">${noteBits.join(' &nbsp;·&nbsp; ')}</div>` : ''}
    </div>`
    }).join('')}
  </section>`)
  }

  // ── Session log ───────────────────────────────────────────────────────────
  if (sections.sessions && sessions.length > 0) {
    const bySession = new Map<ID, SessionAttendee[]>()
    attendees.forEach((a) => {
      const list = bySession.get(a.session_id) ?? []
      list.push(a)
      bySession.set(a.session_id, list)
    })
    parts.push(`
  <section class="break-before">
    <h2>Bargaining Session Log</h2>
    <table class="data-table">
      <thead>
        <tr>
          <th scope="col">Date</th>
          <th scope="col">Location</th>
          <th scope="col">Attendees</th>
          <th scope="col">Notes</th>
        </tr>
      </thead>
      <tbody>
        ${sessions.map((s) => {
          const atts = bySession.get(s.id) ?? []
          const side = (role: string): string => atts
            .filter((a) => a.role === role)
            .map((a) => esc(a.name) + (a.title ? ` <span class="dim">(${esc(a.title)})</span>` : ''))
            .join(', ')
          const mgmt = side('Management')
          const labor = side('Labor')
          const attHtml = atts.length === 0
            ? '<span class="dim">—</span>'
            : `${mgmt ? `<div><strong>Mgmt:</strong> ${mgmt}</div>` : ''}${labor ? `<div><strong>Labor:</strong> ${labor}</div>` : ''}`
          return `
        <tr>
          <td class="nowrap">${esc(formatDate(s.session_date))}</td>
          <td>${esc(s.location) || '<span class="dim">—</span>'}</td>
          <td>${attHtml}</td>
          <td>${s.notes ? escBlock(s.notes) : '<span class="dim">—</span>'}</td>
        </tr>`
        }).join('')}
      </tbody>
    </table>
  </section>`)
  }

  // ── Documents ─────────────────────────────────────────────────────────────
  if (sections.documents && docs.length > 0) {
    parts.push(`
  <section>
    <h2>Documents on File</h2>
    <table class="data-table">
      <thead>
        <tr><th scope="col">Name</th><th scope="col">Type</th><th scope="col">Size</th><th scope="col">Uploaded</th></tr>
      </thead>
      <tbody>
        ${docs.map((d) => `
        <tr>
          <td>${esc(d.file_name)}</td>
          <td>${esc(DOC_ROLE_LABELS[d.role] ?? d.role)}</td>
          <td class="num">${d.file_size != null ? esc(formatBytes(d.file_size)) : '—'}</td>
          <td class="nowrap">${esc(formatDate(d.uploaded_at.slice(0, 10)))}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </section>`)
  }

  // ── Position history appendix (committee only) ────────────────────────────
  if (includeInternal && sections.positionHistory && positions.length > 0) {
    const byProposal = new Map<ID, ProposalPosition[]>()
    positions.forEach((pos) => {
      const list = byProposal.get(pos.proposal_id) ?? []
      list.push(pos)
      byProposal.set(pos.proposal_id, list)
    })
    parts.push(`
  <section class="break-before">
    <h2>Appendix — Position History</h2>
    ${proposals.filter((p) => byProposal.has(p.id)).map((p) => `
    <div class="provision">
      <div class="provision-head"><strong>${esc(p.title)}</strong> ${statusBadge(p.status)}</div>
      ${(byProposal.get(p.id) ?? []).map((pos) => `
      <div class="position-row">
        <span class="position-side ${pos.side === 'Management' ? 'mgmt' : 'union'}">${esc(pos.side)}</span>
        <span class="dim nowrap">${esc(formatDate(pos.position_date))}</span>
        <div class="prewrap">${esc(pos.position_text)}</div>
      </div>`).join('')}
    </div>`).join('')}
  </section>`)
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(cycle.name)} — Negotiation Report</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    color: #0F172A; margin: 0; padding: 32px 40px; font-size: 13px; line-height: 1.5;
    max-width: 900px; margin-left: auto; margin-right: auto;
  }
  .toolbar { position: sticky; top: 0; background: #fff; padding: 10px 0; text-align: right; border-bottom: 1px solid #E2E8F0; margin-bottom: 24px; }
  .toolbar button {
    padding: 8px 18px; font-size: 13px; font-weight: 600; background: #1E3A8A; color: #fff;
    border: none; border-radius: 6px; cursor: pointer;
  }
  .cover { margin-bottom: 36px; }
  .eyebrow { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #B8952A; margin-bottom: 10px; }
  h1 { font-size: 28px; font-weight: 700; color: #1E3A8A; margin: 0 0 4px; }
  .cover-sub { font-size: 15px; color: #64748B; margin-bottom: 16px; }
  .internal-banner {
    font-size: 12px; font-weight: 700; color: #92400E; background: #FFFBEB; border: 1px solid #FDE68A;
    border-radius: 6px; padding: 8px 12px; margin-bottom: 16px;
  }
  .meta-table { border-collapse: collapse; margin-bottom: 12px; }
  .meta-table th { text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B; padding: 4px 24px 4px 0; vertical-align: top; }
  .meta-table td { font-size: 13px; font-weight: 600; padding: 4px 0; }
  .generated { font-size: 11px; color: #94A3B8; }
  h2 { font-size: 17px; font-weight: 700; color: #1E3A8A; border-bottom: 2px solid #1E3A8A; padding-bottom: 6px; margin: 28px 0 14px; }
  section { margin-bottom: 28px; }
  .stat-row { display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 16px; }
  .stat-n { font-size: 24px; font-weight: 700; }
  .stat-n.green { color: #059669; } .stat-n.blue { color: #4F46E5; } .stat-n.gray { color: #64748B; }
  .stat-l { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B; }
  .progress-wrap { margin-bottom: 10px; }
  .progress-label { display: flex; justify-content: space-between; font-size: 12px; color: #64748B; margin-bottom: 4px; }
  .progress { height: 10px; background: #F1F5F9; border-radius: 5px; overflow: hidden; }
  .progress-fill { height: 100%; background: #059669; }
  .fine { font-size: 11px; color: #94A3B8; }
  .data-table { width: 100%; border-collapse: collapse; }
  .data-table th { text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B; background: #F8FAFC; padding: 8px 10px; border-bottom: 1px solid #CBD5E1; }
  .data-table td { padding: 8px 10px; border-bottom: 1px solid #F1F5F9; vertical-align: top; }
  .data-table .num { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .nowrap { white-space: nowrap; }
  .ref { font-size: 11px; color: #94A3B8; }
  .dim { color: #94A3B8; }
  .delta { color: #64748B; font-size: 10px; }
  .key-flag { color: #92400E; }
  .note-row td { font-size: 11.5px; color: #475569; background: #FFFBEB; border-bottom: 1px solid #F1F5F9; }
  .badge { display: inline-block; font-size: 10px; font-weight: 700; padding: 1px 8px; border-radius: 20px; border: 1px solid; white-space: nowrap; }
  .badge-open { background: #EEF2FF; color: #4F46E5; border-color: #C7D2FE; }
  .badge-ta { background: #f0fdf4; color: #059669; border-color: #bbf7d0; }
  .badge-withdrawn { background: #F8FAFC; color: #64748B; border-color: #E2E8F0; }
  .badge-rejected { background: #fef2f2; color: #dc2626; border-color: #fecaca; }
  .gap-box { font-size: 12px; color: #475569; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 10px 14px; margin-bottom: 12px; }
  .provision { border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px 16px; margin-bottom: 12px; page-break-inside: avoid; }
  .provision-head { margin-bottom: 10px; font-size: 14px; }
  .lang-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
  .lang-col { border-left: 3px solid #CBD5E1; padding-left: 10px; }
  .lang-col.union { border-left-color: #1E3A8A; }
  .lang-col.mgmt { border-left-color: #B8952A; }
  .lang-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B; margin-bottom: 4px; }
  .provision-notes { font-size: 11.5px; color: #475569; background: #FFFBEB; border-radius: 6px; padding: 8px 10px; margin-top: 10px; }
  .prewrap { white-space: pre-wrap; }
  .position-row { display: grid; grid-template-columns: 110px 90px 1fr; gap: 10px; padding: 6px 0; border-top: 1px solid #F1F5F9; font-size: 12px; }
  .position-side { font-weight: 700; font-size: 11px; }
  .position-side.mgmt { color: #92400E; } .position-side.union { color: #1E3A8A; }
  @media print {
    body { padding: 0; font-size: 11.5px; }
    .toolbar { display: none; }
    .break-before { page-break-before: always; break-before: page; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    a { color: inherit; text-decoration: none; }
  }
  @page { margin: 18mm 15mm; }
</style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">Print / Save as PDF</button></div>
  ${parts.join('\n')}
</body>
</html>`
}
