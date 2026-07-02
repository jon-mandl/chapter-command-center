// Hours + gross payroll import: file parsing, company matching, and import
// planning. Pure functions (no React, no Supabase) — the MembersHours page
// wires these to the UI and performs the actual database writes.
//
// Expected columns (header row, case-insensitive):
//   Company, Year, Month, Hours, Gross Payroll
// Month accepts 1-12 or a name ("Jan" / "January"). Gross Payroll is optional.

import type { MemberCompany, WorkforceHours, ID } from './types'

// ─── Shapes ───────────────────────────────────────────────────────────────────

export interface ImportRow {
  rowNumber: number // 1-based data row number in the source file (header excluded)
  companyName: string
  year: number
  month: number // 1-12
  hours: number
  grossPayroll: number | null
  error: string | null // parse problem; row cannot be imported until resolved
}

export type MatchState = 'matched' | 'unmatched' | 'ambiguous'

export interface PreviewRow extends ImportRow {
  matchState: MatchState
  companyId: ID | null // auto-matched, or manually chosen in the preview UI
}

export type PlannedActionKind = 'insert' | 'update' | 'skip'

export interface PlannedAction {
  row: PreviewRow
  kind: PlannedActionKind
  reportMonth: string // YYYY-MM-01
  targetId: ID | null // existing workforce_hours row to update
  reason: string | null // why the row is skipped
}

// ─── Small helpers ────────────────────────────────────────────────────────────

const MONTH_LOOKUP: Record<string, number> = {}
;['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
  .forEach((name, i) => {
    MONTH_LOOKUP[name] = i + 1
    MONTH_LOOKUP[name.slice(0, 3)] = i + 1
  })

export function normalizeCompanyName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ')
}

