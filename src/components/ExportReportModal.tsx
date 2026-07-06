// Export Report modal — edition + section picker for the negotiation report.
// Opens the report window synchronously on Generate (so pop-up blockers stay
// quiet), then streams the built HTML into it via writeNegotiationReport.

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { describeError } from '../lib/errors'
import { createSignedDownloadUrl } from '../lib/storage'
import { btnPrimary, btnSecondary, errorBox } from '../lib/ui'
import { writeNegotiationReport, DEFAULT_REPORT_SECTIONS } from '../lib/negotiationReport'
import type { ReportEdition, ReportSections } from '../lib/negotiationReport'
import type { NegotiationCycle, LocalUnion } from '../lib/types'

interface ExportReportModalProps {
  cycle: NegotiationCycle
  union: LocalUnion | null
  onClose: () => void
}

const SECTION_LABELS: { key: keyof ReportSections; label: string; committeeOnly?: boolean }[] = [
  { key: 'summary',         label: 'Cover & summary' },
  { key: 'economic',        label: 'Economic items' },
  { key: 'language',        label: 'Language provisions' },
  { key: 'sessions',        label: 'Session log with attendees' },
  { key: 'documents',       label: 'Documents list' },
  { key: 'positionHistory', label: 'Position history appendix', committeeOnly: true }
]

export default function ExportReportModal({ cycle, union, onClose }: ExportReportModalProps): React.JSX.Element {
  const [edition, setEdition] = useState<ReportEdition>('member')
  const [sections, setSections] = useState<ReportSections>(DEFAULT_REPORT_SECTIONS)
  const [downloadFiles, setDownloadFiles] = useState(false)
  const [progress, setProgress] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const firstRadioRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    firstRadioRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  function toggleSection(key: keyof ReportSections): void {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // Fetch each document via a signed URL and hand it to the browser as a
  // download. Returns the names of files that could not be downloaded.
  async function downloadDocumentFiles(): Promise<string[]> {
    const { data, error: docsErr } = await supabase
      .from('negotiation_documents')
      .select('file_name, file_path')
      .eq('cycle_id', cycle.id)
      .order('uploaded_at')
    if (docsErr) return ['(could not load the document list: ' + describeError(docsErr) + ')']

    const docs = (data ?? []) as { file_name: string; file_path: string }[]
    const failed: string[] = []
    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i]
      setProgress(`Downloading file ${i + 1} of ${docs.length}…`)
      try {
        const { url, error: urlErr } = await createSignedDownloadUrl('negotiationDocuments', doc.file_path)
        if (urlErr || !url) { failed.push(doc.file_name); continue }
        const res = await fetch(url)
        if (!res.ok) { failed.push(doc.file_name); continue }
        const blob = await res.blob()
        const objectUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = objectUrl
        a.download = doc.file_name
        document.body.appendChild(a)
        a.click()
        a.remove()
        // Give the browser a beat between downloads so none get dropped.
        await new Promise((r) => setTimeout(r, 400))
        URL.revokeObjectURL(objectUrl)
      } catch {
        failed.push(doc.file_name)
      }
    }
    setProgress('')
    return failed
  }

  async function handleGenerate(): Promise<void> {
    setError('')
    // Must be synchronous with the click, or the browser blocks the tab.
    const win = window.open('', '_blank')
    if (!win) {
      setError('Your browser blocked the report window. Allow pop-ups for this site and try again.')
      return
    }
    setBusy(true)
    const err = await writeNegotiationReport(win, cycle, union, edition, sections)
    if (err) {
      setBusy(false)
      win.close()
      setError(err)
      return
    }
    if (sections.documents && downloadFiles) {
      const failed = await downloadDocumentFiles()
      if (failed.length > 0) {
        setBusy(false)
        setError(`The report was generated, but ${failed.length} file${failed.length !== 1 ? 's' : ''} could not be downloaded: ${failed.join(', ')}`)
        return
      }
    }
    setBusy(false)
    onClose()
  }

  const nothingChecked = !SECTION_LABELS.some(({ key, committeeOnly }) =>
    sections[key] && (!committeeOnly || edition === 'committee'))

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-report-title"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}
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
          maxWidth: '440px',
          width: '100%',
          padding: '24px 26px',
          boxShadow: '0 12px 40px rgba(15, 23, 42, 0.2)',
          maxHeight: '90vh',
          overflowY: 'auto'
        }}
      >
        <div id="export-report-title" style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>
          Export Negotiation Report
        </div>
        <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.55, marginBottom: '18px' }}>
          Builds a print-ready report for "{cycle.name}". Use your browser's print dialog to save it as a PDF.
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Edition</div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#0F172A', marginBottom: '8px' }}>
            <input
              ref={firstRadioRef}
              type="radio"
              name="report-edition"
              checked={edition === 'member'}
              onChange={() => setEdition('member')}
              disabled={busy}
              style={{ marginTop: '2px' }}
            />
            <span><strong>Member edition</strong><br /><span style={{ color: '#64748B', fontSize: '12px' }}>Positions and outcomes only — no internal bargaining notes.</span></span>
          </label>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#0F172A' }}>
            <input
              type="radio"
              name="report-edition"
              checked={edition === 'committee'}
              onChange={() => setEdition('committee')}
              disabled={busy}
              style={{ marginTop: '2px' }}
            />
            <span><strong>Committee edition</strong><br /><span style={{ color: '#64748B', fontSize: '12px' }}>Adds rationale, movement notes, cost impact, and gap analysis.</span></span>
          </label>
        </div>

        <div style={{ marginBottom: '18px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Sections</div>
          {SECTION_LABELS.map(({ key, label, committeeOnly }) => {
            if (committeeOnly && edition !== 'committee') return null
            return (
              <div key={key}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#0F172A', padding: '3px 0' }}>
                  <input
                    type="checkbox"
                    checked={sections[key]}
                    onChange={() => toggleSection(key)}
                    disabled={busy}
                  />
                  {label}
                </label>
                {key === 'documents' && sections.documents && (
                  <div style={{ paddingLeft: '24px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#0F172A', padding: '3px 0' }}>
                      <input
                        type="checkbox"
                        checked={downloadFiles}
                        onChange={() => setDownloadFiles((v) => !v)}
                        disabled={busy}
                      />
                      Also download the actual files
                    </label>
                    {downloadFiles && (
                      <div style={{ fontSize: '11px', color: '#94A3B8', paddingLeft: '24px' }}>
                        Each document saves separately to your Downloads folder. Your browser may ask permission for multiple downloads.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {progress && <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '12px' }}>{progress}</div>}
        {error && <div style={errorBox}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button style={btnSecondary} onClick={onClose} disabled={busy}>Cancel</button>
          <button
            style={{ ...btnPrimary, opacity: busy || nothingChecked ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer' }}
            onClick={handleGenerate}
            disabled={busy || nothingChecked}
          >
            {busy ? 'Building…' : 'Generate Report'}
          </button>
        </div>
      </div>
    </div>
  )
}
