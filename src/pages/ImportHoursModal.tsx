import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { describeError } from '../lib/errors'
import { inputStyle, btnPrimary, btnSecondary, errorBox, thStyle, tdStyle, formatMoney } from '../lib/ui'
import { parseCsv, parseXlsx, matchCompanies, planImport, buildTemplateCsv } from '../lib/hoursImport'
import type { ImportRow, PreviewRow } from '../lib/hoursImport'
import { SHORT_MONTHS } from '../lib/serviceCharge'
import type { MemberCompany, WorkforceHours, ID } from '../lib/types'

// Import monthly hours + gross payroll from an Excel (.xlsx) or CSV file.
// Flow: pick file -> parse -> preview with company matching -> confirm.
// Parsing/matching/planning logic lives in src/lib/hoursImport.ts; this
// component only renders the preview and performs the database writes.

interface ImportHoursModalProps {
  chapterId: ID
  companies: MemberCompany[]
  existingHours: WorkforceHours[]
  onClose: () => void
  // Called with the rows actually written, so the parent can update its list
  // without a full reload (also called after a partial failure).
  onImported: (inserted: WorkforceHours[], updated: WorkforceHours[]) => void
}

const MATCH_BADGE: Record<PreviewRow['matchState'], { label: string; bg: string; color: string }> = {
  matched:   { label: 'Matched',   bg: '#f0fdf4', color: '#059669' },
  ambiguous: { label: 'Ambiguous', bg: '#fffbeb', color: '#b45309' },
  unmatched: { label: 'Not found', bg: '#fef2f2', color: '#dc2626' }
}

