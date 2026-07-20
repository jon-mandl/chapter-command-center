# CLAUDE.md — Chapter Command Center (web app)

Read this before writing any code in this repo.

> **Important:** the CLAUDE.md one folder up (in `Special Project/`) describes a
> **different product** — the Electron + SQLite desktop app in
> `neca-ibew-tracker/`. None of its rules (IPC handlers, `window.api`,
> `database.ts`, `is.dev`) apply here. This file governs this repo.

## What this app is

A multi-tenant **web app** for trade-association chapter managers: labor-contract
negotiations (sessions, proposals, comparison sheet, close-out, report export),
grievances, member companies, committees, workforce hours + NECA service charge,
documents, and user/chapter administration.

- **Stack:** React 19 + TypeScript + Vite 8. Backend is **Supabase**
  (Postgres + Auth + Storage + one Edge Function, `invite-user`). No router
  library — `App.tsx` switches on a `Page` union. No state library — local
  state + two contexts (`ToastProvider`, `UserSettingsProvider`).
- **Hosting:** Vercel, auto-deploys every push to `main`. Supabase project ref:
  `yjwttrfpkrorzabcghru`.
- **Auth:** invite-only. Admins create chapters and invite users; there is no
  public sign-up.

## Developer context

The owner (Jonathan) is **non-technical** and builds exclusively with Claude.
Explain what you're doing and why in plain English before coding. Don't assume
familiarity with libraries or concepts. Prefer simple, readable code. Ask
before making large assumptions. **Do not add dependencies without explaining
why and getting confirmation.**

## How to run

```bash
npm run dev      # Vite dev server at http://localhost:5173
npm run build    # tsc -b + vite build (must stay clean)
npm run lint     # eslint (currently 0 errors — keep it that way)
```

Env vars live in `.env.local` (see `.env.example`): `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY` (anon key only — never the service-role key).

## Conventions (follow existing patterns)

1. Style tokens come from `src/lib/ui.ts` (`btnPrimary`, `inputStyle`, `card`,
   `errorBox`, `NEG_STATUS_COLORS`, `formatDate`, …). Never redefine them
   locally; add new shared tokens there.
2. Every Supabase mutation surfaces failures: `toast.error(describeError(err))`
   (from `src/lib/toast.tsx` / `src/lib/errors.ts`). Never swallow errors.
3. Destructive actions route through `src/lib/ConfirmDialog.tsx`.
4. Chapter scoping: run chapter-scoped reads through `applyChapterFilter()`
   from `src/lib/useUserSettings.tsx`. RLS is the real boundary — every table
   and storage bucket is chapter-scoped with an `is_admin()` fallback.
5. **Schema changes:** write a timestamped file in `supabase/migrations/`,
   apply it to the live project (Supabase MCP `apply_migration` or
   `npx supabase db push`), update `supabase/MIGRATIONS.md`, commit the file.
   Never dashboard-only changes. Never edit an applied migration.
6. Exports/HTML generation must escape all user strings (see `esc()` in
   `src/lib/negotiationReport.ts`).
7. Modals: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, Escape to
   close. Tables: `scope="col"` on `<th>`. No emojis in UI — inline SVG icons.
8. TypeScript: no `any` without a comment explaining why. Types mirror the
   schema in `src/lib/types.ts`.

## Testing / verification

Unit tests (Vitest) cover the pure modules in `src/lib` — run `npm test`.
When changing `serviceCharge.ts`, `hoursImport.ts`, `directoryImport.ts`, or
`errors.ts`, update their co-located `*.test.ts` files too. After changes:
`npm run build`, `npm run lint`, and `npm test` must pass (CI runs all three
on every push/PR to `main`), then verify in the running app (`npm run dev`).
Anything pushed to `main` goes to production — verify before pushing.

The `invite-user` Edge Function source lives at
`supabase/functions/invite-user/index.ts`. Editing it does NOT deploy it —
redeploy explicitly with `npx supabase functions deploy invite-user`.
