// data.js — shared bargaining data for the Comparison Sheet prototype
// This is a design reference only. Production data comes from Supabase.

window.CCC_NEG = {
  name: 'Inside Wiremen 2026',
  local: '11',
  counterparty: 'Los Angeles County NECA',
  expires: 'May 31, 2026',
  round: 'Round 4 · Mar 18, 2026',
  unitSize: 1240,
  annualHours: 1800,
  rollup: { unionHr: 6.25, mgmtHr: 2.50, gapHr: 3.75 },
  articles: [
    {
      id: 'art5', code: 'Article 5', title: 'Wages',
      items: [
        { id: 'wage-base', section: '5.01', name: 'Base journeyman wage', unit: '$/hr', cur: 48.50, uni: 51.00, mgmt: 49.75, fmt: 'usd', status: 'open', sub: 'counter', party: 'Union', costU: 2.50, costM: 1.25, priority: true, note: 'Union seeks $2.50/hr over the three-year term to restore purchasing power lost since the 2023 agreement.', movement: 'Mgmt moved +$0.25/hr at the Mar 18 session.' },
        { id: 'foreman', section: '5.04', name: 'Foreman differential', unit: '% over JW', cur: 12, uni: 15, mgmt: 12, fmt: 'pct', status: 'open', party: 'Union', costU: 0.40, costM: 0.00, note: 'Union proposes widening the foreman premium to 15%.', movement: 'No movement.' },
        { id: 'gforeman', section: '5.05', name: 'General foreman differential', unit: '% over JW', cur: 18, uni: 20, mgmt: 20, fmt: 'pct', status: 'agreed', party: 'Joint', costU: 0.20, costM: 0.20, note: 'TA reached Mar 18.', movement: 'TA ratified by both parties Mar 18.' },
      ],
    },
    {
      id: 'art7', code: 'Article 7', title: 'Health & Welfare',
      items: [
        { id: 'hw', section: '7.02', name: 'H&W contribution', unit: '$/hr', cur: 9.20, uni: 10.50, mgmt: 9.75, fmt: 'usd', status: 'open', sub: 'counter', party: 'Union', costU: 1.30, costM: 0.55, priority: true, note: 'Fund actuary projects a reserve shortfall.', movement: 'Mgmt countered flat-rate on Mar 04.' },
        { id: 'annuity', section: '7.04', name: 'Annuity contribution', unit: '$/hr', cur: 7.00, uni: 8.00, mgmt: 7.25, fmt: 'usd', status: 'open', party: 'Union', costU: 1.00, costM: 0.25, note: 'Union ties this to the overall wage package.', movement: 'Opened Mar 18.' },
      ],
    },
    {
      id: 'art4', code: 'Article 4', title: 'Hours & Overtime',
      items: [
        { id: 'ot', section: '4.03', name: 'Daily overtime threshold', unit: 'hrs/day', cur: 8, uni: 8, mgmt: 10, fmt: 'hrs', status: 'tabled', party: 'Management', costU: null, costM: null, priority: true, note: 'Tabled pending bargaining-committee review.', movement: 'Tabled Mar 18.' },
        { id: 'shift', section: '4.07', name: 'Night-shift differential', unit: '$/hr', cur: 1.00, uni: 2.00, mgmt: 1.50, fmt: 'usd', status: 'open', party: 'Union', costU: 0.15, costM: 0.08, note: 'Union seeks to double the premium.', movement: 'Mgmt opened at $1.50 on Mar 18.' },
      ],
    },
  ],
};

window.CCC_FMT = {
  value(v, fmt) {
    if (v == null) return '—';
    switch (fmt) {
      case 'usd': return '$' + v.toFixed(2);
      case 'usdDay': return '$' + v.toFixed(0);
      case 'pct': return v + '%';
      case 'hrs': return v + ' hrs';
      case 'mi': return v + ' mi';
      case 'ratio': return '1:' + v.toFixed(0);
      default: return String(v);
    }
  },
  money(n) {
    const abs = Math.abs(n);
    if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + n.toFixed(0);
  },
  hrDelta(cost) {
    if (cost == null) return '—';
    if (cost === 0) return '$0.00';
    return (cost > 0 ? '+$' : '−$') + Math.abs(cost).toFixed(2);
  },
};

