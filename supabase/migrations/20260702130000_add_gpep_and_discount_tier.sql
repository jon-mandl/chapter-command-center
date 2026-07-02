-- Service charge inputs: monthly gross payroll (GPEP) and per-company
-- NECA multiple-membership discount tier.

-- Gross payroll for service-charge purposes (GPEP), reported monthly alongside
-- hours. Nullable: NULL means "not reported" (distinct from 0).
ALTER TABLE public.workforce_hours
  ADD COLUMN IF NOT EXISTS gross_payroll numeric;

-- NECA multiple-membership discount tier, set annually from the national list.
ALTER TABLE public.member_companies
  ADD COLUMN IF NOT EXISTS discount_tier text NOT NULL DEFAULT 'none'
    CHECK (discount_tier = ANY (ARRAY['none', 'ten_plus', 'twenty_five_plus']));
