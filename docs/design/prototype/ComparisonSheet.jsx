// ComparisonSheet.jsx — full shell. Design reference only.

function ModeToggle({ mode, onChange }) {
  const opts = [{ id: 'econ', label: 'Wages & Fringes' }, { id: 'lang', label: 'Contract Language' }];
  return (
    <div style={{ display: 'inline-flex', background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 8, padding: 3, gap: 3 }}>
      {opts.map((o) => {
        const active = mode === o.id;
        return <button key={o.id} onClick={() => onChange(o.id)} style={{ padding: '7px 16px', fontSize: 13, fontWeight: active ? 600 : 500, color: active ? '#fff' : '#475569', background: active ? '#1E3A8A' : 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', boxShadow: active ? '0 1px 2px rgba(30,58,138,0.25)' : 'none' }}>{o.label}</button>;
      })}
    </div>
  );
}

function LanguageSummary() {
  const COLS = window.CCC_COLS, c = window.CCC_LANG_COUNTS();
  const Count = ({ n, label, tone }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
      <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: tone }}>{label}</span>
    </div>
  );
  const Tile = ({ n, label, col }) => (
    <div style={{ flex: 1, padding: '12px 16px', borderRadius: 8, background: col.bg, border: '1px solid ' + col.line }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{n}</div>
      <div style={{ fontSize: 12, color: col.accent, marginTop: 5, fontWeight: 600 }}>{label}</div>
    </div>
  );
  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'stretch', marginTop: 18, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: 24, alignItems: 'center', padding: '4px 4px 4px 0' }}>
        <Count n={c.total} label="Provisions" tone="#64748B" />
        <div style={{ width: 1, alignSelf: 'stretch', background: '#E2E8F0' }} />
        <Count n={c.open} label="Open" tone="#1E3A8A" />
        <Count n={c.agreed} label="Agreed" tone="#059669" />
        <Count n={c.tabled} label="Tabled" tone="#64748B" />
      </div>
      <div style={{ width: 1, alignSelf: 'stretch', background: '#E2E8F0' }} />
      <div style={{ flex: 1, minWidth: 360 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748B', marginBottom: 8 }}>Where the changes are</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Tile n={c.fresh} label="New clauses" col={{ accent: '#475569', bg: '#F8FAFC', line: '#E2E8F0' }} />
          <Tile n={c.mgmtOnly} label="Management-only changes" col={COLS.mgmt} />
          <Tile n={c.unionOnly} label="Union-only changes" col={COLS.uni} />
        </div>
      </div>
    </div>
  );
}

function ComparisonSheet() {
  const [mode, setMode] = React.useState('econ');
  const [filter, setFilter] = React.useState('all');
  const counts = mode === 'econ' ? window.CCC_COUNTS() : window.CCC_LANG_COUNTS();
  React.useEffect(() => setFilter('all'), [mode]);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#F8FAFC', fontFamily: 'var(--ccc-font-sans)', overflow: 'hidden' }}>
      <SheetHeader>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginTop: 16 }}>
          <ModeToggle mode={mode} onChange={setMode} />
          <span style={{ fontSize: 12, color: '#94A3B8' }}>{mode === 'econ' ? 'Economic terms — dollar values per item' : 'Contract language — clause text, side by side'}</span>
        </div>
        {mode === 'econ' ? <SummaryStrip /> : <LanguageSummary />}
      </SheetHeader>
      <FilterTabs value={filter} onChange={setFilter} counts={counts} />
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {mode === 'econ' ? <EconomicGrid filter={filter} /> : <LanguageGrid filter={filter} />}
      </div>
    </div>
  );
}
window.ComparisonSheet = ComparisonSheet;
