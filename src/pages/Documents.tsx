import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useUserSettings } from '../lib/useUserSettings'
import { useToast } from '../lib/toast'
import { describeError } from '../lib/errors'
import ConfirmDialog from '../lib/ConfirmDialog'
import {
  STORAGE_BUCKETS,
  buildStoragePath,
  createSignedDownloadUrl,
  formatBytes,
  validateUpload
} from '../lib/storage'
import { inputStyle, labelStyle, btnPrimary, btnSecondary, btnDanger, card, errorBox, formatDate, thStyle, tdStyle } from '../lib/ui'
import type { Document } from '../lib/types'

// Free-text category. Common values are surfaced as filter chips, but users
// can type whatever they like and it'll show up in the list and on the row.
const SUGGESTED_CATEGORIES = ['Contract', 'Bylaws', 'Meeting Minutes', 'Bulletin', 'Correspondence', 'Reference']

export default function Documents(): React.JSX.Element {
  const { effectiveChapterId, applyChapterFilter, loading: chapterLoading } = useUserSettings()
  const toast = useToast()

  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<'all' | string>('all')

  // Upload form
  const [showUpload, setShowUpload] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [category, setCategory] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  // Delete
  const [confirmDelete, setConfirmDelete] = useState<Document | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let cancelled = false
    void applyChapterFilter(
      supabase.from('documents').select('*').order('uploaded_at', { ascending: false })
    ).then(({ data, error: err }: { data: unknown; error: unknown }) => {
      if (cancelled) return
      if (err) {
        setLoadError(describeError(err, 'Could not load documents.'))
      } else {
        setDocuments((data ?? []) as Document[])
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveChapterId])

  // Categories present in the current dataset, for the filter chips.
  const presentCategories = useMemo(() => {
    const set = new Set<string>()
    documents.forEach((d) => { if (d.category) set.add(d.category) })
    return Array.from(set).sort()
  }, [documents])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return documents.filter((d) => {
      if (categoryFilter !== 'all' && d.category !== categoryFilter) return false
      if (term) {
        const hay = [d.file_name, d.category, d.uploaded_by].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(term)) return false
      }
      return true
    })
  }, [documents, categoryFilter, search])

  function pickFile(f: File | null): void {
    setUploadError('')
    setFile(f)
    if (f && !displayName.trim()) setDisplayName(f.name)
  }

  async function handleUpload(): Promise<void> {
    if (!file) return
    setUploadError('')
    if (!effectiveChapterId) {
      setUploadError('Select a specific chapter from the sidebar before uploading documents.')
      return
    }
    const name = displayName.trim() || file.name
    if (!name) { setUploadError('Display name is required.'); return }

    const v = validateUpload(file, 'documents')
    if (v) { setUploadError(v.message); return }

    setUploading(true)
    const path = buildStoragePath(effectiveChapterId, file.name)

    const { error: uploadErr } = await supabase.storage
      .from(STORAGE_BUCKETS.documents.name)
      .upload(path, file, { contentType: file.type || undefined, upsert: false })

    if (uploadErr) {
      setUploading(false)
      const msg = describeError(uploadErr, 'Upload failed.')
      setUploadError(msg)
      toast.error(msg)
      return
    }

    // Identify the uploader for the audit trail.
    const { data: userData } = await supabase.auth.getUser()
    const uploadedBy = userData.user?.email ?? null

    const { data, error: dbErr } = await supabase
      .from('documents')
      .insert({
        chapter_id: effectiveChapterId,
        file_name: name,
        file_path: path,
        category: category.trim() || null,
        file_size: file.size,
        mime_type: file.type || null,
        uploaded_by: uploadedBy
      })
      .select()
      .single()

    if (dbErr || !data) {
      // Roll back the storage upload so we don't leak an orphan blob.
      await supabase.storage.from(STORAGE_BUCKETS.documents.name).remove([path])
      setUploading(false)
      const msg = describeError(dbErr, 'Saved the file, but could not record it. Try again.')
      setUploadError(msg)
      toast.error(msg)
      return
    }

    setUploading(false)
    setDocuments((prev) => [data as Document, ...prev])
    setFile(null)
    setDisplayName('')
    setCategory('')
    setShowUpload(false)
    toast.success('Document uploaded.')
  }

  async function handleDownload(doc: Document): Promise<void> {
    const { url, error } = await createSignedDownloadUrl('documents', doc.file_path)
    if (error || !url) {
      toast.error('Could not generate download link: ' + (error ?? 'unknown error'))
      return
    }
    // Open in a new tab — the browser handles the download per Content-Disposition.
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function handleDelete(): Promise<void> {
    if (!confirmDelete) return
    setDeleting(true)

    // Delete the DB row first. If that fails, the storage file is still in
    // place and the user can retry. If we deleted the file first and then the
    // DB delete failed, we'd be left with a row pointing at a missing blob.
    const { error: dbErr } = await supabase
      .from('documents')
      .delete()
      .eq('id', confirmDelete.id)
    if (dbErr) {
      setDeleting(false)
      toast.error('Could not delete: ' + describeError(dbErr))
      return
    }

    const { error: storageErr } = await supabase.storage
      .from(STORAGE_BUCKETS.documents.name)
      .remove([confirmDelete.file_path])
    setDeleting(false)
    if (storageErr) {
      // The DB row is gone, but the blob is now orphaned. Surface the issue
      // so an admin can clean up; the user-facing record is correct.
      toast.error('Document removed, but the file could not be deleted from storage. ' + describeError(storageErr))
    } else {
      toast.success('Document deleted.')
    }
    setDocuments((prev) => prev.filter((d) => d.id !== confirmDelete.id))
    setConfirmDelete(null)
  }

  if (chapterLoading || loading) {
    return <div style={{ padding: '32px', fontSize: '13px', color: '#64748B' }}>Loading…</div>
  }

  return (
    <div className="page-content-wide" style={{ maxWidth: '1080px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#0F172A', margin: 0 }}>Documents Vault</h1>
          <p style={{ fontSize: '13px', color: '#64748B', margin: '6px 0 0' }}>
            Chapter-wide file storage. Up to {formatBytes(STORAGE_BUCKETS.documents.maxBytes)} per file.
          </p>
        </div>
        {!showUpload && <button style={btnPrimary} onClick={() => setShowUpload(true)}>+ Upload</button>}
      </div>

      {loadError && <div style={errorBox}>{loadError}</div>}

      {showUpload && (
        <div style={{ ...card, borderColor: '#1E3A8A', borderWidth: '1.5px', marginBottom: '20px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '20px' }}>Upload Document</div>
          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>File <span style={{ color: '#ef4444' }}>*</span></label>
            <input
              type="file"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              style={{ fontSize: '13px' }}
              aria-label="Choose file to upload"
            />
            {file && (
              <div style={{ fontSize: '12px', color: '#64748B', marginTop: '6px' }}>
                {file.name} · {formatBytes(file.size)}{file.type ? ` · ${file.type}` : ''}
              </div>
            )}
          </div>
          <div className="grid-form-2-1" style={{ marginBottom: '16px' }}>
            <div>
              <label style={labelStyle}>Display Name</label>
              <input style={inputStyle} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Defaults to the file name" />
            </div>
            <div>
              <label style={labelStyle}>Category</label>
              <input
                style={inputStyle}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Contract, Bylaws"
                list="documents-category-suggestions"
              />
              <datalist id="documents-category-suggestions">
                {[...new Set([...presentCategories, ...SUGGESTED_CATEGORIES])].map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>
          {uploadError && <div style={errorBox}>{uploadError}</div>}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={{ ...btnPrimary, opacity: !file || uploading ? 0.5 : 1 }} disabled={!file || uploading} onClick={handleUpload}>
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
            <button style={btnSecondary} disabled={uploading} onClick={() => { setShowUpload(false); setFile(null); setDisplayName(''); setCategory(''); setUploadError('') }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Search + filter chips */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          style={{ ...inputStyle, maxWidth: '320px' }}
          placeholder="Search by name, category, uploader…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search documents"
        />
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <FilterChip label={`All (${documents.length})`} active={categoryFilter === 'all'} onClick={() => setCategoryFilter('all')} />
          {presentCategories.map((cat) => (
            <FilterChip
              key={cat}
              label={`${cat} (${documents.filter((d) => d.category === cat).length})`}
              active={categoryFilter === cat}
              onClick={() => setCategoryFilter(cat)}
            />
          ))}
        </div>
      </div>

      {/* Documents list */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 24px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 16px', display: 'block' }} aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>
            {documents.length === 0 ? 'No documents yet' : 'No documents match your filters'}
          </div>
          <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '20px' }}>
            {documents.length === 0
              ? 'Upload contracts, bylaws, meeting minutes, or any other reference files for the chapter.'
              : 'Try a different search term or category.'}
          </div>
          {documents.length === 0 && !showUpload && <button style={btnPrimary} onClick={() => setShowUpload(true)}>Upload First Document</button>}
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
          <div className="table-scroll">
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '560px' }}>
            <thead>
              <tr>
                <th style={thStyle} scope="col">Name</th>
                <th style={thStyle} scope="col">Category</th>
                <th style={thStyle} scope="col">Size</th>
                <th style={thStyle} scope="col">Uploaded</th>
                <th style={thStyle} scope="col">By</th>
                <th style={{ ...thStyle, width: '180px' }} scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id}>
                  <td style={tdStyle}>
                    <button
                      onClick={() => handleDownload(d)}
                      style={{ background: 'none', border: 'none', padding: 0, color: '#1E3A8A', fontWeight: 600, fontSize: '13px', cursor: 'pointer', textAlign: 'left' }}
                    >
                      {d.file_name}
                    </button>
                  </td>
                  <td style={tdStyle}>
                    {d.category ? (
                      <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', background: '#EEF2FF', color: '#4F46E5' }}>{d.category}</span>
                    ) : <span style={{ color: '#CBD5E1' }}>—</span>}
                  </td>
                  <td style={tdStyle}>{formatBytes(d.file_size)}</td>
                  <td style={tdStyle}>{formatDate(d.uploaded_at.slice(0, 10))}</td>
                  <td style={tdStyle}>{d.uploaded_by ?? <span style={{ color: '#CBD5E1' }}>—</span>}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <button style={{ ...btnSecondary, fontSize: '12px', padding: '4px 10px', marginRight: '6px' }} onClick={() => handleDownload(d)}>Download</button>
                    <button style={{ ...btnDanger, fontSize: '12px', padding: '4px 10px' }} onClick={() => setConfirmDelete(d)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete document?"
        message={confirmDelete ? `Delete "${confirmDelete.file_name}"? This removes both the file and the record. This cannot be undone.` : ''}
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px', fontSize: '11px', fontWeight: 500, borderRadius: '20px', cursor: 'pointer',
        background: active ? '#1E3A8A' : '#F8FAFC',
        color: active ? '#fff' : '#64748B',
        border: active ? '1px solid #1E3A8A' : '1px solid #E2E8F0'
      }}
    >
      {label}
    </button>
  )
}
