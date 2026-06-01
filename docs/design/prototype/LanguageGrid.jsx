// LanguageGrid.jsx — "Contract Language" comparison cards. Design reference only.

function LanguageGrid({ filter }) {
  const COLS = window.CCC_COLS, L = window.CCC_LANG;
  const [open, setOpen] = React.useState(null);
  React.useEffect(() => setOpen(null), [filter]);
  const passFilter = (it) => filter === 'all' || it.status === filter;

  const Col = ({ col, kind, data }) => {
    let body, tag, tagTone, muted = false;
    if (kind === 'current') {
      if (data == null) { body = 'No current language — this is a new clause.'; tag = 'New clause'; muted = true; }
      else { body = data; tag = 'In effect'; }
    } else {
      if (!data.change) { body = 'No change proposed — accepts current language.'; tag = 'No change'; muted = true; }
      else { body = data.text; tag = (col.key === 'uni' ? 'Union' : 'Mgmt') + ' change'; tagTone = true; }
    }
    return (
      <div style={{ background: col.bg, borderLeft: '1px solid ' + col.line, padding: '12px 16px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: col.accent }}>{col.label}</span>
          <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '2px 7px', borderRadius: 999, color: tagTone ? '#fff' : col.accent, background: tagTone ? col.accent : 'transparent', border: tagTone ? 'none' : '1px solid ' + col.line, opacity: muted ? 0.7 : 1 }}>{tag}</span>
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.55, margin: 0, color: muted ? '#94A3B8' : '#1E293B', fontStyle: muted ? 'italic' : 'normal' }}>{body}</p>
      </div>
    );
  };

  return (
    <div style={{ padding: '18px 28px 32px' }}>
      {L.articles.map((a) => {
        const items = a.items.filter(passFilter);
        if (!items.length) return null;
        return (
          <div key={a.id} style={{ marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #E2E8F0' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{a.code}</span>
              <span style={{ fontSize: 13, color: '#475569' }}>{a.title}</span>
              <span style={{ fontSize: 11, color: '#94A3B8' }}>{items.length} {items.length === 1 ? 'provision' : 'provisions'}</span>
            </div>
            {items.map((it) => {
              const isOpen = open === it.id;
              return (
                <div key={it.id} style={{ background: '#fff', border: '1px solid ' + (isOpen ? '#CBD5E1' : '#E2E8F0'), borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
                  <div onClick={() => setOpen(isOpen ? null : it.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '11px 16px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                      {it.priority && <PriorityFlag />}
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{it.name}</span>
                      <span style={{ fontSize: 11, color: '#94A3B8' }}>§ {it.section}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      <StatusCell item={it} />
                      <span style={{ fontSize: 11, color: '#94A3B8', width: 54, textAlign: 'right' }}>{isOpen ? 'Hide' : 'Notes'}</span>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
                    <Col col={COLS.cur} kind="current" data={it.current} />
                    <Col col={COLS.uni} kind="party" data={it.union} />
                    <Col col={COLS.mgmt} kind="party" data={it.mgmt} />
                  </div>
                  {isOpen && (
                    <div style={{ display: 'flex', gap: 28, padding: '14px 16px', borderTop: '1px solid #E2E8F0', background: '#FBFCFE' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8', marginBottom: 5 }}>Drafting note</div>
                        <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.5, margin: 0 }}>{it.note}</p>
                      </div>
                      <div style={{ width: 260, flexShrink: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8', marginBottom: 5 }}>Last movement</div>
                        <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.5, margin: 0 }}>{it.movement}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
window.LanguageGrid = LanguageGrid;
