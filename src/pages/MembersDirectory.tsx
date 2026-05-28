import { card } from '../lib/ui'

export default function MembersDirectory(): React.JSX.Element {
  return (
    <div style={{ padding: '28px 32px', maxWidth: '960px' }}>
      <div style={card}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '8px' }}>Employer Directory — being rebuilt</div>
        <div style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.6 }}>
          The directory is being rewired to the live <code>member_companies</code> schema. Coming back shortly.
        </div>
      </div>
    </div>
  )
}
