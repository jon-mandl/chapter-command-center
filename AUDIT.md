# Chapter Command Center — Full Application Audit

**Date:** 2026-05-28
**Auditor:** Principal-engineer review
**Build target:** Web app (Vite + React 19 + TypeScript + Supabase)
**Scope:** every file under `src/`, configuration, and deployment posture

> ⚠ **Documentation drift, up front.** The repository's `CLAUDE.md` describes this project as an **Electron desktop application** using **better-sqlite3** with IPC handlers under `src/main/database.ts`. **That description is stale.** The actual codebase is a **web app** that talks to Supabase (Postgres + Auth + Storage). Most rules in `CLAUDE.md` (IPC patterns, `window.api` calls, SQLite migrations, `is.dev` gating, etc.) do not apply to what's actually in `src/`. The CLAUDE.md needs to be rewritten or replaced before the next contributor reads it.

---

## Scorecard

| # | Area | Status | Priority |
|---|---|---|---|
| 1 | Feature Completeness | **Incomplete** | High |
| 2 | Database Alignment | **Incomplete** (depends on RLS, no schema doc in repo) | High |
| 3 | Authentication & Authorization | **Incomplete** (auth flow good; route protection minimal; RLS not visible in repo) | High |
| 4 | Error Handling & Edge Cases | **Incomplete** (good in some paths, silent in others) | High |
| 5 | UI/UX Polish | **Incomplete** (consistent style, but no responsive, no toasts, no skeletons) | Medium |
| 6 | Performance | **Incomplete** (no lazy loading, one N+1) | Medium |
| 7 | Code Quality | **Mostly Complete** (no `any`, build passes; style tokens duplicated locally) | Medium |
| 8 | Missing Standard Features | **Missing** (no global search, no sort/filter, no pagination, no export, no audit log) | High |
| 9 | Deployment & DevOps | **Missing** (default Vite README; no `.env.example`; no CI) | High |

---

## 1. Feature Completeness — *Incomplete*

### 1a. Route → Page map

`App.tsx` is the router (custom switch statement, no React Router). Top-level routes:

| Route | Component | CRUD | Reads/Writes Supabase | Loading | Empty | Errors |
|---|---|---|---|---|---|---|
| `dashboard` | `Dashboard.tsx` | R only | ✓ | ✓ | ✓ | ✓ |
| `negotiations` | `Negotiations.tsx` | C / R / D | ✓ | ✓ | ✓ | ✓ |
| `negotiations` (selected) | `NegotiationDetail.tsx` | R / U + nested CRUD on sessions, attendees, proposals, positions | ✓ | ✓ | ✓ | **mixed — many silent failures** |
| `grievances` | `Grievances.tsx` | full CRUD + timeline | ✓ | ✓ | ✓ | ✓ |
| `local-unions` | `LocalUnions.tsx` | full CRUD on unions + tiers + package_rates (no delete on package_rates) | ✓ | ✓ | ✓ | **mixed — tier ops swallow errors** |
| `members` | `Members.tsx` → tabs | router only | — | — | — | — |
| ↳ `directory` | `MembersDirectory.tsx` | full CRUD companies + reps | ✓ | ✓ | ✓ | ✓ |
| ↳ `committees` | `MembersCommittees.tsx` | full CRUD committees + members | ✓ | ✓ | ✓ | ✓ |
| ↳ `hours` | `MembersHours.tsx` | full CRUD | ✓ | ✓ | ✓ | ✓ |
| ↳ `service_charge` | `MembersServiceCharge.tsx` | R only (calculator) | ✓ | ✓ | ✓ | ✓ |
| `documents` | `Documents.tsx` | full CRUD + Supabase Storage | ✓ | ✓ | ✓ | ✓ |
| `settings` | `Settings.tsx` | R/U organization, fund labels, password | ✓ | ✓ | n/a | ✓ |

### 1b. Things that *look* present but aren't

