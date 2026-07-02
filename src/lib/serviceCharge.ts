// NECA National Service Charge calculation — pure functions, no React or
// Supabase imports, so the math can be verified (and later unit-tested) in
// isolation. All rules per the NECA bylaws:
//
//   - The charge base is GPEP (gross payroll for service-charge purposes),
//     reported monthly alongside hours.
//   - Hours accumulate per company per CALENDAR YEAR. The first 75,000 hours
//     are billable at 100%, hours 75,000-150,000 at 75%, and hours above
//     150,000 are not billable (0%).
//   - A month that straddles a tier boundary is split pro-rata using that
//     month's GPEP-per-hour (gpep / hours).
//   - base_charge = billable_gpep x 0.002 (0.2%).
//   - Multiple-membership discount (from the NECA national list, set annually
//     per company): 10+ memberships = 10% off, 25+ = 25% off.
//   - Compliance: a discounted company whose last reported month has fewer
//     than 1,250 hours is flagged (discount eligibility at risk).

import type { WorkforceHours, DiscountTier, ID } from './types'

// ─── Bylaw constants ──────────────────────────────────────────────────────────

export const TIER1_CAP = 75000   // annual hours billable at 100%
export const TIER2_CAP = 150000  // annual hours 75k-150k billable at 75%; above = 0%
export const TIER1_RATE = 1.0
export const TIER2_RATE = 0.75
export const SERVICE_CHARGE_RATE = 0.002 // 0.2% of billable GPEP
export const COMPLIANCE_MIN_MONTHLY_HOURS = 1250

export const DISCOUNT_PCT: Record<DiscountTier, number> = {
  none: 0,
  ten_plus: 0.10,
  twenty_five_plus: 0.25
}

export const DISCOUNT_TIER_LABEL: Record<DiscountTier, string> = {
  none: 'None',
  ten_plus: '10% — 10+ memberships',
  twenty_five_plus: '25% — 25+ memberships'
}

export const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ─── Shapes ───────────────────────────────────────────────────────────────────

export interface MonthlyInput {
  month: number // 1-12
  hours: number
  grossPayroll: number | null // null = not reported (distinct from 0)
  hasData: boolean
}

export interface TierSegment {
  tierLabel: '100%' | '75%' | '0% (capped)'
  rate: number
  hours: number
  gpep: number   // this segment's share of the month's GPEP
  charge: number // gpep x rate x SERVICE_CHARGE_RATE (pre-discount)
}

export interface MonthBreakdown {
  month: number
  hours: number
  gpep: number
  gpepMissing: boolean // hours reported but no gross payroll — treated as $0
  cumulativeHoursBefore: number
  cumulativeHoursAfter: number
  segments: TierSegment[] // two entries when the month straddles a tier cap
  monthCharge: number     // pre-discount
  runningCharge: number   // cumulative pre-discount charge over in-range months
  inRange: boolean        // false = context month before the selected range
}

