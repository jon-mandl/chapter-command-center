// Close Out wizard — records the settlement facts on a negotiation cycle and
// moves it to Settled (locked). Optionally attaches the final agreement,
// either by picking an already-uploaded document or uploading a new file
// (stored with the 'final_agreement' role, same path as the Documents tab).

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { describeError } from '../lib/errors'
import { inputStyle, btnPrimary, btnSecondary, labelStyle, errorBox } from '../lib/ui'
import {
  STORAGE_BUCKETS,
  buildStoragePath,
  formatBytes,
  validateUpload
} from '../lib/storage'
import type { NegotiationCycle, NegotiationDocument } from '../lib/types'

interface DocOption {
  id: string
  file_name: string
  role: string
}

interface CloseOutModalProps {
  cycle: NegotiationCycle
  onCancel: () => void
  onClosedOut: (updated: NegotiationCycle) => void
}

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function CloseOutModal({ cycle, onCancel, onClosedOut }: CloseOutModalProps): React.JSX.Element {
  const [settledDate, setSettledDate] = useState(localToday())
  const [openCount, setOpenCount] = useState<number | null>(null)
  const [docs, setDocs] = useState<DocOption[]>([])
  const [selectedDocId, setSelectedDocId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dateRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    dateRef.current?.focus()
    let cancelled = false
    void Promise.all([
      supabase
        .from('proposals')
        .select('id', { count: 'exact', head: true })
        .eq('cycle_id', cycle.id)
        .eq('status', 'Open'),
      supabase
        .from('negotiation_documents')
        .select('id, file_name, role')
        .eq('cycle_id', cycle.id)
        .order('uploaded_at', { ascending: false })
    ]).then(([openRes, docsRes]) => {
      if (cancelled) return
      if (!openRes.error) setOpenCount(openRes.count ?? 0)
      if (!docsRes.error) setDocs((docsRes.data ?? []) as DocOption[])
    })
    return () => { cancelled = true }
  }, [cycle.id])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  async function handleConfirm(): Promise<void> {
    setError('')
    if (!settledDate) { setError('Settlement date is required.'); return }
    setBusy(true)

    let finalDocId: string | null = selectedDocId || null

    if (file) {
      const v = validateUpload(file, 'negotiationDocuments')
      if (v) { setError(v.message); setBusy(false); return }
      const path = buildStoragePath(cycle.id, file.name)
      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKETS.negotiationDocuments.name)
        .upload(path, file, { contentType: file.type || undefined, upsert: false })
      if (upErr) {
        setBusy(false)
        setError(describeError(upErr, 'Upload failed.'))
        return
      }
      const { data: docRow, error: docErr } = await supabase
        .from('negotiation_documents')
        .insert({
          cycle_id: cycle.id,
          chapter_id: cycle.chapter_id,
          file_name: file.name,
          file_path: path,
          file_size: file.size,
          mime_type: file.type || null,
          role: 'final_agreement',
          notes: null
        })
        .select()
        .single()
      if (docErr || !docRow) {
        await supabase.storage.from(STORAGE_BUCKETS.negotiationDocuments.name).remove([path])
        setBusy(false)
        setError(describeError(docErr, 'Saved the file, but could not record it. Try again.'))
        return
      }
      finalDocId = (docRow as NegotiationDocument).id
    }

    const { data, error: updErr } = await supabase
      .from('negotiation_cycles')
      .update({ status: 'Settled', settled_date: settledDate, final_agreement_document_id: finalDocId })
      .eq('id', cycle.id)
      .select()
      .single()
    setBusy(false)
    if (updErr || !data) {
      setError(describeError(updErr, 'Could not close out the negotiation.'))
      return
    }
    onClosedOut(data as NegotiationCycle)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="closeout-title"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel() }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px'
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '10px',
          maxWidth: '480px',
          width: '100%',
          padding: '24px 26px',
          boxShadow: '0 12px 40px rgba(15, 23, 42, 0.2)',
          maxHeight: '90vh',
          overflowY: 'auto'
        }}
      >
        <div id="closeout-title" style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>
          Close Out Negotiation
        </div>
        <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.55, marginBottom: '18px' }}>
          Marks "{cycle.name}" as Settled and locks it against edits. You can reopen it later if needed.
        </div>

        {openCount !== null && openCount > 0 && (
          <div style={{ fontSize: '13px', color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '6px', padding: '10px 14px', marginBottom: '16px' }}>
            {openCount} proposal{openCount !== 1 ? 's are' : ' is'} still Open. They will stay Open in the record —
            review the Proposals tab first if they should be marked TA or Withdrawn.
          </div>
        )}

        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>Settlement Date <span style={{ color: '#ef4444' }}>*</span></label>
          <input
            ref={dateRef}
            type="date"
            style={inputStyle}
            value={settledDate}
            onChange={(e) => setSettledDate(e.target.value)}
            disabled={busy}
          />
        </div>

        <div style={{ marginBottom: '18px' }}>
          <label style={labelStyle}>Final Agreement <span style={{ fontWeight: 400, color: '#94A3B8' }}>(optional)</span></label>
          {docs.length > 0 && (
            <select
              style={{ ...inputStyle, marginBottom: '8px', opacity: file ? 0.4 : 1 }}
              value={selectedDocId}
              disabled={busy || file !== null}
              onChange={(e) => setSelectedDocId(e.target.value)}
              aria-label="Pick an existing document as the final agreement"
            >
              <option value="">— Attach later / none —</option>
              {docs.map((d) => <option key={d.id} value={d.id}>{d.file_name}</option>)}
            </select>
          )}
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={busy}
            style={{ fontSize: '13px' }}
            aria-label="Upload the final agreement file"
          />
          {file && (
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '6px' }}>
              {file.name} · {formatBytes(file.size)} — will be filed under Documents as "Final Agreement"
            </div>
          )}
          {docs.length > 0 && !file && (
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '6px' }}>
              Pick an existing document above, or upload a new file.
            </div>
          )}
        </div>

        {error && <div style={errorBox}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button style={btnSecondary} onClick={onCancel} disabled={busy}>Cancel</button>
          <button
            style={{ ...btnPrimary, opacity: busy || !settledDate ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer' }}
            onClick={handleConfirm}
            disabled={busy || !settledDate}
          >
            {busy ? 'Closing Out…' : 'Close Out Negotiation'}
          </button>
        </div>
      </div>
    </div>
  )
}
