import { card } from '../lib/ui'

export default function MembersServiceCharge(): React.JSX.Element {
  return (
    <div style={{ padding: '28px 32px', maxWidth: '960px' }}>
      <div style={card}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '8px' }}>Service Charge — being rebuilt</div>
        <div style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.6 }}>
          Service charge calculation will return once the underlying hours and company pages are
          rewired to the live schema.
        </div>
      </div>
    </div>
  )
}
