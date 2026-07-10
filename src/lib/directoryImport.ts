// Employer directory bulk import (admin-only). Parses the one-sheet Excel
// template (or a CSV with the same columns) and plans the inserts. Pure
// functions — the modal (ImportDirectoryModal) performs the database writes.
//
// Companies are matched to the existing directory by normalized name:
// new names are inserted, existing ones are skipped (never overwritten).

import { normalizeCompanyName } from './hoursImport'
import { US_STATES_50 } from './usStates'
import type { SheetSpec } from './xlsx'
import type { MemberCompany, CompanyStatus, DiscountTier } from './types'

export const COMPANIES_SHEET = 'Companies'

const TIER_BY_LABEL: Record<string, DiscountTier> = {
  '': 'none',
  'none': 'none',
  '10+': 'ten_plus',
  '10+ memberships': 'ten_plus',
  'ten_plus': 'ten_plus',
  '25+': 'twenty_five_plus',
  '25+ memberships': 'twenty_five_plus',
  'twenty_five_plus': 'twenty_five_plus'
}

const STATE_BY_NAME = new Map<string, string>()
for (const s of US_STATES_50) {
  STATE_BY_NAME.set(s.code.toLowerCase(), s.code)
  STATE_BY_NAME.set(s.name.toLowerCase(), s.code)
}

// ─── Template ─────────────────────────────────────────────────────────────────

export function buildDirectoryTemplateSpecs(): SheetSpec[] {
  return [
    {
      name: COMPANIES_SHEET,
      columns: [
        { header: 'Company Name', width: 28 },
        { header: 'Contact Name', width: 20 },
        { header: 'Contact Email', width: 26 },
        { header: 'Contact Phone', width: 16 },
        { header: 'Address', width: 28 },
        { header: 'City', width: 18 },
        { header: 'State', width: 10, listOptions: US_STATES_50.map((s) => s.code) },
        { header: 'Zip', width: 10 },
        { header: 'Status', width: 12, listOptions: ['Active', 'Inactive'] },
        { header: 'Discount Tier', width: 18, listOptions: ['None', '10+ memberships', '25+ memberships'] },
        { header: 'Notes', width: 30 }
      ],
      exampleRows: [
        ['Example Electric Co', 'Pat Jones', 'pat@exampleelectric.com', '555-201-4477', '100 Main St', 'Los Angeles', 'CA', '90012', 'Active', 'None', '']
      ]
    }
  ]
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

export interface DirectoryImportRow {
  rowNumber: number // 1-based data row (header excluded)
  company_name: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  status: CompanyStatus
  discount_tier: DiscountTier
  notes: string | null
  error: string | null
}

function findColumn(header: string[], ...names: string[]): number {
  const norm = header.map((h) => h.toLowerCase().trim())
  return norm.findIndex((h) => names.includes(h))
}

export function parseDirectoryGrid(grid: string[][]): DirectoryImportRow[] {
  const rows = grid.filter((cells) => cells.some((c) => c.trim() !== ''))
  if (rows.length === 0) throw new Error('The file is empty.')
  const header = rows[0]
  const col = {
    name: findColumn(header, 'company name', 'company', 'employer', 'employer name'),
    contact: findColumn(header, 'contact name', 'contact'),
    email: findColumn(header, 'contact email', 'email'),
    phone: findColumn(header, 'contact phone', 'phone'),
    address: findColumn(header, 'address', 'street address'),
    city: findColumn(header, 'city'),
    state: findColumn(header, 'state'),
    zip: findColumn(header, 'zip', 'zip code', 'postal code'),
    status: findColumn(header, 'status'),
    tier: findColumn(header, 'discount tier', 'discount', 'tier'),
    notes: findColumn(header, 'notes')
  }
  if (col.name < 0) {
    throw new Error('Missing required column "Company Name" — download the template to see the expected format.')
  }
  const cell = (cells: string[], index: number): string => (index >= 0 ? (cells[index] ?? '').trim() : '')

  return rows.slice(1).map((cells, i) => {
    const problems: string[] = []
    const name = cell(cells, col.name)
    if (name === '') problems.push('missing company name')

    const email = cell(cells, col.email)
    if (email !== '' && !email.includes('@')) problems.push(`invalid email "${email}"`)

    const statusRaw = cell(cells, col.status)
    let status: CompanyStatus = 'Active'
    if (statusRaw !== '') {
      if (statusRaw.toLowerCase() === 'active') status = 'Active'
      else if (statusRaw.toLowerCase() === 'inactive') status = 'Inactive'
      else problems.push(`invalid status "${statusRaw}" (use Active or Inactive)`)
    }

    const tierRaw = cell(cells, col.tier)
    const tier = TIER_BY_LABEL[tierRaw.toLowerCase()]
    if (tier === undefined) problems.push(`invalid discount tier "${tierRaw}" (use None, 10+ memberships, or 25+ memberships)`)

    const stateRaw = cell(cells, col.state)
    let state: string | null = null
    if (stateRaw !== '') {
      state = STATE_BY_NAME.get(stateRaw.toLowerCase()) ?? null
      if (!state) problems.push(`unknown state "${stateRaw}"`)
    }

    return {
      rowNumber: i + 1,
      company_name: name,
      contact_name: cell(cells, col.contact) || null,
      contact_email: email || null,
      contact_phone: cell(cells, col.phone) || null,
      address: cell(cells, col.address) || null,
      city: cell(cells, col.city) || null,
      state,
      zip: cell(cells, col.zip) || null,
      status,
      discount_tier: tier ?? 'none',
      notes: cell(cells, col.notes) || null,
      error: problems.length > 0 ? problems.join('; ') : null
    }
  })
}

// ─── Planning ─────────────────────────────────────────────────────────────────

export interface DirectoryPlanned {
  row: DirectoryImportRow
  action: 'insert' | 'exists' | 'error'
  reason: string | null
}

export function planDirectoryImport(rows: DirectoryImportRow[], existing: MemberCompany[]): DirectoryPlanned[] {
  const existingNames = new Set(existing.map((c) => normalizeCompanyName(c.company_name)))
  const seenInFile = new Set<string>()
  return rows.map((row) => {
    if (row.error) return { row, action: 'error' as const, reason: row.error }
    const key = normalizeCompanyName(row.company_name)
    if (existingNames.has(key)) return { row, action: 'exists' as const, reason: 'Already in the directory — left unchanged' }
    if (seenInFile.has(key)) return { row, action: 'error' as const, reason: 'Duplicate of an earlier row in this file' }
    seenInFile.add(key)
    return { row, action: 'insert' as const, reason: null }
  })
}
