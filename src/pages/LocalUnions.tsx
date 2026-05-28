import { card } from '../lib/ui'

export default function LocalUnions(): React.JSX.Element {
  return (
    <div style={{ padding: '28px 32px', maxWidth: '960px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#0F172A', margin: 0 }}>Local Unions</h1>
      <p style={{ fontSize: '13px', color: '#64748B', margin: '6px 0 24px' }}>Manage local unions, wage packages, and components.</p>
      <div style={card}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '8px' }}>Being rebuilt</div>
        <div style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.6 }}>
          This page is being rewritten against the current database schema (wage_packages + wage_components
          replaced the previous package_rates / wage_tiers tables). Coming back online shortly.
        </div>
      </div>
    </div>
  )
}
