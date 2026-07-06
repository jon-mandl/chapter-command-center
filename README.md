# Chapter Command Center

A web app for trade-association chapter managers (designed for NECA chapter use) to
manage labor-contract negotiations, grievances, member companies, committees,
workforce hours, documents, and chapter settings.

The product is craft-agnostic by design: classifications, fund/component
labels, and workflow stages are configurable so the same app works for
electrical (NECA/IBEW), mechanical, sheet metal, or any similar building-trades
chapter.

## Tech stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript |
| Build tool | Vite 8 |
| Backend | Supabase (Postgres + Auth + Storage + Edge Functions) |
| Excel import | ExcelJS (dynamic import) |
| Styling | Inline styles via a shared token file (`src/lib/ui.ts`) |
| Hosting | Vercel (auto-deploys `main`) |

No state-management library, no UI framework. The app uses React local state
plus two contexts: `ToastProvider` (notifications) and `UserSettingsProvider`
(current user, role, and chapter scoping).

## Prerequisites

- Node.js 20+ and npm
- A Supabase project (free tier works for development)

## Local setup

```bash
# 1. Clone and install
git clone <repo-url>
cd chapter-command-center
npm install

# 2. Configure Supabase
cp .env.example .env.local
# Edit .env.local and fill in your Supabase URL + anon key
# (Supabase Dashboard → Project Settings → API)

# 3. Run the dev server
npm run dev
# Visit http://localhost:5173
```

Access is invite-only — there is no public sign-up form. An admin creates
chapters and invites users from **User Management** (the `invite-user` Edge
Function sends the email and applies the chapter/role on acceptance). New
non-admin users see a "pending chapter assignment" screen until an admin
assigns them a chapter, then complete a one-time profile form.

## Available scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server with hot-reload |
| `npm run build` | Type-check (`tsc -b`) then build the production bundle into `dist/` |
| `npm run preview` | Serve the built `dist/` locally to verify the production build |
| `npm run lint` | Run ESLint |

## Database schema (current)

The app expects these tables (all in `public`, all with Row Level Security
enabled). The Supabase project this codebase points at is configured via
`.env.local`. The schema is versioned in `supabase/migrations/` — see
`supabase/MIGRATIONS.md` for the workflow (write a timestamped `.sql` file,
apply it to the live project, commit it). Never change the schema through the
dashboard without also committing a migration.

Core tables:

- `chapters` — one row per chapter (tenant)
- `local_unions` — local unions belonging to a chapter
- `negotiation_cycles` — bargaining cycles (one per CBA negotiation)
- `negotiation_sessions` — bargaining sessions within a cycle
- `session_attendees` — who attended each session, by side
- `proposals` — articles/items being negotiated within a cycle
- `proposal_positions` — Management/Labor positions on each proposal over time
- `grievances` — grievance cases
- `grievance_documents` — file attachments on grievances
- `member_companies` — employer directory
- `committees` + `committee_members` — joint committees and their members
- `workforce_hours` — monthly hours by company / local union
- `wage_packages` + `wage_components` — wage/benefit packages with line items
- `documents` — chapter-wide document storage (paired with the private `documents` Storage bucket)
- `negotiation_documents` — files attached to a negotiation cycle (paired with the `negotiation-documents` bucket)
- `deadlines` — chapter calendar of deadlines and milestones (no UI yet — planned)
- `activity_log` — append-only audit trail (no UI yet — planned)
- `pending_invites` — chapter/role staged for invited users (consumed by the `invite-user` Edge Function)
- `user_settings` — per-user profile, role, and chapter membership

All tables use `uuid` primary keys. Multi-tenancy is by `chapter_id`,
enforced server-side by RLS: every chapter-scoped table checks
`chapter_id = get_user_chapter_id() OR is_admin()`, and the three Storage
buckets carry equivalent per-bucket policies. The client additionally scopes
reads through `applyChapterFilter()` as defense in depth.

## Deployment (Vercel)

The app is a static SPA. To deploy on Vercel:

1. Push this repo to GitHub.
2. Import the repo in Vercel.
3. Framework preset: **Vite**. Build command: `npm run build`. Output: `dist`.
4. Add the environment variables from `.env.example` in **Project Settings → Environment Variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy.

For other static hosts (Netlify, Cloudflare Pages, GitHub Pages with a custom
domain): point them at `dist/` after `npm run build`, set the env vars in
their respective UIs, and configure SPA fallback to `index.html`.

## Project layout

