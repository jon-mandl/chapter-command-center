import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from './supabase'
import type { ID, UserSettings } from './types'

// applyChapterFilter takes any Supabase query that has an `.eq()` method and
// optionally chains `.eq('chapter_id', ...)` onto it. We type it loosely on
// purpose: supabase-js's PostgrestFilterBuilder has deep generic types and
// crossing them with our own generic blows past TS's recursion limit. Pages
// already narrow `data` via casts after awaiting, so we don't lose practical
// type-safety by treating the chain as unknown here.
/* eslint-disable @typescript-eslint/no-explicit-any */
type LooseSupabaseQuery = any
/* eslint-enable @typescript-eslint/no-explicit-any */

// What the hook returns. Everything a caller might need to make data-fetching
// and UI-gating decisions for the current user.
//
//   - `settings`: the raw user_settings row (or null while loading/before
//     login).
//   - `role` / `isAdmin` / `needsOnboarding`: derived booleans
//     for nav/route guards.
//   - `chapterId`: the user's own chapter (what they're assigned to in
//     user_settings).
//   - `effectiveChapterId`: the chapter the app should filter by *right now*.
//     For non-admins this is always their own chapter. For admins this is
//     the chapter they've selected from the admin switcher, or null when
//     they pick "All Chapters".
//   - `adminViewChapterId` / `setAdminViewChapterId`: the admin-only setter
//     used by the chapter switcher. No-op for non-admins.
//   - `applyChapterFilter(query)`: helper that adds `.eq('chapter_id', ...)`
//     when scoping is needed, and is a no-op when an admin is viewing
//     "All Chapters". Every page should run its chapter_id-scoped reads
//     through this helper so the admin switcher works uniformly.
//   - `refresh()`: re-fetch the user_settings row (use after the admin
//     updates their own row, or after onboarding completes server-side).

interface UserSettingsContextValue {
  settings: UserSettings | null
  loading: boolean
  error: string | null

  role: UserSettings['role'] | null
  isAdmin: boolean
  needsOnboarding: boolean
  // True when the user has authenticated and (for non-admins) been assigned
  // to a chapter, but hasn't filled in the post-invite profile form yet. The
  // App router shows the ProfileCompletion screen while this is true.
  needsProfileCompletion: boolean
  profileCompleted: boolean

  chapterId: ID | null
  effectiveChapterId: ID | null
  adminViewChapterId: ID | null
  setAdminViewChapterId: (id: ID | null) => void

  applyChapterFilter: (q: LooseSupabaseQuery) => LooseSupabaseQuery

  refresh: () => void
}

const UserSettingsContext = createContext<UserSettingsContextValue | null>(null)

const ADMIN_VIEW_STORAGE_KEY = 'ccc.adminViewChapterId'

export function UserSettingsProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)

  // Lazy-init from localStorage so the admin's last "view as" choice survives
  // page reloads within a session.
  const [adminViewChapterId, setAdminViewChapterIdState] = useState<ID | null>(() => {
    try {
      const v = window.localStorage.getItem(ADMIN_VIEW_STORAGE_KEY)
      return v && v !== 'null' ? (v as ID) : null
    } catch { return null }
  })

  const setAdminViewChapterId = useCallback((id: ID | null) => {
    setAdminViewChapterIdState(id)
    try {
      window.localStorage.setItem(ADMIN_VIEW_STORAGE_KEY, id ?? 'null')
    } catch {
      // localStorage can fail in private windows or quota-exceeded; non-fatal.
    }
  }, [])

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), [])

  // Fetch user_settings on mount, on refresh(), and when auth changes.
  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      setLoading(true)
      setError(null)

      const { data: userData, error: userErr } = await supabase.auth.getUser()
      if (cancelled) return
      if (userErr || !userData.user) {
        setSettings(null)
        setLoading(false)
        return
      }

      // The on_auth_user_created trigger guarantees a user_settings row exists
      // for every authenticated user. .single() is therefore safe; if it ever
      // errors, surface it rather than silently bootstrapping a row.
      const { data, error: settingsErr } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userData.user.id)
        .single()

      if (cancelled) return
      if (settingsErr || !data) {
        setError('Could not load your account. Please refresh.')
        setSettings(null)
        setLoading(false)
        return
      }

      setSettings(data as UserSettings)
      setLoading(false)
    }

    void load()
    return () => { cancelled = true }
  }, [refreshTick])

  // Re-fetch settings whenever auth changes (sign-in, sign-out, token refresh
  // on a different user). signOut returns no session, and we reset state.
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setSettings(null)
        return
      }
      setRefreshTick((t) => t + 1)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const role = settings?.role ?? null
  const isAdmin = role === 'admin'

  const chapterId = settings?.chapter_id ?? null
  const needsOnboarding = !!settings && chapterId === null && !isAdmin
  // profile_completed is non-nullable in the DB but treat a missing settings
  // row as "still completing" to be conservative.
  const profileCompleted = !!settings?.profile_completed
  const needsProfileCompletion = !!settings && !profileCompleted

  // For non-admins the effective chapter is just their own. For admins it's
  // whatever they've selected in the switcher; null means "All Chapters".
  const effectiveChapterId: ID | null = isAdmin ? adminViewChapterId : chapterId

  // Helper used by every page: pages call applyChapterFilter(query) instead
  // of .eq('chapter_id', chapterId) so admin "All Chapters" view works
  // automatically. If a chapter scope is needed but no chapter is in effect
  // (e.g. admin showing "All Chapters") the filter is intentionally skipped
  // and the underlying RLS does the work (admins see everything).
  const applyChapterFilter = useCallback(
    (q: LooseSupabaseQuery): LooseSupabaseQuery => {
      if (effectiveChapterId) return q.eq('chapter_id', effectiveChapterId)
      return q
    },
    [effectiveChapterId]
  )

  const value = useMemo<UserSettingsContextValue>(() => ({
    settings,
    loading,
    error,
    role,
    isAdmin,
    needsOnboarding,
    needsProfileCompletion,
    profileCompleted,
    chapterId,
    effectiveChapterId,
    adminViewChapterId,
    setAdminViewChapterId,
    applyChapterFilter,
    refresh
  }), [settings, loading, error, role, isAdmin, needsOnboarding, needsProfileCompletion, profileCompleted, chapterId, effectiveChapterId, adminViewChapterId, setAdminViewChapterId, applyChapterFilter, refresh])

  return (
    <UserSettingsContext.Provider value={value}>
      {children}
    </UserSettingsContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useUserSettings(): UserSettingsContextValue {
  const ctx = useContext(UserSettingsContext)
  if (!ctx) throw new Error('useUserSettings must be used inside <UserSettingsProvider>')
  return ctx
}
