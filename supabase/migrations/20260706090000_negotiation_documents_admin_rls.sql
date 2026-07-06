-- The negotiation_documents table policies and the negotiation-documents
-- storage policies were created without the is_admin() fallback that every
-- other chapter-scoped policy in the schema has. Result: admins (whose own
-- chapter_id differs from the cycle's chapter, or is NULL) hit
-- "new row violates row-level security policy" when uploading a negotiation
-- document. Recreate all six policies with the standard
-- "chapter match OR is_admin()" pattern.

-- ── Table: public.negotiation_documents ─────────────────────────────────────

DROP POLICY IF EXISTS "chapter members can read negotiation documents" ON public.negotiation_documents;
CREATE POLICY "chapter members can read negotiation documents"
  ON public.negotiation_documents FOR SELECT TO authenticated
  USING (chapter_id = get_user_chapter_id() OR is_admin());

DROP POLICY IF EXISTS "chapter members can insert negotiation documents" ON public.negotiation_documents;
CREATE POLICY "chapter members can insert negotiation documents"
  ON public.negotiation_documents FOR INSERT TO authenticated
  WITH CHECK (chapter_id = get_user_chapter_id() OR is_admin());

DROP POLICY IF EXISTS "chapter members can delete negotiation documents" ON public.negotiation_documents;
CREATE POLICY "chapter members can delete negotiation documents"
  ON public.negotiation_documents FOR DELETE TO authenticated
  USING (chapter_id = get_user_chapter_id() OR is_admin());

-- ── Storage: negotiation-documents bucket ────────────────────────────────────

DROP POLICY IF EXISTS "chapter members can read negotiation documents" ON storage.objects;
CREATE POLICY "chapter members can read negotiation documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'negotiation-documents'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT negotiation_cycles.id::text FROM public.negotiation_cycles
        WHERE negotiation_cycles.chapter_id = get_user_chapter_id()
      )
      OR is_admin()
    )
  );

DROP POLICY IF EXISTS "chapter members can upload negotiation documents" ON storage.objects;
CREATE POLICY "chapter members can upload negotiation documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'negotiation-documents'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT negotiation_cycles.id::text FROM public.negotiation_cycles
        WHERE negotiation_cycles.chapter_id = get_user_chapter_id()
      )
      OR is_admin()
    )
  );

DROP POLICY IF EXISTS "chapter members can delete negotiation documents" ON storage.objects;
CREATE POLICY "chapter members can delete negotiation documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'negotiation-documents'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT negotiation_cycles.id::text FROM public.negotiation_cycles
        WHERE negotiation_cycles.chapter_id = get_user_chapter_id()
      )
      OR is_admin()
    )
  );