```
src/
├── App.tsx               # Top-level layout, sidebar, page switching, auth gate
├── main.tsx              # Entry point — mounts ToastProvider + UserSettingsProvider + App
├── index.css             # Global resets, focus outline, responsive utility classes
├── lib/
│   ├── supabase.ts       # Supabase client (reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
│   ├── types.ts          # TypeScript types mirroring the Supabase schema
│   ├── ui.ts             # Shared style tokens + formatDate/formatMoney/localUnionLabel
│   ├── useUserSettings.tsx # Current user, role, chapter scoping, applyChapterFilter()
│   ├── toast.tsx         # ToastProvider + useToast()
│   ├── errors.ts         # describeError() — human-readable Supabase errors
│   ├── storage.ts        # Bucket config, upload validation, signed download URLs
│   ├── negotiations.ts   # Shared negotiation queries (classifications, cycle stats)
│   ├── negotiationReport.ts # Print-ready negotiation report builder (Member/Committee editions)
│   ├── serviceCharge.ts  # NECA service-charge calculation (pure math)
│   ├── hoursImport.ts    # Excel/CSV workforce-hours import parsing
│   ├── comparison-utils.ts # Formatters for the Comparison Sheet
│   ├── usStates.ts       # US state list for address forms
│   └── ConfirmDialog.tsx # Reusable confirmation modal for destructive actions
├── components/
│   ├── CloseOutModal.tsx      # Negotiation Close Out wizard (settle + lock)
│   ├── ExportReportModal.tsx  # Report edition/section picker + file downloads
│   └── comparison/            # Comparison Sheet (shell, economic + language grids)
└── pages/
    ├── Login.tsx              # Email/password sign-in + forgot password (invite-only; no sign-up)
    ├── SetNewPassword.tsx     # Invite acceptance + password recovery completion
    ├── ProfileCompletion.tsx  # One-time post-invite profile form
    ├── Dashboard.tsx          # Command Center home page
    ├── Negotiations.tsx       # Negotiation list + create/delete + status filters
    ├── NegotiationDetail.tsx  # Overview / Dashboard / Session Log / Proposals / Comparison Sheet / Documents
    ├── Grievances.tsx         # Grievance lifecycle + attachments
    ├── LocalUnions.tsx        # Local unions, wage packages, wage components
    ├── Members.tsx            # Member Hub tab router
    ├── MembersDirectory.tsx   # Employer directory
    ├── MembersCommittees.tsx  # Joint committees and their members
    ├── MembersHours.tsx       # Workforce hours by month + Excel/CSV import
    ├── ImportHoursModal.tsx   # Hours/payroll import wizard
    ├── MembersServiceCharge.tsx # NECA service-charge calculator
    ├── Documents.tsx          # Document vault (Supabase Storage)
    ├── AdminUsers.tsx         # Admin: chapters, invites, user management
    └── Settings.tsx           # Profile, account info, password change
```

### Code conventions

- TypeScript strict mode (via `tsconfig.app.json` references).
- No `any` types. Use the typed schema in `src/lib/types.ts`.
- Inline styles, never local re-definitions of design tokens — import from
  `lib/ui.ts` (`btnPrimary`, `btnSecondary`, `btnDanger`, `inputStyle`, etc.).
- Every Supabase mutation surfaces failures to the user via the toast system.
  Use `toast.error(describeError(err))` rather than swallowing the error.
- Destructive actions (delete, archive, lock) must route through `ConfirmDialog`.

## Roles and multi-chapter isolation

Every authenticated user has a `user_settings` row (created automatically by a
database trigger) with a `role` and a `chapter_id`. Two roles:

- **admin** — sees all chapters and all rows. Database RLS bypasses
  chapter-scoping via an `is_admin()` helper. Admins also see a "Viewing as"
  chapter switcher in the sidebar to scope the UI to a single chapter at a
  time (purely a client-side filter; it does not change their own
  `user_settings.chapter_id`). Because admin is global, only the vendor/owner
  should hold it — customer staff get **user**.
- **user** — scoped to their assigned chapter by RLS.

New non-admin users land on a "pending chapter assignment" screen until an
admin assigns them a chapter in **User Management**. There is no self-service
chapter picker by design — admins assign chapters.

Email addresses live in `auth.users` and are not readable from the client.
Users identify themselves to administrators via the `display_name` field on
their `user_settings` row (editable under **Settings → Profile**).

## Status & known gaps

- File storage uses three private Supabase Storage buckets — `documents`,
  `grievance-documents`, and `negotiation-documents` — all chapter-scoped by
  RLS, capped at 50 MB per file, and downloaded via short-lived signed URLs.
- The `deadlines` and `activity_log` tables exist but have no UI yet.
- No automated tests and no CI pipeline yet (lint and build are run manually
  and are currently clean — keep them that way).

## Roadmap

- CI (GitHub Actions: typecheck, lint, build on every push)
- Custom SMTP for auth emails, Supabase Pro plan + backup/restore runbook,
  Terms of Service + Privacy Policy (pre-customer launch items)
- Table sorting/pagination at scale; global search
- Audit log surfacing (`activity_log`), deadline reminders (`deadlines`)
- Billing + self-serve signup/provisioning (when demand justifies)

## License

Proprietary. Not for redistribution.
