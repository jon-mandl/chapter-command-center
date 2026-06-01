-- =============================================================================
-- BASELINE SCHEMA SNAPSHOT — 2026-06-01
-- =============================================================================
-- This file captures the full public schema as it existed after all migrations
-- through 20260601134033_proposal_overhaul_and_cycle_fields.
--
-- HOW TO USE THIS FILE:
--   - For a brand-new Supabase project, run this file once to create all tables,
--     constraints, RLS policies, and helper functions from scratch.
--   - For the existing production project (yjwttrfpkrorzabcghru), this file is
--     documentation only — do NOT re-run it against the live database.
--   - All future schema changes must be added as NEW files in this directory
--     using the naming convention: YYYYMMDDHHMMSS_description.sql
-- =============================================================================

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Helper Functions (used by RLS policies) ─────────────────────────────────

-- Returns the chapter_id from user_settings for the currently authenticated user.
CREATE OR REPLACE FUNCTION public.get_user_chapter_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT chapter_id FROM public.user_settings WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Returns true if the currently authenticated user has the 'admin' role.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_settings
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

-- ─── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chapters (
  id          uuid DEFAULT uuid_generate_v4() NOT NULL,
  name        text NOT NULL,
  city        text,
  state       text,
  created_at  timestamptz DEFAULT now() NOT NULL,
  updated_at  timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.user_settings (
  id                   uuid DEFAULT uuid_generate_v4() NOT NULL,
  user_id              uuid NOT NULL,
  chapter_id           uuid REFERENCES public.chapters(id),
  display_name         text,
  role                 text DEFAULT 'user' CHECK (role = ANY (ARRAY['admin','user'])),
  theme                text DEFAULT 'light' CHECK (theme = ANY (ARRAY['light','dark','system'])),
  notifications_enabled boolean DEFAULT true,
  created_at           timestamptz DEFAULT now() NOT NULL,
  updated_at           timestamptz DEFAULT now() NOT NULL,
  email                text,
  phone                text,
  job_title            text,
  company_name         text,
  address_line1        text,
  address_line2        text,
  city                 text,
  state                text,
  zip                  text,
  profile_completed    boolean DEFAULT false NOT NULL,
  PRIMARY KEY (id),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS public.local_unions (
  id           uuid DEFAULT uuid_generate_v4() NOT NULL,
  chapter_id   uuid NOT NULL REFERENCES public.chapters(id),
  local_number integer NOT NULL,
  jurisdiction text,
  city         text,
  state        text,
  created_at   timestamptz DEFAULT now() NOT NULL,
  updated_at   timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.wage_packages (
  id              uuid DEFAULT uuid_generate_v4() NOT NULL,
  local_union_id  uuid NOT NULL REFERENCES public.local_unions(id),
  classification  text DEFAULT 'Journeyman' NOT NULL,
  effective_date  date,
  expiration_date date,
  created_at      timestamptz DEFAULT now() NOT NULL,
  updated_at      timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.wage_components (
  id               uuid DEFAULT uuid_generate_v4() NOT NULL,
  wage_package_id  uuid NOT NULL REFERENCES public.wage_packages(id),
  component_code   text NOT NULL,
  component_name   text NOT NULL,
  category         text NOT NULL CHECK (category = ANY (ARRAY['wage','benefit','deduction'])),
  amount           numeric DEFAULT 0 NOT NULL,
  unit             text DEFAULT '$/hr' NOT NULL CHECK (unit = ANY (ARRAY['$/hr','% of gross','$/wk'])),
  is_locked        boolean DEFAULT false NOT NULL,
  sort_order       integer DEFAULT 0 NOT NULL,
  notes            text,
  created_at       timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.negotiation_cycles (
  id                     uuid DEFAULT uuid_generate_v4() NOT NULL,
  chapter_id             uuid NOT NULL REFERENCES public.chapters(id),
  local_union_id         uuid NOT NULL REFERENCES public.local_unions(id),
  name                   text NOT NULL,
  status                 text DEFAULT 'Active' NOT NULL CHECK (status = ANY (ARRAY['Active','Settled','Archived'])),
  cba_expiration_date    date,
  proposed_effective_date date,
  classification         text DEFAULT 'Journeyman' NOT NULL,
  notes                  text,
  created_at             timestamptz DEFAULT now() NOT NULL,
  updated_at             timestamptz DEFAULT now() NOT NULL,
  neca_chapter_division  text,
  unit_size              integer,
  annual_hours           integer,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.negotiation_sessions (
  id           uuid DEFAULT uuid_generate_v4() NOT NULL,
  cycle_id     uuid NOT NULL REFERENCES public.negotiation_cycles(id),
  session_date date NOT NULL,
  location     text,
  notes        text,
  created_at   timestamptz DEFAULT now() NOT NULL,
  updated_at   timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.session_attendees (
  id         uuid DEFAULT uuid_generate_v4() NOT NULL,
  session_id uuid NOT NULL REFERENCES public.negotiation_sessions(id),
  name       text NOT NULL,
  role       text NOT NULL CHECK (role = ANY (ARRAY['Management','Labor'])),
  title      text,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.proposals (
  id                uuid DEFAULT uuid_generate_v4() NOT NULL,
  cycle_id          uuid NOT NULL REFERENCES public.negotiation_cycles(id),
  title             text NOT NULL,
  category          text NOT NULL CHECK (category = ANY (ARRAY['Economic','Language'])),
  article_reference text,
  current_language  text,
  proposed_change   text,
  proposed_by       text CHECK (proposed_by IS NULL OR proposed_by = ANY (ARRAY['NECA','IBEW','Union','Management','Joint'])),
  status            text DEFAULT 'Open' NOT NULL CHECK (status = ANY (ARRAY['Open','TA','Withdrawn','Rejected'])),
  sort_order        integer DEFAULT 0 NOT NULL,
  notes             text,
  created_at        timestamptz DEFAULT now() NOT NULL,
  updated_at        timestamptz DEFAULT now() NOT NULL,
  priority          boolean DEFAULT false NOT NULL,
  section           text,
  unit              text,
  format            text,
  current_value     numeric,
  union_value       numeric,
  mgmt_value        numeric,
  cost_union        numeric,
  cost_mgmt         numeric,
  current_text      text,
  union_change      boolean DEFAULT false,
  union_text        text,
  mgmt_change       boolean DEFAULT false,
  mgmt_text         text,
  sub_status        text,
  rationale         text,
  last_movement     text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.proposal_positions (
  id             uuid DEFAULT uuid_generate_v4() NOT NULL,
  proposal_id    uuid NOT NULL REFERENCES public.proposals(id),
  session_id     uuid REFERENCES public.negotiation_sessions(id),
  side           text NOT NULL CHECK (side = ANY (ARRAY['Management','Labor'])),
  position_text  text NOT NULL,
  amount         numeric,
  unit           text CHECK (unit = ANY (ARRAY['$/hr','% of gross','$/wk'])),
  position_date  date DEFAULT CURRENT_DATE NOT NULL,
  created_at     timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.grievances (
  id               uuid DEFAULT uuid_generate_v4() NOT NULL,
  chapter_id       uuid NOT NULL REFERENCES public.chapters(id),
  grievance_number text,
  title            text NOT NULL,
  employer_name    text,
  employer_id      uuid REFERENCES public.member_companies(id),
  filed_date       date DEFAULT CURRENT_DATE NOT NULL,
  stage            text DEFAULT 'Filed' NOT NULL CHECK (stage = ANY (ARRAY['Filed','LMC','CIR','Arbitration','Closed','Withdrawn'])),
  description      text,
  resolution       text,
  resolved_date    date,
  is_locked        boolean DEFAULT false NOT NULL,
  local_union_id   uuid REFERENCES public.local_unions(id),
  created_at       timestamptz DEFAULT now() NOT NULL,
  updated_at       timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.grievance_documents (
  id           uuid DEFAULT uuid_generate_v4() NOT NULL,
  grievance_id uuid NOT NULL REFERENCES public.grievances(id),
  file_name    text NOT NULL,
  file_path    text NOT NULL,
  file_size    bigint,
  mime_type    text,
  uploaded_at  timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.member_companies (
  id             uuid DEFAULT uuid_generate_v4() NOT NULL,
  chapter_id     uuid NOT NULL REFERENCES public.chapters(id),
  company_name   text NOT NULL,
  contact_name   text,
  contact_email  text,
  contact_phone  text,
  address        text,
  city           text,
  state          text,
  zip            text,
  status         text DEFAULT 'Active' NOT NULL CHECK (status = ANY (ARRAY['Active','Inactive'])),
  notes          text,
  created_at     timestamptz DEFAULT now() NOT NULL,
  updated_at     timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.committees (
  id          uuid DEFAULT uuid_generate_v4() NOT NULL,
  chapter_id  uuid NOT NULL REFERENCES public.chapters(id),
  name        text NOT NULL,
  description text,
  created_at  timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.committee_members (
  id           uuid DEFAULT uuid_generate_v4() NOT NULL,
  committee_id uuid NOT NULL REFERENCES public.committees(id),
  member_name  text NOT NULL,
  company      text,
  role         text,
  term_start   date,
  term_end     date,
  created_at   timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.documents (
  id          uuid DEFAULT uuid_generate_v4() NOT NULL,
  chapter_id  uuid NOT NULL REFERENCES public.chapters(id),
  file_name   text NOT NULL,
  file_path   text NOT NULL,
  category    text,
  file_size   bigint,
  mime_type   text,
  uploaded_by text,
  uploaded_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.workforce_hours (
  id             uuid DEFAULT uuid_generate_v4() NOT NULL,
  chapter_id     uuid NOT NULL REFERENCES public.chapters(id),
  local_union_id uuid REFERENCES public.local_unions(id),
  company_id     uuid REFERENCES public.member_companies(id),
  report_month   date NOT NULL,
  total_hours    numeric DEFAULT 0 NOT NULL,
  employer_name  text,
  classification text,
  source         text,
  created_at     timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.deadlines (
  id               uuid DEFAULT uuid_generate_v4() NOT NULL,
  chapter_id       uuid NOT NULL REFERENCES public.chapters(id),
  title            text NOT NULL,
  deadline_date    date NOT NULL,
  deadline_type    text DEFAULT 'Other' NOT NULL CHECK (deadline_type = ANY (ARRAY['CBA Expiration','Filing Deadline','Meeting','Report Due','Other'])),
  related_cycle_id uuid REFERENCES public.negotiation_cycles(id),
  notes            text,
  is_complete      boolean DEFAULT false NOT NULL,
  created_at       timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.activity_log (
  id           uuid DEFAULT uuid_generate_v4() NOT NULL,
  chapter_id   uuid NOT NULL REFERENCES public.chapters(id),
  user_id      uuid,
  user_email   text,
  action       text NOT NULL,
  entity_type  text NOT NULL,
  entity_id    uuid,
  entity_label text,
  details      jsonb,
  created_at   timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.pending_invites (
  id          uuid DEFAULT gen_random_uuid() NOT NULL,
  email       text NOT NULL,
  chapter_id  uuid NOT NULL REFERENCES public.chapters(id),
  role        text DEFAULT 'user' NOT NULL CHECK (role = ANY (ARRAY['admin','user'])),
  invited_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id),
  UNIQUE (email)
);

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- All tables use chapter-scoped isolation. Admins can read/write across all
-- chapters. Non-admin users are restricted to their assigned chapter only.

ALTER TABLE public.chapters           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.local_unions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wage_packages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wage_components    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.negotiation_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.negotiation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_attendees  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposals          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grievances         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grievance_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_companies   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.committees         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.committee_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workforce_hours    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deadlines          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_invites    ENABLE ROW LEVEL SECURITY;

-- chapters
CREATE POLICY "Chapter isolation"        ON public.chapters FOR SELECT USING (id = get_user_chapter_id() OR is_admin());
CREATE POLICY "Chapter isolation insert" ON public.chapters FOR INSERT WITH CHECK (id = get_user_chapter_id() OR is_admin());
CREATE POLICY "Chapter isolation update" ON public.chapters FOR UPDATE USING (id = get_user_chapter_id() OR is_admin()) WITH CHECK (id = get_user_chapter_id() OR is_admin());
CREATE POLICY "Chapter isolation delete" ON public.chapters FOR DELETE USING (id = get_user_chapter_id() OR is_admin());
CREATE POLICY "Onboarding chapter list" ON public.chapters FOR SELECT USING (get_user_chapter_id() IS NULL);

-- user_settings
CREATE POLICY "Users can view own settings"      ON public.user_settings FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own settings"    ON public.user_settings FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own settings"    ON public.user_settings FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admin can view all user settings" ON public.user_settings FOR SELECT USING (is_admin());
CREATE POLICY "Admin can update all user settings" ON public.user_settings FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());

-- pending_invites (admin only)
CREATE POLICY "Admin full access" ON public.pending_invites FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Standard chapter-scoped policies for tables with a direct chapter_id column
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'local_unions', 'negotiation_cycles', 'grievances', 'member_companies',
    'committees', 'documents', 'workforce_hours', 'deadlines', 'activity_log'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY "Chapter isolation"        ON public.%I FOR SELECT USING (chapter_id = get_user_chapter_id() OR is_admin());
       CREATE POLICY "Chapter isolation insert" ON public.%I FOR INSERT WITH CHECK (chapter_id = get_user_chapter_id() OR is_admin());
       CREATE POLICY "Chapter isolation update" ON public.%I FOR UPDATE USING (chapter_id = get_user_chapter_id() OR is_admin()) WITH CHECK (chapter_id = get_user_chapter_id() OR is_admin());
       CREATE POLICY "Chapter isolation delete" ON public.%I FOR DELETE USING (chapter_id = get_user_chapter_id() OR is_admin());',
      tbl, tbl, tbl, tbl
    );
  END LOOP;
END;
$$;

-- Tables that join to a chapter via a parent table
CREATE POLICY "Chapter isolation"        ON public.wage_packages FOR SELECT USING (is_admin() OR EXISTS (SELECT 1 FROM public.local_unions lu WHERE lu.id = wage_packages.local_union_id AND lu.chapter_id = get_user_chapter_id()));
CREATE POLICY "Chapter isolation insert" ON public.wage_packages FOR INSERT WITH CHECK (is_admin() OR EXISTS (SELECT 1 FROM public.local_unions lu WHERE lu.id = wage_packages.local_union_id AND lu.chapter_id = get_user_chapter_id()));
CREATE POLICY "Chapter isolation update" ON public.wage_packages FOR UPDATE USING (is_admin() OR EXISTS (SELECT 1 FROM public.local_unions lu WHERE lu.id = wage_packages.local_union_id AND lu.chapter_id = get_user_chapter_id())) WITH CHECK (is_admin() OR EXISTS (SELECT 1 FROM public.local_unions lu WHERE lu.id = wage_packages.local_union_id AND lu.chapter_id = get_user_chapter_id()));
CREATE POLICY "Chapter isolation delete" ON public.wage_packages FOR DELETE USING (is_admin() OR EXISTS (SELECT 1 FROM public.local_unions lu WHERE lu.id = wage_packages.local_union_id AND lu.chapter_id = get_user_chapter_id()));

CREATE POLICY "Chapter isolation"        ON public.wage_components FOR SELECT USING (is_admin() OR EXISTS (SELECT 1 FROM public.wage_packages wp JOIN public.local_unions lu ON lu.id = wp.local_union_id WHERE wp.id = wage_components.wage_package_id AND lu.chapter_id = get_user_chapter_id()));
CREATE POLICY "Chapter isolation insert" ON public.wage_components FOR INSERT WITH CHECK (is_admin() OR EXISTS (SELECT 1 FROM public.wage_packages wp JOIN public.local_unions lu ON lu.id = wp.local_union_id WHERE wp.id = wage_components.wage_package_id AND lu.chapter_id = get_user_chapter_id()));
CREATE POLICY "Chapter isolation update" ON public.wage_components FOR UPDATE USING (is_admin() OR EXISTS (SELECT 1 FROM public.wage_packages wp JOIN public.local_unions lu ON lu.id = wp.local_union_id WHERE wp.id = wage_components.wage_package_id AND lu.chapter_id = get_user_chapter_id())) WITH CHECK (is_admin() OR EXISTS (SELECT 1 FROM public.wage_packages wp JOIN public.local_unions lu ON lu.id = wp.local_union_id WHERE wp.id = wage_components.wage_package_id AND lu.chapter_id = get_user_chapter_id()));
CREATE POLICY "Chapter isolation delete" ON public.wage_components FOR DELETE USING (is_admin() OR EXISTS (SELECT 1 FROM public.wage_packages wp JOIN public.local_unions lu ON lu.id = wp.local_union_id WHERE wp.id = wage_components.wage_package_id AND lu.chapter_id = get_user_chapter_id()));

CREATE POLICY "Chapter isolation"        ON public.negotiation_sessions FOR SELECT USING (is_admin() OR EXISTS (SELECT 1 FROM public.negotiation_cycles nc WHERE nc.id = negotiation_sessions.cycle_id AND nc.chapter_id = get_user_chapter_id()));
CREATE POLICY "Chapter isolation insert" ON public.negotiation_sessions FOR INSERT WITH CHECK (is_admin() OR EXISTS (SELECT 1 FROM public.negotiation_cycles nc WHERE nc.id = negotiation_sessions.cycle_id AND nc.chapter_id = get_user_chapter_id()));
CREATE POLICY "Chapter isolation update" ON public.negotiation_sessions FOR UPDATE USING (is_admin() OR EXISTS (SELECT 1 FROM public.negotiation_cycles nc WHERE nc.id = negotiation_sessions.cycle_id AND nc.chapter_id = get_user_chapter_id())) WITH CHECK (is_admin() OR EXISTS (SELECT 1 FROM public.negotiation_cycles nc WHERE nc.id = negotiation_sessions.cycle_id AND nc.chapter_id = get_user_chapter_id()));
CREATE POLICY "Chapter isolation delete" ON public.negotiation_sessions FOR DELETE USING (is_admin() OR EXISTS (SELECT 1 FROM public.negotiation_cycles nc WHERE nc.id = negotiation_sessions.cycle_id AND nc.chapter_id = get_user_chapter_id()));

CREATE POLICY "Chapter isolation"        ON public.session_attendees FOR SELECT USING (is_admin() OR EXISTS (SELECT 1 FROM public.negotiation_sessions ns JOIN public.negotiation_cycles nc ON nc.id = ns.cycle_id WHERE ns.id = session_attendees.session_id AND nc.chapter_id = get_user_chapter_id()));
CREATE POLICY "Chapter isolation insert" ON public.session_attendees FOR INSERT WITH CHECK (is_admin() OR EXISTS (SELECT 1 FROM public.negotiation_sessions ns JOIN public.negotiation_cycles nc ON nc.id = ns.cycle_id WHERE ns.id = session_attendees.session_id AND nc.chapter_id = get_user_chapter_id()));
CREATE POLICY "Chapter isolation update" ON public.session_attendees FOR UPDATE USING (is_admin() OR EXISTS (SELECT 1 FROM public.negotiation_sessions ns JOIN public.negotiation_cycles nc ON nc.id = ns.cycle_id WHERE ns.id = session_attendees.session_id AND nc.chapter_id = get_user_chapter_id())) WITH CHECK (is_admin() OR EXISTS (SELECT 1 FROM public.negotiation_sessions ns JOIN public.negotiation_cycles nc ON nc.id = ns.cycle_id WHERE ns.id = session_attendees.session_id AND nc.chapter_id = get_user_chapter_id()));
CREATE POLICY "Chapter isolation delete" ON public.session_attendees FOR DELETE USING (is_admin() OR EXISTS (SELECT 1 FROM public.negotiation_sessions ns JOIN public.negotiation_cycles nc ON nc.id = ns.cycle_id WHERE ns.id = session_attendees.session_id AND nc.chapter_id = get_user_chapter_id()));

CREATE POLICY "Chapter isolation"        ON public.proposals FOR SELECT USING (is_admin() OR EXISTS (SELECT 1 FROM public.negotiation_cycles nc WHERE nc.id = proposals.cycle_id AND nc.chapter_id = get_user_chapter_id()));
CREATE POLICY "Chapter isolation insert" ON public.proposals FOR INSERT WITH CHECK (is_admin() OR EXISTS (SELECT 1 FROM public.negotiation_cycles nc WHERE nc.id = proposals.cycle_id AND nc.chapter_id = get_user_chapter_id()));
CREATE POLICY "Chapter isolation update" ON public.proposals FOR UPDATE USING (is_admin() OR EXISTS (SELECT 1 FROM public.negotiation_cycles nc WHERE nc.id = proposals.cycle_id AND nc.chapter_id = get_user_chapter_id())) WITH CHECK (is_admin() OR EXISTS (SELECT 1 FROM public.negotiation_cycles nc WHERE nc.id = proposals.cycle_id AND nc.chapter_id = get_user_chapter_id()));
CREATE POLICY "Chapter isolation delete" ON public.proposals FOR DELETE USING (is_admin() OR EXISTS (SELECT 1 FROM public.negotiation_cycles nc WHERE nc.id = proposals.cycle_id AND nc.chapter_id = get_user_chapter_id()));

CREATE POLICY "Chapter isolation"        ON public.proposal_positions FOR SELECT USING (is_admin() OR EXISTS (SELECT 1 FROM public.proposals p JOIN public.negotiation_cycles nc ON nc.id = p.cycle_id WHERE p.id = proposal_positions.proposal_id AND nc.chapter_id = get_user_chapter_id()));
CREATE POLICY "Chapter isolation insert" ON public.proposal_positions FOR INSERT WITH CHECK (is_admin() OR EXISTS (SELECT 1 FROM public.proposals p JOIN public.negotiation_cycles nc ON nc.id = p.cycle_id WHERE p.id = proposal_positions.proposal_id AND nc.chapter_id = get_user_chapter_id()));
CREATE POLICY "Chapter isolation update" ON public.proposal_positions FOR UPDATE USING (is_admin() OR EXISTS (SELECT 1 FROM public.proposals p JOIN public.negotiation_cycles nc ON nc.id = p.cycle_id WHERE p.id = proposal_positions.proposal_id AND nc.chapter_id = get_user_chapter_id())) WITH CHECK (is_admin() OR EXISTS (SELECT 1 FROM public.proposals p JOIN public.negotiation_cycles nc ON nc.id = p.cycle_id WHERE p.id = proposal_positions.proposal_id AND nc.chapter_id = get_user_chapter_id()));
CREATE POLICY "Chapter isolation delete" ON public.proposal_positions FOR DELETE USING (is_admin() OR EXISTS (SELECT 1 FROM public.proposals p JOIN public.negotiation_cycles nc ON nc.id = p.cycle_id WHERE p.id = proposal_positions.proposal_id AND nc.chapter_id = get_user_chapter_id()));

CREATE POLICY "Chapter isolation"        ON public.grievance_documents FOR SELECT USING (is_admin() OR EXISTS (SELECT 1 FROM public.grievances g WHERE g.id = grievance_documents.grievance_id AND g.chapter_id = get_user_chapter_id()));
CREATE POLICY "Chapter isolation insert" ON public.grievance_documents FOR INSERT WITH CHECK (is_admin() OR EXISTS (SELECT 1 FROM public.grievances g WHERE g.id = grievance_documents.grievance_id AND g.chapter_id = get_user_chapter_id()));
CREATE POLICY "Chapter isolation update" ON public.grievance_documents FOR UPDATE USING (is_admin() OR EXISTS (SELECT 1 FROM public.grievances g WHERE g.id = grievance_documents.grievance_id AND g.chapter_id = get_user_chapter_id())) WITH CHECK (is_admin() OR EXISTS (SELECT 1 FROM public.grievances g WHERE g.id = grievance_documents.grievance_id AND g.chapter_id = get_user_chapter_id()));
CREATE POLICY "Chapter isolation delete" ON public.grievance_documents FOR DELETE USING (is_admin() OR EXISTS (SELECT 1 FROM public.grievances g WHERE g.id = grievance_documents.grievance_id AND g.chapter_id = get_user_chapter_id()));

CREATE POLICY "Chapter isolation"        ON public.committee_members FOR SELECT USING (is_admin() OR EXISTS (SELECT 1 FROM public.committees c WHERE c.id = committee_members.committee_id AND c.chapter_id = get_user_chapter_id()));
CREATE POLICY "Chapter isolation insert" ON public.committee_members FOR INSERT WITH CHECK (is_admin() OR EXISTS (SELECT 1 FROM public.committees c WHERE c.id = committee_members.committee_id AND c.chapter_id = get_user_chapter_id()));
CREATE POLICY "Chapter isolation update" ON public.committee_members FOR UPDATE USING (is_admin() OR EXISTS (SELECT 1 FROM public.committees c WHERE c.id = committee_members.committee_id AND c.chapter_id = get_user_chapter_id())) WITH CHECK (is_admin() OR EXISTS (SELECT 1 FROM public.committees c WHERE c.id = committee_members.committee_id AND c.chapter_id = get_user_chapter_id()));
CREATE POLICY "Chapter isolation delete" ON public.committee_members FOR DELETE USING (is_admin() OR EXISTS (SELECT 1 FROM public.committees c WHERE c.id = committee_members.committee_id AND c.chapter_id = get_user_chapter_id()));
