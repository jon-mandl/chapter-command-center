import { useState } from 'react'
import { SHORT_MONTHS } from '../lib/serviceCharge'
import { COLORS } from '../lib/ui'

// Monthly member-hours line chart, hand-rolled SVG (no chart library).
// One series (navy), markers only on months that have reported data, and the
// line never bridges months with no report. Hovering a month column shows a
// crosshair + tooltip.

interface HoursChartProps {
  monthlyTotals: number[] // 12 sums, Jan..Dec
  monthsWithData: boolean[] // 12 flags — true when any row was reported
  year: number
}

// SVG user units; the svg scales to the card width via viewBox.
const W = 720
const H = 240
const M = { top: 14, right: 14, bottom: 28, left: 56 }
const PLOT_W = W - M.left - M.right
const PLOT_H = H - M.top - M.bottom

// Round up to a 1/2/5 × 10^n ceiling so the y-axis labels are clean.
function niceMax(v: number): number {
  if (v <= 0) return 100
  const base = Math.pow(10, Math.floor(Math.log10(v)))
  const m = v / base
  const nice = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10
  return nice * base
}

export default function HoursChart({ monthlyTotals, monthsWithData, year }: HoursChartProps): React.JSX.Element {
  const [hovered, setHovered] = useState<number | null>(null)

  const dataMonths = monthsWithData.filter(Boolean).length
  if (dataMonths === 0) {
    return (
      <div style={{ padding: '48px 16px', textAlign: 'center', fontSize: '13px', color: '#94A3B8' }}>
        No hours recorded for {year} yet. Add or import hours in the Member Hub.
      </div>
    )
  }

  const maxVal = niceMax(Math.max(...monthlyTotals))
  const x = (m: number): number => M.left + (PLOT_W * (m + 0.5)) / 12
  const y = (v: number): number => M.top + PLOT_H * (1 - v / maxVal)

  // Consecutive runs of reported months become separate line segments, so the
  // line never spans a gap in the data.
  const segments: number[][] = []
  let run: number[] = []
  for (let m = 0; m < 12; m++) {
    if (monthsWithData[m]) {
      run.push(m)
    } else if (run.length > 0) {
      segments.push(run)
      run = []
    }
  }
  if (run.length > 0) segments.push(run)

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxVal)
  const fmt = (v: number): string => Math.round(v).toLocaleString()

  const tooltipLeftPct = hovered != null ? (x(hovered) / W) * 100 : 0
  const tooltipShift = hovered != null && hovered <= 1 ? '0%' : hovered != null && hovered >= 10 ? '-100%' : '-50%'

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label={`Member hours by month for ${year}: ${dataMonths} month${dataMonths === 1 ? '' : 's'} reported, peak ${fmt(Math.max(...monthlyTotals))} hours.`}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} stroke={v === 0 ? '#E2E8F0' : '#F1F5F9'} strokeWidth={1} />
            <text x={M.left - 8} y={y(v) + 3.5} textAnchor="end" fontSize={11} fill="#64748B">{fmt(v)}</text>
          </g>
        ))}

        {SHORT_MONTHS.map((label, m) => (
          <text
            key={label}
            x={x(m)}
            y={H - 8}
            textAnchor="middle"
            fontSize={11}
            fontWeight={hovered === m ? 600 : 400}
            fill={hovered === m ? '#0F172A' : '#64748B'}
          >
            {label}
          </text>
        ))}

        {hovered != null && monthsWithData[hovered] && (
          <line x1={x(hovered)} x2={x(hovered)} y1={M.top} y2={M.top + PLOT_H} stroke="#CBD5E1" strokeWidth={1} />
        )}

        {segments.map((seg) =>
          seg.length > 1 ? (
            <polyline
              key={seg[0]}
              points={seg.map((m) => `${x(m)},${y(monthlyTotals[m])}`).join(' ')}
              fill="none"
              stroke={COLORS.navy}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null
        )}

        {SHORT_MONTHS.map((label, m) =>
          monthsWithData[m] ? (
            <circle
              key={label}
              cx={x(m)}
              cy={y(monthlyTotals[m])}
              r={hovered === m ? 5 : 4}
              fill="#fff"
              stroke={COLORS.navy}
              strokeWidth={2}
            />
          ) : null
        )}

        {/* Invisible full-height hover targets, one per month column */}
        {SHORT_MONTHS.map((label, m) => (
          <rect
            key={label}
            x={M.left + (PLOT_W * m) / 12}
            y={M.top}
            width={PLOT_W / 12}
            height={PLOT_H}
            fill="transparent"
            onMouseEnter={() => setHovered(m)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
      </svg>

      {hovered != null && monthsWithData[hovered] && (
        <div
          style={{
            position: 'absolute',
            left: `${tooltipLeftPct}%`,
            top: '2px',
            transform: `translateX(${tooltipShift})`,
            background: '#fff',
            border: '1px solid #E2E8F0',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(15, 23, 42, 0.12)',
            padding: '6px 10px',
            pointerEvents: 'none',
            whiteSpace: 'nowrap'
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#0F172A' }}>{SHORT_MONTHS[hovered]} {year}</div>
          <div style={{ fontSize: '12px', color: '#64748B' }}>{fmt(monthlyTotals[hovered])} hours</div>
        </div>
      )}
    </div>
  )
}
