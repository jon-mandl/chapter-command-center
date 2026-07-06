// Shared primitive components for the Comparison Sheet.
import React from 'react'
import { PILL_TONES, STATUS_DISPLAY, COLS, type PillTone, type SheetStatus } from '../../lib/comparison-utils'

// ─── Pill ─────────────────────────────────────────────────────────────────────

export function Pill({ tone = 'neutral', children, style }: {
  tone?: PillTone
  children: React.ReactNode
  style?: React.CSSProperties
}): React.JSX.Element {
  const c = PILL_TONES[tone]
  return (
    <span style={{
      display: 'inline-block', fontSize: 11, fontWeight: 600,
      padding: '2px 9px', borderRadius: 999, whiteSpace: 'nowrap',
      background: c.bg, color: c.color, border: `1px solid ${c.border}`, ...style,
    }}>{children}</span>
  )
}

// ─── StatusPill ───────────────────────────────────────────────────────────────

export function StatusPill({ status }: { status: SheetStatus }): React.JSX.Element {
  const s = STATUS_DISPLAY[status]
  return <Pill tone={s.tone}>{s.label}</Pill>
}

// ─── PriorityFlag ─────────────────────────────────────────────────────────────

export function PriorityFlag(): React.JSX.Element {
  return (
    <span
      aria-label="Key issue"
      title="Key issue"
      style={{
        display: 'inline-block', width: 8, height: 8,
        background: '#92400E', transform: 'rotate(45deg)',
        borderRadius: 1, flexShrink: 0,
      }}
    />
  )
}

// ─── ModeToggle ───────────────────────────────────────────────────────────────

export type ComparisonMode = 'econ' | 'lang'

export function ModeToggle({ mode, onChange }: {
  mode: ComparisonMode
  onChange: (m: ComparisonMode) => void
}): React.JSX.Element {
  const opts: { id: ComparisonMode; label: string }[] = [
    { id: 'econ', label: 'Wages & Fringes' },
    { id: 'lang', label: 'Contract Language' },
  ]
  return (
    <div style={{
      display: 'inline-flex', background: '#F1F5F9',
      border: '1px solid #E2E8F0', borderRadius: 8, padding: 3, gap: 3,
    }}>
      {opts.map((o) => {
        const active = mode === o.id
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            style={{
              padding: '7px 16px', fontSize: 13,
              fontWeight: active ? 600 : 500,
              color: active ? '#fff' : '#475569',
              background: active ? '#1E3A8A' : 'transparent',
              border: 'none', borderRadius: 6, cursor: 'pointer',
              boxShadow: active ? '0 1px 2px rgba(30,58,138,0.25)' : 'none',
            }}
          >{o.label}</button>
        )
      })}
    </div>
  )
}

// ─── FilterTabs ───────────────────────────────────────────────────────────────

export type FilterValue = 'all' | SheetStatus

export function FilterTabs({ value, onChange, counts }: {
  value: FilterValue
  onChange: (v: FilterValue) => void
  counts: { total: number; open: number; agreed: number; tabled: number }
}): React.JSX.Element {
  const tabs: { id: FilterValue; label: string; n: number }[] = [
    { id: 'all',    label: 'All',    n: counts.total },
    { id: 'open',   label: 'Open',   n: counts.open },
    { id: 'agreed', label: 'Agreed', n: counts.agreed },
    { id: 'tabled', label: 'Tabled', n: counts.tabled },
  ]
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid #E2E8F0', paddingLeft: 28, background: '#fff', flexShrink: 0 }}>
      {tabs.map((t) => {
        const active = value === t.id
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              padding: '12px 16px', fontSize: 13,
              fontWeight: active ? 600 : 400,
              color: active ? '#1E3A8A' : '#64748B',
              background: 'none', border: 'none',
              borderBottom: active ? '2px solid #1E3A8A' : '2px solid transparent',
              cursor: 'pointer', marginBottom: -1,
              display: 'flex', alignItems: 'center', gap: 7,
            }}
          >
            {t.label}
            <span style={{
              fontSize: 11, fontWeight: 600,
              color: active ? '#1E3A8A' : '#94A3B8',
              background: active ? '#EFF6FF' : '#F1F5F9',
              borderRadius: 999, padding: '1px 7px',
              fontVariantNumeric: 'tabular-nums',
            }}>{t.n}</span>
          </button>
        )
      })}
    </div>
  )
}

// ─── ExpandedDetail ───────────────────────────────────────────────────────────
// The shared "Rationale / Last movement" accordion row used by both grids.

export function ExpandedDetail({ note, movement }: {
  note: string | null
  movement: string | null
}): React.JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 28, padding: '4px 0 6px', borderTop: '1px dashed #E2E8F0' }}>
      <div style={{ flex: 1, paddingTop: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8', marginBottom: 5 }}>Rationale</div>
        <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.5, margin: 0 }}>{note || '—'}</p>
      </div>
      <div style={{ width: 260, flexShrink: 0, paddingTop: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8', marginBottom: 5 }}>Last movement</div>
        <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.5, margin: 0 }}>{movement || '—'}</p>
      </div>
    </div>
  )
}

// ─── Column header cell (used in EconomicGrid table) ─────────────────────────

export function ColHeader({ col, sub }: {
  col: typeof COLS[keyof typeof COLS]
  sub: string
}): React.JSX.Element {
  return (
    <th
      scope="col"
      style={{
        padding: '8px 14px', textAlign: 'left',
        background: col.bg,
        borderBottom: `2px solid ${col.accent}`,
        borderLeft: `1px solid ${col.line}`,
        borderRight: `1px solid ${col.line}`,
        verticalAlign: 'bottom',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: col.accent }}>{col.label}</div>
      <div style={{ fontSize: 10, fontWeight: 500, color: '#94A3B8', marginTop: 2 }}>{sub}</div>
    </th>
  )
}
