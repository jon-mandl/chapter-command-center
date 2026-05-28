import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useOrg } from '../lib/useOrg'
import { inputStyle, btnPrimary, btnSecondary, card, labelStyle, errorBox } from '../lib/ui'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LocalUnion {
  id: number
  local_number: string
  charter_city: string | null
}

interface Negotiation {
  id: number
  name: string
  bargaining_unit: string
  local_number: string | null
  local_union_id: number | null
  contract_expiration_date: string | null
  status: string
  created_at: string
}

// ─── New Negotiation Form ─────────────────────────────────────────────────────

function NewNegotiationForm({ orgId, onSaved, onCancel, onNavigateToLocalUnions }: {
  orgId: string
  onSaved: (n: Negotiation) => void
  onCancel: () => void
  onNavigateToLocalUnions: () => void
}): React.JSX.Element {
  const [name, setName] = useState('')
  const [localUnions, setLocalUnions] = useState<LocalUnion[]>([])
  const [localUnionId, setLocalUnionId] = useState<number | ''>('')
  const [expirationDate, setExpirationDate] = useState('')
  const [loadingUnions, setLoadingUnions] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    supabase
      .from('local_unions')
      .select('id, local_number, charter_city')
      .eq('org_id', orgId)
      .order('local_number')
      .then(({ data, error }) => {
        if (!error && data) setLocalUnions(data)
        setLoadingUnions(false)
      })
  }, [orgId])

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!name.trim() || !localUnionId) return
    setSaving(true)
    setSaveError('')

    const selectedUnion = localUnions.find((l) => l.id === localUnionId)

    const { data, error } = await supabase
      .from('negotiations')
      .insert({
        org_id: orgId,
        name: name.trim(),
        bargaining_unit: '',
        local_union_id: localUnionId,
        local_number: selectedUnion?.local_number ?? null,
        contract_expiration_date: expirationDate || null,
        status: 'Scheduling'
      })
      .select()
      .single()

    if (error) {
      setSaveError('Could not create negotiation. Please try again.')
    } else {
      onSaved(data as Negotiation)
    }
    setSaving(false)
  }

  const noUnions = !loadingUnions && localUnions.length === 0
  const canSubmit = name.trim() && localUnionId && !saving && !noUnions

  return (
    <div style={{ ...card, borderColor: '#1E3A8A', borderWidth: '1.5px', marginBottom: '20px' }}>
      <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '18px' }}>New Negotiation</div>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '14px' }}>
          <div>
            <label style={labelStyle}>Negotiation Name <span style={{ color: '#ef4444' }}>*</span></label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Inside Wiremen 2026"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Local Union <span style={{ color: '#ef4444' }}>*</span></label>
            {noUnions ? (
              <div style={{ fontSize: '13px', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '5px', padding: '8px 12px' }}>
                No local unions found.{' '}
                <button
                  type="button"
                  onClick={onNavigateToLocalUnions}
                  style={{ color: '#1E3A8A', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '13px', textDecoration: 'underline' }}
                >
                  Go to Local Unions
                </button>
                {' '}to create one first.
              </div>
            ) : (
              <select
                required
                value={localUnionId}
                onChange={(e) => setLocalUnionId(e.target.value ? Number(e.target.value) : '')}
                style={inputStyle}
                disabled={loadingUnions}
              >
                <option value="">{loadingUnions ? 'Loading…' : '— Select Local Union —'}</option>
                {localUnions.map((l) => (
                  <option key={l.id} value={l.id}>
                    Local {l.local_number}{l.charter_city ? ` — ${l.charter_city}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        <div style={{ marginBottom: '18px' }}>
          <label style={labelStyle}>Contract Expiration Date</label>
          <input
            type="date"
            value={expirationDate}
            onChange={(e) => setExpirationDate(e.target.value)}
            style={{ ...inputStyle, maxWidth: '200px' }}
          />
        </div>
        {saveError && <div style={errorBox}>{saveError}</div>}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="submit" disabled={!canSubmit} style={{ ...btnPrimary, opacity: !canSubmit ? 0.5 : 1 }}>
            {saving ? 'Creating…' : 'Create Negotiation'}
          </button>
          <button type="button" onClick={onCancel} style={btnSecondary}>Cancel</button>
        </div>
      </form>
    </div>
  )
}

// ─── Negotiation Card ─────────────────────────────────────────────────────────

function NegotiationCard({ negotiation, onOpen, onDelete }: {
  negotiation: Negotiation
  onOpen: (id: number) => void
  onDelete: (id: number) => void
}): React.JSX.Element {
  const [confirming, setConfirming] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)

  async function handleDelete(): Promise<void> {
    setDeleting(true)
    setDeleteError('')
    const { error } = await supabase.from('negotiations').delete().eq('id', negotiation.id)
    if (error) {
      setDeleteError('Could not delete. Please try again.')
      setConfirming(false)
    } else {
      onDelete(negotiation.id)
    }
    setDeleting(false)
  }

  const isOpen = negotiation.status !== 'Closed'

  const expDate = negotiation.contract_expiration_date
    ? new Date(negotiation.contract_expiration_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div style={{ ...card, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>{negotiation.name}</span>
          <span style={{
            fontSize: '11px', fontWeight: 600, padding: '2px 9px', borderRadius: '20px',
            background: isOpen ? '#f0fdf4' : '#F8FAFC',
            color: isOpen ? '#059669' : '#64748B',
            border: `1px solid ${isOpen ? '#bbf7d0' : '#E2E8F0'}`
          }}>
            {negotiation.status}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '13px', color: '#64748B' }}>
          {negotiation.local_number && <span>Local {negotiation.local_number}</span>}
          {expDate && <span>Expires {expDate}</span>}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flexShrink: 0 }}>
        {deleteError && (
          <div style={{ fontSize: '12px', color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', padding: '4px 8px' }}>
            {deleteError}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => onOpen(negotiation.id)} style={{ ...btnPrimary, padding: '6px 14px', fontSize: '13px' }}>
            Open
          </button>
          {confirming ? (
            <>
              <span style={{ fontSize: '12px', color: '#64748B' }}>Delete?</span>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{ ...btnSecondary, fontSize: '12px', padding: '4px 10px', color: '#dc2626', borderColor: '#fca5a5' }}
              >
                Yes
              </button>
              <button onClick={() => setConfirming(false)} style={{ ...btnSecondary, fontSize: '12px', padding: '4px 10px' }}>No</button>
            </>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '13px', padding: '4px 8px' }}
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Negotiations Page ────────────────────────────────────────────────────────

export default function Negotiations({ onOpenNegotiation, onNavigateToLocalUnions }: {
  onOpenNegotiation: (id: number) => void
  onNavigateToLocalUnions: () => void
}): React.JSX.Element {
  const { orgId, loading: orgLoading } = useOrg()
  const [negotiations, setNegotiations] = useState<Negotiation[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    if (!orgId) return
    supabase
      .from('negotiations')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          setLoadError('Could not load negotiations. Please try again.')
        } else {
          setNegotiations((data as Negotiation[]) ?? [])
        }
        setLoading(false)
      })
  }, [orgId])

  if (orgLoading) {
    return <div style={{ padding: '32px', fontSize: '13px', color: '#64748B' }}>Loading…</div>
  }

  const active = negotiations.filter((n) => n.status !== 'Closed')
  const closed = negotiations.filter((n) => n.status === 'Closed')

  return (
    <div style={{ padding: '28px 32px', maxWidth: '960px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#0F172A', margin: 0 }}>Negotiations</h1>
          <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0' }}>
            {negotiations.length === 0 ? 'No negotiations yet' : `${active.length} active · ${closed.length} closed`}
          </p>
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)} style={btnPrimary}>+ New Negotiation</button>
        )}
      </div>

      {showForm && orgId && (
        <NewNegotiationForm
          orgId={orgId}
          onSaved={(n) => { setNegotiations((prev) => [n, ...prev]); setShowForm(false) }}
          onCancel={() => setShowForm(false)}
          onNavigateToLocalUnions={onNavigateToLocalUnions}
        />
      )}

      {loadError && <div style={errorBox}>{loadError}</div>}

      {loading ? (
        <p style={{ color: '#64748B', fontSize: '14px' }}>Loading…</p>
      ) : negotiations.length === 0 && !showForm ? (
        <div style={{ textAlign: 'center', padding: '80px 24px' }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 16px', display: 'block' }}>
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>No negotiations yet</div>
          <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '20px' }}>
            Create your first negotiation to start tracking sessions, open items, and tentative agreements.
          </div>
          <button onClick={() => setShowForm(true)} style={btnPrimary}>New Negotiation</button>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div style={{ marginBottom: '28px' }}>
              {active.map((n) => (
                <NegotiationCard
                  key={n.id}
                  negotiation={n}
                  onOpen={onOpenNegotiation}
                  onDelete={(id) => setNegotiations((prev) => prev.filter((x) => x.id !== id))}
                />
              ))}
            </div>
          )}
          {closed.length > 0 && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
                Closed Negotiations
              </div>
              {closed.map((n) => (
                <NegotiationCard
                  key={n.id}
                  negotiation={n}
                  onOpen={onOpenNegotiation}
                  onDelete={(id) => setNegotiations((prev) => prev.filter((x) => x.id !== id))}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