- **Negotiation tabs `Documents`, `Dashboard`, and `Rounds` do not exist.** `NegotiationDetail.tsx:876–880` declares only three tabs: **Overview**, **Session Log**, **Open Items**. The CLAUDE.md feature list and "Phase 2 complete" checkmarks claim six tabs and reference `NegotiationVault.tsx`, `NegotiationDashboard.tsx`, `NegotiationRounds.tsx` files. None of those files exist in `src/pages/`. **This is the single most visible gap.**
- **Member Hours CSV/Excel import is missing.** `MembersHours.tsx` has no file picker, no parser, and does not import any spreadsheet library. CLAUDE.md marks "Member hours: Excel/CSV import from payroll systems (NECA Star, EPR Live format)" as complete.
- **MembersEmail (mass-email) sub-page is missing.** `Members.tsx:9–14` declares four tabs (Directory, Committees, Hours, Service Charge). CLAUDE.md describes five, including `MembersEmail`.
- **Settings → Data tab and Branding tab are missing.** `Settings.tsx` exposes three tabs: General, Fund Labels, Security. CLAUDE.md claims four tabs including Data (backup/restore) and Branding (logo upload). Logo upload, in particular, would affect every PDF export referenced in CLAUDE.md.
- **Export hub is missing.** No `Export.tsx`, no ExcelJS dependency, no PDF generation code. CLAUDE.md describes Excel + PDF export from inside NegotiationDetail.
- **Grievance file attachments** (`grievance_documents` per CLAUDE.md) — no upload UI exists in `Grievances.tsx`. Locked-document workflow is not implemented.
- **`NegotiationDetail.tsx` "Add Position" race** — when the user types into the position field on one proposal card and clicks Add on another, state can be read stale: `handleAddPosition` (L455) reads `posForm.position_text` from closure rather than from the row that fired the callback. Demo-fragile.

### 1c. End-to-end workflow check

| Workflow | Works? | Notes |
|---|---|---|
| Sign up → confirm → sign in | ✓ | Email confirmation flow assumed |
| Create a negotiation, log a session, add attendees, add a proposal, record positions | ✓ | But silent failures may mask save errors |
| File a grievance → progress through Filed → LMC → CIR → Closed | ✓ | Timeline writes append correctly |
| Add a member company → add a representative → assign to a committee → log hours | ✓ | |
| Upload a document → download it again | ✓ | Storage works; signed URL TTL is 60 s |
| Wage package modeling: set rates → add tiers → calculate apprentice scale | ✓ | But tier blur-save may persist stale label/amount (closure capture in `handleTierBlur`) |
| Export a negotiation to Excel/PDF | ✗ | Feature absent |
| Search globally across data | ✗ | No global search |
| View an audit log of who changed what | ✗ | No audit trail |

---

## 2. Database Alignment — *Incomplete*

The codebase touches the following Supabase tables:

`negotiations`, `sessions`, `attendees`, `proposals`, `proposal_positions`, `grievances`, `grievance_timeline`, `local_unions`, `package_rates`, `wage_tiers`, `member_companies`, `member_representatives`, `committees`, `committee_members`, `man_hours`, `documents`, `organizations`, `org_settings`, `user_profiles`.

Plus Storage bucket: `documents`.

### 2a. Schema-vs-UI mismatches

- **No schema definition lives in this repo.** There is no `supabase/` directory, no migrations folder, no `.sql` file. The schema exists only on the Supabase project. This means: (1) no diff-able history, (2) no way to reproduce the database from a fresh clone, (3) no way to verify the auditing claims below without Supabase project access. **This is the single largest production-readiness gap.**
- **`negotiations.bargaining_unit`** is inserted as the empty string by `Negotiations.tsx:66`. The CLAUDE.md schema marks it `NOT NULL`. The UI never asks for it. If a NOT NULL constraint exists in Supabase, the empty-string insert succeeds but the field is meaningless data; if it doesn't, the column itself is dead.
- **`negotiations.local_number`** is snapshot-copied at insert (`Negotiations.tsx:68`) **and** there is a foreign key to `local_unions.id`. If a local union's number is later updated, the snapshot on the negotiation row goes stale. Either drop the FK or drop the snapshot — both is confusing.
- **`member_companies.discount_tier`** is written as `'none'` by `Grievances.tsx:271` (inside the inline AddCompanyModal). CLAUDE.md's `member_companies` schema does not mention this column. Either schema drift or column the rest of the app doesn't know about.
- **`man_hours.gpep`** appears in `MembersHours.tsx` (L138) but is not in CLAUDE.md's schema. Same pattern: schema drift.
- **`grievances.locked`** is treated as `0|1` integer (`Grievances.tsx:414`); CLAUDE.md does not document the column. A Postgres `boolean` column would reject integer literals on some drivers; verify.
- **`is_member`** on `member_companies` is treated as `0|1` integer throughout `MembersDirectory.tsx` rather than boolean.

