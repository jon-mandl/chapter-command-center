import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useChapter } from '../lib/useChapter'
import { useToast } from '../lib/toast'
import { describeError } from '../lib/errors'
import { inputStyle, labelStyle, btnPrimary, btnSecondary, errorBox } from '../lib/ui'

type SettingsTab = 'general' | 'security'

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'general',  label: 'General' },
  { id: 'security', label: 'Security' }
]

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

function GeneralTab({ chapterId }: { chapterId: string }): React.JSX.Element {
  const toast = useToast()
  const [chapterName, setChapterName] = useState('')
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    void supabase
      .from('chapters')
      .select('name')
      .eq('id', chapterId)
      .single()
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err || !data) {
          setError(describeError(err, 'Could not load chapter.'))
        } else {
          setChapterName(data.name)
          setDraft(data.name)
        }
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [chapterId])

  async function handleSave(): Promise<void> {
    const trimmed = draft.trim()
    if (!trimmed) { setError('Chapter name cannot be empty.'); return }
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('chapters').update({ name: trimmed }).eq('id', chapterId)
    setSaving(false)
    if (err) {
      const msg = describeError(err, 'Could not save.')
      setError(msg)
      toast.error(msg)
      return
    }
    setChapterName(trimmed)
    toast.success('Chapter name updated.')
  }

  if (loading) return <div style={{ fontSize: '13px', color: '#64748B' }}>Loading…</div>

  const isDirty = draft.trim() !== chapterName

  return (
    <Section title="Chapter">
      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>Chapter Name</label>
        <input
          style={inputStyle}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
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
          <button onClick={() => setDraft(chapterName)} style={btnSecondary}>Cancel</button>
        )}
      </div>
    </Section>
  )
}

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
  const { chapterId, loading: chapterLoading } = useChapter()
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')

  if (chapterLoading) {
    return <div style={{ padding: '32px', fontSize: '13px', color: '#64748B' }}>Loading…</div>
  }

  return (
    <div style={{ padding: '28px 32px' }}>
      <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#0F172A', margin: 0 }}>Settings</h1>
      <p style={{ fontSize: '13px', color: '#64748B', margin: '6px 0 24px' }}>Manage your chapter and account settings.</p>

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

      {chapterId && activeTab === 'general' && <GeneralTab chapterId={chapterId} />}
      {activeTab === 'security' && <SecurityTab />}
    </div>
  )
}