export default function ImportHoursModal({ chapterId, companies, existingHours, onClose, onImported }: ImportHoursModalProps): React.JSX.Element {
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [previewRows, setPreviewRows] = useState<PreviewRow[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')

  useEffect(() => {
    fileInputRef.current?.focus()
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape' && !importing) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [importing, onClose])

  const plan = useMemo(
    () => (previewRows ? planImport(previewRows, existingHours) : []),
    [previewRows, existingHours]
  )
  const insertCount = plan.filter((a) => a.kind === 'insert').length
  const updateCount = plan.filter((a) => a.kind === 'update').length
  const skipCount = plan.filter((a) => a.kind === 'skip').length

  async function handleFile(file: File): Promise<void> {
    setParsing(true)
    setParseError('')
    setPreviewRows(null)
    setFileName(file.name)
    try {
      let rows: ImportRow[]
      if (file.name.toLowerCase().endsWith('.csv')) {
        rows = parseCsv(await file.text())
      } else {
        rows = await parseXlsx(await file.arrayBuffer())
      }
      if (rows.length === 0) {
        setParseError('No data rows found below the header row.')
      } else {
        setPreviewRows(matchCompanies(rows, companies))
      }
    } catch (e) {
      setParseError(describeError(e, 'Could not read the file.'))
    }
    setParsing(false)
  }

  function setRowCompany(index: number, companyId: string): void {
    setPreviewRows((prev) => prev?.map((r, i) => (i === index ? { ...r, companyId: companyId === '' ? null : companyId } : r)) ?? prev)
  }

  async function handleImport(): Promise<void> {
    setImporting(true)
    setImportError('')
    const inserts = plan.filter((a) => a.kind === 'insert')
    const updates = plan.filter((a) => a.kind === 'update')
    const insertedRows: WorkforceHours[] = []
    const updatedRows: WorkforceHours[] = []
    try {
      if (inserts.length > 0) {
        const { data, error: err } = await supabase
          .from('workforce_hours')
          .insert(inserts.map((a) => ({
            chapter_id: chapterId,
            company_id: a.row.companyId,
            report_month: a.reportMonth,
            total_hours: a.row.hours,
            gross_payroll: a.row.grossPayroll,
            source: 'import'
          })))
          .select()
        if (err) throw err
        insertedRows.push(...((data ?? []) as WorkforceHours[]))
      }
      for (const a of updates) {
        const { data, error: err } = await supabase
          .from('workforce_hours')
          .update({ total_hours: a.row.hours, gross_payroll: a.row.grossPayroll })
          .eq('id', a.targetId as ID)
          .select()
          .single()
        if (err || !data) throw err ?? new Error('Update failed.')
        updatedRows.push(data as WorkforceHours)
      }
      setImporting(false)
      onImported(insertedRows, updatedRows)
      toast.success(`Import complete: ${insertedRows.length} added, ${updatedRows.length} updated${skipCount > 0 ? `, ${skipCount} skipped` : ''}.`)
      onClose()
    } catch (e) {
      setImporting(false)
      // Keep the UI consistent with whatever did get written before the error
      onImported(insertedRows, updatedRows)
      setImportError(describeError(e, 'Import failed.') + ` ${insertedRows.length + updatedRows.length} row(s) were imported before the error — review the hours list before retrying.`)
    }
  }

  const templateHref = 'data:text/csv;charset=utf-8,' + encodeURIComponent(buildTemplateCsv())

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-hours-title"
      onClick={(e) => { if (e.target === e.currentTarget && !importing) onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '20px'
      }}
    >
      <div style={{
        background: '#fff', borderRadius: '10px', maxWidth: '860px', width: '100%',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        padding: '24px 26px', boxShadow: '0 12px 40px rgba(15, 23, 42, 0.2)'
      }}>
        <div id="import-hours-title" style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
          Import Hours
        </div>
        <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '16px', lineHeight: 1.55 }}>
          Upload an Excel (.xlsx) or CSV file with columns <strong>Company, Year, Month, Hours, Gross Payroll</strong>.
          Rows are matched to the company directory by name.{' '}
          <a href={templateHref} download="hours-import-template.csv" style={{ color: '#1E3A8A', fontWeight: 600 }}>Download template</a>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx"
            aria-label="Choose file to import"
            disabled={parsing || importing}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f) }}
            style={{ fontSize: '13px' }}
          />
          {parsing && <span style={{ fontSize: '13px', color: '#64748B' }}>Reading {fileName}…</span>}
        </div>

        {parseError && <div style={errorBox}>{parseError}</div>}

        {previewRows && (
          <>
            <div style={{ fontSize: '13px', color: '#0F172A', marginBottom: '10px' }}>
              <strong>{insertCount}</strong> to add, <strong>{updateCount}</strong> to update, <strong>{skipCount}</strong> skipped
            </div>
            <div className="table-scroll" style={{ overflowY: 'auto', flex: 1, border: '1px solid #E2E8F0', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '720px' }}>
                <thead>
                  <tr>
                    <th style={thStyle} scope="col">Company (file)</th>
                    <th style={thStyle} scope="col">Match</th>
                    <th style={thStyle} scope="col">Period</th>
                    <th style={{ ...thStyle, textAlign: 'right' }} scope="col">Hours</th>
                    <th style={{ ...thStyle, textAlign: 'right' }} scope="col">Gross Payroll</th>
                    <th style={thStyle} scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.map((action, i) => {
                    const row = action.row
                    const badge = MATCH_BADGE[row.matchState]
                    const needsPick = row.matchState !== 'matched' && row.error == null
                    return (
                      <tr key={i}>
                        <td style={tdStyle}>{row.companyName || '—'}</td>
                        <td style={tdStyle}>
                          {needsPick ? (
                            <div>
                              <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '20px', background: badge.bg, color: badge.color }}>{badge.label}</span>
                              <select
                                style={{ ...inputStyle, width: 'auto', fontSize: '12px', padding: '3px 6px', marginTop: '4px', display: 'block' }}
                                value={row.companyId ?? ''}
                                aria-label={`Choose company for row ${row.rowNumber}`}
                                onChange={(e) => setRowCompany(i, e.target.value)}
                              >
                                <option value="">— Choose company —</option>
                                {companies.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                              </select>
                            </div>
                          ) : (
                            <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '20px', background: badge.bg, color: badge.color }}>
                              {row.error != null ? 'Error' : badge.label}
                            </span>
                          )}
                        </td>
                        <td style={tdStyle}>{row.month >= 1 && row.month <= 12 ? `${SHORT_MONTHS[row.month - 1]} ${row.year}` : '—'}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{row.error == null ? Math.round(row.hours).toLocaleString() : '—'}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{row.error == null ? formatMoney(row.grossPayroll, false) : '—'}</td>
                        <td style={tdStyle}>
                          {action.kind === 'insert' && <span style={{ fontSize: '11px', fontWeight: 600, color: '#059669' }}>Add</span>}
                          {action.kind === 'update' && <span style={{ fontSize: '11px', fontWeight: 600, color: '#0891b2' }}>Update existing</span>}
                          {action.kind === 'skip' && (
                            <span style={{ fontSize: '11px', color: '#94A3B8' }}>Skipped — {action.reason}</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {importError && <div style={{ ...errorBox, marginTop: '12px', marginBottom: 0 }}>{importError}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
          <button style={btnSecondary} onClick={onClose} disabled={importing}>Cancel</button>
          <button
            style={{ ...btnPrimary, opacity: importing || insertCount + updateCount === 0 ? 0.5 : 1 }}
            disabled={importing || insertCount + updateCount === 0}
            onClick={() => { void handleImport() }}
          >
            {importing ? 'Importing…' : `Import ${insertCount + updateCount} row${insertCount + updateCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