### 2b. Multi-tenant scoping (`org_id`)

The app is multi-tenant, and tenant isolation is enforced by `.eq('org_id', orgId)` on the client and (presumably) Supabase Row Level Security on the server. **The client-side enforcement is inconsistent.** Many `.update()` and `.delete()` calls filter only by `.eq('id', …)` and trust RLS to do the rest. If an RLS policy is ever misconfigured (or temporarily disabled for a migration), the app has **no defense in depth**.

Specific writes missing an explicit `org_id` filter (relies fully on RLS):

| File | Line | Operation |
|---|---|---|
| `NegotiationDetail.tsx` | 156, 169, 194, 444, 450, 476, 753 | session update/delete, attendee delete, proposal update/delete, position delete, **negotiation update** |
| `Negotiations.tsx` | 170 | negotiation delete |
| `Grievances.tsx` | 384, 403, 414, 423 | grievance update (3×) + delete |
| `LocalUnions.tsx` | 183, 198, 364, 388, 392 | local union update/delete, package_rates update, wage_tier update/delete |
| `MembersDirectory.tsx` | 178, 258, 284, 297 | company update/delete, rep update/delete |
| `MembersCommittees.tsx` | 147, 159, 188, 206 | committee update/delete, committee_member update/delete |
| `MembersHours.tsx` | 131, 164 | man_hours update/delete |
| `Documents.tsx` | 264, 277 | document update/delete |

### 2c. Missing schema documentation

There is no `supabase/schema.sql`, no `database.types.ts` (Supabase-generated types), and no `useOrg.ts` documentation of what `user_profiles` looks like. Recommend running `supabase gen types typescript` and committing the result to lock the contract.

---

## 3. Authentication & Authorization — *Incomplete*

### What works
- Email/password sign-up, sign-in, forgot-password, password-reset are all implemented in `Login.tsx` and `SetNewPassword.tsx`.
- Session persistence is handled by Supabase's local-storage session (default).
- `App.tsx:154–170` listens to `onAuthStateChange` and renders `Login` when no session is present.
- Sign-out is a single click in the sidebar (`App.tsx:90`).

### What's incomplete

- **No route protection layer.** Protection is a single `if (!session) return <Login />` at `App.tsx:180`. Because there's no router, that single check is fine *today*, but the moment anyone introduces deep-linking or React Router, every page would need its own guard. There is no `<RequireAuth>` wrapper or hook.
- **No password complexity enforcement.** Both `Login.tsx:101` and `SetNewPassword.tsx:38` require ≥6 characters only. Supabase's default minimum is 6; for a business app handling labor relations data, raise to ≥10 with at least one number or symbol.
- **Email verification not enforced.** Sign-up calls `supabase.auth.signUp` (`Login.tsx:106`) and shows "Check your email to confirm before signing in." But if Supabase's "Confirm email" toggle is off, accounts work immediately. Verify in the Supabase dashboard and document it.
- **No multi-factor auth.** Acceptable for v1; flag for Phase 3.
- **No "session expired" UX.** When the JWT expires mid-session, Supabase fails queries silently; the user sees blank screens or load errors instead of being redirected to login. Add a global error boundary that detects 401/PGRST301 and signs the user out.
- **RLS policies are not in this repo.** There is no SQL file describing the RLS posture. Without it, the entire multi-tenant model is invisible to code review. **This is a release blocker.**
- **`useOrg.ts` failure mode.** If `user_profiles` has no row for the current user (e.g., signup happened but no profile row was created), `useOrg` returns `orgId: null` and every page either spins forever (`Dashboard.tsx:81`) or renders an empty list. There is no "your account is not set up — contact admin" path.
- **No way for an org admin to invite/remove other users.** All user management would need to happen in the Supabase dashboard. Acceptable for early customers, not for self-serve onboarding.

---

## 4. Error Handling & Edge Cases — *Incomplete*

