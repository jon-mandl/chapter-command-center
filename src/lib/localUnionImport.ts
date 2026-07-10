// Local union + wage data bulk import (admin-only). Parses the two-sheet
// Excel template and plans the inserts. Pure functions — the modal
// (ImportLocalUnionsModal) performs the database writes.
//
// Template sheets:
//   "Local Unions":    Local Number, City, State
//   "Wage Components": Local Number, Effective Date, Expiration Date,
//                      Component Name, Category, Amount, Unit, Notes
//
// One wage package is created per unique (Local Number, Effective Date,
// Expiration Date) group of component rows; classification stays the
// database default ('Journeyman'). Re-importing the same file is safe:
// existing unions and existing packages (same local + dates) are skipped.

import { US_STATES_50 } from './usStates'
import type { SheetSpec } from './xlsx'
import type { LocalUnion, WageComponentCategory, WageComponentUnit } from './types'

export const UNIONS_SHEET = 'Local Unions'
export const COMPONENTS_SHEET = 'Wage Components'

// ─── Label maps (template shows labels; parser accepts labels or codes) ───────

const CATEGORY_BY_LABEL: Record<string, WageComponentCategory> = {
  'wage': 'wage',
  'benefit': 'benefit',
  'fringe benefit': 'benefit',
  'industry fund': 'industry_fund',
  'industry_fund': 'industry_fund'
}

const UNIT_BY_LABEL: Record<string, WageComponentUnit> = {
  '$/hr': '$/hr',
  '$ per hour': '$/hr',
  '% of gross': '% of gross',
  '% gross': '% of gross'
}

const STATE_BY_NAME = new Map<string, string>()
for (const s of US_STATES_50) {
  STATE_BY_NAME.set(s.code.toLowerCase(), s.code)
  STATE_BY_NAME.set(s.name.toLowerCase(), s.code)
}

// ─── Template ─────────────────────────────────────────────────────────────────

export function buildLocalUnionTemplateSpecs(): SheetSpec[] {
  return [
    {
      name: UNIONS_SHEET,
      columns: [
        { header: 'Local Number', width: 14 },
        { header: 'City', width: 22 },
        { header: 'State', width: 10, listOptions: US_STATES_50.map((s) => s.code) }
      ],
      exampleRows: [['11', 'Los Angeles', 'CA']]
    },
    {
      name: COMPONENTS_SHEET,
      columns: [
        { header: 'Local Number', width: 14 },
        { header: 'Effective Date', width: 15 },
        { header: 'Expiration Date', width: 16 },
        { header: 'Component Name', width: 26 },
        { header: 'Category', width: 16, listOptions: ['Wage', 'Fringe Benefit', 'Industry Fund'] },
        { header: 'Amount', width: 12 },
        { header: 'Unit', width: 14, listOptions: ['$/hr', '% of gross'] },
        { header: 'Notes', width: 30 }
      ],
      exampleRows: [
        ['11', '2026-06-01', '2027-05-31', 'Base Wage', 'Wage', '52.50', '$/hr', ''],
        ['11', '2026-06-01', '2027-05-31', 'Health & Welfare', 'Fringe Benefit', '9.75', '$/hr', ''],
        ['11', '2026-06-01', '2027-05-31', 'NECA Service Charge', 'Industry Fund', '1', '% of gross', '']
      ]
    }
  ]
}

// ─── Parsed row shapes ────────────────────────────────────────────────────────

export interface UnionImportRow {
  rowNumber: number // 1-based data row in the sheet (header excluded)
  localNumber: number
  city: string | null
  state: string | null
  error: string | null
}

export interface ComponentImportRow {
  rowNumber: number
  localNumber: number
  effectiveDate: string | null // YYYY-MM-DD
  expirationDate: string | null
  componentName: string
  category: WageComponentCategory
  amount: number
  unit: WageComponentUnit
  notes: string | null
  error: string | null
}

export interface ParsedLocalUnionWorkbook {
  unionRows: UnionImportRow[]
  componentRows: ComponentImportRow[]
}

// ─── Cell parsing helpers ─────────────────────────────────────────────────────

