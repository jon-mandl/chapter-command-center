-- Negotiation close-out: record settlement facts on the cycle.
-- settled_date is set by the Close Out wizard and cleared on Reopen.
-- final_agreement_document_id points at the ratified agreement in
-- negotiation_documents; SET NULL on delete so removing the file never
-- blocks or cascades into the cycle row.

ALTER TABLE public.negotiation_cycles
  ADD COLUMN IF NOT EXISTS settled_date date,
  ADD COLUMN IF NOT EXISTS final_agreement_document_id uuid
    REFERENCES public.negotiation_documents(id) ON DELETE SET NULL;
