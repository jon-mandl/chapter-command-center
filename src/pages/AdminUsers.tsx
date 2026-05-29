import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useUserSettings } from '../lib/useUserSettings'
import { useToast } from '../lib/toast'
import { describeError } from '../lib/errors'
import { inputStyle, labelStyle, btnPrimary, btnSecondary, btnDanger, card, errorBox, formatDate, thStyle, tdStyle } from '../lib/ui'
import type { Chapter, UserSettings, ID } from '../lib/types'

type Role = NonNullable<UserSettings['role']>

const ROLES: Role[] = ['admin', 'user']

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  admin: { bg: '#fef2f2', color: '#b91c1c' },
  user:  { bg: '#F8FAFC', color: '#64748B' },
}

// user_settings rows joined to chapters. The admin RLS lets us read this for
// every user.
type UserRow = UserSettings & { chapters: { id: ID; name: string } | null }

// pending_invites rows joined to the chapter the invitee will land in.
interface PendingInviteRow {
  id: ID
  email: string
  chapter_id: ID
  role: Role
  invited_by: ID | null
  created_at: string
  chapters: { id: ID; name: string } | null
}

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

  // Expanded row id (click a row to see all profile fields beneath it).
  const [expandedUserId, setExpandedUserId] = useState<ID | null>(null)

  // New chapter form
  const [showChapterForm, setShowChapterForm] = useState(false)
  const [chapterForm, setChapterForm] = useState<{ name: string; city: string; state: string }>({ name: '', city: '', state: '' })
  const [savingChapter, setSavingChapter] = useState(false)
  const [chapterError, setChapterError] = useState('')

  // Delete confirmation dialog
  const [userToDelete, setUserToDelete] = useState<UserRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // Invite user form + pending invites list
  const [pendingInvites, setPendingInvites] = useState<PendingInviteRow[]>([])
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteForm, setInviteForm] = useState<{ email: string; chapter_id: ID | ''; role: Role }>({ email: '', chapter_id: '', role: 'user' })
  const [sendingInvite, setSendingInvite] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [cancellingInviteId, setCancellingInviteId] = useState<ID | null>(null)

  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    void Promise.all([
      supabase.from('user_settings').select('*, chapters(id, name)').order('created_at', { ascending: false }),
      supabase.from('chapters').select('*').order('name'),
      supabase.from('pending_invites').select('*, chapters(id, name)').order('created_at', { ascending: false })
    ]).then(([uRes, cRes, iRes]) => {
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
      if (iRes.error) {
        toast.error('Could not load pending invites: ' + describeError(iRes.error))
      } else {
        setPendingInvites((iRes.data ?? []) as PendingInviteRow[])
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
      const hay = [
        u.display_name, u.email, u.user_id, u.chapters?.name,
        u.job_title, u.company_name, u.phone,
      ].filter(Boolean).join(' ').toLowerCase()
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

  async function handleSendInvite(): Promise<void> {
    setInviteError('')
    const email = inviteForm.email.trim().toLowerCase()
    if (!email) { setInviteError('Email is required.'); return }
    if (!inviteForm.chapter_id) { setInviteError('Pick a chapter.'); return }
    setSendingInvite(true)
    const { data, error } = await supabase.functions.invoke('invite-user', {
      body: { email, chapter_id: inviteForm.chapter_id, role: inviteForm.role }
    })
    setSendingInvite(false)
    if (error) {
      const msg = describeError(error, 'Could not send invite.')
      setInviteError(msg)
      toast.error(msg)
      return
    }
    // The Edge Function returns success; re-pull pending invites so the new
    // row appears (including its server-assigned id and created_at).
    const { data: refreshed, error: refreshErr } = await supabase
      .from('pending_invites')
      .select('*, chapters(id, name)')
      .order('created_at', { ascending: false })
    if (!refreshErr && refreshed) {
      setPendingInvites(refreshed as PendingInviteRow[])
    }
    setShowInviteForm(false)
    setInviteForm({ email: '', chapter_id: '', role: 'member' })
    toast.success(`Invite sent to ${email}.`)
    // Touch `data` so unused-var lint doesn't fire; the Edge Function payload
    // isn't surfaced beyond the success toast.
    void data
  }

  async function handleCancelInvite(invite: PendingInviteRow): Promise<void> {
    setCancellingInviteId(invite.id)
    const { error } = await supabase.from('pending_invites').delete().eq('id', invite.id)
    setCancellingInviteId(null)
    if (error) {
      toast.error('Could not cancel invite: ' + describeError(error))
      return
    }
    setPendingInvites((prev) => prev.filter((i) => i.id !== invite.id))
    toast.success(`Invite for ${invite.email} cancelled.`)
  }

  async function handleDeleteUser(): Promise<void> {
    if (!userToDelete) return
    setDeleteError('')
    setDeleting(true)
    const { error } = await supabase.functions.invoke('invite-user', {
      body: { action: 'delete', user_id: userToDelete.user_id }
    })
    setDeleting(false)
    if (error) {
      setDeleteError(describeError(error, 'Could not delete user.'))
      return
    }
    setUsers((prev) => prev.filter((u) => u.user_id !== userToDelete.user_id))
    if (expandedUserId === userToDelete.user_id) setExpandedUserId(null)
    toast.success(`${userToDelete.display_name ?? userToDelete.email ?? 'User'} deleted.`)
    setUserToDelete(null)
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
        <div style={{ display: 'flex', gap: '8px' }}>
          {!showInviteForm && (
            <button style={btnPrimary} onClick={() => setShowInviteForm(true)}>+ Invite User</button>
          )}
          {!showChapterForm && (
            <button style={btnSecondary} onClick={() => setShowChapterForm(true)}>+ New Chapter</button>
          )}
        </div>
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

      {showInviteForm && (
        <div style={{ ...card, borderColor: '#1E3A8A', borderWidth: '1.5px', marginBottom: '20px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>Invite User</div>
          <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '16px' }}>
            They'll get an email with a link to set their password. The chapter and role you pick
            here are applied automatically when they accept.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label style={labelStyle}>Email <span style={{ color: '#ef4444' }}>*</span></label>
              <input
                style={inputStyle}
                type="email"
                value={inviteForm.email}
                autoFocus
                onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                placeholder="person@example.com"
              />
            </div>
            <div>
              <label style={labelStyle}>Chapter <span style={{ color: '#ef4444' }}>*</span></label>
              <select
                style={inputStyle}
                value={inviteForm.chapter_id}
                onChange={(e) => setInviteForm({ ...inviteForm, chapter_id: e.target.value as ID | '' })}
              >
                <option value="">— Select a chapter —</option>
                {chapters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Role</label>
              <select
                style={inputStyle}
                value={inviteForm.role}
                onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as Role })}
              >
                {ROLES.map((r) => <option key={r} value={r} style={{ textTransform: 'capitalize' }}>{r}</option>)}
              </select>
            </div>
          </div>
          {inviteError && <div style={errorBox}>{inviteError}</div>}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={{ ...btnPrimary, opacity: sendingInvite ? 0.5 : 1 }} disabled={sendingInvite} onClick={handleSendInvite}>
              {sendingInvite ? 'Sending…' : 'Send Invite'}
            </button>
            <button style={btnSecondary} disabled={sendingInvite} onClick={() => { setShowInviteForm(false); setInviteError('') }}>Cancel</button>
          </div>
        </div>
      )}

      {pendingInvites.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', marginBottom: '8px' }}>
            Pending invites ({pendingInvites.length})
          </div>
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle} scope="col">Email</th>
                  <th style={thStyle} scope="col">Role</th>
                  <th style={thStyle} scope="col">Chapter</th>
                  <th style={thStyle} scope="col">Invited</th>
                  <th style={thStyle} scope="col" aria-label="Actions"></th>
                </tr>
              </thead>
              <tbody>
                {pendingInvites.map((inv) => {
                  const rc = ROLE_COLORS[inv.role] ?? ROLE_COLORS.user
                  const isCancelling = cancellingInviteId === inv.id
                  return (
                    <tr key={inv.id} style={{ opacity: isCancelling ? 0.6 : 1 }}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600, color: '#0F172A' }}>{inv.email}</div>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', background: rc.bg, color: rc.color, textTransform: 'capitalize' }}>
                          {inv.role}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: '13px', color: '#0F172A' }}>
                          {inv.chapters?.name ?? '(deleted chapter)'}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: '12px', color: '#64748B' }}>
                          {formatDate(inv.created_at.slice(0, 10))}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <button
                          style={{ ...btnSecondary, color: '#b91c1c', borderColor: '#fecaca', padding: '4px 10px', fontSize: '12px' }}
                          disabled={isCancelling}
                          onClick={() => handleCancelInvite(inv)}
                          aria-label={`Cancel invite for ${inv.email}`}
                          title={`Cancel invite for ${inv.email}`}
                        >
                          {isCancelling ? 'Cancelling…' : 'Cancel'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          style={{ ...inputStyle, maxWidth: '320px' }}
          placeholder="Search by name, email, job title, company, chapter…"
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
                <th style={thStyle} scope="col">Title / Company</th>
                <th style={thStyle} scope="col">Role</th>
                <th style={thStyle} scope="col">Chapter</th>
                <th style={thStyle} scope="col">Profile</th>
                <th style={thStyle} scope="col">Created</th>
                <th style={thStyle} scope="col" aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const isPending = pendingUserId === u.user_id
                const isSelf = mySettings?.user_id === u.user_id
                const rc = ROLE_COLORS[u.role ?? 'user'] ?? ROLE_COLORS.user
                const isExpanded = expandedUserId === u.user_id
                return (
                  <React.Fragment key={u.user_id}>
                    <tr
                      style={{ opacity: isPending ? 0.6 : 1, cursor: 'pointer', background: isExpanded ? '#F8FAFC' : 'transparent' }}
                      onClick={() => setExpandedUserId(isExpanded ? null : u.user_id)}
                    >
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600, color: '#0F172A' }}>
                          {u.display_name || <span style={{ color: '#94A3B8', fontWeight: 400, fontStyle: 'italic' }}>(no display name)</span>}
                          {isSelf && <span style={{ marginLeft: '6px', fontSize: '11px', color: '#1E3A8A', fontWeight: 500 }}>(you)</span>}
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                          {u.email ?? <span style={{ fontStyle: 'italic', color: '#CBD5E1' }}>(no email)</span>}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontSize: '13px', color: '#0F172A' }}>{u.job_title ?? <span style={{ color: '#CBD5E1' }}>—</span>}</div>
                        <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>{u.company_name ?? ''}</div>
                      </td>
                      <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', background: rc.bg, color: rc.color, textTransform: 'capitalize' }}>
                            {u.role ?? 'user'}
                          </span>
                          <select
                            value={u.role ?? 'user'}
                            disabled={isPending}
                            onChange={(e) => updateUser(u.user_id, { role: e.target.value as Role })}
                            style={{ ...inputStyle, width: 'auto', fontSize: '12px', padding: '4px 8px' }}
                            aria-label={`Change role for ${u.display_name ?? u.user_id}`}
                          >
                            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </div>
                      </td>
                      <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
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
                        {u.profile_completed ? (
                          <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', background: '#ECFDF5', color: '#047857' }}>Complete</span>
                        ) : (
                          <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', background: '#FEF3C7', color: '#92400E' }}>Pending</span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: '12px', color: '#64748B' }}>
                          {formatDate(u.created_at.slice(0, 10))}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        {!isSelf && (
                          <button
                            style={{ ...btnDanger, padding: '4px 10px', fontSize: '12px' }}
                            disabled={isPending}
                            onClick={() => { setDeleteError(''); setUserToDelete(u) }}
                            aria-label={`Delete ${u.display_name ?? u.email ?? 'user'}`}
                            title={`Delete ${u.display_name ?? u.email ?? 'user'}`}
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr style={{ background: '#F8FAFC' }}>
                        <td colSpan={7} style={{ padding: '16px 24px', borderBottom: '1px solid #F1F5F9' }}>
                          <UserDetail user={u} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ marginTop: '16px', fontSize: '12px', color: '#94A3B8', lineHeight: 1.6 }}>
        Click any row to see the user's full profile — phone, address, and remaining contact fields.
        Role and chapter remain editable from the row itself.
      </div>

      {/* Delete confirmation modal */}
      {userToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-user-heading"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
          }}
        >
          <div style={{ background: '#fff', borderRadius: '12px', padding: '28px 32px', maxWidth: '420px', width: '100%', boxShadow: '0 8px 32px rgba(15,23,42,0.18)' }}>
            <h2 id="delete-user-heading" style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', margin: '0 0 8px' }}>
              Delete user?
            </h2>
            <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6, margin: '0 0 6px' }}>
              You are about to permanently delete:
            </p>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', margin: '0 0 8px' }}>
              {userToDelete.display_name ?? userToDelete.email ?? userToDelete.user_id}
            </p>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 20px', lineHeight: 1.5 }}>
              This removes their account from Supabase Auth and all associated data. This cannot be undone.
            </p>
            {deleteError && <div style={errorBox}>{deleteError}</div>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                style={{ ...btnDanger, opacity: deleting ? 0.5 : 1 }}
                disabled={deleting}
                onClick={handleDeleteUser}
              >
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button
                style={btnSecondary}
                disabled={deleting}
                onClick={() => { setUserToDelete(null); setDeleteError('') }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Expanded detail block shown below a row when the admin clicks into it.
// Read-only on purpose — admin edits today are scoped to role + chapter; the
// rest of the profile is user-owned.
function UserDetail({ user }: { user: UserRow }): React.JSX.Element {
  const lines: Array<[string, string | null]> = [
    ['Phone',     user.phone],
    ['Address 1', user.address_line1],
    ['Address 2', user.address_line2],
    ['City',      user.city],
    ['State',     user.state],
    ['ZIP',       user.zip],
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px 24px' }}>
      {lines.map(([label, value]) => (
        <div key={label}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>{label}</div>
          <div style={{ fontSize: '13px', color: value ? '#0F172A' : '#CBD5E1' }}>{value || '—'}</div>
        </div>
      ))}
    </div>
  )
}