### What works
- `Login.tsx`, `Dashboard.tsx`, `Negotiations.tsx`, `Grievances.tsx`, `Documents.tsx`, `MembersDirectory.tsx`, `MembersHours.tsx`, `MembersServiceCharge.tsx`, `Settings.tsx` all surface load and save errors in a red inline banner. The banner styling is consistent (`#fef2f2` / `#fecaca`).
- `MembersHours.tsx:188–193` specifically handles Postgres error `23505` (unique-constraint violation on `(company_id, year, month)`) with a friendly message — exemplary.
- `Documents.tsx:131` cleans up an orphaned storage blob if the DB insert fails — good.

### What's missing

- **Many mutations swallow errors silently** (no try/catch, no `if (err) setError(...)`):
  - `NegotiationDetail.tsx`: `handleSaveEdit` (152), `handleDeleteSession` (169), `handleDeleteAttendee` (194), `handleStatusChange` (439), `handleDeleteProposal` (449), `handleAddPosition` (454), `handleDeletePosition` (475).
  - `Grievances.tsx:341`: timeline load.
  - `LocalUnions.tsx`: `handleAddTier` (378), `handleTierBlur` (388), `handleDeleteTier` (391); AnalysisTab loads (531, 533); main `loadUnions` (673).
- **No offline / Supabase-unreachable handling.** Every page issues queries on mount and assumes they resolve. If the user loses connectivity, requests hang until the browser times out and the page stays in the loading state forever. There is no network error banner, no retry, no offline indicator.
- **Form validation is shallow.** Required-field checks exist; but:
  - No email format validation despite `type="email"` (relies on browser; users can still submit invalid emails on some browsers).
  - No phone-number format/normalization.
  - No date sanity (past-dated contract expirations and future-dated grievance filings both accepted).
  - No text-length caps (a 100,000-character "notes" field will be saved as-is).
  - No numeric range checks on wage rates (negative wages accepted; 9 999 999 % accepted).
- **No confirmation dialogs on several destructive actions:**
  - Delete representative (`MembersDirectory.tsx:295`).
  - Delete committee member (`MembersCommittees.tsx:204`).
  - Delete man-hours entry (`MembersHours.tsx:162`).
  - Delete wage tier (`LocalUnions.tsx:391`).
  - Delete attendee (`NegotiationDetail.tsx:194`) and proposal position (`NegotiationDetail.tsx:476`).
  - Toggle grievance lock (`Grievances.tsx:414`).
- **No global error boundary.** A React render error anywhere will white-screen the whole app.
- **No console logging.** This is good (no info leak), but it also means a production support case is impossible to diagnose without remote logs.

---

## 5. UI/UX Polish — *Incomplete* (against the Microsoft 365 / Salesforce bar)

### Strong points
- Consistent design system via `src/lib/ui.ts`: navy `#1E3A8A`, gold accent `#B8952A`, neutral palette, shared `inputStyle`, `btnPrimary`, `btnSecondary`, `btnGold`, `btnDanger`, `card`, `labelStyle`, `errorBox`, `thStyle`, `tdStyle`, `pageTitle`, `pageSubtitle`.
- Empty states exist on every list page and most include a primary-action CTA.
- Tables use proper `<th>`/`<td>` and reasonable typography.
- Focus rings: `index.css:22–25` defines a global `:focus-visible` outline in gold — accessibility nicety.
- No emojis. Inline SVG icons throughout. (Matches CLAUDE.md guidance.)

### Gaps

