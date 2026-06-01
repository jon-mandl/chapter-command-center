// shared.jsx — chrome + primitives shared by all comparison-sheet layouts.

const FMT = window.CCC_FMT;
const STATUS = window.CCC_STATUS;
const SUB = window.CCC_SUB;

const COLS = {
  cur:  { key: 'cur',  label: 'Current',    accent: '#475569', bg: '#F8FAFC', line: '#E2E8F0' },
  uni:  { key: 'uni',  label: 'Union',      accent: '#1E3A8A', bg: '#EFF6FF', line: '#BFD3F2' },
  mgmt: { key: 'mgmt', label: 'Management', accent: '#92400E', bg: '#FFFBEB', line: '#FDE68A' },
};
window.CCC_COLS = COLS;

const PILL_TONES = {
  success: { bg: '#f0fdf4', color: '#059669', border: '#bbf7d0' },
  warning: { bg: '#FFFBEB', color: '#92400E', border: '#fde68a' },
  danger:  { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  info:    { bg: '#EFF6FF', color: '#1E3A8A', border: '#dbeafe' },
  neutral: { bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' },
};

function Pill({ tone = 'neutral', children, style }) {
  const c = PILL_TONES[tone] || PILL_TONES.neutral;
  return (
    <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999, whiteSpace: 'nowrap', background: c.bg, color: c.color, border: '1px solid ' + c.border, ...style }}>{children}</span>
  );
}

function StatusCell({ item }) {
  const s = STATUS[item.status];
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <Pill tone={s.tone}>{s.label}</Pill>
      {item.sub && SUB[item.sub] && <Pill tone={SUB[item.sub].tone}>{SUB[item.sub].label}</Pill>}
    </span>
  );
}

function PriorityFlag({ size = 8, style }) {
  return <span title="Key issue" style={{ display: 'inline-block', width: size, height: size, background: '#92400E', transform: 'rotate(45deg)', borderRadius: 1, flexShrink: 0, ...style }} />;
}

const btnPrimary = { padding: '8px 14px', fontSize: 13, fontWeight: 600, background: '#1E3A8A', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' };
const btnSecondary = { padding: '8px 14px', fontSize: 13, fontWeight: 500, background: '#fff', color: '#0F172A', border: '1px solid #CBD5E1', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' };

function SheetHeader({ children }) {
  const N = window.CCC_NEG;
  return (
    <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '20px 28px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748B', marginBottom: 6 }}>Negotiation Comparison Sheet</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', margin: 0, letterSpacing: '-0.01em' }}>{N.name}</h1>
            <Pill tone="info" style={{ fontSize: 11 }}>Local {N.local}</Pill>
          </div>
          <div style={{ display: 'flex', gap: 18, fontSize: 13, color: '#64748B', flexWrap: 'wrap' }}>
            <span>{N.counterparty}</span>
            <span>Agreement expires {N.expires}</span>
            <span>{N.round}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button style={btnSecondary}>Export PDF</button>
          <button style={btnPrimary}>Share with Committee</button>
        </div>
      </div>
      {children}
    </div>
  );
}

function SummaryStrip() {
  const N = window.CCC_NEG, c = window.CCC_COUNTS(), r = N.rollup;
  const annualGap = r.gapHr * N.unitSize * N.annualHours;
  const Count = ({ n, label, tone }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
      <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: tone }}>{label}</span>
    </div>
  );
  const Cost = ({ col, value, sub }) => (
    <div style={{ flex: 1, minWidth: 0, padding: '12px 16px', borderRadius: 8, background: col.bg, border: '1px solid ' + col.line }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: col.accent, marginBottom: 6 }}>{col.label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>{sub}</div>
    </div>
  );
  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'stretch', marginTop: 18, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: 24, alignItems: 'center', padding: '4px 4px 4px 0' }}>
        <Count n={c.total} label="Items" tone="#64748B" />
        <div style={{ width: 1, alignSelf: 'stretch', background: '#E2E8F0' }} />
        <Count n={c.open} label="Open" tone="#1E3A8A" />
        <Count n={c.agreed} label="Agreed" tone="#059669" />
        <Count n={c.tabled} label="Tabled" tone="#64748B" />
      </div>
      <div style={{ width: 1, alignSelf: 'stretch', background: '#E2E8F0' }} />
      <div style={{ flex: 1, minWidth: 360 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748B' }}>Package cost · per compensated hour</span>
          <span style={{ fontSize: 12, color: '#92400E', fontWeight: 600 }}>Parties {FMT.money(annualGap)}/yr apart</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Cost col={COLS.uni} value={'+$' + r.unionHr.toFixed(2)} sub="union ask vs. current" />
          <Cost col={COLS.mgmt} value={'+$' + r.mgmtHr.toFixed(2)} sub="mgmt offer vs. current" />
          <Cost col={{ label: 'Gap', accent: '#0F172A', bg: '#fff', line: '#CBD5E1' }} value={'$' + r.gapHr.toFixed(2)} sub="distance to close" />
        </div>
      </div>
    </div>
  );
}

function FilterTabs({ value, onChange, counts }) {
  const tabs = [
    { id: 'all', label: 'All', n: counts.total },
    { id: 'open', label: 'Open', n: counts.open },
    { id: 'agreed', label: 'Agreed', n: counts.agreed },
    { id: 'tabled', label: 'Tabled', n: counts.tabled },
  ];
  return (
    <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #E2E8F0', paddingLeft: 28, background: '#fff' }}>
      {tabs.map((t) => {
        const active = value === t.id;
        return (
          <button key={t.id} onClick={() => onChange(t.id)} style={{ padding: '12px 16px', fontSize: 13, fontWeight: active ? 600 : 400, color: active ? '#1E3A8A' : '#64748B', background: 'none', border: 'none', borderBottom: active ? '2px solid #1E3A8A' : '2px solid transparent', cursor: 'pointer', marginBottom: -1, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 7 }}>
            {t.label}
            <span style={{ fontSize: 11, fontWeight: 600, color: active ? '#1E3A8A' : '#94A3B8', background: active ? '#EFF6FF' : '#F1F5F9', borderRadius: 999, padding: '1px 7px', fontVariantNumeric: 'tabular-nums' }}>{t.n}</span>
          </button>
        );
      })}
    </div>
  );
}

Object.assign(window, { Pill, StatusCell, PriorityFlag, SheetHeader, SummaryStrip, FilterTabs });
