-- ─── negotiation_documents table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.negotiation_documents (
  id             uuid DEFAULT uuid_generate_v4() NOT NULL,
  cycle_id       uuid NOT NULL REFERENCES public.negotiation_cycles(id) ON DELETE CASCADE,
  chapter_id     uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  file_name      text NOT NULL,
  file_path      text NOT NULL,
  file_size      bigint,
  mime_type      text,
  role           text CHECK (role IN ('opening_letter','meeting_minutes','final_agreement','arbitration','proposal','other')) DEFAULT 'other',
  notes          text,
  uploaded_at    timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.negotiation_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chapter members can read negotiation documents"
  ON public.negotiation_documents FOR SELECT
  USING (chapter_id = public.get_user_chapter_id());

CREATE POLICY "chapter members can insert negotiation documents"
  ON public.negotiation_documents FOR INSERT
  WITH CHECK (chapter_id = public.get_user_chapter_id());

CREATE POLICY "chapter members can delete negotiation documents"
  ON public.negotiation_documents FOR DELETE
  USING (chapter_id = public.get_user_chapter_id());

-- ─── Index ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS negotiation_documents_cycle_id_idx
  ON public.negotiation_documents (cycle_id);

-- ─── Storage bucket ──────────────────────────────────────────────────────────
-- Run once against the live project; bucket must be created via the Dashboard
-- or INSERT into storage.buckets if the project owner has access.
--
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES (
--   'negotiation-documents', 'negotiation-documents', false, 52428800,
--   ARRAY['application/pdf','application/msword',
--         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
--         'application/vnd.ms-excel',
--         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
--         'application/vnd.ms-powerpoint',
--         'application/vnd.openxmlformats-officedocument.presentationml.presentation',
--         'text/plain','text/csv','image/png','image/jpeg']
-- ) ON CONFLICT (id) DO NOTHING;

-- ─── Storage RLS ─────────────────────────────────────────────────────────────
CREATE POLICY "chapter members can upload negotiation documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'negotiation-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.negotiation_cycles
      WHERE chapter_id = public.get_user_chapter_id()
    )
  );

CREATE POLICY "chapter members can read negotiation documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'negotiation-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.negotiation_cycles
      WHERE chapter_id = public.get_user_chapter_id()
    )
  );

CREATE POLICY "chapter members can delete negotiation documents"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'negotiation-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.negotiation_cycles
      WHERE chapter_id = public.get_user_chapter_id()
    )
  );
