import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useOrg } from '../lib/useOrg'
import { inputStyle, labelStyle, btnPrimary, btnSecondary, btnDanger, errorBox, formatDate } from '../lib/ui'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Document {
  id: number
  name: string
  original_name: string
  storage_path: string
  file_type: string | null
  file_size: number | null
  document_type: string | null
  tags: string | null
  notes: string | null
  uploaded_at: string
}

const DOCUMENT_TYPES = [
  'Contract / CBA',
  'Opening Letter',
  'Meeting Minutes',
  'Proposal',
  'Arbitration',
  'Grievance',
  'Correspondence',
  'Financial',
  'Other',
]

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileIcon(fileType: string | null): React.JSX.Element {
  const t = (fileType ?? '').toLowerCase()
  if (t.includes('pdf')) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
        <line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/><polyline points="11 9 9 9 9 13"/>
      </svg>
    )
  }
  if (t.includes('word') || t.includes('doc')) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1E3A8A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
        <line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/>
      </svg>
    )
  }
  if (t.includes('sheet') || t.includes('excel') || t.includes('xlsx') || t.includes('csv')) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
        <line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/>
      </svg>
    )
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
    </svg>
  )
}

// ─── Upload Panel ─────────────────────────────────────────────────────────────

function UploadPanel({ orgId, onUploaded, onCancel }: {
  orgId: string
  onUploaded: (doc: Document) => void
  onCancel: () => void
}): React.JSX.Element {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [documentType, setDocumentType] = useState('')
  const [tags, setTags] = useState('')
  const [notes, setNotes] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileSelect(selected: File): void {
    setFile(selected)
    if (!name) setName(selected.name.replace(/\.[^.]+$/, ''))
    setError('')
  }

  async function handleUpload(): Promise<void> {
    if (!file || !name.trim()) { setError('A file and name are required.'); return }
    setUploading(true); setError('')

    const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : ''
    const storagePath = `${orgId}/${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('documents')
      .upload(storagePath, file, { contentType: file.type, upsert: false })

    if (uploadErr) {
      setError('Upload failed. Please try again.')
      setUploading(false)
      return
    }

    const { data, error: dbErr } = await supabase
      .from('documents')
      .insert({
        org_id: orgId,
        name: name.trim(),
        original_name: file.name,
        storage_path: storagePath,
        file_type: file.type || null,
        file_size: file.size,
        document_type: documentType || null,
        tags: tags.trim() || null,
        notes: notes.trim() || null,
      })
      .select()
      .single()

    if (dbErr) {
      // Clean up the uploaded file if DB insert fails
      await supabase.storage.from('documents').remove([storagePath])
      setError('Could not save document record. Please try again.')
      setUploading(false)
      return
    }

    onUploaded(data as Document)
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '24px', marginBottom: '20px' }}>
      <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '20px' }}>Upload Document</div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f) }}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? '#1E3A8A' : '#CBD5E1'}`,
          borderRadius: '8px',
          padding: '32px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragOver ? '#EFF6FF' : '#F8FAFC',
          marginBottom: '20px',
          transition: 'all 0.15s'
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }}
        />
        {file ? (
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '4px' }}>{file.name}</div>
            <div style={{ fontSize: '12px', color: '#64748B' }}>{formatBytes(file.size)}</div>
            <button
              onClick={(e) => { e.stopPropagation(); setFile(null); setName('') }}
              style={{ marginTop: '8px', fontSize: '11px', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Remove
            </button>
          </div>
        ) : (
          <div>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 10px', display: 'block' }} aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <div style={{ fontSize: '13px', fontWeight: 500, color: '#64748B' }}>Drop a file here or click to browse</div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
        <div>
          <label style={labelStyle}>Document Name <span style={{ color: '#ef4444' }}>*</span></label>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 2026 CBA Draft" />
        </div>
        <div>
          <label style={labelStyle}>Document Type</label>
          <select style={inputStyle} value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
            <option value="">— None —</option>
            {DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Tags <span style={{ fontSize: '11px', fontWeight: 400, color: '#94A3B8' }}>(comma-separated)</span></label>
          <input style={inputStyle} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. 2026, inside wiremen, final" />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Notes</label>
          <textarea style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      {error && <div style={errorBox}>{error}</div>}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={handleUpload}
          disabled={!file || !name.trim() || uploading}
          style={{ ...btnPrimary, opacity: !file || !name.trim() || uploading ? 0.5 : 1 }}
        >
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
        <button onClick={onCancel} style={btnSecondary} disabled={uploading}>Cancel</button>
      </div>
    </div>
  )
}

// ─── Document Detail Panel ─────────────────────────────────────────────────────

function DocumentDetail({ doc, onClose, onDeleted, onUpdated }: {
  doc: Document
  onClose: () => void
  onDeleted: (id: number) => void
  onUpdated: (doc: Document) => void
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(doc.name)
  const [documentType, setDocumentType] = useState(doc.document_type ?? '')
  const [tags, setTags] = useState(doc.tags ?? '')
  const [notes, setNotes] = useState(doc.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function handleDownload(): Promise<void> {
    setDownloading(true); setError('')
    const { data, error: err } = await supabase.storage
      .from('documents')
      .createSignedUrl(doc.storage_path, 60)
    if (err || !data) { setError('Could not generate download link.'); setDownloading(false); return }
    const a = window.document.createElement('a')
    a.href = data.signedUrl
    a.download = doc.original_name
    a.click()
    setDownloading(false)
  }

  async function handleSave(): Promise<void> {
    if (!name.trim()) { setError('Name is required.'); return }
    setSaving(true); setError('')
    const { data, error: err } = await supabase
      .from('documents')
      .update({ name: name.trim(), document_type: documentType || null, tags: tags.trim() || null, notes: notes.trim() || null })
      .eq('id', doc.id)
      .select()
      .single()
    if (err) { setError('Could not save changes.'); setSaving(false); return }
    onUpdated(data as Document)
    setEditing(false)
    setSaving(false)
  }

  async function handleDelete(): Promise<void> {
    setDeleting(true); setError('')
    const { error: storageErr } = await supabase.storage.from('documents').remove([doc.storage_path])
    if (storageErr) { setError('Could not delete file.'); setDeleting(false); return }
    const { error: dbErr } = await supabase.from('documents').delete().eq('id', doc.id)
    if (dbErr) { setError('File deleted but record could not be removed.'); setDeleting(false); return }
    onDeleted(doc.id)
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
          {fileIcon(doc.file_type)}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', wordBreak: 'break-word' }}>{doc.name}</div>
            <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>{doc.original_name}</div>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          title="Close"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '4px', flexShrink: 0 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {error && <div style={errorBox}>{error}</div>}

      {editing ? (
        <div>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>Document Name</label>
            <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>Document Type</label>
            <select style={inputStyle} value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
              <option value="">— None —</option>
              {DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>Tags <span style={{ fontSize: '11px', fontWeight: 400, color: '#94A3B8' }}>(comma-separated)</span></label>
            <input style={inputStyle} value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Notes</label>
            <textarea style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
            <button onClick={() => { setEditing(false); setError('') }} style={btnSecondary}>Cancel</button>
          </div>
        </div>
      ) : (
        <div>
          {/* Meta */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>Type</div>
              <div style={{ fontSize: '13px', color: '#0F172A' }}>{doc.document_type ?? '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>Size</div>
              <div style={{ fontSize: '13px', color: '#0F172A' }}>{formatBytes(doc.file_size)}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>Uploaded</div>
              <div style={{ fontSize: '13px', color: '#0F172A' }}>{formatDate(doc.uploaded_at)}</div>
            </div>
            {doc.tags && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Tags</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {doc.tags.split(',').map((tag) => tag.trim()).filter(Boolean).map((tag) => (
                    <span key={tag} style={{ fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: '20px', background: '#EFF6FF', color: '#1E3A8A', border: '1px solid #BFDBFE' }}>{tag}</span>
                  ))}
                </div>
              </div>
            )}
            {doc.notes && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>Notes</div>
                <div style={{ fontSize: '13px', color: '#64748B', whiteSpace: 'pre-wrap' }}>{doc.notes}</div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
            <button
              onClick={handleDownload}
              disabled={downloading}
              style={{ ...btnPrimary, display: 'flex', alignItems: 'center', gap: '6px', opacity: downloading ? 0.6 : 1 }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              {downloading ? 'Preparing…' : 'Download'}
            </button>
            <button onClick={() => { setEditing(true); setError('') }} style={btnSecondary}>Edit</button>
          </div>

          {/* Delete */}
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} style={{ fontSize: '12px', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Delete document
            </button>
          ) : (
            <div style={{ background: '#FFF1F2', border: '1px solid #FECDD3', borderRadius: '6px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#9F1239' }}>
              <span>Delete permanently?</span>
              <button onClick={handleDelete} disabled={deleting} style={{ ...btnDanger, padding: '4px 12px', fontSize: '12px' }}>{deleting ? 'Deleting…' : 'Delete'}</button>
              <button onClick={() => setConfirmDelete(false)} style={{ ...btnSecondary, padding: '4px 10px', fontSize: '12px' }}>Cancel</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Documents Page ────────────────────────────────────────────────────────────

export default function Documents(): React.JSX.Element {
  const { orgId, loading: orgLoading } = useOrg()
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selected, setSelected] = useState<Document | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')

  useEffect(() => {
    if (!orgId) return
    supabase
      .from('documents')
      .select('*')
      .eq('org_id', orgId)
      .order('uploaded_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setLoadError('Could not load documents.')
        else setDocuments((data as Document[]) ?? [])
        setLoading(false)
      })
  }, [orgId])

  const filtered = documents.filter((d) => {
    const matchSearch = !search.trim() ||
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      (d.tags ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (d.document_type ?? '').toLowerCase().includes(search.toLowerCase())
    const matchType = !filterType || d.document_type === filterType
    return matchSearch && matchType
  })

  const usedTypes = Array.from(new Set(documents.map((d) => d.document_type).filter(Boolean))) as string[]

  if (orgLoading) return <div style={{ padding: '32px', fontSize: '13px', color: '#64748B' }}>Loading…</div>

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

      {/* ── Left: List ── */}
      <div style={{ width: '340px', minWidth: '340px', borderRight: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', background: '#fff', height: '100%' }}>
        <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid #E2E8F0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', margin: 0 }}>Documents Vault</h2>
            <button
              onClick={() => { setShowUpload(true); setSelected(null) }}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', background: '#1E3A8A', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Upload
            </button>
          </div>
          <input
            type="text"
            placeholder="Search by name, type, or tag…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, marginBottom: '8px' }}
          />
          {usedTypes.length > 0 && (
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              <button
                onClick={() => setFilterType('')}
                style={{ padding: '3px 8px', fontSize: '11px', fontWeight: 500, borderRadius: '4px', border: '1px solid', borderColor: !filterType ? '#1E3A8A' : '#CBD5E1', background: !filterType ? '#EFF6FF' : '#fff', color: !filterType ? '#1E3A8A' : '#4A5568', cursor: 'pointer' }}
              >
                All
              </button>
              {usedTypes.map((t) => (
                <button
                  key={t}
                  onClick={() => setFilterType(filterType === t ? '' : t)}
                  style={{ padding: '3px 8px', fontSize: '11px', fontWeight: 500, borderRadius: '4px', border: '1px solid', borderColor: filterType === t ? '#1E3A8A' : '#CBD5E1', background: filterType === t ? '#EFF6FF' : '#fff', color: filterType === t ? '#1E3A8A' : '#4A5568', cursor: 'pointer' }}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '32px', fontSize: '13px', color: '#64748B', textAlign: 'center' }}>Loading…</div>
          ) : loadError ? (
            <div style={{ padding: '16px' }}><div style={errorBox}>{loadError}</div></div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center' }}>
              {documents.length === 0 ? (
                <>
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 16px', display: 'block' }} aria-hidden="true">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                  </svg>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>No documents yet</div>
                  <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '20px' }}>Upload contracts, minutes, and other files to keep them organized.</div>
                  <button onClick={() => setShowUpload(true)} style={btnPrimary}>Upload First Document</button>
                </>
              ) : (
                <div style={{ fontSize: '13px', color: '#64748B' }}>No documents match this filter.</div>
              )}
            </div>
          ) : (
            filtered.map((d) => {
              const isActive = selected?.id === d.id
              return (
                <button
                  key={d.id}
                  onClick={() => { setSelected(d); setShowUpload(false) }}
                  style={{ width: '100%', textAlign: 'left', padding: '12px 14px', border: 'none', borderBottom: '1px solid #F1F5F9', borderLeft: isActive ? '3px solid #1E3A8A' : '3px solid transparent', background: isActive ? '#EFF6FF' : 'transparent', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {fileIcon(d.file_type)}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '3px', flexWrap: 'wrap' }}>
                        {d.document_type && (
                          <span style={{ fontSize: '11px', color: '#64748B' }}>{d.document_type}</span>
                        )}
                        <span style={{ fontSize: '11px', color: '#94A3B8' }}>{formatDate(d.uploaded_at)}</span>
                      </div>
                      {d.tags && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                          {d.tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 3).map((tag) => (
                            <span key={tag} style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '20px', background: '#F1F5F9', color: '#64748B' }}>{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── Right: Detail / Upload ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: '#F8FAFC' }}>
        {showUpload && orgId && (
          <UploadPanel
            orgId={orgId}
            onUploaded={(doc) => {
              setDocuments((prev) => [doc, ...prev])
              setSelected(doc)
              setShowUpload(false)
            }}
            onCancel={() => setShowUpload(false)}
          />
        )}

        {selected && !showUpload && (
          <DocumentDetail
            key={selected.id}
            doc={selected}
            onClose={() => setSelected(null)}
            onDeleted={(id) => { setDocuments((prev) => prev.filter((d) => d.id !== id)); setSelected(null) }}
            onUpdated={(updated) => { setDocuments((prev) => prev.map((d) => d.id === updated.id ? updated : d)); setSelected(updated) }}
          />
        )}

        {!selected && !showUpload && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60%', flexDirection: 'column', gap: '12px', color: '#94A3B8' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
            <div style={{ fontSize: '13px' }}>Select a document or upload a new one</div>
          </div>
        )}
      </div>
    </div>
  )
}