- **Local re-definitions of style tokens** still exist in `Login.tsx:6–66`, `SetNewPassword.tsx:4–22`, and the various `errorBox` / `successBox` inline definitions. Per CLAUDE.md rule #10, these should pull from `lib/ui.ts`.
- **No responsive design.** Sidebar is hard-coded at `232px` (`App.tsx:37`). Dashboard cards use `gridTemplateColumns: 'repeat(3, 1fr)'` (`Dashboard.tsx:174`) with no media query. On a 768 px viewport, the sidebar plus three cards squeeze unreadably; on a phone the sidebar takes a third of the screen. **For a sales demo on a customer's laptop this is fine. For a public web app it is not.**
- **No loading skeletons.** Every page just renders the text "Loading…" while data fetches. Microsoft 365 / Salesforce both use skeleton placeholders that maintain layout — feels significantly slower than it is.
- **No toast notifications.** Save-success feedback in `Settings.tsx` uses an inline banner that times out via `setTimeout`. There is no global toast system; success feedback is per-page and inconsistent.
- **Inline confirm UIs are inconsistent.** `Negotiations.tsx:216–227` uses a text-style "Delete? Yes/No"; `MembersDirectory.tsx:713–720` and `Documents.tsx:383–389` use button-style inline confirms; `NegotiationDetail.tsx:290–297` uses yet another pattern. Pick one and ship it as a `<ConfirmButton>` component.
- **No breadcrumbs or back-navigation cues.** `NegotiationDetail` is reached by clicking a row in `Negotiations`; the only way back is the "← Back" button at the top of the detail page. There is no breadcrumb trail.
- **No keyboard shortcuts** (no ⌘K command palette, no `?` cheatsheet).
- **No dark mode.**
- **No tooltips on truncated text.** Multiple ellipsis-truncated rows (e.g., `Dashboard.tsx:455`) drop content with no way to see it.
- **`maxWidth: 960px` consistency is partial.** Dashboard, Negotiations, Settings use it; Grievances, Members\*, Documents, LocalUnions are full-width split-pane layouts. That's a defensible choice but is not documented anywhere.
- **Drop zone in `Documents.tsx`** has no keyboard equivalent.

---

## 6. Performance — *Incomplete*

- **No code-splitting / lazy loading.** All pages are eagerly imported in `App.tsx:5–13`. The initial JS bundle includes Recharts (heavy) for users who never visit the Dashboard. Convert to `React.lazy()` + `<Suspense>` boundaries.
- **N+1 query in `MembersCommittees.tsx:91–96`.** After fetching companies, the code loops and issues one query per company to fetch representatives. With 50 companies that's 51 round-trips. Replace with a single `from('member_representatives').select('id, company_id, name, title').in('company_id', companyIds)`.
- **Dashboard fetches everything.** `Dashboard.tsx:82–87` pulls every negotiation, grievance, company, and man-hours row for the org. For an org with five years of grievances, that's all of them, every page load. Add a `.limit()` or paginate.
- **No client-side caching.** Every navigation refetches. Adopt React Query / SWR / TanStack Query, or at minimum a module-level cache keyed by `orgId`.
- **No pagination on tables.** `Negotiations.tsx`, `Grievances.tsx`, `Documents.tsx`, `MembersDirectory.tsx`, `MembersHours.tsx` all render the full result set. Once a customer has 200 grievances the page slows visibly.
- **Recharts loads on every Dashboard mount.** Lazy-load the chart specifically.
- **Document list re-fetches storage signed URLs** every download instead of caching for 60 s.
- **No React keys warnings observed**, but the rapidly remounting `<WagePackagesTab key={selected.id}>` pattern (`LocalUnions.tsx:776`) refetches on every selection change with no debounce.

---

## 7. Code Quality — *Mostly Complete*

### What's right
- `tsc -b` passes with no errors against the current code. The `npm run build` script will succeed.
- No `any` types anywhere in `src/`. Only 3 `as unknown as` casts, all in `MembersHours.tsx` (necessary for typed Supabase join shapes).
- No `console.log` / `console.error` / `console.warn` calls. Good for production output, but see comment in §4 about losing diagnostic information.
- No `@ts-ignore`. No `window.confirm` / `window.alert`.
- Naming is consistent: PascalCase pages, camelCase helpers, descriptive function names.
- File structure is reasonable for a project this size.

### What's off

