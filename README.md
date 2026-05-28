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
| Backend | Supabase (Postgres + Auth + Storage) |
| Charts | Recharts |
| Styling | Inline styles via a shared token file (`src/lib/ui.ts`) |
| Hosting (recommended) | Vercel |

No state-management library, no UI framework. The app uses React local state
and a single React context (`ToastProvider`) for in-app notifications.

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

On first sign-up, the app will create a default chapter (`"My Chapter"`) for
the new user and link it to their account via the `user_settings` table. You
can rename the chapter under Settings → General.

## Available scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server with hot-reload |
| `npm run build` | Type-check (`tsc -b`) then build the production bundle into `dist/` |
| `npm run preview` | Serve the built `dist/` locally to verify the production build |
| `npm run lint` | Run ESLint |

## Database schema (current)

The app expects these tables (all in `public`, all with Row Level Security
enabled). The Supabase project ID this codebase points at is configured via
`.env.local`; the schema is *not* yet versioned in this repo — schema changes
are applied directly through the Supabase dashboard or CLI. Adding a
`supabase/migrations/` directory to lock the schema is on the roadmap.

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
- `documents` — chapter-wide document storage (paired with a Supabase Storage bucket — not yet created)
- `deadlines` — chapter calendar of deadlines and milestones
- `activity_log` — append-only audit trail
- `user_settings` — per-user preferences and chapter membership

All tables use `uuid` primary keys. Multi-tenancy is by `chapter_id`. RLS
policies are currently `allow authenticated full access` — that means the app
is effectively single-tenant for now and should be tightened before letting
multiple chapters share the same Supabase project.

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
├── main.tsx              # Entry point — mounts ToastProvider + App
├── index.css             # Global resets and focus-visible outline
├── lib/
│   ├── supabase.ts       # Supabase client (reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
│   ├── types.ts          # TypeScript types mirroring the Supabase schema
│   ├── ui.ts             # Shared style tokens (colors, buttons, inputs, formatDate)
│   ├── useChapter.ts     # Hook that resolves the current user's chapter
│   ├── toast.tsx         # ToastProvider + useToast() + describeError() helper
│   └── ConfirmDialog.tsx # Reusable confirmation modal for destructive actions
└── pages/
    ├── Login.tsx              # Email/password sign-in, sign-up, forgot password
    ├── SetNewPassword.tsx     # Password recovery completion screen
    ├── Dashboard.tsx          # Command Center home page
    ├── Negotiations.tsx       # Negotiation list + create + delete
    ├── NegotiationDetail.tsx  # Per-cycle Overview / Session Log / Proposals
    ├── Grievances.tsx         # Grievance lifecycle + attachments
    ├── LocalUnions.tsx        # Local unions, wage packages, wage components
    ├── Members.tsx            # Member Hub tab router
    ├── MembersDirectory.tsx   # Employer directory
    ├── MembersCommittees.tsx  # Joint committees and their members
    ├── MembersHours.tsx       # Workforce hours by month
    ├── MembersServiceCharge.tsx # Per-company hours summary
    ├── Documents.tsx          # Document vault (Supabase Storage)
    └── Settings.tsx           # Chapter name + password change
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
database trigger on sign-up) with a `role` and a `chapter_id`. Three roles:

- **admin** — sees all chapters and all rows. Database RLS bypasses
  chapter-scoping via an `is_admin()` helper. Admins also see a "Viewing as"
  chapter switcher in the sidebar to scope the UI to a single chapter at a
  time (purely a client-side filter; it does not change their own
  `user_settings.chapter_id`).
- **manager** / **member** — scoped to their assigned chapter by RLS. The two
  roles render the same UI today; future capability differences are planned.

New non-admin users land on a "pending chapter assignment" screen until an
admin assigns them a chapter in **User Management**. There is no self-service
chapter picker by design — admins assign chapters.

Email addresses live in `auth.users` and are not readable from the client.
Users identify themselves to administrators via the `display_name` field on
their `user_settings` row (editable under **Settings → Profile**).

## Status & known gaps

- File storage uses two private Supabase Storage buckets, `documents` and
  `grievance-documents`. Both cap files at 50 MB and accept PDFs, Office
  docs, common images, CSV, and plain text. Document and grievance
  attachment uploads use short-lived signed URLs for download.
- The schema lives only in the Supabase dashboard — committing
  `supabase/migrations/` so the schema can be reproduced from scratch is on
  the roadmap.

## Roadmap

Tier 1 (in flight): commit schema migrations to git.
Tier 2: CSV/Excel export, audit log surfacing, search,
sort/filter/pagination on tables.
Tier 3: multi-user invites, branding/white-label, email notifications for
deadlines.

See `AUDIT.md` at the repo root for the full audit and prioritised action plan.

## License

Proprietary. Not for redistribution.
