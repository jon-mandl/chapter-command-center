// EconomicGrid.jsx — "Wages & Fringes" comparison table. Design reference only.

function EconomicGrid({ filter }) {
  const FMT = window.CCC_FMT, COLS = window.CCC_COLS, N = window.CCC_NEG;
  const [sort, setSort] = React.useState('article');
  const [open, setOpen] = React.useState(null);
  React.useEffect(() => setOpen(null), [filter]);

  const passFilter = (it) => filter === 'all' || it.status === filter;

  const posDelta = (it, key) => {
    const d = it[key] - it.cur;
    if (Math.abs(d) < 1e-9) return null;
    const s = d > 0 ? '+' : '−', a = Math.abs(d);
    switch (it.fmt) {
      case 'usd': return s + '$' + a.toFixed(2);
      case 'usdDay': return s + '$' + a.toFixed(0);
      case 'pct': return s + a + ' pts';
      case 'hrs': return s + a + ' hrs';
      case 'mi': return s + a + ' mi';
      case 'ratio': return s + a.toFixed(0) + ' app';
      default: return s + a;
    }
  };

  const gapScore = (it) => (it.costU == null || it.costM == null) ? -1 : Math.abs(it.costU - it.costM);
  const statusRank = { open: 0, tabled: 1, agreed: 2 };

  let rows = [];
  if (sort === 'article') {
    N.articles.forEach((a) => {
      const items = a.items.filter(passFilter);
      if (!items.length) return;
      rows.push({ kind: 'divider', article: a, key: 'd-' + a.id });
      items.forEach((it) => rows.push({ kind: 'item', it, key: it.id }));
    });
  } else {
    const flat = window.CCC_ALL_ITEMS().filter(passFilter);
    flat.sort((x, y) => sort === 'gap' ? gapScore(y) - gapScore(x) : statusRank[x.status] - statusRank[y.status]);
    rows = flat.map((it) => ({ kind: 'item', it, key: it.id }));
  }

  const HCell = ({ col, sub }) => (
    <th style={{ padding: '8px 14px', textAlign: 'left', background: col.bg, borderBottom: '2px solid ' + col.accent, borderLeft: '1px solid ' + col.line, borderRight: '1px solid ' + col.line, verticalAlign: 'bottom' }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: col.accent }}>{col.label}</div>
      <div style={{ fontSize: 10, fontWeight: 500, color: '#94A3B8', marginTop: 2 }}>{sub}</div>
    </th>
  );
  const thBase = { padding: '8px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748B', borderBottom: '1px solid #E2E8F0', background: '#fff', verticalAlign: 'bottom' };

  const PosCell = ({ it, col, accentVal }) => {
    const d = col.key === 'cur' ? null : posDelta(it, col.key);
    return (
      <td style={{ padding: '9px 14px', background: col.bg, borderLeft: '1px solid ' + col.line, borderRight: '1px solid ' + col.line, borderBottom: '1px solid #F1F5F9' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: accentVal ? col.accent : '#0F172A', fontVariantNumeric: 'tabular-nums' }}>{FMT.value(it[col.key], it.fmt)}</div>
        {d && <div style={{ fontSize: 11, color: col.accent, marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>{d}</div>}
      </td>
    );
  };

  const SortBtn = ({ id, children }) => (
    <button onClick={() => setSort(id)} style={{ padding: '5px 11px', fontSize: 12, fontWeight: sort === id ? 600 : 500, color: sort === id ? '#1E3A8A' : '#64748B', background: sort === id ? '#EFF6FF' : '#fff', border: '1px solid ' + (sort === id ? '#BFD3F2' : '#E2E8F0'), borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}>{children}</button>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 28px', background: '#fff', borderBottom: '1px solid #F1F5F9' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8' }}>Sort</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <SortBtn id="article">By article</SortBtn>
            <SortBtn id="gap">Largest gap</SortBtn>
            <SortBtn id="status">By status</SortBtn>
          </div>
        </div>
        <span style={{ fontSize: 12, color: '#94A3B8' }}>Click any row to see rationale &amp; movement</span>
      </div>
      <div style={{ padding: '16px 28px 28px' }}>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '26%' }} /><col style={{ width: '15%' }} /><col style={{ width: '15%' }} /><col style={{ width: '15%' }} /><col style={{ width: '14%' }} /><col style={{ width: '15%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={thBase}>Item</th>
                <HCell col={COLS.cur} sub="in effect" />
                <HCell col={COLS.uni} sub="proposal" />
                <HCell col={COLS.mgmt} sub="counter" />
                <th style={thBase}>Δ cost / hr</th>
                <th style={thBase}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                if (r.kind === 'divider') {
                  return (
                    <tr key={r.key}>
                      <td colSpan={6} style={{ padding: '9px 14px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', borderTop: '1px solid #E2E8F0' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#475569' }}>{r.article.code} · {r.article.title}</span>
                        <span style={{ fontSize: 11, color: '#94A3B8', marginLeft: 8 }}>{r.article.items.length} items</span>
                      </td>
                    </tr>
                  );
                }
                const it = r.it, isOpen = open === it.id;
                return (
                  <React.Fragment key={r.key}>
                    <tr onClick={() => setOpen(isOpen ? null : it.id)} style={{ cursor: 'pointer', background: isOpen ? '#FBFCFE' : '#fff' }}>
                      <td style={{ padding: '9px 14px', borderBottom: isOpen ? 'none' : '1px solid #F1F5F9', verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {it.priority && <PriorityFlag />}
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{it.name}</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>§ {it.section} · {it.unit} · {it.party} proposal</div>
                      </td>
                      <PosCell it={it} col={COLS.cur} />
                      <PosCell it={it} col={COLS.uni} accentVal />
                      <PosCell it={it} col={COLS.mgmt} accentVal />
                      <td style={{ padding: '9px 14px', borderBottom: isOpen ? 'none' : '1px solid #F1F5F9', verticalAlign: 'top' }}>
                        {it.costU == null ? <span style={{ fontSize: 12, color: '#94A3B8' }}>work rule</span> : (
                          <div style={{ fontVariantNumeric: 'tabular-nums' }}>
                            <div style={{ fontSize: 12, color: COLS.uni.accent, fontWeight: 600 }}>U {FMT.hrDelta(it.costU)}</div>
                            <div style={{ fontSize: 12, color: COLS.mgmt.accent, fontWeight: 600, marginTop: 1 }}>M {FMT.hrDelta(it.costM)}</div>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '9px 14px', borderBottom: isOpen ? 'none' : '1px solid #F1F5F9', verticalAlign: 'top' }}>
                        <StatusCell item={it} />
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={6} style={{ padding: '0 14px 14px', background: '#FBFCFE', borderBottom: '1px solid #F1F5F9' }}>
                          <div style={{ display: 'flex', gap: 28, padding: '4px 0 6px', borderTop: '1px dashed #E2E8F0' }}>
                            <div style={{ flex: 1, paddingTop: 10 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8', marginBottom: 5 }}>Rationale</div>
                              <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.5, margin: 0 }}>{it.note}</p>
                            </div>
                            <div style={{ width: 260, flexShrink: 0, paddingTop: 10 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8', marginBottom: 5 }}>Last movement</div>
                              <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.5, margin: 0 }}>{it.movement}</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
window.EconomicGrid = EconomicGrid;
