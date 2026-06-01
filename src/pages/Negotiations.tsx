import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useUserSettings } from '../lib/useUserSettings'
import { useToast } from '../lib/toast'
import { describeError } from '../lib/errors'
import ConfirmDialog from '../lib/ConfirmDialog'
import { inputStyle, btnPrimary, btnSecondary, btnDanger, card, labelStyle, errorBox, formatDate, thStyle, tdStyle } from '../lib/ui'
import type { NegotiationCycle, LocalUnion, ID, NegotiationStatus } from '../lib/types'

interface NegotiationsProps {
  onOpenNegotiation: (id: ID) => void
  onNavigateToLocalUnions: () => void
}

const STATUS_COLORS: Record<NegotiationStatus, { bg: string; color: string; border: string }> = {
  Active:   { bg: '#f0fdf4', color: '#059669', border: '#bbf7d0' },
  Settled:  { bg: '#EEF2FF', color: '#4F46E5', border: '#C7D2FE' },
  Archived: { bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' }
}

export default function Negotiations({ onOpenNegotiation, onNavigateToLocalUnions }: NegotiationsProps): React.JSX.Element {
  const { effectiveChapterId, applyChapterFilter, loading: chapterLoading } = useUserSettings()
  const toast = useToast()
  const [cycles, setCycles] = useState<NegotiationCycle[]>([])
  const [unions, setUnions] = useState<LocalUnion[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', local_union_id: '', cba_expiration_date: '' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [confirmDelete, setConfirmDelete] = useState<NegotiationCycle | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let cancelled = false

    void Promise.all([
      applyChapterFilter(supabase.from('negotiation_cycles').select('*').order('created_at', { ascending: false })),
      applyChapterFilter(supabase.from('local_unions').select('*').order('local_number'))
    ]).then(([cyclesRes, unionsRes]: [{ data: unknown; error: unknown }, { data: unknown; error: unknown }]) => {
      if (cancelled) return
      if (cyclesRes.error) {
        setLoadError(describeError(cyclesRes.error, 'Could not load negotiations.'))
      } else {
        setCycles((cyclesRes.data ?? []) as NegotiationCycle[])
      }
      if (unionsRes.error) {
        toast.error('Could not load local unions: ' + describeError(unionsRes.error))
      } else {
        setUnions((unionsRes.data ?? []) as LocalUnion[])
      }
      setLoading(false)
    })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveChapterId])

  async function handleCreate(): Promise<void> {
    setSaveError('')
    if (!effectiveChapterId) {
      setSaveError('Select a specific chapter from the sidebar before creating a negotiation.')
      return
    }
    const name = form.name.trim()
    if (!name) { setSaveError('Negotiation name is required.'); return }
    if (!form.local_union_id) { setSaveError('Select a local union.'); return }

    setSaving(true)
    const { data, error } = await supabase
      .from('negotiation_cycles')
      .insert({
        chapter_id: effectiveChapterId,
        local_union_id: form.local_union_id,
        name,
        classification: 'Journeyman',
        cba_expiration_date: form.cba_expiration_date || null,
        status: 'Active'
      })
      .select()
      .single()
    setSaving(false)

    if (error || !data) {
      const msg = describeError(error, 'Could not create the negotiation.')
      setSaveError(msg)
      toast.error(msg)
      return
    }
    setCycles((prev) => [data as NegotiationCycle, ...prev])
    setShowForm(false)
    setForm({ name: '', local_union_id: '', cba_expiration_date: '' })
    toast.success('Negotiation created.')
  }

  async function handleDelete(): Promise<void> {
    if (!confirmDelete) return
    setDeleting(true)
    const { error } = await supabase.from('negotiation_cycles').delete().eq('id', confirmDelete.id)
    setDeleting(false)
    if (error) {
      toast.error('Could not delete: ' + describeError(error))
      return
    }
    setCycles((prev) => prev.filter((c) => c.id !== confirmDelete.id))
    setConfirmDelete(null)
    toast.success('Negotiation deleted.')
  }

  function unionLabel(localUnionId: ID): string {
    const u = unions.find((x) => x.id === localUnionId)
    if (!u) return '—'
    const loc = `Local ${u.local_number}`
    return u.city ? `${loc} — ${u.city}` : loc
  }

  if (chapterLoading || loading) {
    return <div style={{ padding: '32px', fontSize: '13px', color: '#64748B' }}>Loading…</div>
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: '960px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#0F172A', margin: 0 }}>Negotiations</h1>
          <p style={{ fontSize: '13px', color: '#64748B', margin: '6px 0 0' }}>Manage bargaining cycles with each local union.</p>
        </div>
        {!showForm && <button style={btnPrimary} onClick={() => setShowForm(true)}>+ New Negotiation</button>}
      </div>

      {loadError && <div style={errorBox}>{loadError}</div>}

      {showForm && (
        <div style={{ ...card, borderColor: '#1E3A8A', borderWidth: '1.5px', marginBottom: '24px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '16px' }}>New Negotiation</div>
          {unions.length === 0 ? (
            <div style={{ fontSize: '13px', color: '#64748B', padding: '12px', background: '#F8FAFC', borderRadius: '6px' }}>
              You need at least one local union first.{' '}
              <button onClick={onNavigateToLocalUnions} style={{ background: 'none', border: 'none', color: '#1E3A8A', cursor: 'pointer', padding: 0, fontSize: '13px', fontWeight: 600 }}>
                Add a local union →
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={labelStyle}>Name <span style={{ color: '#ef4444' }}>*</span></label>
                  <input style={inputStyle} value={form.name} autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. 2026 IBEW Local 11 Inside Wireman CBA" />
                </div>
                <div>
                  <label style={labelStyle}>Local Union <span style={{ color: '#ef4444' }}>*</span></label>
                  <select style={inputStyle} value={form.local_union_id} onChange={(e) => setForm({ ...form, local_union_id: e.target.value })}>
                    <option value="">— Select —</option>
                    {unions.map((u) => (
                      <option key={u.id} value={u.id}>Local {u.local_number}{u.city ? ` — ${u.city}` : ''}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>CBA Expiration</label>
                <input type="date" style={{ ...inputStyle, maxWidth: '240px' }} value={form.cba_expiration_date} onChange={(e) => setForm({ ...form, cba_expiration_date: e.target.value })} />
              </div>
              {saveError && <div style={errorBox}>{saveError}</div>}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button style={{ ...btnPrimary, opacity: saving ? 0.5 : 1 }} disabled={saving} onClick={handleCreate}>
                  {saving ? 'Creating…' : 'Create'}
                </button>
                <button style={btnSecondary} onClick={() => { setShowForm(false); setSaveError('') }}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}

      {cycles.length === 0 && !showForm ? (
        <div style={{ textAlign: 'center', padding: '60px 24px' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 16px', display: 'block' }} aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>No negotiations yet</div>
          <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '20px' }}>Create your first bargaining cycle to start logging sessions and tracking proposals.</div>
          <button style={btnPrimary} onClick={() => setShowForm(true)}>Create First Negotiation</button>
        </div>
      ) : cycles.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle} scope="col">Name</th>
                <th style={thStyle} scope="col">Local Union</th>
                <th style={thStyle} scope="col">CBA Expires</th>
                <th style={thStyle} scope="col">Status</th>
                <th style={{ ...thStyle, width: '80px' }} scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {cycles.map((c) => {
                const sc = STATUS_COLORS[c.status]
                return (
                  <tr key={c.id}>
                    <td style={tdStyle}>
                      <button
                        onClick={() => onOpenNegotiation(c.id)}
                        style={{ background: 'none', border: 'none', padding: 0, color: '#1E3A8A', fontWeight: 600, fontSize: '13px', cursor: 'pointer', textAlign: 'left' }}
                      >
                        {c.name}
                      </button>
                    </td>
                    <td style={tdStyle}>{unionLabel(c.local_union_id)}</td>
                    <td style={tdStyle}>{formatDate(c.cba_expiration_date)}</td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                        {c.status}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <button
                        aria-label={`Delete ${c.name}`}
                        title={`Delete ${c.name}`}
                        onClick={() => setConfirmDelete(c)}
                        style={{ ...btnDanger, fontSize: '12px', padding: '4px 10px' }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete negotiation?"
        message={confirmDelete ? `This will permanently delete "${confirmDelete.name}" and all its sessions, proposals, and positions. This cannot be undone.` : ''}
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
