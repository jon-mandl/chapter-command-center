import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useOrg } from '../lib/useOrg'
import { inputStyle, labelStyle, btnPrimary, btnSecondary, errorBox } from '../lib/ui'

// ─── Types ────────────────────────────────────────────────────────────────────

type SettingsTab = 'general' | 'fund-labels' | 'security'

const FUND_KEYS = [
  { key: 'fund_label_hw',   default: 'Health & Welfare' },
  { key: 'fund_label_supp_hw', default: 'Supplemental H&W' },
  { key: 'fund_label_pension', default: 'Pension' },
  { key: 'fund_label_annuity', default: 'Annuity' },
  { key: 'fund_label_401k',    default: '401(k)' },
  { key: 'fund_label_unemployment', default: 'Unemployment' },
  { key: 'fund_label_jatc',    default: 'JATC / Training' },
  { key: 'fund_label_neca_svc', default: 'NECA Service Charge' },
  { key: 'fund_label_admin',   default: 'Admin & Maintenance Fund' },
  { key: 'fund_label_lmcc',    default: 'LMCC' },
  { key: 'fund_label_nlmcc',   default: 'NLMCC' },
]

// ─── Shared section wrapper ────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '24px', marginBottom: '20px', maxWidth: '600px' }}>
      <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid #F1F5F9' }}>
        {title}
      </div>
      {children}
    </div>
  )
}

// ─── General Tab ──────────────────────────────────────────────────────────────

function GeneralTab({ orgId }: { orgId: string }): React.JSX.Element {
  const [orgName, setOrgName] = useState('')
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .single()
      .then(({ data, error: err }) => {
        if (!err && data) { setOrgName(data.name); setDraft(data.name) }
        setLoading(false)
      })
  }, [orgId])

  async function handleSave(): Promise<void> {
    const trimmed = draft.trim()
    if (!trimmed) { setError('Organization name cannot be empty.'); return }
    setSaving(true); setError(''); setSaved(false)
    const { error: err } = await supabase.from('organizations').update({ name: trimmed }).eq('id', orgId)
    if (err) { setError('Could not save. Please try again.') }
    else { setOrgName(trimmed); setSaved(true); setTimeout(() => setSaved(false), 2500) }
    setSaving(false)
  }

  if (loading) return <div style={{ fontSize: '13px', color: '#64748B' }}>Loading…</div>

  const isDirty = draft.trim() !== orgName

  return (
    <Section title="Organization">
      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>Organization Name</label>
        <input
          style={inputStyle}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setSaved(false) }}
          placeholder="e.g. NECA Chapter 51"
          maxLength={120}
        />
      </div>
      {error && <div style={errorBox}>{error}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button
          onClick={handleSave}
          disabled={!isDirty || saving}
          style={{ ...btnPrimary, opacity: !isDirty || saving ? 0.5 : 1 }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {isDirty && !saving && (
          <button onClick={() => setDraft(orgName)} style={btnSecondary}>Cancel</button>
        )}
        {saved && <span style={{ fontSize: '12px', color: '#059669', fontWeight: 500 }}>Saved.</span>}
      </div>
    </Section>
  )
}

// ─── Fund Labels Tab ───────────────────────────────────────────────────────────

function FundLabelsTab({ orgId }: { orgId: string }): React.JSX.Element {
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const keys = FUND_KEYS.map((f) => f.key)
    supabase
      .from('org_settings')
      .select('key, value')
      .eq('org_id', orgId)
      .in('key', keys)
      .then(({ data }) => {
        const stored: Record<string, string> = {}
        if (data) data.forEach((row) => { stored[row.key] = row.value })
        // Fill in defaults for any missing keys
        const full: Record<string, string> = {}
        FUND_KEYS.forEach((f) => { full[f.key] = stored[f.key] ?? f.default })
        setLabels(full)
        setDraft({ ...full })
        setLoading(false)
      })
  }, [orgId])

  async function handleSave(): Promise<void> {
    setSaving(true); setError(''); setSaved(false)
    const upserts = FUND_KEYS.map((f) => ({
      org_id: orgId,
      key: f.key,
      value: draft[f.key]?.trim() || f.default
    }))
    const { error: err } = await supabase.from('org_settings').upsert(upserts, { onConflict: 'org_id,key' })
    if (err) { setError('Could not save fund labels. Please try again.') }
    else {
      const saved_labels: Record<string, string> = {}
      upserts.forEach((u) => { saved_labels[u.key] = u.value })
      setLabels(saved_labels)
      setDraft({ ...saved_labels })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    }
    setSaving(false)
  }

  const isDirty = FUND_KEYS.some((f) => (draft[f.key] ?? '') !== (labels[f.key] ?? ''))

  if (loading) return <div style={{ fontSize: '13px', color: '#64748B' }}>Loading…</div>

  return (
    <Section title="Fund Labels">
      <p style={{ fontSize: '12px', color: '#64748B', marginBottom: '20px', marginTop: 0 }}>
        These names appear in wage package calculations and exports. Customize them to match your craft's terminology.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
        {FUND_KEYS.map((f) => (
          <div key={f.key}>
            <label style={{ ...labelStyle, fontSize: '11px', color: '#8896A5' }}>{f.default}</label>
            <input
              style={inputStyle}
              value={draft[f.key] ?? ''}
              onChange={(e) => setDraft((prev) => ({ ...prev, [f.key]: e.target.value }))}
              placeholder={f.default}
            />
          </div>
        ))}
      </div>
      {error && <div style={errorBox}>{error}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button
          onClick={handleSave}
          disabled={!isDirty || saving}
          style={{ ...btnPrimary, opacity: !isDirty || saving ? 0.5 : 1 }}
        >
          {saving ? 'Saving…' : 'Save Labels'}
        </button>
        {isDirty && !saving && (
          <button onClick={() => setDraft({ ...labels })} style={btnSecondary}>Cancel</button>
        )}
        {saved && <span style={{ fontSize: '12px', color: '#059669', fontWeight: 500 }}>Saved.</span>}
      </div>
    </Section>
  )
}

