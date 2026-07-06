# Database Migrations

## How This Works

All schema changes are tracked as numbered SQL files in `supabase/migrations/`.
The live Supabase project is `yjwttrfpkrorzabcghru`.

### File naming
```
YYYYMMDDHHMMSS_short_description.sql
```
Example: `20260615120000_add_documents_notes_column.sql`

### To make a schema change

1. Create a new `.sql` file in this directory with today's timestamp.
2. Write the DDL change (ALTER TABLE, CREATE TABLE, CREATE INDEX, etc.).
3. Apply it to the live project using the Supabase MCP tool `apply_migration`.
4. Commit the file to Git.

**Never edit an existing migration file.** If you need to undo something, write a new migration that reverses it.

### To apply a migration to the live database

Using Claude with the Supabase MCP:
```
Apply migration <filename> to project yjwttrfpkrorzabcghru
```

Or using the Supabase CLI (after `supabase link`):
```
npx supabase db push
```

---

## Migration History

| Version | Name | What it does |
|---|---|---|
| 20260528152226 | initial_schema | Creates all base tables |
| 20260528160126 | add_activity_log_and_hours_company_fk | Adds activity_log, workforce_hours company FK |
| 20260528170108 | rls_chapter_isolation | Adds RLS policies for chapter isolation |
| 20260528170430 | user_provisioning_trigger | Auto-creates user_settings on signup |
| 20260528170725 | admin_role_system | Adds is_admin() helper function |
| 20260529123730 | invite_system | Adds pending_invites table |
| 20260529131718 | user_profile_fields | Adds profile fields to user_settings |
| 20260529131727 | trigger_capture_email | Captures auth email into user_settings |
| 20260529191535 | simplify_roles_step1_drop_constraint | Drops old role constraint, adds admin/user |
| 20260601130900 | add_priority_to_proposals | Adds priority boolean to proposals |
| 20260601134033 | proposal_overhaul_and_cycle_fields | Adds economic/language fields to proposals, cycle metadata |
| 20260601000000 | baseline_schema | **Local snapshot** — full schema as of 2026-06-01 (not applied to live DB, documentation only) |
| 20260601000001 | add_negotiation_documents | Adds negotiation_documents table |
| 20260702000000 | user_settings_cascade_delete | Cascade delete for user_settings |
| 20260702130000 | add_gpep_and_discount_tier | Adds workforce_hours.gross_payroll (GPEP) and member_companies.discount_tier for service charge |
| 20260702160000 | negotiation_closeout | Adds negotiation_cycles.settled_date and final_agreement_document_id for the Close Out flow |
| 20260706090000 | negotiation_documents_admin_rls | Adds the missing is_admin() fallback to the negotiation_documents table and negotiation-documents storage policies (admins couldn't upload) |

---

## Baseline File Note

`20260601000000_baseline_schema.sql` is a complete schema snapshot created for
documentation and disaster recovery purposes. It reflects the exact state of the
database after all 11 migrations above. Use it to recreate the schema on a
fresh Supabase project if ever needed — do NOT run it against the existing
production database.