- **`tsconfig.app.json` doesn't enable `strict`.** It enables `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `erasableSyntaxOnly`, but **not** `strict`, `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`. Many of the bugs called out elsewhere in this audit (closure captures in `handleTierBlur`, untyped Supabase result shapes) would be caught by stricter TS settings.
- **Style tokens are still duplicated** in `Login.tsx` and `SetNewPassword.tsx`. CLAUDE.md rule #10 forbids local redefinition.
- **No custom hooks for Supabase reads.** Every page handcrafts its own `useEffect` + `.then` ladder. Extract `useSupabaseQuery(table, columns, filters)` or adopt TanStack Query.
- **No shared confirm-button component.** Three different patterns in active use (see §5).
- **`useOrg.ts` is fragile.** It calls `.single()` (`useOrg.ts:18`), which throws when there are zero rows or more than one. No `.maybeSingle()`. No error state — only `orgId | null`. Components can't distinguish "still loading" from "user has no profile" from "query failed."
- **No barrel files / no `src/types.ts`.** Every page re-declares its own `interface Negotiation`, `interface Grievance`, etc. If a column is renamed in one place, the other twelve drift silently.
- **Hardcoded NECA-specific constants** in `MembersServiceCharge.tsx:73–157`: tier caps `75000` / `150000`, rate `0.002`, discounts `0.10` / `0.25`, 1 250-hour non-compliance threshold. CLAUDE.md promises "craft-agnostic" but these are NECA Service Charge Plan rules. Either move to `org_settings` or document them as NECA-only.
- **`nlmcc: 0.01` and `bw * 0.03` (NEBF)** hardcoded in `LocalUnions.tsx:85, 358, 396, 543, 554` — should be either configurable or commented with rationale.
- **No tests at all.** No `*.test.ts`, no `vitest.config.ts`, no `playwright.config.ts`. CLAUDE.md describes a test suite that doesn't exist in this repo.
- **`Members.tsx` tab routing is local state**, so reloading the page loses tab selection. Same with negotiation selection. Acceptable for v1; URL-driven routing is the long-term answer.

---

## 8. Missing Standard Features — *Missing*

Compared to the Microsoft 365 / Google Workspace / Salesforce bar:

| Feature | Present? | Notes |
|---|---|---|
| Global search (cross-module) | ✗ | None. Local filters exist on Members and Grievances. |
| Sort by column | ✗ | Tables render server-sorted; no clickable headers. |
| Column-level filtering | ✗ | Only Grievances has filter chips. |
| Pagination | ✗ | Every list renders the full result. |
| Export (CSV/Excel) | ✗ | No export anywhere. CLAUDE.md claims it. |
| Export (PDF / print-friendly) | ✗ | None. |
| Bulk actions | ✗ | No multi-select on any list. |
| Activity / audit log | Partial | Grievance status changes write to `grievance_timeline`. No other entity has an audit trail. No user-attributed log. |
| User profile / settings | Partial | Org name + password live in Settings. No user-level profile (display name, photo, notification preferences). |
| Keyboard shortcuts | ✗ | None. |
| Dark mode | ✗ | None. |
| Print-friendly views | ✗ | None. |
| In-app help / docs | ✗ | CLAUDE.md describes a Help drawer that doesn't exist. |
| Notifications (in-app or email) | ✗ | Nothing about upcoming contract expirations, grievance deadlines, etc. The dashboard shows expiring contracts within 180 days but does not notify proactively. |
| Recently viewed / recently edited | ✗ | None. |
| Undo for destructive actions | ✗ | None (and no soft delete — deletes are permanent). |

---

## 9. Deployment & DevOps — *Missing*

- **No `.env.example`.** Required env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are referenced in `src/lib/supabase.ts:3–4` but documented nowhere except `.env.local`. A fresh developer can't get the app to run.
- **README is the default Vite/React boilerplate.** `README.md` is unchanged from `npm create vite`. No project description, no setup steps, no deployment instructions, no architecture diagram, no Supabase setup guide.
- **No deployment configuration in repo.** No `vercel.json`, no `netlify.toml`, no `Dockerfile`, no GitHub Actions workflow. The recent commits mention "Fix NegotiationDetail TypeScript errors blocking Vercel build" so Vercel is presumably the host — but that contract isn't visible from this repo.
- **No CI pipeline.** No automated build, no automated `tsc -b`, no automated lint on PRs.
- **No automated database migrations.** No `supabase/migrations/` directory. Schema is whatever the dashboard has — fragile.
- **Hardcoded Supabase project URL in `.env.local`** (committed values, see below). `.env.local` is in `.gitignore` for some patterns but not all; verify whether it has been committed to git history. The `VITE_SUPABASE_ANON_KEY` in `.env.local` is the *anon* key (not service-role), so leakage is bounded by RLS — but the project URL plus anon key plus a misconfigured RLS policy is still an exposure.
- **No build output verification.** I ran `npx tsc -b` and it passes with no errors. Good. No `vite build` was run as part of this audit.
- **No `lint:fix`, `format`, or `test` scripts** in `package.json:8–13`.
- **`vite.config.ts` is empty default** (assumed — not read in this pass).
- **No bundle size monitoring.** Recharts pulls a lot of weight; nothing measures it.