// ─── Security Tab ─────────────────────────────────────────────────────────────

function SecurityTab(): React.JSX.Element {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function handleChangePassword(): Promise<void> {
    setError(''); setSaved(false)
    if (!currentPassword) { setError('Enter your current password.'); return }
    if (newPassword.length < 8) { setError('New password must be at least 8 characters.'); return }
    if (newPassword !== confirmPassword) { setError('New passwords do not match.'); return }

    setSaving(true)

    // Re-authenticate with current password to verify it
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) { setError('Could not identify current user.'); setSaving(false); return }

    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword
    })
    if (signInErr) { setError('Current password is incorrect.'); setSaving(false); return }

    // Update to new password
    const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword })
    if (updateErr) { setError('Could not update password. Please try again.') }
    else {
      setSaved(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  return (
    <Section title="Change Password">
      <div style={{ marginBottom: '14px' }}>
        <label style={labelStyle}>Current Password</label>
        <input
          type="password"
          style={inputStyle}
          value={currentPassword}
          onChange={(e) => { setCurrentPassword(e.target.value); setError('') }}
          autoComplete="current-password"
        />
      </div>
      <div style={{ marginBottom: '14px' }}>
        <label style={labelStyle}>New Password</label>
        <input
          type="password"
          style={inputStyle}
          value={newPassword}
          onChange={(e) => { setNewPassword(e.target.value); setError('') }}
          autoComplete="new-password"
          placeholder="At least 8 characters"
        />
      </div>
      <div style={{ marginBottom: '20px' }}>
        <label style={labelStyle}>Confirm New Password</label>
        <input
          type="password"
          style={inputStyle}
          value={confirmPassword}
          onChange={(e) => { setConfirmPassword(e.target.value); setError('') }}
          autoComplete="new-password"
        />
      </div>
      {error && <div style={errorBox}>{error}</div>}
      {saved && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '10px 14px', fontSize: '13px', color: '#059669', marginBottom: '12px', fontWeight: 500 }}>
          Password updated successfully.
        </div>
      )}
      <button
        onClick={handleChangePassword}
        disabled={saving}
        style={{ ...btnPrimary, opacity: saving ? 0.5 : 1 }}
      >
        {saving ? 'Updating…' : 'Update Password'}
      </button>
    </Section>
  )
}

// ─── Settings Page ─────────────────────────────────────────────────────────────

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'general',     label: 'General' },
  { id: 'fund-labels', label: 'Fund Labels' },
  { id: 'security',    label: 'Security' },
]

export default function Settings(): React.JSX.Element {
  const { orgId, loading: orgLoading } = useOrg()
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')

  if (orgLoading) {
    return <div style={{ padding: '32px', fontSize: '13px', color: '#64748B' }}>Loading…</div>
  }

  return (
    <div style={{ padding: '28px 32px' }}>
      <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#0F172A', margin: '0 0 4px' }}>Settings</h1>
      <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 24px' }}>Manage your organization and account settings.</p>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid #E2E8F0', marginBottom: '28px' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '10px 18px',
              fontSize: '13px',
              fontWeight: activeTab === t.id ? 600 : 400,
              color: activeTab === t.id ? '#1E3A8A' : '#64748B',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === t.id ? '2px solid #1E3A8A' : '2px solid transparent',
              cursor: 'pointer',
              marginBottom: '-1px',
              transition: 'color 0.15s'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {orgId && activeTab === 'general'     && <GeneralTab orgId={orgId} />}
      {orgId && activeTab === 'fund-labels' && <FundLabelsTab orgId={orgId} />}
      {activeTab === 'security' && <SecurityTab />}
    </div>
  )
}
