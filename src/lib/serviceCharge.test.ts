// Unit tests for the NECA service-charge math. These encode the bylaw rules
// documented at the top of serviceCharge.ts so a future edit that changes the
// numbers gets caught by CI before it reaches production.

import { describe, it, expect } from 'vitest'
import {
  aggregateMonthly,
  computeCompanyCharge,
  SERVICE_CHARGE_RATE,
  type MonthlyInput
} from './serviceCharge'
import type { WorkforceHours } from './types'

function mkHours(overrides: Partial<WorkforceHours>): WorkforceHours {
  return {
    id: 'h1',
    chapter_id: 'ch1',
    local_union_id: null,
    company_id: 'co1',
    report_month: '2026-01-01',
    total_hours: 0,
    gross_payroll: null,
    employer_name: null,
    classification: null,
    source: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

function month(m: number, hours: number, grossPayroll: number | null): MonthlyInput {
  return { month: m, hours, grossPayroll, hasData: true }
}

describe('aggregateMonthly', () => {
  it('sums multiple rows for the same company and month', () => {
    const rows = [
      mkHours({ id: 'a', report_month: '2026-03-01', total_hours: 1000, gross_payroll: 50000 }),
      mkHours({ id: 'b', report_month: '2026-03-01', total_hours: 500, gross_payroll: 25000 })
    ]
    const result = aggregateMonthly(rows, 2026)
    const months = result.get('co1')
    expect(months).toHaveLength(1)
    expect(months![0]).toMatchObject({ month: 3, hours: 1500, grossPayroll: 75000 })
  })

  it('skips rows with no company link', () => {
    const rows = [mkHours({ company_id: null, total_hours: 999 })]
    expect(aggregateMonthly(rows, 2026).size).toBe(0)
  })

  it('ignores rows from other years', () => {
    const rows = [
      mkHours({ id: 'a', report_month: '2025-12-01', total_hours: 100 }),
      mkHours({ id: 'b', report_month: '2026-01-01', total_hours: 200 })
    ]
    const months = aggregateMonthly(rows, 2026).get('co1')
    expect(months).toHaveLength(1)
    expect(months![0].hours).toBe(200)
  })

  it('keeps grossPayroll null only when every contributing row is null', () => {
    const allNull = aggregateMonthly(
      [mkHours({ id: 'a', total_hours: 100, gross_payroll: null })],
      2026
    ).get('co1')!
    expect(allNull[0].grossPayroll).toBeNull()

    const mixed = aggregateMonthly(
      [
        mkHours({ id: 'a', total_hours: 100, gross_payroll: null }),
        mkHours({ id: 'b', total_hours: 100, gross_payroll: 5000 })
      ],
      2026
    ).get('co1')!
    expect(mixed[0].grossPayroll).toBe(5000)
  })
})

describe('computeCompanyCharge', () => {
  it('charges 0.2% of GPEP for a simple month under the 75k tier', () => {
    const result = computeCompanyCharge([month(1, 2000, 100000)], 'none', 1, 1)
    expect(result.baseCharge).toBeCloseTo(100000 * SERVICE_CHARGE_RATE) // $200
    expect(result.discountAmount).toBe(0)
    expect(result.netDue).toBeCloseTo(200)
    expect(result.billableGpep).toBeCloseTo(100000)
  })

  it('splits a month that straddles the 75,000-hour cap pro-rata into 100%/75% segments', () => {
    // Jan: 70,000 hours at $50/hr. Feb: 10,000 hours at $50/hr.
    // Feb crosses 75k: 5,000 hours at 100%, 5,000 hours at 75%.
    const inputs = [month(1, 70000, 3500000), month(2, 10000, 500000)]
    const result = computeCompanyCharge(inputs, 'none', 1, 2)

    const feb = result.months[1]
    expect(feb.segments).toHaveLength(2)
    expect(feb.segments[0]).toMatchObject({ tierLabel: '100%', hours: 5000 })
    expect(feb.segments[1]).toMatchObject({ tierLabel: '75%', hours: 5000 })
    // Feb billable = 5,000×$50×100% + 5,000×$50×75% = $437,500
    expect(result.billableGpep).toBeCloseTo(3500000 + 437500)
    expect(result.baseCharge).toBeCloseTo((3500000 + 437500) * SERVICE_CHARGE_RATE)
  })

  it('bills hours above 150,000 at 0%', () => {
    // 200,000 hours in one month at $10/hr: 75k at 100%, 75k at 75%, 50k at 0%.
    const result = computeCompanyCharge([month(1, 200000, 2000000)], 'none', 1, 1)
    const segments = result.months[0].segments
    expect(segments.map((s) => s.tierLabel)).toEqual(['100%', '75%', '0% (capped)'])
    expect(segments[2].hours).toBe(50000)
    expect(segments[2].charge).toBe(0)
    expect(result.billableGpep).toBeCloseTo(75000 * 10 + 75000 * 10 * 0.75)
  })

  it('applies the 10% and 25% membership discounts', () => {
    const inputs = [month(1, 2000, 100000)]
    const ten = computeCompanyCharge(inputs, 'ten_plus', 1, 1)
    expect(ten.discountAmount).toBeCloseTo(ten.baseCharge * 0.10)
    expect(ten.netDue).toBeCloseTo(ten.baseCharge * 0.90)

    const twentyFive = computeCompanyCharge(inputs, 'twenty_five_plus', 1, 1)
    expect(twentyFive.discountAmount).toBeCloseTo(twentyFive.baseCharge * 0.25)
    expect(twentyFive.netDue).toBeCloseTo(twentyFive.baseCharge * 0.75)
  })

  it('flags a discounted company as non-compliant when its last month is under 1,250 hours', () => {
    const low = computeCompanyCharge([month(1, 1000, 50000)], 'ten_plus', 1, 1)
    expect(low.nonCompliant).toBe(true)

    const ok = computeCompanyCharge([month(1, 1300, 65000)], 'ten_plus', 1, 1)
    expect(ok.nonCompliant).toBe(false)

    // No discount = never non-compliant, even with low hours
    const none = computeCompanyCharge([month(1, 1000, 50000)], 'none', 1, 1)
    expect(none.nonCompliant).toBe(false)
  })

  it('excludes months before fromMonth from totals but keeps them for the annual caps', () => {
    // Jan reports 74,000 hours; Feb reports 2,000. With fromMonth=2, Jan is
    // context-only, but Feb must still straddle the 75k cap because the caps
    // are annual and cumulative.
    const inputs = [month(1, 74000, 3700000), month(2, 2000, 100000)]
    const result = computeCompanyCharge(inputs, 'none', 2, 2)

    expect(result.months[0].inRange).toBe(false)
    expect(result.totalHours).toBe(2000) // Jan excluded from totals
    const feb = result.months[1]
    expect(feb.segments[0]).toMatchObject({ tierLabel: '100%', hours: 1000 })
    expect(feb.segments[1]).toMatchObject({ tierLabel: '75%', hours: 1000 })
  })

  it('warns when hours are reported with no gross payroll and treats it as $0', () => {
    const result = computeCompanyCharge([month(1, 500, null)], 'none', 1, 1)
    expect(result.months[0].gpepMissing).toBe(true)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('no gross payroll')
    expect(result.baseCharge).toBe(0)
  })
})
