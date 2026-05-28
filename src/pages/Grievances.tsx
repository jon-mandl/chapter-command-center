import { card } from '../lib/ui'

export default function Grievances(): React.JSX.Element {
  return (
    <div style={{ padding: '28px 32px', maxWidth: '960px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#0F172A', margin: 0 }}>Grievances</h1>
      <p style={{ fontSize: '13px', color: '#64748B', margin: '6px 0 24px' }}>Track grievances through filing, LMC, CIR, and resolution.</p>
      <div style={card}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '8px' }}>Being rebuilt</div>
        <div style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.6 }}>
          This page is being rewritten against the current database schema (the previous version targeted
          tables that don't exist in the live project). Coming back online shortly.
        </div>
      </div>
    </div>
  )
}
