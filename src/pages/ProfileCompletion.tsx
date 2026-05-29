import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useUserSettings } from '../lib/useUserSettings'
import { useToast } from '../lib/toast'
import { describeError } from '../lib/errors'
import { inputStyle, labelStyle, btnPrimary, errorBox, COLORS } from '../lib/ui'
import { US_STATES } from '../lib/usStates'
import type { UserSettings } from '../lib/types'

// Shown once, immediately after a user accepts their invite and sets a
// password. They have a session and (for non-admins) a chapter assignment,
// but no profile data yet. Submitting flips profile_completed=true and the
// App router falls through to the dashboard. "Skip for now" does the same
// flip without requiring the optional fields.

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

export default function ProfileCompletion(): React.JSX.Element {
  const { settings, refresh } = useUserSettings()
  const toast = useToast()

  // Pre-fill from whatever the trigger captured (display name from invite if
  // any, email from auth). Stored in local state so the user can edit before
  // committing.
  const [displayName, setDisplayName]   = useState(settings?.display_name ?? '')
  const [jobTitle, setJobTitle]         = useState(settings?.job_title ?? '')
  const [companyName, setCompanyName]   = useState(settings?.company_name ?? '')
  const [phone, setPhone]               = useState(settings?.phone ?? '')
  const [addressLine1, setAddressLine1] = useState(settings?.address_line1 ?? '')
  const [addressLine2, setAddressLine2] = useState(settings?.address_line2 ?? '')
  const [city, setCity]                 = useState(settings?.city ?? '')
  const [stateCode, setStateCode]       = useState(settings?.state ?? '')
  const [zip, setZip]                   = useState(settings?.zip ?? '')

  // Chapter name is read-only here. We cache the most recent fetch keyed by
  // chapter_id so we don't have to call setState in the early-return branch
  // (the React 19 set-state-in-effect rule disallows it).
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

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function persist(extraPayload: Partial<UserSettings>): Promise<boolean> {
    if (!settings) return false
    setError('')
    setSaving(true)
    const payload: Partial<UserSettings> = {
      display_name:  displayName.trim() || null,
      job_title:     jobTitle.trim() || null,
      company_name:  companyName.trim() || null,
      phone:         phone.trim() || null,
      address_line1: addressLine1.trim() || null,
      address_line2: addressLine2.trim() || null,
      city:          city.trim() || null,
      state:         stateCode || null,
      zip:           zip.trim() || null,
      ...extraPayload,
    }
    const { error: err } = await supabase
      .from('user_settings')
      .update(payload)
      .eq('user_id', settings.user_id)
    setSaving(false)
    if (err) {
      const msg = describeError(err, 'Could not save your profile.')
      setError(msg)
      toast.error(msg)
      return false
    }
    refresh()
    return true
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!displayName.trim()) { setError('Display name is required.'); return }
    if (!jobTitle.trim())    { setError('Job title is required.'); return }
    const ok = await persist({ profile_completed: true })
    if (ok) toast.success('Profile saved. Welcome aboard.')
  }

  async function handleSkip(): Promise<void> {
    const ok = await persist({ profile_completed: true })
    if (ok) toast.info('You can finish your profile later under Settings.')
  }

  if (!settings) {
    return <div style={{ padding: '32px', fontSize: '13px', color: '#64748B' }}>Loading…</div>
  }

  const role = settings.role ?? 'member'
  const roleLabel = ROLE_LABEL[role] ?? role
  const roleColor = ROLE_COLOR[role] ?? ROLE_COLOR.member

  return (
    <div style={{ minHeight: '100vh', background: COLORS.surface, padding: '40px 20px' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: COLORS.gold, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '6px' }}>
            Chapter Command Center
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: COLORS.textPrimary, margin: '0 0 8px' }}>
            Welcome — let's set up your profile
          </h1>
          <p style={{ fontSize: '14px', color: COLORS.textSecondary, margin: 0, lineHeight: 1.5 }}>
            We use this to identify you in chapter activity and to keep your contact info on file.
            You can edit any of it later from Settings.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Personal Information */}
          <div style={card}>
            <SectionHeader>Personal Information</SectionHeader>

            <Field label="Display Name" required>
              <input
                style={inputStyle}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How your name should appear in the app"
                autoFocus
                required
              />
            </Field>

            <Field label="Job Title" required>
              <input
                style={inputStyle}
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g. Executive Director, Chapter Manager"
                required
              />
            </Field>

            <Field label="Company / Organization" hint="Optional — leave blank if you're chapter staff.">
              <input
                style={inputStyle}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. NECA or your contractor name"
              />
            </Field>
          </div>

          {/* Contact Information */}
          <div style={card}>
            <SectionHeader>Contact Information</SectionHeader>

            <Field label="Email" hint="From your invite — changing your email is a separate, secure flow.">
              <input
                style={{ ...inputStyle, background: '#F8FAFC', color: '#64748B', cursor: 'not-allowed' }}
                value={settings.email ?? ''}
                readOnly
                disabled
              />
            </Field>

            <Field label="Phone">
              <input
                style={inputStyle}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 555-1212"
                autoComplete="tel"
              />
            </Field>

            <Field label="Address Line 1">
              <input
                style={inputStyle}
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                autoComplete="address-line1"
              />
            </Field>

            <Field label="Address Line 2">
              <input
                style={inputStyle}
                value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)}
                autoComplete="address-line2"
              />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px' }}>
              <Field label="City">
                <input
                  style={inputStyle}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  autoComplete="address-level2"
                />
              </Field>
              <Field label="State">
                <select
                  style={inputStyle}
                  value={stateCode}
                  onChange={(e) => setStateCode(e.target.value)}
                  autoComplete="address-level1"
                >
                  <option value="">—</option>
                  {US_STATES.map((s) => (
                    <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="ZIP">
                <input
                  style={inputStyle}
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  autoComplete="postal-code"
                  maxLength={10}
                />
              </Field>
            </div>
          </div>

          {/* Account info — read-only */}
          <div style={card}>
            <SectionHeader>Account</SectionHeader>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <div style={labelStyle}>Chapter</div>
                <div style={readOnlyValue}>
                  {chapterName ?? (settings.chapter_id ? '(loading…)' : 'Unassigned')}
                </div>
                <div style={hintStyle}>Set by your administrator.</div>
              </div>
              <div>
                <div style={labelStyle}>Role</div>
                <div>
                  <span style={{ display: 'inline-block', fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '20px', background: roleColor.bg, color: roleColor.color, textTransform: 'capitalize' }}>
                    {roleLabel}
                  </span>
                </div>
                <div style={hintStyle}>Set by your administrator.</div>
              </div>
            </div>
          </div>

          {error && <div style={errorBox}>{error}</div>}

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '20px' }}>
            <button
              type="submit"
              disabled={saving}
              style={{ ...btnPrimary, opacity: saving ? 0.5 : 1, padding: '10px 22px' }}
            >
              {saving ? 'Saving…' : 'Save & Continue'}
            </button>
            <button
              type="button"
              onClick={handleSkip}
              disabled={saving}
              style={{
                background: 'none', border: 'none', padding: 0,
                fontSize: '13px', color: COLORS.textSecondary,
                cursor: saving ? 'not-allowed' : 'pointer',
                textDecoration: 'underline',
              }}
            >
              Skip for now
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// --- local helpers ---------------------------------------------------------

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #E2E8F0',
  borderRadius: '10px',
  padding: '24px',
  marginBottom: '16px',
}

const readOnlyValue: React.CSSProperties = {
  fontSize: '14px',
  color: '#0F172A',
  padding: '8px 10px',
  background: '#F8FAFC',
  border: '1px solid #E2E8F0',
  borderRadius: '6px',
  minHeight: '20px',
}

const hintStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#94A3B8',
  marginTop: '4px',
}

function SectionHeader({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{
      fontSize: '14px', fontWeight: 700, color: '#0F172A',
      marginBottom: '16px', paddingBottom: '10px',
      borderBottom: '1px solid #F1F5F9',
    }}>
      {children}
    </div>
  )
}

function Field({ label, required, hint, children }: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={labelStyle}>
        {label}{required && <span style={{ color: '#ef4444', marginLeft: '4px' }}>*</span>}
      </label>
      {children}
      {hint && <div style={hintStyle}>{hint}</div>}
    </div>
  )
}
