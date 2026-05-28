import { card } from '../lib/ui'

export default function MembersHours(): React.JSX.Element {
  return (
    <div style={{ padding: '28px 32px', maxWidth: '960px' }}>
      <div style={card}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '8px' }}>Member Hours — being rebuilt</div>
        <div style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.6 }}>
          Hours tracking is being rewired to the live <code>workforce_hours</code> schema
          (monthly entries by <code>report_month</code>). Coming back shortly.
        </div>
      </div>
    </div>
  )
}
