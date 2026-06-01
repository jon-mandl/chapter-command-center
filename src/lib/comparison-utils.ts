// Formatters and helpers for the Negotiation Comparison Sheet.

export type EconFmt = 'usd' | 'usdDay' | 'pct' | 'hrs' | 'mi' | 'ratio'

export function formatValue(v: number | null, fmt: EconFmt): string {
  if (v == null) return '—'
  switch (fmt) {
    case 'usd':    return '$' + v.toFixed(2)
    case 'usdDay': return '$' + v.toFixed(0)
    case 'pct':    return v + '%'
    case 'hrs':    return v + ' hrs'
    case 'mi':     return v + ' mi'
    case 'ratio':  return '1:' + v.toFixed(0)
    default:       return String(v)
  }
}

// Signed delta between a position value and current, formatted per unit type.
// Returns null when the delta is effectively zero.
export function formatDelta(delta: number, fmt: EconFmt): string | null {
  if (Math.abs(delta) < 1e-9) return null
  const sign = delta > 0 ? '+' : '−'
  const abs = Math.abs(delta)
  switch (fmt) {
    case 'usd':    return sign + '$' + abs.toFixed(2)
    case 'usdDay': return sign + '$' + abs.toFixed(0)
    case 'pct':    return sign + abs + ' pts'
    case 'hrs':    return sign + abs + ' hrs'
    case 'mi':     return sign + abs + ' mi'
    case 'ratio':  return sign + abs.toFixed(0) + ' app'
    default:       return sign + String(abs)
  }
}

// Signed $/hr cost delta — e.g. "+$2.50", "−$1.25", "$0.00", "—"
export function formatHrDelta(cost: number | null): string {
  if (cost == null) return '—'
  if (cost === 0) return '$0.00'
  return (cost > 0 ? '+$' : '−$') + Math.abs(cost).toFixed(2)
}

// Annualized dollar amount — "$8.4M", "$150K", "$500"
export function formatMoney(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M'
  if (abs >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K'
  return '$' + n.toFixed(0)
}

// ─── Column identity (shared across all grids) ────────────────────────────────

export interface ColDef {
  label: string
  accent: string
  bg: string
  line: string
}

export const COLS = {
  cur:  { label: 'Current',    accent: '#475569', bg: '#F8FAFC', line: '#E2E8F0' },
  uni:  { label: 'Union',      accent: '#1E3A8A', bg: '#EFF6FF', line: '#BFD3F2' },
  mgmt: { label: 'Management', accent: '#92400E', bg: '#FFFBEB', line: '#FDE68A' },
} as const satisfies Record<string, ColDef>

// ─── Status display ───────────────────────────────────────────────────────────

// Maps Supabase proposal statuses to comparison-sheet display values.
// Supabase: Open | TA | Withdrawn | Rejected
// Sheet:    open | agreed | tabled
export type SheetStatus = 'open' | 'agreed' | 'tabled'

export function toSheetStatus(dbStatus: string): SheetStatus {
  if (dbStatus === 'TA') return 'agreed'
  if (dbStatus === 'Withdrawn' || dbStatus === 'Rejected') return 'tabled'
  return 'open'
}

export const STATUS_DISPLAY: Record<SheetStatus, { tone: 'info' | 'success' | 'neutral'; label: string }> = {
  open:   { tone: 'info',    label: 'Open' },
  agreed: { tone: 'success', label: 'Agreed (TA)' },
  tabled: { tone: 'neutral', label: 'Tabled' },
}

// ─── Pill tones ───────────────────────────────────────────────────────────────

export const PILL_TONES = {
  success: { bg: '#f0fdf4', color: '#059669', border: '#bbf7d0' },
  warning: { bg: '#FFFBEB', color: '#92400E', border: '#fde68a' },
  danger:  { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  info:    { bg: '#EFF6FF', color: '#1E3A8A', border: '#dbeafe' },
  neutral: { bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' },
} as const

export type PillTone = keyof typeof PILL_TONES
