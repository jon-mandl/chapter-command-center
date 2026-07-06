-- Drop the pre-three-position-model proposal columns, preserving their
-- content in the new model first:
--   current_language -> current_text (the modern "current contract text")
--   proposed_change  -> appended to notes (shown in the rationale accordion;
--                       nothing in the UI read proposed_change, so this makes
--                       previously-invisible text visible again)
--   sub_status       -> dropped outright (NULL on every row in production)

UPDATE public.proposals
SET current_text = current_language
WHERE current_text IS NULL AND current_language IS NOT NULL;

UPDATE public.proposals
SET notes = CASE
  WHEN notes IS NULL OR notes = ''
    THEN 'Proposed change (imported from earlier version): ' || proposed_change
  ELSE notes || E'\n\nProposed change (imported from earlier version): ' || proposed_change
END
WHERE proposed_change IS NOT NULL;

ALTER TABLE public.proposals
  DROP COLUMN IF EXISTS current_language,
  DROP COLUMN IF EXISTS proposed_change,
  DROP COLUMN IF EXISTS sub_status;
