// Shared data helpers for the Negotiation Tracker — queries and aggregation
// used by more than one page or tab live here, not in the page files.

import { supabase } from './supabase'
import { describeError } from './errors'
import type { ID } from './types'

export interface CycleProposalCounts {
  total: number
  open: number
  ta: number
  withdrawn: number
  rejected: number
  economic: number
  language: number
  priority: number
}

export interface CycleSessionSummary {
  total: number
  lastDate: string | null
  attendeeCount: number
}

export interface CycleStats {
  proposals: CycleProposalCounts
  sessions: CycleSessionSummary
}

// Proposal + session aggregates for one cycle — shared by the Overview and
// Dashboard tabs so the counting rules are defined exactly once.
export async function loadCycleStats(
  cycleId: ID
): Promise<{ stats: CycleStats | null; error: string | null }> {
  const [propRes, sessRes] = await Promise.all([
    supabase.from('proposals').select('id, status, category, priority').eq('cycle_id', cycleId),
    supabase
      .from('negotiation_sessions')
      .select('id, session_date')
      .eq('cycle_id', cycleId)
      .order('session_date', { ascending: false })
  ])
  if (propRes.error) {
    return { stats: null, error: describeError(propRes.error, 'Could not load proposal data.') }
  }
  if (sessRes.error) {
    return { stats: null, error: describeError(sessRes.error, 'Could not load session data.') }
  }

  const props = (propRes.data ?? []) as { status: string; category: string; priority: boolean }[]
  const proposals: CycleProposalCounts = {
    total: props.length,
    open: props.filter((p) => p.status === 'Open').length,
    ta: props.filter((p) => p.status === 'TA').length,
    withdrawn: props.filter((p) => p.status === 'Withdrawn').length,
    rejected: props.filter((p) => p.status === 'Rejected').length,
    economic: props.filter((p) => p.category === 'Economic').length,
    language: props.filter((p) => p.category === 'Language').length,
    priority: props.filter((p) => p.priority).length
  }

  const sessList = (sessRes.data ?? []) as { id: ID; session_date: string }[]
  let attendeeCount = 0
  if (sessList.length > 0) {
    const { count } = await supabase
      .from('session_attendees')
      .select('id', { count: 'exact', head: true })
      .in('session_id', sessList.map((s) => s.id))
    attendeeCount = count ?? 0
  }

  return {
    stats: {
      proposals,
      sessions: { total: sessList.length, lastDate: sessList[0]?.session_date ?? null, attendeeCount }
    },
    error: null
  }
}
