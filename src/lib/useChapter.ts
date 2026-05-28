import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'
import type { ID } from './types'

interface ChapterContext {
  chapterId: ID | null
  loading: boolean
  error: string | null
  refresh: () => void
}

// Derives the current user's chapter:
//   1. Look up user_settings for this auth user.
//   2. If user_settings.chapter_id is set, use it.
//   3. Else fall back to the first chapter the user can see (RLS is wide-open
//      today, so this is "any chapter"). If found, link it on user_settings.
//   4. Else create a new chapter named "My Chapter" and link it.
// On any failure, returns chapterId: null with an error message and a refresh().
export function useChapter(): ChapterContext {
  const [chapterId, setChapterId] = useState<ID | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    let cancelled = false

    async function bootstrap(): Promise<void> {
      setLoading(true)
      setError(null)

      const { data: userData, error: userErr } = await supabase.auth.getUser()
      if (cancelled) return
      if (userErr || !userData.user) {
        setError('Not signed in.')
        setChapterId(null)
        setLoading(false)
        return
      }
      const userId = userData.user.id

      const { data: settings, error: settingsErr } = await supabase
        .from('user_settings')
        .select('id, chapter_id')
        .eq('user_id', userId)
        .maybeSingle()
      if (cancelled) return
      if (settingsErr) {
        setError('Could not load your account settings.')
        setChapterId(null)
        setLoading(false)
        return
      }

      if (settings?.chapter_id) {
        setChapterId(settings.chapter_id as ID)
        setLoading(false)
        return
      }

      // No chapter yet: pick the first visible chapter, or create one.
      const { data: chapters, error: chErr } = await supabase
        .from('chapters')
        .select('id')
        .order('created_at')
        .limit(1)
      if (cancelled) return
      if (chErr) {
        setError('Could not load chapters.')
        setChapterId(null)
        setLoading(false)
        return
      }

      let targetChapterId: ID | null = chapters && chapters.length > 0 ? (chapters[0].id as ID) : null

      if (!targetChapterId) {
        const { data: created, error: createErr } = await supabase
          .from('chapters')
          .insert({ name: 'My Chapter' })
          .select('id')
          .single()
        if (cancelled) return
        if (createErr || !created) {
          setError('Could not create your chapter. Contact support.')
          setChapterId(null)
          setLoading(false)
          return
        }
        targetChapterId = created.id as ID
      }

      const settingsPayload = { user_id: userId, chapter_id: targetChapterId }
      const { error: upsertErr } = await supabase
        .from('user_settings')
        .upsert(settingsPayload, { onConflict: 'user_id' })
      if (cancelled) return
      if (upsertErr) {
        // Non-fatal: we have a chapter for this session even if we can't persist.
        setChapterId(targetChapterId)
        setLoading(false)
        return
      }

      setChapterId(targetChapterId)
      setLoading(false)
    }

    void bootstrap()
    return () => { cancelled = true }
  }, [tick])

  return { chapterId, loading, error, refresh }
}
