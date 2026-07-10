import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { describeError } from '../lib/errors'
import { btnPrimary, btnSecondary, errorBox, thStyle, tdStyle } from '../lib/ui'
import { buildXlsxBlob, downloadBlob, readWorkbookGrids } from '../lib/xlsx'
import { csvToGrid } from '../lib/hoursImport'
import {
  COMPANIES_SHEET,
  buildDirectoryTemplateSpecs,
  parseDirectoryGrid,
  planDirectoryImport
} from '../lib/directoryImport'
import type { DirectoryPlanned } from '../lib/directoryImport'
import type { MemberCompany, ID } from '../lib/types'

// Admin-only bulk import of member companies from the Excel/CSV template.
// Flow: pick file -> parse -> preview with new/existing badges -> confirm.
// Parsing/planning logic lives in src/lib/directoryImport.ts; this component
// renders the preview and performs the database writes.

interface ImportDirectoryModalProps {
  chapterId: ID
  companies: MemberCompany[]
  onClose: () => void
  // Receives the created rows so the parent can merge them into its list.
  onImported: (created: MemberCompany[]) => void
}

const ACTION_BADGE: Record<DirectoryPlanned['action'], { label: string; bg: string; color: string }> = {
  insert: { label: 'Add',            bg: '#f0fdf4', color: '#059669' },
  exists: { label: 'Already exists', bg: '#F8FAFC', color: '#64748B' },
  error:  { label: 'Error',          bg: '#fef2f2', color: '#dc2626' }
}

export default function ImportDirectoryModal({ chapterId, companies, onClose, onImported }: ImportDirectoryModalProps): React.JSX.Element {
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [plan, setPlan] = useState<DirectoryPlanned[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [buildingTemplate, setBuildingTemplate] = useState(false)

  useEffect(() => {
    fileInputRef.current?.focus()
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape' && !importing) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [importing, onClose])

  async function handleTemplate(): Promise<void> {
    setBuildingTemplate(true)
    try {
      const blob = await buildXlsxBlob(buildDirectoryTemplateSpecs())
      downloadBlob(blob, 'employer-directory-template.xlsx')
    } catch (e) {
      toast.error('Could not build the template: ' + describeError(e))
    }
    setBuildingTemplate(false)
  }

  async function handleFile(file: File): Promise<void> {
    setParsing(true)
    setParseError('')
    setPlan(null)
    setFileName(file.name)
    try {
      let grid: string[][]
      if (file.name.toLowerCase().endsWith('.csv')) {
        grid = csvToGrid(await file.text())
      } else {
        const grids = await readWorkbookGrids(await file.arrayBuffer())
        // Prefer the template's sheet name, else fall back to the first sheet
        let found: string[][] | null = null
        for (const [name, g] of grids) {
          if (name.trim().toLowerCase() === COMPANIES_SHEET.toLowerCase()) { found = g; break }
        }
        if (!found) found = grids.values().next().value ?? null
        if (!found) throw new Error('The workbook has no worksheets.')
        grid = found
      }
      const rows = parseDirectoryGrid(grid)
      if (rows.length === 0) {
        setParseError('No data rows found below the header row.')
      } else {
        setPlan(planDirectoryImport(rows, companies))
      }
    } catch (e) {
      setParseError(describeError(e, 'Could not read the file.'))
    }
    setParsing(false)
  }

  const inserts = plan?.filter((p) => p.action === 'insert') ?? []
  const existsCount = plan?.filter((p) => p.action === 'exists').length ?? 0
  const errorCount = plan?.filter((p) => p.action === 'error').length ?? 0

  async function handleImport(): Promise<void> {
    if (inserts.length === 0) return
    setImporting(true)
    setImportError('')
    const { data, error } = await supabase
      .from('member_companies')
      .insert(inserts.map(({ row }) => ({
        chapter_id: chapterId,
        company_name: row.company_name,
        contact_name: row.contact_name,
        contact_email: row.contact_email,
        contact_phone: row.contact_phone,
        address: row.address,
        city: row.city,
        state: row.state,
        zip: row.zip,
        status: row.status,
        discount_tier: row.discount_tier,
        notes: row.notes
      })))
      .select()
    setImporting(false)
    if (error) {
      setImportError(describeError(error, 'Import failed.'))
      return
    }
    const created = (data ?? []) as MemberCompany[]
    onImported(created)
    toast.success(`Import complete: ${created.length} compan${created.length === 1 ? 'y' : 'ies'} added${existsCount > 0 ? `, ${existsCount} already existed` : ''}.`)
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-directory-title"
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
        <div id="import-directory-title" style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
          Import Employer Directory
        </div>
        <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '16px', lineHeight: 1.55 }}>
          Upload the filled-in template (.xlsx or .csv). Companies are matched by name — new ones are
          added, existing ones are left unchanged.{' '}
          <button
            onClick={() => { void handleTemplate() }}
            disabled={buildingTemplate}
            style={{ background: 'none', border: 'none', color: '#1E3A8A', cursor: 'pointer', padding: 0, fontSize: '13px', fontWeight: 600 }}
          >
            {buildingTemplate ? 'Building template…' : 'Download template'}
          </button>
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

        {plan && (
          <>
            <div style={{ fontSize: '13px', color: '#0F172A', marginBottom: '10px' }}>
              <strong>{inserts.length}</strong> to add, <strong>{existsCount}</strong> already exist, <strong>{errorCount}</strong> with errors
            </div>
            <div className="table-scroll" style={{ overflowY: 'auto', flex: 1, border: '1px solid #E2E8F0', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '720px' }}>
                <thead>
                  <tr>
                    <th style={thStyle} scope="col">Company</th>
                    <th style={thStyle} scope="col">Contact</th>
                    <th style={thStyle} scope="col">Email</th>
                    <th style={thStyle} scope="col">City / State</th>
                    <th style={thStyle} scope="col">Status</th>
                    <th style={thStyle} scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.map((p, i) => {
                    const badge = ACTION_BADGE[p.action]
                    return (
                      <tr key={i}>
                        <td style={tdStyle}>{p.row.company_name || '—'}</td>
                        <td style={tdStyle}>{p.row.contact_name ?? '—'}</td>
                        <td style={tdStyle}>{p.row.contact_email ?? '—'}</td>
                        <td style={tdStyle}>{[p.row.city, p.row.state].filter(Boolean).join(', ') || '—'}</td>
                        <td style={tdStyle}>{p.row.status}</td>
                        <td style={tdStyle}>
                          <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '20px', background: badge.bg, color: badge.color }}>{badge.label}</span>
                          {p.reason && <span style={{ fontSize: '11px', color: '#94A3B8', marginLeft: '6px' }}>{p.reason}</span>}
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
            style={{ ...btnPrimary, opacity: importing || inserts.length === 0 ? 0.5 : 1 }}
            disabled={importing || inserts.length === 0}
            onClick={() => { void handleImport() }}
          >
            {importing ? 'Importing…' : `Import ${inserts.length} compan${inserts.length === 1 ? 'y' : 'ies'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
