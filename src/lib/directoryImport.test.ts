// Unit tests for the employer-directory bulk import: grid parsing with
// defaults/validation, and insert-vs-exists planning.

import { describe, it, expect } from 'vitest'
import { parseDirectoryGrid, planDirectoryImport, type DirectoryImportRow } from './directoryImport'
import type { MemberCompany } from './types'

const HEADER = [
  'Company Name', 'Contact Name', 'Contact Email', 'Contact Phone',
  'Address', 'City', 'State', 'Zip', 'Status', 'Discount Tier', 'Notes'
]

function mkCompany(overrides: Partial<MemberCompany>): MemberCompany {
  return {
    id: 'co1',
    chapter_id: 'ch1',
    company_name: 'Example Electric Co',
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    address: null,
    city: null,
    state: null,
    zip: null,
    status: 'Active',
    discount_tier: 'none',
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

function mkParsedRow(overrides: Partial<DirectoryImportRow>): DirectoryImportRow {
  return {
    rowNumber: 1,
    company_name: 'Example Electric Co',
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    address: null,
    city: null,
    state: null,
    zip: null,
    status: 'Active',
    discount_tier: 'none',
    notes: null,
    error: null,
    ...overrides
  }
}

describe('parseDirectoryGrid', () => {
  it('parses a full row, mapping state names and tier labels', () => {
    const grid = [
      HEADER,
      ['Acme Electric', 'Pat Jones', 'pat@acme.com', '555-1234',
        '100 Main St', 'Los Angeles', 'California', '90012', 'Inactive', '10+ memberships', 'note']
    ]
    const [row] = parseDirectoryGrid(grid)
    expect(row).toMatchObject({
      company_name: 'Acme Electric',
      contact_email: 'pat@acme.com',
      state: 'CA', // full state name mapped to its code
      status: 'Inactive',
      discount_tier: 'ten_plus',
      error: null
    })
  })

  it('defaults blank status to Active and blank tier to none', () => {
    const grid = [HEADER, ['Acme Electric', '', '', '', '', '', '', '', '', '', '']]
    const [row] = parseDirectoryGrid(grid)
    expect(row.status).toBe('Active')
    expect(row.discount_tier).toBe('none')
    expect(row.error).toBeNull()
  })

  it('collects validation problems into the row error', () => {
    const grid = [
      HEADER,
      ['', '', 'not-an-email', '', '', '', 'Atlantis', '', 'Maybe', 'lots', '']
    ]
    const [row] = parseDirectoryGrid(grid)
    expect(row.error).toContain('missing company name')
    expect(row.error).toContain('invalid email')
    expect(row.error).toContain('unknown state')
    expect(row.error).toContain('invalid status')
    expect(row.error).toContain('invalid discount tier')
  })

  it('throws when the Company Name column is missing', () => {
    expect(() => parseDirectoryGrid([['Contact', 'Email'], ['Pat', 'p@x.com']]))
      .toThrow(/Company Name/)
  })
})

describe('planDirectoryImport', () => {
  it('inserts new names, leaves existing ones unchanged, passes errors through', () => {
    const existing = [mkCompany({ company_name: 'Existing Electric' })]
    const rows = [
      mkParsedRow({ company_name: 'Brand New Co' }),
      mkParsedRow({ company_name: 'EXISTING electric' }), // matches by normalized name
      mkParsedRow({ company_name: '', error: 'missing company name' })
    ]
    const [fresh, dupe, bad] = planDirectoryImport(rows, existing)
    expect(fresh.action).toBe('insert')
    expect(dupe).toMatchObject({ action: 'exists', reason: 'Already in the directory — left unchanged' })
    expect(bad).toMatchObject({ action: 'error', reason: 'missing company name' })
  })

  it('flags a duplicate of an earlier row in the same file', () => {
    const rows = [
      mkParsedRow({ company_name: 'Twice Co' }),
      mkParsedRow({ company_name: 'twice co' })
    ]
    const [first, second] = planDirectoryImport(rows, [])
    expect(first.action).toBe('insert')
    expect(second.action).toBe('error')
    expect(second.reason).toContain('Duplicate')
  })
})
