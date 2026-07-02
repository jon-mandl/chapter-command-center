import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Snapshot the `type` param out of the URL hash *before* we hand the page over
// to the Supabase SDK. createClient (with detectSessionInUrl: true, which is
// the default) parses and then clears `#access_token=...&type=invite` so by
// the time React renders, window.location.hash is usually empty.
//
// We need to know whether the user arrived via an invite or password-recovery
// link so we can force them through the SetNewPassword screen — read it now,
// stash it in a module-level constant, and let the rest of the app consult
// authCallbackType() at its leisure.
type AuthCallbackType = 'invite' | 'recovery' | null

function snapshotAuthCallbackType(): AuthCallbackType {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash
  if (!hash) return null
  const params = new URLSearchParams(hash)
  const type = params.get('type')
  if (type === 'invite' || type === 'signup') return 'invite'
  if (type === 'recovery') return 'recovery'
  return null
}

const initialAuthCallbackType: AuthCallbackType = snapshotAuthCallbackType()

export function authCallbackType(): AuthCallbackType {
  return initialAuthCallbackType
}

// Supabase silently caps an unbounded select() at 1000 rows. Pages that sum
// workforce_hours client-side must request an explicit range well above any
// realistic row count so totals aren't silently truncated, and warn the user
// if the ceiling is ever actually reached. One chapter's hours = companies ×
// months × classifications, so 100k leaves a very large safety margin.
export const HOURS_QUERY_MAX = 100000

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Default true, but make it explicit: the SDK should parse the auth tokens
    // out of the URL hash on load and establish a session.
    detectSessionInUrl: true,
    // Implicit flow puts tokens in the hash fragment (#access_token=...). This
    // matches what Supabase emits for invite + recovery links by default. PKCE
    // would use ?code=... query params and require exchangeCodeForSession.
    flowType: 'implicit',
    persistSession: true,
    autoRefreshToken: true,
  },
})