export interface CompanyChargeResult {
  // Totals cover in-range months only (fromMonth..toMonth)
  totalHours: number
  totalGpep: number
  billableGpep: number
  baseCharge: number
  discountPct: number
  discountAmount: number
  netDue: number
  lastReportedMonth: number | null // greatest month <= toMonth with data
  lastReportedMonthHours: number | null
  nonCompliant: boolean
  warnings: string[]
  months: MonthBreakdown[] // months 1..toMonth (context months included)
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

// Groups hours rows for one calendar year by company, summing hours and gross
// payroll per month. Rows without a company link are skipped (the page shows a
// notice when such rows exist). A month's payroll stays null only when every
// contributing row is null — null + number = number.
export function aggregateMonthly(rows: WorkforceHours[], year: number): Map<ID, MonthlyInput[]> {
  const byCompany = new Map<ID, Map<number, MonthlyInput>>()
  for (const row of rows) {
    if (!row.company_id) continue
    if (parseInt(row.report_month.slice(0, 4), 10) !== year) continue
    const month = parseInt(row.report_month.slice(5, 7), 10)
    if (!(month >= 1 && month <= 12)) continue

    let months = byCompany.get(row.company_id)
    if (!months) {
      months = new Map<number, MonthlyInput>()
      byCompany.set(row.company_id, months)
    }
    const existing = months.get(month) ?? { month, hours: 0, grossPayroll: null, hasData: true }
    existing.hours += Number(row.total_hours ?? 0)
    if (row.gross_payroll != null) {
      existing.grossPayroll = (existing.grossPayroll ?? 0) + Number(row.gross_payroll)
    }
    months.set(month, existing)
  }

  const out = new Map<ID, MonthlyInput[]>()
  byCompany.forEach((months, companyId) => {
    out.set(companyId, Array.from(months.values()).sort((a, b) => a.month - b.month))
  })
  return out
}

// ─── Tier walk ────────────────────────────────────────────────────────────────

// Computes one company's charge for the months fromMonth..toMonth of a year.
// The walk ALWAYS starts at January regardless of fromMonth: the 75k/150k caps
// are annual and cumulative, so a later month's tier depends on hours reported
// earlier in the year. Months before fromMonth are returned with
// inRange: false (context rows) and excluded from the totals.
export function computeCompanyCharge(
  monthlyInputs: MonthlyInput[],
  discountTier: DiscountTier,
  fromMonth: number,
  toMonth: number
): CompanyChargeResult {
  const byMonth = new Map(monthlyInputs.map((m) => [m.month, m]))
  const warnings: string[] = []
  const months: MonthBreakdown[] = []

  let cumHours = 0
  let runningCharge = 0
  let totalHours = 0
  let totalGpep = 0
  let billableGpep = 0
  let lastReportedMonth: number | null = null
  let lastReportedMonthHours: number | null = null

  for (let m = 1; m <= toMonth; m++) {
    const input = byMonth.get(m) ?? { month: m, hours: 0, grossPayroll: null, hasData: false }
    const inRange = m >= fromMonth
    const hours = input.hours
    const gpep = input.grossPayroll ?? 0
    const gpepMissing = hours > 0 && (input.grossPayroll == null || input.grossPayroll === 0)
    if (gpepMissing) {
      warnings.push(`${SHORT_MONTHS[m - 1]}: ${Math.round(hours).toLocaleString()} hours reported with no gross payroll — treated as $0`)
    }

    const cumBefore = cumHours
    const cumAfter = cumBefore + hours
    const gpepPerHour = hours > 0 ? gpep / hours : 0

    // Split the month's hours across the annual tiers (pro-rata by GPEP/hour)
    const t1Hours = Math.max(0, Math.min(cumAfter, TIER1_CAP) - Math.min(cumBefore, TIER1_CAP))
    const t2Hours = Math.max(0, Math.min(cumAfter, TIER2_CAP) - Math.max(cumBefore, TIER1_CAP))
    const t3Hours = hours - t1Hours - t2Hours

    const segments: TierSegment[] = []
    const pushSegment = (tierLabel: TierSegment['tierLabel'], rate: number, segHours: number): void => {
      if (segHours <= 0) return
      const segGpep = segHours * gpepPerHour
      segments.push({ tierLabel, rate, hours: segHours, gpep: segGpep, charge: segGpep * rate * SERVICE_CHARGE_RATE })
    }
    pushSegment('100%', TIER1_RATE, t1Hours)
    pushSegment('75%', TIER2_RATE, t2Hours)
    pushSegment('0% (capped)', 0, t3Hours)

    const monthCharge = segments.reduce((sum, s) => sum + s.charge, 0)
    if (inRange) {
      runningCharge += monthCharge
      totalHours += hours
      totalGpep += gpep
      billableGpep += segments.reduce((sum, s) => sum + s.gpep * s.rate, 0)
    }
    if (input.hasData) {
      lastReportedMonth = m
      lastReportedMonthHours = hours
    }

    cumHours = cumAfter
    months.push({
      month: m,
      hours,
      gpep,
      gpepMissing,
      cumulativeHoursBefore: cumBefore,
      cumulativeHoursAfter: cumAfter,
      segments,
      monthCharge,
      runningCharge: inRange ? runningCharge : 0,
      inRange
    })
  }

  const discountPct = DISCOUNT_PCT[discountTier]
  const baseCharge = billableGpep * SERVICE_CHARGE_RATE
  const discountAmount = baseCharge * discountPct
  const netDue = baseCharge - discountAmount

  const nonCompliant =
    discountPct > 0 &&
    (lastReportedMonthHours == null || lastReportedMonthHours < COMPLIANCE_MIN_MONTHLY_HOURS)

  return {
    totalHours,
    totalGpep,
    billableGpep,
    baseCharge,
    discountPct,
    discountAmount,
    netDue,
    lastReportedMonth,
    lastReportedMonthHours,
    nonCompliant,
    warnings,
    months
  }
}