window.CCC_STATUS = {
  open:   { tone: 'info',    label: 'Open' },
  agreed: { tone: 'success', label: 'Agreed (TA)' },
  tabled: { tone: 'neutral', label: 'Tabled' },
};
window.CCC_SUB = { counter: { tone: 'warning', label: 'Counter' } };

window.CCC_ALL_ITEMS = () =>
  window.CCC_NEG.articles.flatMap((a) => a.items.map((it) => ({ ...it, article: a })));

window.CCC_COUNTS = () => {
  const c = { open: 0, agreed: 0, tabled: 0, total: 0 };
  window.CCC_ALL_ITEMS().forEach((it) => { c[it.status]++; c.total++; });
  return c;
};

window.CCC_LANG = {
  articles: [
    {
      id: 'lart4', code: 'Article 4', title: 'Hours of Work',
      items: [
        { id: 'reg-hours', section: '4.01', name: 'Regular working hours', status: 'open', priority: true, current: 'Eight (8) hours between 6:00 AM and 4:30 PM, Monday through Friday, shall constitute a regular workday at the straight-time rate, with a one-half hour unpaid lunch.', union: { change: false, text: '' }, mgmt: { change: true, text: 'Eight (8) hours between 5:00 AM and 6:00 PM, Monday through Friday, at the straight-time rate. Starting time set by the Employer with twenty-four (24) hours notice.' }, note: 'Management seeks a wider straight-time window.', movement: 'Management opened Mar 18; union holding.' },
        { id: 'ot-rate', section: '4.03', name: 'Overtime rate', status: 'open', current: 'All work performed outside regular hours and on Saturdays shall be paid at one and one-half times the regular rate; Sundays and holidays at two times.', union: { change: true, text: 'All work outside regular hours and on Saturdays at two times the regular rate; Sundays and holidays at two and one-half times.' }, mgmt: { change: false, text: '' }, note: 'Union seeks to raise overtime multipliers.', movement: 'Union proposal exchanged Mar 18.' },
        { id: 'shift-ops', section: '4.05', name: 'Multiple-shift operations', status: 'open', current: null, union: { change: true, text: 'When two or more shifts are worked, a $2.00/hr premium shall apply to second and third shifts.' }, mgmt: { change: true, text: 'The Employer may establish multiple shifts at the straight-time rate with a $1.00/hr premium on shifts beginning after 6:00 PM.' }, note: 'No current shift language. Both parties propose new clauses.', movement: 'Both parties opened new language Mar 18.' },
      ],
    },
    {
      id: 'lart3', code: 'Article 3', title: 'Referral & Union Security',
      items: [
        { id: 'hiring-hall', section: '3.04', name: 'Hiring-hall referral', status: 'open', priority: true, current: 'All employees shall be referred through the Union exclusive hiring hall in accordance with the referral procedures set out in Appendix B.', union: { change: false, text: '' }, mgmt: { change: true, text: 'The Employer may directly hire up to twenty percent (20%) of the workforce on each project outside the referral procedure.' }, note: 'Management direct-hire carve-out is a core union-security issue.', movement: 'Management opened Mar 04; union has rejected.' },
      ],
    },
    {
      id: 'lart6', code: 'Article 6', title: 'Travel & Reporting',
      items: [
        { id: 'showup', section: '6.05', name: 'Show-up pay', status: 'agreed', current: 'Employees who report for work and are not put to work shall receive two (2) hours pay at the regular rate.', union: { change: true, text: 'Employees who report and are not put to work shall receive four (4) hours pay at the regular rate.' }, mgmt: { change: true, text: 'Employees who report and are not put to work shall receive four (4) hours pay at the regular rate.' }, note: 'TA reached at four hours show-up pay.', movement: 'TA reached Mar 18.' },
      ],
    },
  ],
};

window.CCC_LANG_ITEMS = () =>
  window.CCC_LANG.articles.flatMap((a) => a.items.map((it) => ({ ...it, article: a })));

window.CCC_LANG_COUNTS = () => {
  const c = { open: 0, agreed: 0, tabled: 0, total: 0, fresh: 0, mgmtOnly: 0, unionOnly: 0 };
  window.CCC_LANG_ITEMS().forEach((it) => {
    c[it.status]++; c.total++;
    if (it.current == null) c.fresh++;
    if (it.mgmt.change && !it.union.change) c.mgmtOnly++;
    if (it.union.change && !it.mgmt.change) c.unionOnly++;
  });
  return c;
};