function parseNumberCell(raw: string): number | null {
  const cleaned = raw.replace(/[$,%\s]/g, '')
  if (cleaned === '') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function parseLocalNumber(raw: string): number | null {
  const n = parseNumberCell(raw)
  return n != null && Number.isInteger(n) && n > 0 ? n : null
}

// Accepts YYYY-MM-DD (what ExcelJS date cells normalize to) or M/D/YYYY.
// Returns { iso: null } for blank cells and { error } for anything unreadable.
function parseDateCell(raw: string): { iso: string | null; error: string | null } {
  const v = raw.trim()
  if (v === '') return { iso: null, error: null }
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return { iso: v, error: null }
  const us = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (us) {
    const [, m, d, y] = us
    return { iso: `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`, error: null }
  }
  return { iso: null, error: `invalid date "${v}" (use YYYY-MM-DD)` }
}

function parseStateCell(raw: string): { state: string | null; error: string | null } {
  const v = raw.trim()
  if (v === '') return { state: null, error: null }
  const code = STATE_BY_NAME.get(v.toLowerCase())
  if (!code) return { state: null, error: `unknown state "${v}"` }
  return { state: code, error: null }
}

// Case-insensitive header lookup with aliases.
function findColumn(header: string[], ...names: string[]): number {
  const norm = header.map((h) => h.toLowerCase().trim())
  return norm.findIndex((h) => names.includes(h))
}

function findGrid(grids: Map<string, string[][]>, wanted: string): string[][] | null {
  for (const [name, grid] of grids) {
    if (name.trim().toLowerCase() === wanted.toLowerCase()) return grid
  }
  return null
}

// ─── Workbook parsing ─────────────────────────────────────────────────────────

export function parseLocalUnionWorkbook(grids: Map<string, string[][]>): ParsedLocalUnionWorkbook {
  const unionsGrid = findGrid(grids, UNIONS_SHEET)
  const componentsGrid = findGrid(grids, COMPONENTS_SHEET)
  if (!unionsGrid && !componentsGrid) {
    throw new Error(`The workbook needs a "${UNIONS_SHEET}" or "${COMPONENTS_SHEET}" sheet — download the template to see the expected format.`)
  }

  const unionRows: UnionImportRow[] = []
  if (unionsGrid) {
    const rows = unionsGrid.filter((cells) => cells.some((c) => c.trim() !== ''))
    if (rows.length > 1) {
      const header = rows[0]
      const colNumber = findColumn(header, 'local number', 'local', 'local #', 'number')
      const colCity = findColumn(header, 'city')
      const colState = findColumn(header, 'state')
      if (colNumber < 0) throw new Error(`The "${UNIONS_SHEET}" sheet is missing a "Local Number" column.`)
      rows.slice(1).forEach((cells, i) => {
        const problems: string[] = []
        const localNumber = parseLocalNumber(cells[colNumber] ?? '')
        if (localNumber == null) problems.push(`invalid local number "${(cells[colNumber] ?? '').trim()}"`)
        const stateParsed = parseStateCell(colState >= 0 ? cells[colState] ?? '' : '')
        if (stateParsed.error) problems.push(stateParsed.error)
        unionRows.push({
          rowNumber: i + 1,
          localNumber: localNumber ?? 0,
          city: colCity >= 0 ? (cells[colCity] ?? '').trim() || null : null,
          state: stateParsed.state,
          error: problems.length > 0 ? problems.join('; ') : null
        })
      })
    }
  }

  const componentRows: ComponentImportRow[] = []
  if (componentsGrid) {
    const rows = componentsGrid.filter((cells) => cells.some((c) => c.trim() !== ''))
    if (rows.length > 1) {
      const header = rows[0]
      const colNumber = findColumn(header, 'local number', 'local', 'local #', 'number')
      const colEff = findColumn(header, 'effective date', 'effective')
      const colExp = findColumn(header, 'expiration date', 'expiration', 'expires')
      const colName = findColumn(header, 'component name', 'component', 'name')
      const colCategory = findColumn(header, 'category')
      const colAmount = findColumn(header, 'amount')
      const colUnit = findColumn(header, 'unit')
      const colNotes = findColumn(header, 'notes')
      const missing: string[] = []
      if (colNumber < 0) missing.push('Local Number')
      if (colName < 0) missing.push('Component Name')
      if (colCategory < 0) missing.push('Category')
      if (colAmount < 0) missing.push('Amount')
      if (colUnit < 0) missing.push('Unit')
      if (missing.length > 0) {
        throw new Error(`The "${COMPONENTS_SHEET}" sheet is missing column(s): ${missing.join(', ')}.`)
      }
      rows.slice(1).forEach((cells, i) => {
        const problems: string[] = []
        const localNumber = parseLocalNumber(cells[colNumber] ?? '')
        if (localNumber == null) problems.push(`invalid local number "${(cells[colNumber] ?? '').trim()}"`)
        const eff = parseDateCell(colEff >= 0 ? cells[colEff] ?? '' : '')
        if (eff.error) problems.push(eff.error)
        const exp = parseDateCell(colExp >= 0 ? cells[colExp] ?? '' : '')
        if (exp.error) problems.push(exp.error)
        const componentName = (cells[colName] ?? '').trim()
        if (componentName === '') problems.push('missing component name')
        const categoryRaw = (cells[colCategory] ?? '').trim()
        const category = CATEGORY_BY_LABEL[categoryRaw.toLowerCase()]
        if (!category) problems.push(`invalid category "${categoryRaw}" (use Wage, Fringe Benefit, or Industry Fund)`)
        const amount = parseNumberCell(cells[colAmount] ?? '')
        if (amount == null || amount < 0) problems.push(`invalid amount "${(cells[colAmount] ?? '').trim()}"`)
        const unitRaw = (cells[colUnit] ?? '').trim()
        const unit = UNIT_BY_LABEL[unitRaw.toLowerCase()]
        if (!unit) problems.push(`invalid unit "${unitRaw}" (use $/hr or % of gross)`)
        componentRows.push({
          rowNumber: i + 1,
          localNumber: localNumber ?? 0,
          effectiveDate: eff.iso,
          expirationDate: exp.iso,
          componentName,
          category: category ?? 'wage',
          amount: amount ?? 0,
          unit: unit ?? '$/hr',
          notes: colNotes >= 0 ? (cells[colNotes] ?? '').trim() || null : null,
          error: problems.length > 0 ? problems.join('; ') : null
        })
      })
    }
  }

  if (unionRows.length === 0 && componentRows.length === 0) {
    throw new Error('No data rows found below the header rows.')
  }
  return { unionRows, componentRows }
}

// ─── Import planning ──────────────────────────────────────────────────────────

export interface PlannedUnion {
  row: UnionImportRow
  action: 'add' | 'exists' | 'error'
  reason: string | null
}

export interface PlannedComponent {
  component_name: string
  category: WageComponentCategory
  amount: number
  unit: WageComponentUnit
  notes: string | null
  sort_order: number
}

export interface PlannedPackage {
  localNumber: number
  effectiveDate: string | null
  expirationDate: string | null
  action: 'create' | 'exists'
  components: PlannedComponent[]
}

export interface LocalUnionImportPlan {
  unions: PlannedUnion[]
  packages: PlannedPackage[]
  // Component rows that cannot be imported (parse error or unknown local).
  badComponentRows: Array<{ row: ComponentImportRow; reason: string }>
}

export function packageKey(localNumber: number, eff: string | null, exp: string | null): string {
  return `${localNumber}|${eff ?? ''}|${exp ?? ''}`
}

export function planLocalUnionImport(
  parsed: ParsedLocalUnionWorkbook,
  existingUnions: LocalUnion[],
  existingPackageKeys: Set<string>
): LocalUnionImportPlan {
  const existingNumbers = new Set(existingUnions.map((u) => u.local_number))

  const unions: PlannedUnion[] = []
  const seenInFile = new Set<number>()
  for (const row of parsed.unionRows) {
    if (row.error) {
      unions.push({ row, action: 'error', reason: row.error })
    } else if (seenInFile.has(row.localNumber)) {
      unions.push({ row, action: 'error', reason: 'Duplicate of an earlier row in this file' })
    } else if (existingNumbers.has(row.localNumber)) {
      seenInFile.add(row.localNumber)
      unions.push({ row, action: 'exists', reason: 'Already in this chapter — left unchanged' })
    } else {
      seenInFile.add(row.localNumber)
      unions.push({ row, action: 'add', reason: null })
    }
  }

  // Locals that will exist after the union inserts run.
  const knownNumbers = new Set<number>(existingNumbers)
  for (const u of unions) if (u.action === 'add') knownNumbers.add(u.row.localNumber)

  const packagesByKey = new Map<string, PlannedPackage>()
  const badComponentRows: LocalUnionImportPlan['badComponentRows'] = []
  for (const row of parsed.componentRows) {
    if (row.error) {
      badComponentRows.push({ row, reason: row.error })
      continue
    }
    if (!knownNumbers.has(row.localNumber)) {
      badComponentRows.push({ row, reason: `Local ${row.localNumber} is not in this chapter or the "${UNIONS_SHEET}" sheet` })
      continue
    }
    const key = packageKey(row.localNumber, row.effectiveDate, row.expirationDate)
    let pkg = packagesByKey.get(key)
    if (!pkg) {
      pkg = {
        localNumber: row.localNumber,
        effectiveDate: row.effectiveDate,
        expirationDate: row.expirationDate,
        action: existingPackageKeys.has(key) ? 'exists' : 'create',
        components: []
      }
      packagesByKey.set(key, pkg)
    }
    if (pkg.action === 'create') {
      pkg.components.push({
        component_name: row.componentName,
        category: row.category,
        amount: row.amount,
        unit: row.unit,
        notes: row.notes,
        sort_order: pkg.components.length
      })
    }
  }

  return { unions, packages: Array.from(packagesByKey.values()), badComponentRows }
}
