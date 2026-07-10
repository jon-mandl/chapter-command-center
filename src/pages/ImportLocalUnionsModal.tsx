import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { describeError } from '../lib/errors'
import { btnPrimary, btnSecondary, errorBox, thStyle, tdStyle, formatDate } from '../lib/ui'
import { buildXlsxBlob, downloadBlob, readWorkbookGrids } from '../lib/xlsx'
import {
  buildLocalUnionTemplateSpecs,
  parseLocalUnionWorkbook,
  planLocalUnionImport,
  packageKey
} from '../lib/localUnionImport'
import type { LocalUnionImportPlan } from '../lib/localUnionImport'
import type { LocalUnion, WagePackage, ID } from '../lib/types'

// Admin-only bulk import of local unions + wage packages/components from the
// two-sheet Excel template. Flow: pick file -> parse -> preview -> confirm.
// Parsing/planning logic lives in src/lib/localUnionImport.ts; this component
// renders the preview and performs the database writes.

interface ImportLocalUnionsModalProps {
  chapterId: ID
  existingUnions: LocalUnion[]
  onClose: () => void
  // Called after rows were written (success or partial failure) so the parent
  // can reload its list. The modal closes itself only on full success.
  onImported: () => void
}

const ACTION_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  add:    { label: 'Add',            bg: '#f0fdf4', color: '#059669' },
  create: { label: 'Create',         bg: '#f0fdf4', color: '#059669' },
  exists: { label: 'Already exists', bg: '#F8FAFC', color: '#64748B' },
  error:  { label: 'Error',          bg: '#fef2f2', color: '#dc2626' }
}

function Badge({ action }: { action: string }): React.JSX.Element {
  const b = ACTION_BADGE[action] ?? ACTION_BADGE.error
  return (
    <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '20px', background: b.bg, color: b.color }}>
      {b.label}
    </span>
  )
}

