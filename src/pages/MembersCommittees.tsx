import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useOrg } from '../lib/useOrg'
import { inputStyle, btnPrimary, btnSecondary, btnDanger, labelStyle, thStyle, tdStyle, formatDate } from '../lib/ui'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Committee {
  id: number
  name: string
  description: string | null
}

interface Company {
  id: number
  company_name: string
}

interface Rep {
  id: number
  company_id: number
  name: string
  title: string | null
}

interface CommitteeMember {
  id: number
  committee_id: number
  company_id: number
  representative_id: number | null
  appointed_date: string | null
  term_expiry_date: string | null
  notes: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function expiryStatus(dateStr: string | null): 'expired' | 'warn' | null {
  if (!dateStr) return null
  const today = new Date()
  const expiry = new Date(dateStr + 'T00:00:00')
  const daysLeft = (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  if (daysLeft < 0) return 'expired'
  if (daysLeft <= 30) return 'warn'
  return null
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function MembersCommittees(): React.JSX.Element {
  const { orgId, loading: orgLoading } = useOrg()
  const [committees, setCommittees] = useState<Committee[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [allReps, setAllReps] = useState<Record<number, Rep[]>>({})
  const [selected, setSelected] = useState<Committee | null>(null)
  const [members, setMembers] = useState<CommitteeMember[]>([])
  const [loading, setLoading] = useState(true)
  const [actionError, setActionError] = useState('')

  // Add committee
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', description: '' })
  const [addSaving, setAddSaving] = useState(false)

  // Edit committee name/desc
  const [editCommittee, setEditCommittee] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', description: '' })
  const [editSaving, setEditSaving] = useState(false)

  // Member form
  const [showAddMember, setShowAddMember] = useState(false)
  const [editingMember, setEditingMember] = useState<CommitteeMember | null>(null)
  const [memberForm, setMemberForm] = useState({ company_id: 0, representative_id: 0, appointed_date: '', term_expiry_date: '', notes: '' })
  const [memberSaving, setMemberSaving] = useState(false)

  // Delete committee
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!orgId) return
    Promise.all([
      supabase.from('committees').select('*').eq('org_id', orgId).order('name'),
      supabase.from('member_companies').select('id, company_name').eq('org_id', orgId).order('company_name')
    ]).then(async ([committeeRes, companyRes]) => {
      setCommittees((committeeRes.data as Committee[]) ?? [])
      const cos = (companyRes.data as Company[]) ?? []
      setCompanies(cos)
      // Pre-load reps for all companies
      const repMap: Record<number, Rep[]> = {}
      await Promise.all(
        cos.map(async (c) => {
          const { data } = await supabase.from('member_representatives').select('id, company_id, name, title').eq('company_id', c.id)
          repMap[c.id] = (data as Rep[]) ?? []
        })
      )
      setAllReps(repMap)
      setLoading(false)
    })
  }, [orgId])

  useEffect(() => {
    if (!selected) { setMembers([]); return }
    supabase.from('committee_members').select('*').eq('committee_id', selected.id).then(({ data }) => {
      setMembers((data as CommitteeMember[]) ?? [])
    })
  }, [selected])

  function openDetail(c: Committee): void {
    setSelected(c)
    setEditCommittee(false)
    setShowAddMember(false)
    setEditingMember(null)
    setActionError('')
    setConfirmDelete(false)
  }

  function closeDetail(): void {
    setSelected(null)
    setEditCommittee(false)
    setShowAddMember(false)
    setEditingMember(null)
    setConfirmDelete(false)
  }

  async function handleAddCommittee(): Promise<void> {
    if (!orgId || !addForm.name.trim()) return
    setAddSaving(true)
    setActionError('')
    const { data, error } = await supabase
      .from('committees')
      .insert({ org_id: orgId, name: addForm.name.trim(), description: addForm.description.trim() || null })
      .select()
      .single()
    if (error) { setActionError('Could not create committee. Please try again.') }
    else { setCommittees((prev) => [...prev, data as Committee].sort((a, b) => a.name.localeCompare(b.name))); setShowAdd(false); setAddForm({ name: '', description: '' }) }
    setAddSaving(false)
  }

  async function handleSaveEditCommittee(): Promise<void> {
    if (!selected || !editForm.name.trim()) return
    setEditSaving(true)
    setActionError('')
    const { data, error } = await supabase
      .from('committees')
      .update({ name: editForm.name.trim(), description: editForm.description.trim() || null })
      .eq('id', selected.id)
      .select()
      .single()
    if (error) { setActionError('Could not save changes. Please try again.') }
    else { const updated = data as Committee; setCommittees((prev) => prev.map((c) => c.id === updated.id ? updated : c)); setSelected(updated); setEditCommittee(false) }
    setEditSaving(false)
  }

  async function handleDeleteCommittee(): Promise<void> {
    if (!selected) return
    setDeleting(true)
    setActionError('')
    const { error } = await supabase.from('committees').delete().eq('id', selected.id)
    if (error) { setActionError('Could not delete committee. Please try again.'); setConfirmDelete(false) }
    else { setCommittees((prev) => prev.filter((c) => c.id !== selected.id)); closeDetail() }
    setDeleting(false)
  }

  async function handleSaveMember(): Promise<void> {
    if (!selected || !memberForm.company_id) return
    setMemberSaving(true)
    setActionError('')
    if (editingMember) {
      const { data, error } = await supabase
        .from('committee_members')
        .update({
          company_id: memberForm.company_id,
          representative_id: memberForm.representative_id || null,
          appointed_date: memberForm.appointed_date || null,
          term_expiry_date: memberForm.term_expiry_date || null,
          notes: memberForm.notes.trim() || null
        })
        .eq('id', editingMember.id)
        .select()
        .single()
      if (error) { setActionError('Could not save. Please try again.') }
      else { setMembers((prev) => prev.map((m) => m.id === editingMember.id ? data as CommitteeMember : m)); setEditingMember(null) }
    } else {
      const { data, error } = await supabase
        .from('committee_members')
        .insert({
          committee_id: selected.id,
          company_id: memberForm.company_id,
          representative_id: memberForm.representative_id || null,
          appointed_date: memberForm.appointed_date || null,
          term_expiry_date: memberForm.term_expiry_date || null,
          notes: memberForm.notes.trim() || null
        })
        .select()
        .single()
      if (error) { setActionError('Could not add member. Please try again.') }
      else { setMembers((prev) => [...prev, data as CommitteeMember]); setShowAddMember(false) }
    }
    setMemberForm({ company_id: 0, representative_id: 0, appointed_date: '', term_expiry_date: '', notes: '' })
    setMemberSaving(false)
  }

  async function handleRemoveMember(m: CommitteeMember): Promise<void> {
    setActionError('')
    const { error } = await supabase.from('committee_members').delete().eq('id', m.id)
    if (error) setActionError('Could not remove member. Please try again.')
    else setMembers((prev) => prev.filter((x) => x.id !== m.id))
  }

  const repsForSelected = allReps[memberForm.company_id] ?? []

  if (orgLoading || loading) {
    return <div style={{ padding: '32px', fontSize: '13px', color: '#64748B' }}>Loading…</div>
  }

  return (
    <div style={{ display: 'flex', height: '100%', position: 'relative' }}>
      {/* Main list */}
      <div style={{ flex: 1, padding: '28px 32px', overflowY: 'auto', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0F172A', margin: 0 }}>Committees</h1>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0' }}>{committees.length} {committees.length === 1 ? 'committee' : 'committees'}</p>
          </div>
          <button style={btnPrimary} onClick={() => { setShowAdd(true); setAddForm({ name: '', description: '' }) }}>Add Committee</button>
        </div>

        {actionError && (
          <div style={{ marginBottom: '16px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {actionError}
            <button onClick={() => setActionError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#94A3B8' }}>×</button>
          </div>
        )}

        {showAdd && (
          <div style={{ background: '#fff', border: '1.5px solid #1E3A8A', borderRadius: '8px', padding: '20px', marginBottom: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '14px' }}>New Committee</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={labelStyle}>Committee Name <span style={{ color: '#ef4444' }}>*</span></label>
                <input style={inputStyle} value={addForm.name} autoFocus onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Description</label>
                <input style={inputStyle} value={addForm.description} onChange={(e) => setAddForm({ ...addForm, description: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={{ ...btnPrimary, opacity: !addForm.name.trim() || addSaving ? 0.5 : 1 }} disabled={!addForm.name.trim() || addSaving} onClick={handleAddCommittee}>
                {addSaving ? 'Adding…' : 'Add Committee'}
              </button>
              <button style={btnSecondary} onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        )}

        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
          {committees.length === 0 ? (
            <div style={{ padding: '64px 24px', textAlign: 'center' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 16px', display: 'block' }}>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>No committees yet</div>
              <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '20px' }}>Create your first committee to track member appointments and terms.</div>
              <button style={btnPrimary} onClick={() => setShowAdd(true)}>Add First Committee</button>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th scope="col" style={thStyle}>Committee Name</th>
                  <th scope="col" style={thStyle}>Description</th>
                  <th scope="col" style={{ ...thStyle, textAlign: 'right' as const }}></th>
                </tr>
              </thead>
              <tbody>
                {committees.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => openDetail(c)}
                    style={{ cursor: 'pointer', background: selected?.id === c.id ? '#EEF2FF' : 'transparent' }}
                    onMouseEnter={(e) => { if (selected?.id !== c.id) (e.currentTarget as HTMLTableRowElement).style.background = '#F8FAFC' }}
                    onMouseLeave={(e) => { if (selected?.id !== c.id) (e.currentTarget as HTMLTableRowElement).style.background = 'transparent' }}
                  >
                    <td style={{ ...tdStyle, fontWeight: 500 }}>{c.name}</td>
                    <td style={{ ...tdStyle, color: '#64748B' }}>{c.description ?? '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' as const, color: '#94A3B8' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18 15 12 9 6"/></svg>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <>
          <div onClick={closeDetail} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.15)', zIndex: 100 }} />
          <div role="dialog" aria-modal="true" aria-labelledby="committee-detail-title" style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: '580px',
            background: '#fff', borderLeft: '1px solid #E2E8F0',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.08)', zIndex: 101, overflowY: 'auto'
          }}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              {editCommittee ? (
                <div style={{ flex: 1, marginRight: '12px' }}>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
                    <input style={inputStyle} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Committee name" />
                    <input style={inputStyle} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} placeholder="Description" />
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button style={{ ...btnPrimary, fontSize: '12px', padding: '5px 12px', opacity: !editForm.name.trim() || editSaving ? 0.5 : 1 }} disabled={!editForm.name.trim() || editSaving} onClick={handleSaveEditCommittee}>{editSaving ? 'Saving…' : 'Save'}</button>
                    <button style={{ ...btnSecondary, fontSize: '12px', padding: '5px 10px' }} onClick={() => setEditCommittee(false)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div>
                  <div id="committee-detail-title" style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>{selected.name}</div>
                  {selected.description && <div style={{ fontSize: '13px', color: '#64748B', marginTop: '2px' }}>{selected.description}</div>}
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                {!editCommittee && <button style={btnSecondary} onClick={() => { setEditCommittee(true); setEditForm({ name: selected.name, description: selected.description ?? '' }) }}>Edit</button>}
                <button aria-label="Close" title="Close" style={{ ...btnSecondary, fontSize: '18px', lineHeight: 1, padding: '5px 10px' }} onClick={closeDetail}>×</button>
              </div>
            </div>

            <div style={{ padding: '20px 24px' }}>
              {actionError && (
                <div style={{ marginBottom: '14px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '13px' }}>{actionError}</div>
              )}

              {/* Members header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748B' }}>Members ({members.length})</div>
                {!showAddMember && !editingMember && (
                  <button style={{ ...btnPrimary, fontSize: '12px', padding: '5px 12px' }} onClick={() => { setShowAddMember(true); setMemberForm({ company_id: 0, representative_id: 0, appointed_date: '', term_expiry_date: '', notes: '' }) }}>
                    + Add Member
                  </button>
                )}
              </div>

              {/* Member form */}
              {(showAddMember || editingMember) && (
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px', marginBottom: '14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                    <div>
                      <label style={labelStyle}>Company <span style={{ color: '#ef4444' }}>*</span></label>
                      <select style={inputStyle} value={memberForm.company_id} onChange={(e) => setMemberForm({ ...memberForm, company_id: parseInt(e.target.value), representative_id: 0 })}>
                        <option value={0}>Select company…</option>
                        {companies.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Representative <span style={{ fontWeight: 400, color: '#94A3B8' }}>(optional)</span></label>
                      <select style={inputStyle} value={memberForm.representative_id} onChange={(e) => setMemberForm({ ...memberForm, representative_id: parseInt(e.target.value) })} disabled={!memberForm.company_id}>
                        <option value={0}>No specific rep</option>
                        {repsForSelected.map((r) => <option key={r.id} value={r.id}>{r.name}{r.title ? ` — ${r.title}` : ''}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Appointed Date</label>
                      <input type="date" style={inputStyle} value={memberForm.appointed_date} onChange={(e) => setMemberForm({ ...memberForm, appointed_date: e.target.value })} />
                    </div>
                    <div>
                      <label style={labelStyle}>Term Expiry Date</label>
                      <input type="date" style={inputStyle} value={memberForm.term_expiry_date} onChange={(e) => setMemberForm({ ...memberForm, term_expiry_date: e.target.value })} />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={labelStyle}>Notes</label>
                      <input style={inputStyle} value={memberForm.notes} onChange={(e) => setMemberForm({ ...memberForm, notes: e.target.value })} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button style={{ ...btnPrimary, fontSize: '12px', padding: '6px 12px', opacity: !memberForm.company_id || memberSaving ? 0.5 : 1 }} disabled={!memberForm.company_id || memberSaving} onClick={handleSaveMember}>
                      {memberSaving ? 'Saving…' : editingMember ? 'Save' : 'Add'}
                    </button>
                    <button style={{ ...btnSecondary, fontSize: '12px', padding: '6px 10px' }} onClick={() => { setShowAddMember(false); setEditingMember(null) }}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Members table */}
              {members.length === 0 ? (
                <div style={{ fontSize: '13px', color: '#94A3B8' }}>No members added yet.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th scope="col" style={thStyle}>Company</th>
                      <th scope="col" style={thStyle}>Rep</th>
                      <th scope="col" style={thStyle}>Term Expires</th>
                      <th scope="col" style={{ ...thStyle, textAlign: 'right' as const }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => {
                      const co = companies.find((c) => c.id === m.company_id)
                      const rep = (allReps[m.company_id] ?? []).find((r) => r.id === m.representative_id)
                      const expStatus = expiryStatus(m.term_expiry_date)
                      return (
                        <tr key={m.id}>
                          <td style={{ ...tdStyle, fontWeight: 500 }}>{co?.company_name ?? '—'}</td>
                          <td style={{ ...tdStyle, color: '#64748B' }}>{rep ? rep.name : '—'}</td>
                          <td style={tdStyle}>
                            {m.term_expiry_date ? (
                              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ color: expStatus ? (expStatus === 'expired' ? '#dc2626' : '#d97706') : '#0F172A', fontSize: '13px' }}>
                                  {formatDate(m.term_expiry_date)}
                                </span>
                                {expStatus === 'expired' && <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '999px', background: '#fef2f2', color: '#dc2626' }}>Expired</span>}
                                {expStatus === 'warn' && <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '999px', background: '#fffbeb', color: '#d97706' }}>Soon</span>}
                              </span>
                            ) : '—'}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right' as const }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                              <button style={{ ...btnSecondary, fontSize: '11px', padding: '3px 8px' }} onClick={() => {
                                setEditingMember(m)
                                setMemberForm({ company_id: m.company_id, representative_id: m.representative_id ?? 0, appointed_date: m.appointed_date ?? '', term_expiry_date: m.term_expiry_date ?? '', notes: m.notes ?? '' })
                                setShowAddMember(false)
                              }}>Edit</button>
                              <button style={{ ...btnDanger, fontSize: '11px', padding: '3px 8px' }} onClick={() => handleRemoveMember(m)}>Remove</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}

              {/* Delete committee */}
              <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '20px', marginTop: '20px' }}>
                {confirmDelete ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '13px', color: '#64748B' }}>Delete this committee and all its members?</span>
                    <button style={{ ...btnDanger, fontSize: '12px', padding: '5px 12px' }} disabled={deleting} onClick={handleDeleteCommittee}>{deleting ? 'Deleting…' : 'Yes, Delete'}</button>
                    <button style={{ ...btnSecondary, fontSize: '12px', padding: '5px 10px' }} onClick={() => setConfirmDelete(false)}>Cancel</button>
                  </div>
                ) : (
                  <button style={btnDanger} onClick={() => setConfirmDelete(true)}>Delete Committee</button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
