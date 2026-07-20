// Unit tests for the workforce-hours import pipeline: CSV parsing, cell
// normalization, company matching, and insert/update/skip planning.

import { describe, it, expect } from 'vitest'
import {
  csvToGrid,
  parseCsv,
  cellToString,
  normalizeCompanyName,
  firstOfMonthIso,
  matchCompanies,
  planImport,
  type ImportRow,
  type PreviewRow
} from './hoursImport'
import type { MemberCompany, WorkforceHours } from './types'

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

function mkRow(overrides: Partial<ImportRow>): ImportRow {
  return {
    rowNumber: 1,
    companyName: 'Example Electric Co',
    year: 2026,
    month: 1,
    hours: 100,
    grossPayroll: null,
    error: null,
    ...overrides
  }
}

function mkPreview(overrides: Partial<PreviewRow>): PreviewRow {
  return { ...mkRow({}), matchState: 'matched', companyId: 'co1', ...overrides }
}

function mkExisting(overrides: Partial<WorkforceHours>): WorkforceHours {
  return {
    id: 'wh1',
    chapter_id: 'ch1',
    local_union_id: null,
    company_id: 'co1',
    report_month: '2026-01-01',
    total_hours: 50,
    gross_payroll: null,
    employer_name: null,
    classification: null,
    source: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

describe('csvToGrid', () => {
  it('handles quoted fields with embedded commas and escaped quotes', () => {
    const grid = csvToGrid('"Smith, Jones & Co",2026,"say ""hi"""\r\nplain,1,2\n')
    expect(grid).toEqual([
      ['Smith, Jones & Co', '2026', 'say "hi"'],
      ['plain', '1', '2']
    ])
  })

  it('handles a final row with no trailing newline', () => {
    expect(csvToGrid('a,b\nc,d')).toEqual([['a', 'b'], ['c', 'd']])
  })
})

describe('parseCsv', () => {
  const header = 'Company,Year,Month,Hours,Gross Payroll'

  it('parses a valid row, accepting month names and $/comma formatting', () => {
    const rows = parseCsv(`${header}\nExample Electric Co,2026,Jan,"1,234.5","$12,000"`)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      companyName: 'Example Electric Co',
      year: 2026,
      month: 1,
      hours: 1234.5,
      grossPayroll: 12000,
      error: null
    })
  })

  it('treats gross payroll as optional', () => {
    const rows = parseCsv(`${header}\nExample Electric Co,2026,2,4000,`)
    expect(rows[0].grossPayroll).toBeNull()
    expect(rows[0].error).toBeNull()
  })

  it('collects parse problems into the row error', () => {
    const rows = parseCsv(`${header}\n,203X,13,-5,`)
    expect(rows[0].error).toContain('missing company name')
    expect(rows[0].error).toContain('invalid year')
    expect(rows[0].error).toContain('invalid month')
    expect(rows[0].error).toContain('invalid hours')
  })

  it('throws when a required column is missing', () => {
    expect(() => parseCsv('Company,Year,Hours\nA,2026,100')).toThrow(/Missing required column/)
  })
})

describe('cellToString', () => {
  it('normalizes the ExcelJS cell value shapes', () => {
    expect(cellToString(null)).toBe('')
    expect(cellToString('text')).toBe('text')
    expect(cellToString(42)).toBe('42')
    expect(cellToString(new Date('2026-03-15T00:00:00Z'))).toBe('2026-03-15')
    expect(cellToString({ richText: [{ text: 'a' }, { text: 'b' }] })).toBe('ab')
    expect(cellToString({ result: 99 })).toBe('99') // formula cell
  })
})

describe('small helpers', () => {
  it('normalizeCompanyName lowercases and collapses whitespace', () => {
    expect(normalizeCompanyName('  Example   ELECTRIC Co ')).toBe('example electric co')
  })

  it('firstOfMonthIso zero-pads the month', () => {
    expect(firstOfMonthIso(2026, 3)).toBe('2026-03-01')
    expect(firstOfMonthIso(2026, 11)).toBe('2026-11-01')
  })
})

describe('matchCompanies', () => {
  it('matches case-insensitively, and flags unmatched and ambiguous names', () => {
    const companies = [
      mkCompany({ id: 'co1', company_name: 'Example Electric Co' }),
      mkCompany({ id: 'co2', company_name: 'Dupe Inc' }),
      mkCompany({ id: 'co3', company_name: 'DUPE INC' }) // normalizes to same key
    ]
    const rows = [
      mkRow({ companyName: 'example electric co' }),
      mkRow({ companyName: 'Nowhere LLC' }),
      mkRow({ companyName: 'Dupe Inc' })
    ]
    const [matched, unmatched, ambiguous] = matchCompanies(rows, companies)
    expect(matched).toMatchObject({ matchState: 'matched', companyId: 'co1' })
    expect(unmatched).toMatchObject({ matchState: 'unmatched', companyId: null })
    expect(ambiguous).toMatchObject({ matchState: 'ambiguous', companyId: null })
  })
})

describe('planImport', () => {
  it('inserts when no existing row, updates when exactly one exists', () => {
    const existing = [mkExisting({ id: 'wh1', report_month: '2026-01-01' })]
    const rows = [
      mkPreview({ month: 1 }), // existing row for Jan -> update
      mkPreview({ month: 2 })  // nothing for Feb -> insert
    ]
    const [jan, feb] = planImport(rows, existing)
    expect(jan).toMatchObject({ kind: 'update', targetId: 'wh1' })
    expect(feb).toMatchObject({ kind: 'insert', targetId: null, reportMonth: '2026-02-01' })
  })

  it('skips months with multiple existing rows (classification splits)', () => {
    const existing = [
      mkExisting({ id: 'wh1', classification: 'Inside' }),
      mkExisting({ id: 'wh2', classification: 'Residential' })
    ]
    const [action] = planImport([mkPreview({ month: 1 })], existing)
    expect(action.kind).toBe('skip')
    expect(action.reason).toContain('edit manually')
  })

  it('skips duplicate company+month rows within the same file', () => {
    const rows = [mkPreview({ rowNumber: 1 }), mkPreview({ rowNumber: 2 })]
    const [first, second] = planImport(rows, [])
    expect(first.kind).toBe('insert')
    expect(second.kind).toBe('skip')
    expect(second.reason).toContain('Duplicate')
  })

  it('skips rows with parse errors or no chosen company, with a reason', () => {
    const rows = [
      mkPreview({ error: 'invalid month "13"' }),
      mkPreview({ matchState: 'unmatched', companyId: null }),
      mkPreview({ matchState: 'ambiguous', companyId: null })
    ]
    const [bad, unmatched, ambiguous] = planImport(rows, [])
    expect(bad).toMatchObject({ kind: 'skip', reason: 'invalid month "13"' })
    expect(unmatched.kind).toBe('skip')
    expect(unmatched.reason).toContain('not found')
    expect(ambiguous.reason).toContain('Multiple companies')
  })
})