export default function ImportLocalUnionsModal({ chapterId, existingUnions, onClose, onImported }: ImportLocalUnionsModalProps): React.JSX.Element {
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [plan, setPlan] = useState<LocalUnionImportPlan | null>(null)
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
      const blob = await buildXlsxBlob(buildLocalUnionTemplateSpecs())
      downloadBlob(blob, 'local-unions-template.xlsx')
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
      const grids = await readWorkbookGrids(await file.arrayBuffer())
      const parsed = parseLocalUnionWorkbook(grids)

      // Existing packages for this chapter's unions, so re-imports skip them.
      const keys = new Set<string>()
      if (existingUnions.length > 0) {
        const { data, error: err } = await supabase
          .from('wage_packages')
          .select('local_union_id, effective_date, expiration_date')
          .in('local_union_id', existingUnions.map((u) => u.id))
        if (err) throw err
        const numberById = new Map(existingUnions.map((u) => [u.id, u.local_number]))
        for (const p of (data ?? []) as Pick<WagePackage, 'local_union_id' | 'effective_date' | 'expiration_date'>[]) {
          const num = numberById.get(p.local_union_id)
          if (num != null) keys.add(packageKey(num, p.effective_date, p.expiration_date))
        }
      }

      setPlan(planLocalUnionImport(parsed, existingUnions, keys))
    } catch (e) {
      setParseError(describeError(e, 'Could not read the file.'))
    }
    setParsing(false)
  }

  const unionsToAdd = plan?.unions.filter((u) => u.action === 'add') ?? []
  const packagesToCreate = plan?.packages.filter((p) => p.action === 'create') ?? []
  const componentCount = packagesToCreate.reduce((sum, p) => sum + p.components.length, 0)
  const hasWork = unionsToAdd.length > 0 || packagesToCreate.length > 0

  async function handleImport(): Promise<void> {
    if (!plan) return
    setImporting(true)
    setImportError('')
    let unionsCreated = 0
    let packagesCreated = 0
    let componentsCreated = 0
    try {
      const numberToId = new Map(existingUnions.map((u) => [u.local_number, u.id]))

      if (unionsToAdd.length > 0) {
        const { data, error: err } = await supabase
          .from('local_unions')
          .insert(unionsToAdd.map((u) => ({
            chapter_id: chapterId,
            local_number: u.row.localNumber,
            city: u.row.city,
            state: u.row.state
          })))
          .select()
        if (err) throw err
        for (const u of (data ?? []) as LocalUnion[]) numberToId.set(u.local_number, u.id)
        unionsCreated = (data ?? []).length
      }

      for (const pkg of packagesToCreate) {
        const unionId = numberToId.get(pkg.localNumber)
        if (!unionId) continue
        // Classification is omitted on purpose — the DB default is 'Journeyman'.
        const { data: pkgRow, error: pkgErr } = await supabase
          .from('wage_packages')
          .insert({
            local_union_id: unionId,
            effective_date: pkg.effectiveDate,
            expiration_date: pkg.expirationDate
          })
          .select()
          .single()
        if (pkgErr || !pkgRow) throw pkgErr ?? new Error('Could not create wage package.')
        packagesCreated++
        if (pkg.components.length > 0) {
          const { error: compErr } = await supabase
            .from('wage_components')
            .insert(pkg.components.map((c) => ({ ...c, wage_package_id: (pkgRow as WagePackage).id })))
          if (compErr) throw compErr
          componentsCreated += pkg.components.length
        }
      }

      setImporting(false)
      onImported()
      toast.success(`Import complete: ${unionsCreated} local union${unionsCreated === 1 ? '' : 's'}, ${packagesCreated} wage package${packagesCreated === 1 ? '' : 's'}, ${componentsCreated} component${componentsCreated === 1 ? '' : 's'} added.`)
      onClose()
    } catch (e) {
      setImporting(false)
      // Keep the parent list consistent with whatever did get written
      onImported()
      setImportError(
        describeError(e, 'Import failed.') +
        ` ${unionsCreated} union(s) and ${packagesCreated} package(s) were created before the error — review the page before retrying.`
      )
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-unions-title"
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
        <div id="import-unions-title" style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
          Import Local Unions &amp; Wage Data
        </div>
        <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '16px', lineHeight: 1.55 }}>
          Upload the filled-in Excel template. The <strong>Local Unions</strong> sheet adds locals; the{' '}
          <strong>Wage Components</strong> sheet builds one Journeyman wage package per local + date range.{' '}
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
            accept=".xlsx"
            aria-label="Choose Excel file to import"
            disabled={parsing || importing}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f) }}
            style={{ fontSize: '13px' }}
          />
          {parsing && <span style={{ fontSize: '13px', color: '#64748B' }}>Reading {fileName}…</span>}
        </div>

        {parseError && <div style={errorBox}>{parseError}</div>}

        {plan && (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <div style={{ fontSize: '13px', color: '#0F172A', marginBottom: '10px' }}>
              <strong>{unionsToAdd.length}</strong> local union{unionsToAdd.length === 1 ? '' : 's'} to add,{' '}
              <strong>{packagesToCreate.length}</strong> wage package{packagesToCreate.length === 1 ? '' : 's'} to create
              {' '}({componentCount} component{componentCount === 1 ? '' : 's'})
            </div>

            {plan.unions.length > 0 && (
              <div className="table-scroll" style={{ border: '1px solid #E2E8F0', borderRadius: '8px', marginBottom: '12px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle} scope="col">Local</th>
                      <th style={thStyle} scope="col">City</th>
                      <th style={thStyle} scope="col">State</th>
                      <th style={thStyle} scope="col">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.unions.map((u, i) => (
                      <tr key={i}>
                        <td style={tdStyle}>{u.row.localNumber || '—'}</td>
                        <td style={tdStyle}>{u.row.city ?? '—'}</td>
                        <td style={tdStyle}>{u.row.state ?? '—'}</td>
                        <td style={tdStyle}>
                          <Badge action={u.action} />
                          {u.reason && <span style={{ fontSize: '11px', color: '#94A3B8', marginLeft: '6px' }}>{u.reason}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {plan.packages.length > 0 && (
              <div className="table-scroll" style={{ border: '1px solid #E2E8F0', borderRadius: '8px', marginBottom: '12px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle} scope="col">Local</th>
                      <th style={thStyle} scope="col">Effective</th>
                      <th style={thStyle} scope="col">Expires</th>
                      <th style={{ ...thStyle, textAlign: 'right' }} scope="col">Components</th>
                      <th style={thStyle} scope="col">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.packages.map((p, i) => (
                      <tr key={i}>
                        <td style={tdStyle}>{p.localNumber}</td>
                        <td style={tdStyle}>{formatDate(p.effectiveDate)}</td>
                        <td style={tdStyle}>{formatDate(p.expirationDate)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{p.action === 'create' ? p.components.length : '—'}</td>
                        <td style={tdStyle}>
                          <Badge action={p.action} />
                          {p.action === 'exists' && <span style={{ fontSize: '11px', color: '#94A3B8', marginLeft: '6px' }}>Same local + dates already has a package</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {plan.badComponentRows.length > 0 && (
              <div style={{ ...errorBox, marginBottom: '12px' }}>
                <strong>{plan.badComponentRows.length} component row{plan.badComponentRows.length === 1 ? '' : 's'} skipped:</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
                  {plan.badComponentRows.slice(0, 8).map((b, i) => (
                    <li key={i}>Row {b.row.rowNumber}: {b.reason}</li>
                  ))}
                  {plan.badComponentRows.length > 8 && <li>…and {plan.badComponentRows.length - 8} more</li>}
                </ul>
              </div>
            )}
          </div>
        )}

        {importError && <div style={{ ...errorBox, marginTop: '12px', marginBottom: 0 }}>{importError}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
          <button style={btnSecondary} onClick={onClose} disabled={importing}>Cancel</button>
          <button
            style={{ ...btnPrimary, opacity: importing || !hasWork ? 0.5 : 1 }}
            disabled={importing || !hasWork}
            onClick={() => { void handleImport() }}
          >
            {importing ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  )
}
