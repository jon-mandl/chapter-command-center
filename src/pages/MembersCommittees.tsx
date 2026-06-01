import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useUserSettings } from '../lib/useUserSettings'
import { useToast } from '../lib/toast'
import { describeError } from '../lib/errors'
import ConfirmDialog from '../lib/ConfirmDialog'
import { inputStyle, labelStyle, btnPrimary, btnSecondary, btnDanger, card, errorBox, formatDate } from '../lib/ui'
import type { Committee, CommitteeMember, ID } from '../lib/types'

type CommitteeForm = { name: string; description: string }
type MemberForm = { member_name: string; company: string; role: string; term_start: string; term_end: string }

const EMPTY_COMMITTEE: CommitteeForm = { name: '', description: '' }
const EMPTY_MEMBER: MemberForm = { member_name: '', company: '', role: '', term_start: '', term_end: '' }

export default function MembersCommittees(): React.JSX.Element {
  const { effectiveChapterId, applyChapterFilter, loading: chapterLoading } = useUserSettings()
  const toast = useToast()
  const [committees, setCommittees] = useState<Committee[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selectedId, setSelectedId] = useState<ID | null>(null)

  // Committee create/edit
  const [showCommitteeForm, setShowCommitteeForm] = useState(false)
  const [editingCommittee, setEditingCommittee] = useState<Committee | null>(null)
  const [committeeForm, setCommitteeForm] = useState<CommitteeForm>(EMPTY_COMMITTEE)
  const [savingCommittee, setSavingCommittee] = useState(false)
  const [committeeError, setCommitteeError] = useState('')

  const [confirmDeleteCommittee, setConfirmDeleteCommittee] = useState<Committee | null>(null)
  const [deletingCommittee, setDeletingCommittee] = useState(false)

  // Members for the currently-selected committee. `membersLoadedFor` tracks
  // which committee's roster is currently in `members`; when it diverges from
  // `selectedId`, the right pane shows a loading state.
  const [members, setMembers] = useState<CommitteeMember[]>([])
  const [membersLoadedFor, setMembersLoadedFor] = useState<ID | null>(null)
  const [showMemberForm, setShowMemberForm] = useState(false)
  const [editingMember, setEditingMember] = useState<CommitteeMember | null>(null)
  const [memberForm, setMemberForm] = useState<MemberForm>(EMPTY_MEMBER)
  const [savingMember, setSavingMember] = useState(false)
  const [memberError, setMemberError] = useState('')

  const [confirmRemoveMember, setConfirmRemoveMember] = useState<CommitteeMember | null>(null)
  const [removingMember, setRemovingMember] = useState(false)

  // Load committees on mount and when the effective chapter changes.
  useEffect(() => {
    let cancelled = false
    void applyChapterFilter(
      supabase.from('committees').select('*').order('name')
    ).then(({ data, error: err }: { data: unknown; error: unknown }) => {
      if (cancelled) return
      if (err) {
        setLoadError(describeError(err, 'Could not load committees.'))
      } else {
        setCommittees((data ?? []) as Committee[])
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveChapterId])

  // Load members when selection changes
  useEffect(() => {
    if (!selectedId) return
    const target = selectedId
    let cancelled = false
    void supabase
      .from('committee_members')
      .select('*')
      .eq('committee_id', target)
      .order('member_name')
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          toast.error('Could not load members: ' + describeError(err))
          setMembers([])
        } else {
          setMembers((data ?? []) as CommitteeMember[])
        }
        setMembersLoadedFor(target)
      })
    return () => { cancelled = true }
  }, [selectedId, toast])

  function selectCommittee(id: ID): void {
    if (id !== selectedId) setMembers([])
    setSelectedId(id)
  }

  const membersLoading = selectedId !== null && membersLoadedFor !== selectedId

  const selected = committees.find((c) => c.id === selectedId) ?? null

  function startCreateCommittee(): void {
    setEditingCommittee(null)
    setCommitteeForm(EMPTY_COMMITTEE)
    setCommitteeError('')
    setShowCommitteeForm(true)
  }

  function startEditCommittee(c: Committee): void {
    setEditingCommittee(c)
    setCommitteeForm({ name: c.name, description: c.description ?? '' })
    setCommitteeError('')
    setShowCommitteeForm(true)
  }

  async function handleSaveCommittee(): Promise<void> {
    setCommitteeError('')
    if (!editingCommittee && !effectiveChapterId) {
      setCommitteeError('Select a specific chapter from the sidebar before creating a committee.')
      return
    }
    const name = committeeForm.name.trim()
    if (!name) { setCommitteeError('Name is required.'); return }
    setSavingCommittee(true)

    const payload = { name, description: committeeForm.description.trim() || null }
    if (editingCommittee) {
      const { data, error: err } = await supabase
        .from('committees')
        .update(payload)
        .eq('id', editingCommittee.id)
        .select()
        .single()
      setSavingCommittee(false)
      if (err || !data) {
        const msg = describeError(err, 'Could not save committee.')
        setCommitteeError(msg)
        toast.error(msg)
        return
      }
      const updated = data as Committee
      setCommittees((prev) => prev.map((c) => c.id === updated.id ? updated : c).sort((a, b) => a.name.localeCompare(b.name)))
      setShowCommitteeForm(false)
      toast.success('Committee updated.')
      return
    }

    const { data, error: err } = await supabase
      .from('committees')
      .insert({ ...payload, chapter_id: effectiveChapterId })
      .select()
      .single()
    setSavingCommittee(false)
    if (err || !data) {
      const msg = describeError(err, 'Could not create committee.')
      setCommitteeError(msg)
      toast.error(msg)
      return
    }
    const created = data as Committee
    setCommittees((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
    setSelectedId(created.id)
    setShowCommitteeForm(false)
    toast.success('Committee created.')
  }

  async function handleDeleteCommittee(): Promise<void> {
    if (!confirmDeleteCommittee) return
    setDeletingCommittee(true)
    const { error: err } = await supabase
      .from('committees')
      .delete()
      .eq('id', confirmDeleteCommittee.id)
    setDeletingCommittee(false)
    if (err) {
      toast.error('Could not delete: ' + describeError(err))
      return
    }
    setCommittees((prev) => prev.filter((c) => c.id !== confirmDeleteCommittee.id))
    if (selectedId === confirmDeleteCommittee.id) {
      setSelectedId(null)
      setMembers([])
    }
    setConfirmDeleteCommittee(null)
    toast.success('Committee deleted.')
  }

  function startCreateMember(): void {
    setEditingMember(null)
    setMemberForm(EMPTY_MEMBER)
    setMemberError('')
    setShowMemberForm(true)
  }

  function startEditMember(m: CommitteeMember): void {
    setEditingMember(m)
    setMemberForm({
      member_name: m.member_name,
      company: m.company ?? '',
      role: m.role ?? '',
      term_start: m.term_start ?? '',
      term_end: m.term_end ?? ''
    })
    setMemberError('')
    setShowMemberForm(true)
  }

  async function handleSaveMember(): Promise<void> {
    if (!selectedId) return
    setMemberError('')
    const name = memberForm.member_name.trim()
    if (!name) { setMemberError('Name is required.'); return }
    setSavingMember(true)

    const payload = {
      member_name: name,
      company: memberForm.company.trim() || null,
      role: memberForm.role.trim() || null,
      term_start: memberForm.term_start || null,
      term_end: memberForm.term_end || null
    }

    if (editingMember) {
      const { data, error: err } = await supabase
        .from('committee_members')
        .update(payload)
        .eq('id', editingMember.id)
        .select()
        .single()
      setSavingMember(false)
      if (err || !data) {
        const msg = describeError(err, 'Could not save member.')
        setMemberError(msg)
        toast.error(msg)
        return
      }
      const updated = data as CommitteeMember
      setMembers((prev) => prev.map((m) => m.id === updated.id ? updated : m).sort((a, b) => a.member_name.localeCompare(b.member_name)))
      setShowMemberForm(false)
      toast.success('Member updated.')
      return
    }

    const { data, error: err } = await supabase
      .from('committee_members')
      .insert({ ...payload, committee_id: selectedId })
      .select()
      .single()
    setSavingMember(false)
    if (err || !data) {
      const msg = describeError(err, 'Could not add member.')
      setMemberError(msg)
      toast.error(msg)
      return
    }
    const created = data as CommitteeMember
    setMembers((prev) => [...prev, created].sort((a, b) => a.member_name.localeCompare(b.member_name)))
    setShowMemberForm(false)
    toast.success('Member added.')
  }

  async function handleRemoveMember(): Promise<void> {
    if (!confirmRemoveMember) return
    setRemovingMember(true)
    const { error: err } = await supabase
      .from('committee_members')
      .delete()
      .eq('id', confirmRemoveMember.id)
    setRemovingMember(false)
    if (err) {
      toast.error('Could not remove member: ' + describeError(err))
      return
    }
    setMembers((prev) => prev.filter((m) => m.id !== confirmRemoveMember.id))
    setConfirmRemoveMember(null)
    toast.success('Member removed.')
  }

  if (chapterLoading || loading) {
    return <div style={{ padding: '32px', fontSize: '13px', color: '#64748B' }}>Loading…</div>
  }

  return (
    <div className="split-panel">
      {/* Left: committees */}
      <div className="split-panel-list" style={{ width: '300px' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>Committees</span>
          <button style={{ ...btnPrimary, fontSize: '12px', padding: '5px 12px' }} onClick={startCreateCommittee}>+ Add</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadError && <div style={{ ...errorBox, margin: '12px 16px' }}>{loadError}</div>}
          {committees.length === 0 ? (
            <div style={{ padding: '24px 20px', color: '#94A3B8', fontSize: '13px', textAlign: 'center' }}>No committees yet.</div>
          ) : committees.map((c) => {
            const isSelected = c.id === selectedId
            return (
              <button
                key={c.id}
                onClick={() => selectCommittee(c.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '12px 20px', borderBottom: '1px solid #F1F5F9',
                  background: isSelected ? '#EEF2FF' : 'none',
                  border: 'none', borderLeft: isSelected ? '3px solid #1E3A8A' : '3px solid transparent',
                  cursor: 'pointer'
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>{c.name}</div>
                {c.description && (
                  <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.description}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Right: detail */}
      <div className="split-panel-detail" style={{ padding: '28px 32px' }}>
        {showCommitteeForm ? (
          <div style={{ ...card, maxWidth: '600px', borderColor: '#1E3A8A', borderWidth: '1.5px' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '20px' }}>
              {editingCommittee ? `Edit ${editingCommittee.name}` : 'New Committee'}
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Name <span style={{ color: '#ef4444' }}>*</span></label>
              <input style={inputStyle} value={committeeForm.name} autoFocus onChange={(e) => setCommitteeForm({ ...committeeForm, name: e.target.value })} placeholder="e.g. Joint Apprenticeship Committee" />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Description</label>
              <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }} value={committeeForm.description} onChange={(e) => setCommitteeForm({ ...committeeForm, description: e.target.value })} />
            </div>
            {committeeError && <div style={errorBox}>{committeeError}</div>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={{ ...btnPrimary, opacity: savingCommittee ? 0.5 : 1 }} disabled={savingCommittee} onClick={handleSaveCommittee}>
                {savingCommittee ? 'Saving…' : 'Save'}
              </button>
              <button style={btnSecondary} disabled={savingCommittee} onClick={() => setShowCommitteeForm(false)}>Cancel</button>
            </div>
          </div>
        ) : selected ? (
          <div style={{ maxWidth: '760px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', margin: 0 }}>{selected.name}</h2>
                {selected.description && <p style={{ fontSize: '13px', color: '#64748B', margin: '6px 0 0' }}>{selected.description}</p>}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button style={btnSecondary} onClick={() => startEditCommittee(selected)}>Edit</button>
                <button style={btnDanger} onClick={() => setConfirmDeleteCommittee(selected)}>Delete</button>
              </div>
            </div>

            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                  {members.length} {members.length === 1 ? 'Member' : 'Members'}
                </span>
                {!showMemberForm && (
                  <button style={{ ...btnPrimary, fontSize: '12px', padding: '5px 12px' }} onClick={startCreateMember}>+ Add Member</button>
                )}
              </div>

              {showMemberForm && (
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px', marginBottom: '14px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', marginBottom: '12px' }}>
                    {editingMember ? `Edit ${editingMember.member_name}` : 'New Member'}
                  </div>
                  <div className="grid-2col" style={{ marginBottom: '10px' }}>
                    <div>
                      <label style={labelStyle}>Name <span style={{ color: '#ef4444' }}>*</span></label>
                      <input style={inputStyle} value={memberForm.member_name} autoFocus onChange={(e) => setMemberForm({ ...memberForm, member_name: e.target.value })} />
                    </div>
                    <div>
                      <label style={labelStyle}>Company</label>
                      <input style={inputStyle} value={memberForm.company} onChange={(e) => setMemberForm({ ...memberForm, company: e.target.value })} />
                    </div>
                    <div>
                      <label style={labelStyle}>Role</label>
                      <input style={inputStyle} value={memberForm.role} onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })} placeholder="e.g. Chair, Member" />
                    </div>
                    <div className="grid-2col">
                      <div>
                        <label style={labelStyle}>Term Start</label>
                        <input type="date" style={inputStyle} value={memberForm.term_start} onChange={(e) => setMemberForm({ ...memberForm, term_start: e.target.value })} />
                      </div>
                      <div>
                        <label style={labelStyle}>Term End</label>
                        <input type="date" style={inputStyle} value={memberForm.term_end} onChange={(e) => setMemberForm({ ...memberForm, term_end: e.target.value })} />
                      </div>
                    </div>
                  </div>
                  {memberError && <div style={errorBox}>{memberError}</div>}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button style={{ ...btnPrimary, fontSize: '12px', padding: '5px 12px', opacity: savingMember ? 0.5 : 1 }} disabled={savingMember} onClick={handleSaveMember}>
                      {savingMember ? 'Saving…' : 'Save'}
                    </button>
                    <button style={{ ...btnSecondary, fontSize: '12px', padding: '5px 12px' }} disabled={savingMember} onClick={() => setShowMemberForm(false)}>Cancel</button>
                  </div>
                </div>
              )}

              {membersLoading ? (
                <div style={{ fontSize: '13px', color: '#64748B', padding: '12px 0' }}>Loading members…</div>
              ) : members.length === 0 ? (
                <div style={{ fontSize: '13px', color: '#94A3B8', padding: '12px 0' }}>No members yet.</div>
              ) : members.map((m) => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid #F1F5F9' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>{m.member_name}</div>
                    <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                      {[m.company, m.role].filter(Boolean).join(' · ')}
                      {(m.term_start || m.term_end) && (
                        <span style={{ marginLeft: '8px', color: '#94A3B8' }}>
                          ({formatDate(m.term_start)} – {formatDate(m.term_end)})
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button style={{ ...btnSecondary, fontSize: '12px', padding: '4px 10px' }} onClick={() => startEditMember(m)}>Edit</button>
                    <button style={{ ...btnDanger, fontSize: '12px', padding: '4px 10px' }} onClick={() => setConfirmRemoveMember(m)}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '80px 24px', color: '#94A3B8', fontSize: '13px' }}>
            Select a committee on the left, or{' '}
            <button onClick={startCreateCommittee} style={{ background: 'none', border: 'none', color: '#1E3A8A', cursor: 'pointer', padding: 0, fontSize: '13px', fontWeight: 600 }}>create one</button>.
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDeleteCommittee !== null}
        title="Delete committee?"
        message={confirmDeleteCommittee ? `Delete "${confirmDeleteCommittee.name}"? All members on this committee will also be removed. This cannot be undone.` : ''}
        confirmLabel="Delete"
        busy={deletingCommittee}
        onConfirm={handleDeleteCommittee}
        onCancel={() => setConfirmDeleteCommittee(null)}
      />

      <ConfirmDialog
        open={confirmRemoveMember !== null}
        title="Remove member?"
        message={confirmRemoveMember ? `Remove ${confirmRemoveMember.member_name} from this committee?` : ''}
        confirmLabel="Remove"
        busy={removingMember}
        onConfirm={handleRemoveMember}
        onCancel={() => setConfirmRemoveMember(null)}
      />
    </div>
  )
}
