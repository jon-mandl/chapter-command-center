import { card } from '../lib/ui'

export default function MembersCommittees(): React.JSX.Element {
  return (
    <div style={{ padding: '28px 32px', maxWidth: '960px' }}>
      <div style={card}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '8px' }}>Committees — being rebuilt</div>
        <div style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.6 }}>
          Committees are being rewired to the live <code>committees</code> + <code>committee_members</code>
          schema. Coming back shortly.
        </div>
      </div>
    </div>
  )
}
