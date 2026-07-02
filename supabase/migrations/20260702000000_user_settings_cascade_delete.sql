-- user_settings.user_id had no foreign key to auth.users, so deleting a user
-- (via the invite-user Edge Function or the Supabase dashboard) left an
-- orphaned user_settings row that still rendered as a "ghost" user in the
-- Admin > User Management page. Adding an explicit FK with ON DELETE CASCADE
-- guarantees cleanup regardless of which path deletes the auth user.

-- Remove any rows already orphaned by a prior deletion before adding the FK,
-- otherwise the ADD CONSTRAINT below will fail.
DELETE FROM public.user_settings us
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users u WHERE u.id = us.user_id
);

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
