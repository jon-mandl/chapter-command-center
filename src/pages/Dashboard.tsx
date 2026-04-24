import { useOrg } from '../lib/useOrg'

export default function Dashboard(): React.JSX.Element {
  const { orgId, loading } = useOrg()

  return (
    <div style={{ padding: '32px' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
        Command Center
      </h1>
      {loading ? (
        <p style={{ fontSize: '13px', color: '#64748B' }}>Loading…</p>
      ) : (
        <p style={{ fontSize: '13px', color: '#64748B' }}>
          Organization ID: {orgId}
        </p>
      )}
    </div>
  )
}
