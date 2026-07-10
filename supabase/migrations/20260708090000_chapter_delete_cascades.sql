-- Chapter delete support (admin-only feature in User Management).
--
-- Audit of the live database (2026-07-08) found chapter deletion is already
-- cascade-safe everywhere except pending_invites:
--   - Every other chapter_id FK is ON DELETE CASCADE (local_unions,
--     negotiation_cycles, grievances, member_companies, committees,
--     documents, workforce_hours, deadlines, activity_log,
--     negotiation_documents), and user_settings.chapter_id is SET NULL
--     (users of a deleted chapter become Unassigned, not deleted).
--   - All child chains already cascade (wage_packages -> wage_components,
--     negotiation_sessions -> session_attendees, proposals ->
--     proposal_positions, grievance_documents, committee_members).
--
-- This migration brings the one straggler in line so deleting a chapter row
-- cleans up everything. Storage blobs are removed by the app BEFORE the row
-- delete, because DB cascades never touch Storage objects.

ALTER TABLE public.pending_invites
  DROP CONSTRAINT IF EXISTS pending_invites_chapter_id_fkey;
ALTER TABLE public.pending_invites
  ADD CONSTRAINT pending_invites_chapter_id_fkey
  FOREIGN KEY (chapter_id) REFERENCES public.chapters(id) ON DELETE CASCADE;
