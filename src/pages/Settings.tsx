import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useUserSettings } from '../lib/useUserSettings'
import { useToast } from '../lib/toast'
import { describeError } from '../lib/errors'
import { inputStyle, labelStyle, btnPrimary, errorBox } from '../lib/ui'
import { US_STATES } from '../lib/usStates'

type SettingsTab = 'profile' | 'account' | 'security'

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'profile',  label: 'Profile' },
  { id: 'account',  label: 'Account Info' },
  { id: 'security', label: 'Security' },
]

const ROLE_LABEL: Record<string, string> = {
  admin:   'Admin',
  manager: 'Manager',
  member:  'Member',
}

const ROLE_COLOR: Record<string, { bg: string; color: string }> = {
  admin:   { bg: '#fef2f2', color: '#b91c1c' },
  manager: { bg: '#EEF2FF', color: '#4F46E5' },
  member:  { bg: '#F8FAFC', color: '#64748B' },
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '24px', marginBottom: '20px', maxWidth: '720px' }}>
      <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid #F1F5F9' }}>
        {title}
      </div>
      {children}
    </div>
  )
}

// ─── Profile tab ───────────────────────────────────────────────────────────
// Editable subset of user_settings — the contact/identity fields the user
// owns. Admin-controlled fields (chapter_id, role, email) are read-only and
// live on the Account Info tab.
function ProfileTab(): React.JSX.Element {
  const { settings, refresh } = useUserSettings()
  const toast = useToast()

  const [displayName, setDisplayName]   = useState(settings?.display_name ?? '')
  const [jobTitle, setJobTitle]         = useState(settings?.job_title ?? '')
  const [companyName, setCompanyName]   = useState(settings?.company_name ?? '')
  const [phone, setPhone]               = useState(settings?.phone ?? '')
  const [addressLine1, setAddressLine1] = useState(settings?.address_line1 ?? '')
  const [addressLine2, setAddressLine2] = useState(settings?.address_line2 ?? '')
  const [city, setCity]                 = useState(settings?.city ?? '')
  const [stateCode, setStateCode]       = useState(settings?.state ?? '')
  const [zip, setZip]                   = useState(settings?.zip ?? '')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!settings) return <div style={{ fontSize: '13px', color: '#64748B' }}>Loading…</div>

  const isDirty =
    (displayName.trim()  !== (settings.display_name  ?? '')) ||
    (jobTitle.trim()     !== (settings.job_title     ?? '')) ||
    (companyName.trim()  !== (settings.company_name  ?? '')) ||
    (phone.trim()        !== (settings.phone         ?? '')) ||
    (addressLine1.trim() !== (settings.address_line1 ?? '')) ||
    (addressLine2.trim() !== (settings.address_line2 ?? '')) ||
    (city.trim()         !== (settings.city          ?? '')) ||
    (stateCode           !== (settings.state         ?? '')) ||
    (zip.trim()          !== (settings.zip           ?? ''))

  async function handleSave(): Promise<void> {
    if (!settings) return
    setError('')
    setSaving(true)
    const { error: err } = await supabase
      .from('user_settings')
      .update({
        display_name:  displayName.trim() || null,
        job_title:     jobTitle.trim() || null,
        company_name:  companyName.trim() || null,
        phone:         phone.trim() || null,
        address_line1: addressLine1.trim() || null,
        address_line2: addressLine2.trim() || null,
        city:          city.trim() || null,
        state:         stateCode || null,
        zip:           zip.trim() || null,
      })
      .eq('user_id', settings.user_id)
    setSaving(false)
    if (err) {
      const msg = describeError(err, 'Could not save your profile.')
      setError(msg)
      toast.error(msg)
      return
    }
    refresh()
    toast.success('Profile updated.')
  }

  return (
    <>
      <Section title="Identity">
        <Field label="Display Name">
          <input style={inputStyle} value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={120} />
        </Field>
        <Field label="Job Title">
          <input style={inputStyle} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Chapter Manager" maxLength={120} />
        </Field>
        <Field label="Company / Organization">
          <input style={inputStyle} value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. NECA or your contractor name" maxLength={160} />
        </Field>
      </Section>

      <Section title="Contact">
        <Field label="Phone">
          <input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 555-1212" autoComplete="tel" />
        </Field>
        <Field label="Address Line 1">
          <input style={inputStyle} value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} autoComplete="address-line1" />
        </Field>
        <Field label="Address Line 2">
          <input style={inputStyle} value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} autoComplete="address-line2" />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px' }}>
          <Field label="City">
            <input style={inputStyle} value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
          </Field>
          <Field label="State">
            <select style={inputStyle} value={stateCode} onChange={(e) => setStateCode(e.target.value)} autoComplete="address-level1">
              <option value="">—</option>
              {US_STATES.map((s) => (
                <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
              ))}
            </select>
          </Field>
          <Field label="ZIP">
            <input style={inputStyle} value={zip} onChange={(e) => setZip(e.target.value)} autoComplete="postal-code" maxLength={10} />
          </Field>
        </div>

        {error && <div style={errorBox}>{error}</div>}

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
          <button onClick={handleSave} disabled={!isDirty || saving} style={{ ...btnPrimary, opacity: !isDirty || saving ? 0.5 : 1 }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </Section>
    </>
  )
}