export function firstOfMonthIso(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`
}

function parseMonth(raw: string): number | null {
  const asNumber = Number(raw)
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= 12) return asNumber
  const named = MONTH_LOOKUP[raw.toLowerCase().trim()]
  return named ?? null
}

// Accepts "1,234.5", "$12,000", " 40000 " — returns null when not a number.
function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '')
  if (cleaned === '') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

// Maps header cells to column indexes. Returns null when a required column
// is missing (with the missing names for the error message).
interface ColumnMap { company: number; year: number; month: number; hours: number; grossPayroll: number | null }

function mapColumns(header: string[]): { columns: ColumnMap | null; missing: string[] } {
  const norm = header.map((h) => h.toLowerCase().trim())
  const find = (...names: string[]): number => norm.findIndex((h) => names.includes(h))
  const company = find('company', 'company name', 'employer', 'employer name')
  const year = find('year')
  const month = find('month')
  const hours = find('hours', 'total hours')
  const grossPayroll = find('gross payroll', 'gpep', 'payroll', 'gross payroll ($)')
  const missing: string[] = []
  if (company < 0) missing.push('Company')
  if (year < 0) missing.push('Year')
  if (month < 0) missing.push('Month')
  if (hours < 0) missing.push('Hours')
  if (missing.length > 0) return { columns: null, missing }
  return { columns: { company, year, month, hours, grossPayroll: grossPayroll >= 0 ? grossPayroll : null }, missing: [] }
}

function rowFromCells(cells: string[], columns: ColumnMap, rowNumber: number): ImportRow {
  const companyName = (cells[columns.company] ?? '').trim()
  const yearRaw = (cells[columns.year] ?? '').trim()
  const monthRaw = (cells[columns.month] ?? '').trim()
  const hoursRaw = (cells[columns.hours] ?? '').trim()
  const gpepRaw = columns.grossPayroll != null ? (cells[columns.grossPayroll] ?? '').trim() : ''

  const problems: string[] = []
  if (companyName === '') problems.push('missing company name')

  const year = parseNumber(yearRaw)
  if (year == null || !Number.isInteger(year) || year < 1990 || year > 2100) problems.push(`invalid year "${yearRaw}"`)

  const month = parseMonth(monthRaw)
  if (month == null) problems.push(`invalid month "${monthRaw}"`)

  const hours = parseNumber(hoursRaw)
  if (hours == null || hours < 0) problems.push(`invalid hours "${hoursRaw}"`)

  let grossPayroll: number | null = null
  if (gpepRaw !== '') {
    grossPayroll = parseNumber(gpepRaw)
    if (grossPayroll == null || grossPayroll < 0) {
      problems.push(`invalid gross payroll "${gpepRaw}"`)
      grossPayroll = null
    }
  }

  return {
    rowNumber,
    companyName,
    year: year ?? 0,
    month: month ?? 0,
    hours: hours ?? 0,
    grossPayroll,
    error: problems.length > 0 ? problems.join('; ') : null
  }
}

function rowsFromGrid(grid: string[][]): ImportRow[] {
  const nonEmpty = grid.filter((cells) => cells.some((c) => c.trim() !== ''))
  if (nonEmpty.length === 0) throw new Error('The file is empty.')
  const { columns, missing } = mapColumns(nonEmpty[0])
  if (!columns) {
    throw new Error(`Missing required column(s): ${missing.join(', ')}. Expected headers: Company, Year, Month, Hours, Gross Payroll.`)
  }
  return nonEmpty.slice(1).map((cells, i) => rowFromCells(cells, columns, i + 1))
}

// ─── CSV parsing (hand-rolled; handles quoted fields and embedded commas) ─────

export function parseCsv(text: string): ImportRow[] {
  const grid: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field); field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      grid.push(row); row = []
    } else {
      field += ch
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); grid.push(row) }
  return rowsFromGrid(grid)
}

// ─── XLSX parsing (ExcelJS, loaded on demand to keep it out of the bundle) ────

// ExcelJS cell values can be strings, numbers, Dates, rich text, formulas...
// Normalize everything to a display string, then reuse the CSV row logic.
function cellToString(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object') {
    const obj = value as { result?: unknown; text?: unknown; richText?: Array<{ text: string }> }
    if (obj.richText) return obj.richText.map((r) => r.text).join('')
    if (obj.result != null) return cellToString(obj.result)
    if (obj.text != null) return cellToString(obj.text)
  }
  return String(value)
}

export async function parseXlsx(buffer: ArrayBuffer): Promise<ImportRow[]> {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error('The workbook has no worksheets.')
  const grid: string[][] = []
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = []
    // ExcelJS cell indexes are 1-based; values[0] is always empty
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cells[colNumber - 1] = cellToString(cell.value)
    })
    grid.push(cells.map((c) => c ?? ''))
  })
  return rowsFromGrid(grid)
}

// ─── Template ─────────────────────────────────────────────────────────────────

export function buildTemplateCsv(): string {
  return [
    'Company,Year,Month,Hours,Gross Payroll',
    `Example Electric Co,${new Date().getFullYear()},1,4000,200000`,
    `Example Electric Co,${new Date().getFullYear()},2,4200,210000`
  ].join('\r\n') + '\r\n'
}

// ─── Company matching ─────────────────────────────────────────────────────────

export function matchCompanies(rows: ImportRow[], companies: MemberCompany[]): PreviewRow[] {
  const byName = new Map<string, MemberCompany[]>()
  for (const c of companies) {
    const key = normalizeCompanyName(c.company_name)
    const list = byName.get(key)
    if (list) list.push(c)
    else byName.set(key, [c])
  }
  return rows.map((row) => {
    const candidates = byName.get(normalizeCompanyName(row.companyName)) ?? []
    if (candidates.length === 1) return { ...row, matchState: 'matched' as const, companyId: candidates[0].id }
    if (candidates.length > 1) return { ...row, matchState: 'ambiguous' as const, companyId: null }
    return { ...row, matchState: 'unmatched' as const, companyId: null }
  })
}

// ─── Import planning ──────────────────────────────────────────────────────────

// Decides, per preview row, whether to insert a new workforce_hours row or
// update an existing one:
//   - no existing row for (company, month)  -> insert
//   - exactly one existing row              -> update its hours + payroll
//     (classification / local union on that row are preserved)
//   - two or more existing rows (classification splits) -> skip; those months
//     must be edited manually so the import never guesses which row to change
// Rows with parse errors or no selected company are skipped with a reason.
// A second file row for the same company + month is skipped as a duplicate.
export function planImport(previewRows: PreviewRow[], existingHours: WorkforceHours[]): PlannedAction[] {
  const existingByKey = new Map<string, WorkforceHours[]>()
  for (const h of existingHours) {
    if (!h.company_id) continue
    const key = `${h.company_id}|${h.report_month}`
    const list = existingByKey.get(key)
    if (list) list.push(h)
    else existingByKey.set(key, [h])
  }

  const seenInFile = new Set<string>()
  return previewRows.map((row) => {
    const reportMonth = row.error == null ? firstOfMonthIso(row.year, row.month) : ''
    if (row.error != null) {
      return { row, kind: 'skip' as const, reportMonth, targetId: null, reason: row.error }
    }
    if (!row.companyId) {
      return {
        row,
        kind: 'skip' as const,
        reportMonth,
        targetId: null,
        reason: row.matchState === 'ambiguous'
          ? 'Multiple companies share this name — choose one'
          : 'Company not found in the directory — choose one or skip'
      }
    }
    const key = `${row.companyId}|${reportMonth}`
    if (seenInFile.has(key)) {
      return { row, kind: 'skip' as const, reportMonth, targetId: null, reason: 'Duplicate of an earlier row in this file' }
    }
    seenInFile.add(key)

    const existing = existingByKey.get(key) ?? []
    if (existing.length === 0) {
      return { row, kind: 'insert' as const, reportMonth, targetId: null, reason: null }
    }
    if (existing.length === 1) {
      return { row, kind: 'update' as const, reportMonth, targetId: existing[0].id, reason: null }
    }
    return {
      row,
      kind: 'skip' as const,
      reportMonth,
      targetId: null,
      reason: 'Multiple entries exist for this month — edit manually'
    }
  })
}
