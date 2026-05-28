// Small helper for the common "Supabase returned an error" case.
// Pass any PostgrestError-like object or unknown; returns a readable message.
export function describeError(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!err) return fallback
  if (typeof err === 'string') return err
  if (typeof err === 'object') {
    const e = err as { message?: unknown; details?: unknown; hint?: unknown }
    if (typeof e.message === 'string' && e.message.trim()) return e.message
    if (typeof e.details === 'string' && e.details.trim()) return e.details
    if (typeof e.hint === 'string' && e.hint.trim()) return e.hint
  }
  return fallback
}
