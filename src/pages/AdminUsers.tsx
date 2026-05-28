import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useUserSettings } from '../lib/useUserSettings'
import { useToast } from '../lib/toast'
import { describeError } from '../lib/errors'
import { inputStyle, labelStyle, btnPrimary, btnSecondary, card, errorBox, formatDate, thStyle, tdStyle } from '../lib/ui'
import type { Chapter, UserSettings, ID } from '../lib/types'

type Role = NonNullable<UserSettings['role']>

const ROLES: Role[] = ['admin', 'manager', 'member']

const ROLE_COLORS: Record<Role, { bg: string; color: string }> = {
  admin:   { bg: '#fef2f2', color: '#b91c1c' },
  manager: { bg: '#EEF2FF', color: '#4F46E5' },
  member:  { bg: '#F8FAFC', color: '#64748B' }
}

// user_settings rows joined to chapters. The admin RLS lets us read this for
// every user.
type UserRow = UserSettings & { chapters: { id: ID; name: string } | null }

export default function AdminUsers(): React.JSX.Element {
  const { settings: mySettings, refresh: refreshMySettings, isAdmin } = useUserSettings()
  const toast = useToast()

  const [users, setUsers] = useState<UserRow[]>([])
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all')

  // Per-row save state for optimistic feedback.
  const [pendingUserId, setPendingUserId] = useState<ID | null>(null)

  // New chapter form
  const [showChapterForm, setShowChapterForm] = useState(false)
  const [chapterForm, setChapterForm] = useState<{ name: string; city: string; state: string }>({ name: '', city: '', state: '' })
  const [savingChapter, setSavingChapter] = useState(false)
  const [chapterError, setChapterError] = useState('')

  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    void Promise.all([
      supabase.from('user_settings').select('*, chapters(id, name)').order('created_at', { ascending: false }),
      supabase.from('chapters').select('*').order('name')
    ]).then(([uRes, cRes]) => {
      if (cancelled) return
      if (uRes.error) {
        setLoadError(describeError(uRes.error, 'Could not load users.'))
      } else {
        setUsers((uRes.data ?? []) as UserRow[])
      }
      if (cRes.error) {
        toast.error('Could not load chapters: ' + describeError(cRes.error))
      } else {
        setChapters((cRes.data ?? []) as Chapter[])
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [isAdmin, toast])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false
      if (!term) return true
      const hay = [u.display_name, u.user_id, u.chapters?.name].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(term)
    })
  }, [users, roleFilter, search])

  async function updateUser(targetUserId: ID, patch: Partial<Pick<UserSettings, 'role' | 'chapter_id'>>): Promise<void> {
    setPendingUserId(targetUserId)
    const { data, error } = await supabase
      .from('user_settings')
      .update(patch)
      .eq('user_id', targetUserId)
      .select('*, chapters(id, name)')
      .single()
    setPendingUserId(null)
    if (error || !data) {
      toast.error('Could not update user: ' + describeError(error))
      return
    }
    const updated = data as UserRow
    setUsers((prev) => prev.map((u) => u.user_id === updated.user_id ? updated : u))

    // If the admin edited their own row, refresh the global user settings so
    // their navigation immediately reflects the change. (E.g. demoting self
    // from admin will hide the User Management nav on the next render.)
    if (mySettings && updated.user_id === mySettings.user_id) {
      refreshMySettings()
    }

    toast.success('User updated.')
  }

  async function handleCreateChapter(): Promise<void> {
    setChapterError('')
    const name = chapterForm.name.trim()
    if (!name) { setChapterError('Chapter name is required.'); return }
    setSavingChapter(true)
    const payload = {
      name,
      city: chapterForm.city.trim() || null,
      state: chapterForm.state.trim() || null
    }
    const { data, error } = await supabase
      .from('chapters')
      .insert(payload)
      .select()
      .single()
    setSavingChapter(false)
    if (error || !data) {
      const msg = describeError(error, 'Could not create chapter.')
      setChapterError(msg)
      toast.error(msg)
      return
    }
    setChapters((prev) => [...prev, data as Chapter].sort((a, b) => a.name.localeCompare(b.name)))
    setShowChapterForm(false)
    setChapterForm({ name: '', city: '', state: '' })
    toast.success('Chapter created.')
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: '32px' }}>
        <div style={errorBox}>You don't have permission to view this page.</div>
      </div>
    )
  }

  if (loading) {
    return <div style={{ padding: '32px', fontSize: '13px', color: '#64748B' }}>Loading users…</div>
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1080px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#0F172A', margin: 0 }}>User Management</h1>
          <p style={{ fontSize: '13px', color: '#64748B', margin: '6px 0 0' }}>
            Assign chapters and roles to users. New accounts arrive here pending assignment.
          </p>
        </div>
        {!showChapterForm && (
          <button style={btnPrimary} onClick={() => setShowChapterForm(true)}>+ New Chapter</button>
        )}
      </div>

      {loadError && <div style={errorBox}>{loadError}</div>}

      {showChapterForm && (
        <div style={{ ...card, borderColor: '#1E3A8A', borderWidth: '1.5px', marginBottom: '20px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '16px' }}>New Chapter</div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label style={labelStyle}>Name <span style={{ color: '#ef4444' }}>*</span></label>
              <input style={inputStyle} value={chapterForm.name} autoFocus onChange={(e) => setChapterForm({ ...chapterForm, name: e.target.value })} placeholder="e.g. NECA Chapter 51" />
            </div>
            <div>
              <label style={labelStyle}>City</label>
              <input style={inputStyle} value={chapterForm.city} onChange={(e) => setChapterForm({ ...chapterForm, city: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>State</label>
              <input style={inputStyle} value={chapterForm.state} onChange={(e) => setChapterForm({ ...chapterForm, state: e.target.value })} maxLength={2} placeholder="CA" />
            </div>
          </div>
          {chapterError && <div style={errorBox}>{chapterError}</div>}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={{ ...btnPrimary, opacity: savingChapter ? 0.5 : 1 }} disabled={savingChapter} onClick={handleCreateChapter}>
              {savingChapter ? 'Saving…' : 'Create'}
            </button>
            <button style={btnSecondary} disabled={savingChapter} onClick={() => { setShowChapterForm(false); setChapterError('') }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          style={{ ...inputStyle, maxWidth: '320px' }}
          placeholder="Search by name, user ID, or chapter…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search users"
        />
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {(['all', ...ROLES] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              style={{
                padding: '4px 10px', fontSize: '11px', fontWeight: 500, borderRadius: '20px', cursor: 'pointer', textTransform: 'capitalize',
                background: roleFilter === r ? '#1E3A8A' : '#F8FAFC',
                color: roleFilter === r ? '#fff' : '#64748B',
                border: roleFilter === r ? '1px solid #1E3A8A' : '1px solid #E2E8F0'
              }}
            >
              {r === 'all' ? `All (${users.length})` : `${r} (${users.filter((u) => u.role === r).length})`}
            </button>
          ))}
        </div>
      </div>

      {/* User table */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>
            {users.length === 0 ? 'No users yet.' : 'No users match your filters.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle} scope="col">User</th>
                <th style={thStyle} scope="col">Role</th>
                <th style={thStyle} scope="col">Chapter</th>
                <th style={thStyle} scope="col">Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const isPending = pendingUserId === u.user_id
                const isSelf = mySettings?.user_id === u.user_id
                const rc = u.role ? ROLE_COLORS[u.role as Role] : ROLE_COLORS.member
                return (
                  <tr key={u.user_id} style={{ opacity: isPending ? 0.6 : 1 }}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600, color: '#0F172A' }}>
                        {u.display_name || <span style={{ color: '#94A3B8', fontWeight: 400, fontStyle: 'italic' }}>(no display name)</span>}
                        {isSelf && <span style={{ marginLeft: '6px', fontSize: '11px', color: '#1E3A8A', fontWeight: 500 }}>(you)</span>}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px', fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace' }}>
                        {u.user_id}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', background: rc.bg, color: rc.color, textTransform: 'capitalize' }}>
                          {u.role ?? 'member'}
                        </span>
                        <select
                          value={u.role ?? 'member'}
                          disabled={isPending}
                          onChange={(e) => updateUser(u.user_id, { role: e.target.value as Role })}
                          style={{ ...inputStyle, width: 'auto', fontSize: '12px', padding: '4px 8px' }}
                          aria-label={`Change role for ${u.display_name ?? u.user_id}`}
                        >
                          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '13px', color: u.chapter_id ? '#0F172A' : '#CBD5E1' }}>
                          {u.chapters?.name ?? (u.chapter_id ? '(deleted chapter)' : 'Unassigned')}
                        </span>
                        <select
                          value={u.chapter_id ?? ''}
                          disabled={isPending}
                          onChange={(e) => updateUser(u.user_id, { chapter_id: e.target.value ? (e.target.value as ID) : null })}
                          style={{ ...inputStyle, width: 'auto', fontSize: '12px', padding: '4px 8px' }}
                          aria-label={`Change chapter for ${u.display_name ?? u.user_id}`}
                        >
                          <option value="">— Unassigned —</option>
                          {chapters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: '12px', color: '#64748B' }}>
                        {formatDate(u.created_at.slice(0, 10))}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ marginTop: '16px', fontSize: '12px', color: '#94A3B8', lineHeight: 1.6 }}>
        Email addresses live in the auth system and aren't readable from the client. Users identify
        themselves by setting a display name under Settings → General. Until they do, the user ID is
        shown so you can match an account to an email out-of-band.
      </div>
    </div>
  )
}