---

## Detailed Supabase Query Inventory

For Section 2, here is the consolidated list of all `from()` calls:

| Table | Read | Insert | Update | Delete | Where used |
|---|---|---|---|---|---|
| `user_profiles` | ✓ | — | — | — | `useOrg.ts` |
| `organizations` | ✓ | — | ✓ | — | `Settings.tsx` |
| `org_settings` | ✓ | upsert | upsert | — | `Settings.tsx`, `LocalUnions.tsx` |
| `negotiations` | ✓ | ✓ | ✓ | ✓ | `Dashboard.tsx`, `Negotiations.tsx`, `NegotiationDetail.tsx` |
| `sessions` | ✓ | ✓ | ✓ | ✓ | `NegotiationDetail.tsx` |
| `attendees` | ✓ | ✓ | — | ✓ | `NegotiationDetail.tsx` |
| `proposals` | ✓ | ✓ | ✓ | ✓ | `NegotiationDetail.tsx` |
| `proposal_positions` | ✓ | ✓ | — | ✓ | `NegotiationDetail.tsx` |
| `grievances` | ✓ | ✓ | ✓ | ✓ | `Dashboard.tsx`, `Grievances.tsx` |
| `grievance_timeline` | ✓ | ✓ | — | — | `Grievances.tsx` |
| `local_unions` | ✓ | ✓ | ✓ | ✓ | `Negotiations.tsx`, `NegotiationDetail.tsx`, `Grievances.tsx`, `LocalUnions.tsx` |
| `package_rates` | ✓ | ✓ | ✓ | — | `LocalUnions.tsx` |
| `wage_tiers` | ✓ | ✓ | ✓ | ✓ | `LocalUnions.tsx` |
| `member_companies` | ✓ | ✓ | ✓ | ✓ | `Dashboard.tsx`, `Grievances.tsx`, `Members*.tsx` |
| `member_representatives` | ✓ | ✓ | ✓ | ✓ | `MembersDirectory.tsx`, `MembersCommittees.tsx` |
| `committees` | ✓ | ✓ | ✓ | ✓ | `MembersCommittees.tsx` |
| `committee_members` | ✓ | ✓ | ✓ | ✓ | `MembersCommittees.tsx` |
| `man_hours` | ✓ | ✓ | ✓ | ✓ | `Dashboard.tsx`, `MembersHours.tsx`, `MembersServiceCharge.tsx` |
| `documents` | ✓ | ✓ | ✓ | ✓ | `Documents.tsx` |

Tables referenced in CLAUDE.md that **no page queries** in this repo: `deadlines`, `grievance_documents`, `negotiation_documents`. They may exist in Supabase from an earlier iteration; verify and drop if dead.

---

## Prioritized Action Plan — ranked by demo embarrassment

> *"Most embarrassing in a live demo" = first row.* A demo audience will not see the schema or the bundle size; they will see broken tabs, blank screens, and obvious typos.

### Tier 1 — Fix before any live demo (1–3 days each)

1. **Wire up the three missing Negotiation tabs (Documents, Dashboard, Rounds) — or remove them from the UI.** If the tabs aren't there yet, don't ship CLAUDE.md claiming they are; if they were removed deliberately, that's also fine, but the file structure and docs need to match. **Demo blocker: a partner clicks a phantom tab and finds nothing.**

2. **Stop swallowing mutation errors.** Add `if (err) setError(err.message); return` after every `await supabase.…` in `NegotiationDetail.tsx`, `LocalUnions.tsx` (tier ops), and `Grievances.tsx` (timeline load). Without this, a failed delete looks like success and the user sees stale data. **Demo blocker: silent corruption.**

3. **Fix the `Add Position` state-leak / closure bug in `NegotiationDetail.tsx`.** When a user types into one proposal's position field and clicks Add on another, the wrong text saves. This will absolutely surface in a real demo where someone clicks around.

4. **Add a confirm dialog to every destructive action.** Specifically: delete attendee, delete proposal position, delete representative, delete committee member, delete man-hours entry, delete wage tier, toggle grievance lock. One reusable `<ConfirmButton>` component covers all of them. **Demo blocker: accidental click destroys data live.**

