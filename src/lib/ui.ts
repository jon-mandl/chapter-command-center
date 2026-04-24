// Shared style tokens — import from here, never redefine locally

export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: '13px',
  border: '1px solid #CBD5E1',
  borderRadius: '6px',
  outline: 'none',
  color: '#0F172A',
  background: '#fff',
  boxSizing: 'border-box'
}

export const btnPrimary: React.CSSProperties = {
  padding: '8px 16px',
  fontSize: '13px',
  fontWeight: 600,
  background: '#1E3A8A',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer'
}

export const btnSecondary: React.CSSProperties = {
  padding: '8px 16px',
  fontSize: '13px',
  fontWeight: 500,
  background: '#fff',
  color: '#0F172A',
  border: '1px solid #CBD5E1',
  borderRadius: '6px',
  cursor: 'pointer'
}

export const btnDanger: React.CSSProperties = {
  padding: '8px 16px',
  fontSize: '13px',
  fontWeight: 500,
  background: '#fff',
  color: '#dc2626',
  border: '1px solid #fca5a5',
  borderRadius: '6px',
  cursor: 'pointer'
}

export const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #E2E8F0',
  borderRadius: '8px',
  padding: '16px 20px',
  marginBottom: '12px'
}

export const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: '#64748B',
  marginBottom: '4px'
}

export const errorBox: React.CSSProperties = {
  fontSize: '13px',
  color: '#dc2626',
  background: '#fef2f2',
  border: '1px solid #fecaca',
  borderRadius: '6px',
  padding: '10px 14px',
  marginBottom: '12px'
}

export const thStyle: React.CSSProperties = {
  padding: '10px 14px',
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  color: '#64748B',
  textAlign: 'left' as const,
  borderBottom: '1px solid #E2E8F0',
  background: '#F8FAFC'
}

export const tdStyle: React.CSSProperties = {
  padding: '10px 14px',
  fontSize: '13px',
  color: '#0F172A',
  borderBottom: '1px solid #F1F5F9'
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  })
}
