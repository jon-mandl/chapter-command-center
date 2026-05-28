import { useState } from 'react'
import MembersDirectory from './MembersDirectory'
import MembersCommittees from './MembersCommittees'
import MembersHours from './MembersHours'
import MembersServiceCharge from './MembersServiceCharge'

type SubPage = 'directory' | 'committees' | 'hours' | 'service_charge'

const TABS: { id: SubPage; label: string }[] = [
  { id: 'directory',      label: 'Employer Directory' },
  { id: 'committees',     label: 'Committees' },
  { id: 'hours',          label: 'Member Hours' },
  { id: 'service_charge', label: 'Service Charge' },
]

export default function Members(): React.JSX.Element {
  const [tab, setTab] = useState<SubPage>('directory')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: '0', borderBottom: '1px solid #E2E8F0',
        background: '#fff', paddingLeft: '32px', flexShrink: 0
      }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '14px 18px',
              fontSize: '13px',
              fontWeight: tab === t.id ? 600 : 400,
              color: tab === t.id ? '#1E3A8A' : '#64748B',
              background: 'none',
              border: 'none',
              borderBottom: tab === t.id ? '2px solid #1E3A8A' : '2px solid transparent',
              cursor: 'pointer',
              marginBottom: '-1px',
              transition: 'color 0.15s'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Sub-page content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'directory'      && <MembersDirectory />}
        {tab === 'committees'     && <MembersCommittees />}
        {tab === 'hours'          && <MembersHours />}
        {tab === 'service_charge' && <MembersServiceCharge />}
      </div>
    </div>
  )
}