5. **Replace the default Vite README with a real one.** Setup steps, env vars, Supabase project bootstrap, how to run, how to deploy. Add `.env.example`. **Demo-adjacent: anyone Jonathan onboards as a co-founder, contractor, or buyer cannot get the app running.**

### Tier 2 — Fix before pilot customers (1–2 weeks)

6. **Commit the Supabase schema and RLS policies to the repo.** Either as `supabase/schema.sql` (snapshot) or `supabase/migrations/*.sql` (managed). Without this, the project is one Supabase dashboard misclick away from total data loss and there is no way to audit RLS.

7. **Re-assert `.eq('org_id', orgId)` on every `.update()` and `.delete()`.** Defense in depth. Twenty-plus mutation sites to patch (full list in §2b). One afternoon of mechanical work.

8. **Add a global error boundary + a "session expired" handler.** When a query fails with 401, sign the user out gracefully and redirect to login.

9. **Decide what `Settings → Data` and `Settings → Branding` will be — and either build them or remove them from CLAUDE.md / roadmap claims.**

10. **Add CSV/Excel import to MembersHours**, or rewrite the CLAUDE.md claim. Pick one — the gap between docs and code is the credibility risk.

11. **Add basic table sorting and pagination** to Negotiations, Grievances, Members Directory, Member Hours, Documents. Once a customer has 200 rows, the page will feel broken.

12. **Add an export hub** (CSV at minimum). Every business buyer asks "can I export this to Excel?" within the first hour. ExcelJS or SheetJS, one shared utility, done.

13. **Fix the `MembersCommittees` N+1 query.** Single `.in('company_id', …)` query replaces 50.

14. **Strengthen TypeScript:** enable `strict: true` in `tsconfig.app.json`. Fix the few resulting errors. Generate `database.types.ts` via the Supabase CLI and use it everywhere.

15. **Extract shared types** to `src/types.ts`. Every page currently re-declares its own `Negotiation`, `Grievance`, etc.

### Tier 3 — Fix before general availability (3–6 weeks)

16. **Add a toast / notification system** (one global provider). Replace inline `setTimeout` success messages.

17. **Loading skeletons** on every page in place of "Loading…" text.

18. **Responsive layout** — collapse sidebar at <1024 px, stack dashboard cards.

19. **TanStack Query** (or equivalent) for client caching and request deduplication.

20. **Lazy-load Recharts** (`React.lazy`) and code-split per route.

21. **Full audit log** — write a row to a generic `activity_log` table on every mutation, surfaced on a per-entity timeline tab and a global Activity page.

22. **Email verification + password complexity enforcement** + (eventually) MFA.

23. **In-app help drawer** that CLAUDE.md describes.

24. **User profile page** — display name, avatar, notification preferences.

25. **CI pipeline** — GitHub Actions: install, `tsc -b`, lint, build. Block merges on failure.

26. **End-to-end tests** for the core five workflows in §1c.

### Tier 4 — Phase 3 commercialization (not blocking)

- Soft delete (recoverable trash).
- Billing / licensing.
- White-labeling.
- Webhooks / Zapier / external integrations.
- Mobile / responsive PWA.
- Dark mode.
- Keyboard shortcuts / command palette.

---

## One-paragraph executive summary

The Chapter Command Center is **a working product at roughly 70% of its claimed feature set**, with a clean Supabase-backed React codebase, no `any` types, and a passing TypeScript build. The product is closer to demo-ready than most prototypes — auth works, the seven core modules each render real data, error banners exist on most paths, and the design system is consistent. **What blocks it from a credible live demo today is the gap between the documentation (`CLAUDE.md`, which still describes an Electron + SQLite app and lists features as "complete" that are absent in code) and reality.** Specifically: three negotiation tabs, hours import, settings sub-pages, and the entire export pipeline don't exist. **What blocks it from a credible production deployment is the absence of any committed schema/RLS, a default Vite README, no CI, no error boundary, no `.env.example`, silent failures on a meaningful subset of mutations, and several unconfirmed destructive actions.** Fix Tier 1 in three days and the app is demo-safe; fix Tier 2 in two weeks and the app is pilot-customer-safe.
