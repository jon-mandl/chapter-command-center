-- Wage component form cleanup (Local Unions page):
--   1. component_code is no longer collected in the UI -> drop NOT NULL.
--   2. Categories become Wage / Fringe Benefit / Industry Fund
--      ('deduction' retired; any existing rows migrated to 'industry_fund').
--   3. Units narrowed to $/hr and % of gross ('$/wk' retired; relabeled to
--      $/hr without converting amounts — audit on 2026-07-08 found zero
--      'deduction' and zero '$/wk' rows, so both UPDATEs are no-ops).
-- proposal_positions.unit intentionally keeps '$/wk' (separate concept).
-- Each CHECK is dropped before its UPDATE so the data change can't violate
-- the old constraint.

ALTER TABLE public.wage_components ALTER COLUMN component_code DROP NOT NULL;

ALTER TABLE public.wage_components DROP CONSTRAINT IF EXISTS wage_components_category_check;
UPDATE public.wage_components SET category = 'industry_fund' WHERE category = 'deduction';
ALTER TABLE public.wage_components ADD CONSTRAINT wage_components_category_check
  CHECK (category = ANY (ARRAY['wage'::text, 'benefit'::text, 'industry_fund'::text]));

ALTER TABLE public.wage_components DROP CONSTRAINT IF EXISTS wage_components_unit_check;
UPDATE public.wage_components SET unit = '$/hr' WHERE unit = '$/wk';
ALTER TABLE public.wage_components ADD CONSTRAINT wage_components_unit_check
  CHECK (unit = ANY (ARRAY['$/hr'::text, '% of gross'::text]));