// ─── Account Info tab ──────────────────────────────────────────────────────
// Read-only: email comes from auth, chapter + role are set by an admin.
function AccountInfoTab(): React.JSX.Element {
  const { settings } = useUserSettings()
  // Cache the fetched chapter keyed by id so we don't have to clear via
  // setState in the early-return branch (React 19's set-state-in-effect rule).
  const [cachedChapter, setCachedChapter] = useState<{ forId: string; name: string | null } | null>(null)

  useEffect(() => {
    if (!settings?.chapter_id) return
    const targetId = settings.chapter_id
    let cancelled = false
    void supabase
      .from('chapters')
      .select('name')
      .eq('id', targetId)
      .single()
      .then(({ data }) => {
        if (cancelled) return
        setCachedChapter({ forId: targetId, name: data?.name ?? null })
      })
    return () => { cancelled = true }
  }, [settings?.chapter_id])
  const chapterName = settings?.chapter_id && cachedChapter?.forId === settings.chapter_id
    ? cachedChapter.name
    : null

  if (!settings) return <div style={{ fontSize: '13px', color: '#64748B' }}>Loading…</div>

  const role = settings.role ?? 'member'
  const roleLabel = ROLE_LABEL[role] ?? role
  const roleColor = ROLE_COLOR[role] ?? ROLE_COLOR.member

  return (
    <Section title="Account Info">
      <div style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '16px', lineHeight: 1.5 }}>
        These fields are managed by your administrator. Reach out to your chapter admin if anything
        needs to change.
      </div>

      <ReadOnlyField label="Email" value={settings.email ?? '—'} />
      <ReadOnlyField label="Chapter" value={chapterName ?? (settings.chapter_id ? '(unknown)' : 'Unassigned')} />

      <div style={{ marginBottom: '14px' }}>
        <label style={labelStyle}>Role</label>
        <div>
          <span style={{ display: 'inline-block', fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '20px', background: roleColor.bg, color: roleColor.color, textTransform: 'capitalize' }}>
            {roleLabel}
          </span>
        </div>
      </div>
    </Section>
  )
}

// ─── Security tab ──────────────────────────────────────────────────────────
function SecurityTab(): React.JSX.Element {
  const toast = useToast()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleChangePassword(): Promise<void> {
    setError('')
    if (!currentPassword) { setError('Enter your current password.'); return }
    if (newPassword.length < 8) { setError('New password must be at least 8 characters.'); return }
    if (newPassword !== confirmPassword) { setError('New passwords do not match.'); return }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      setError('Could not identify current user.')
      setSaving(false)
      return
    }
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword })
    if (signInErr) {
      setError('Current password is incorrect.')
      setSaving(false)
      return
    }
    const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword })
    setSaving(false)
    if (updateErr) {
      const msg = describeError(updateErr, 'Could not update password.')
      setError(msg)
      toast.error(msg)
      return
    }
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    toast.success('Password updated.')
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

export default function Settings(): React.JSX.Element {
  const { loading } = useUserSettings()
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile')

  if (loading) {
    return <div style={{ padding: '32px', fontSize: '13px', color: '#64748B' }}>Loading…</div>
  }

  return (
    <div style={{ padding: '28px 32px' }}>
      <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#0F172A', margin: 0 }}>Settings</h1>
      <p style={{ fontSize: '13px', color: '#64748B', margin: '6px 0 24px' }}>Manage your profile and account.</p>

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

      {activeTab === 'profile'  && <ProfileTab />}
      {activeTab === 'account'  && <AccountInfoTab />}
      {activeTab === 'security' && <SecurityTab />}
    </div>
  )
}

// ─── helpers ───────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={labelStyle}>{label}</label>
      <div style={{
        fontSize: '14px', color: '#0F172A',
        padding: '8px 10px', background: '#F8FAFC',
        border: '1px solid #E2E8F0', borderRadius: '6px',
      }}>
        {value}
      </div>
    </div>
  )
}

