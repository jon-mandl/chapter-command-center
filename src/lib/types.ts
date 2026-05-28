// Shared types — mirror the Supabase schema in public.*
// Source of truth is the Supabase project (yjwttrfpkrorzabcghru). When the
// schema changes, regenerate this file.

export type ID = string

export interface Chapter {
  id: ID
  name: string
  city: string | null
  state: string | null
  created_at: string
  updated_at: string
}

export interface LocalUnion {
  id: ID
  chapter_id: ID
  local_number: number
  jurisdiction: string | null
  city: string | null
  state: string | null
  created_at: string
  updated_at: string
}

export type NegotiationStatus = 'Active' | 'Settled' | 'Archived'

export interface NegotiationCycle {
  id: ID
  chapter_id: ID
  local_union_id: ID
  name: string
  status: NegotiationStatus
  cba_expiration_date: string | null
  proposed_effective_date: string | null
  classification: string
  notes: string | null
  created_at: string
  updated_at: string
}

export interface NegotiationSession {
  id: ID
  cycle_id: ID
  session_date: string
  location: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type AttendeeRole = 'Management' | 'Labor'

export interface SessionAttendee {
  id: ID
  session_id: ID
  name: string
  role: AttendeeRole
  title: string | null
  created_at: string
}

export type ProposalCategory = 'Economic' | 'Language'
export type ProposalStatus = 'Open' | 'TA' | 'Withdrawn' | 'Rejected'
export type ProposedBy = 'NECA' | 'IBEW'

export interface Proposal {
  id: ID
  cycle_id: ID
  title: string
  category: ProposalCategory
  article_reference: string | null
  current_language: string | null
  proposed_change: string | null
  proposed_by: ProposedBy | null
  status: ProposalStatus
  sort_order: number
  notes: string | null
  created_at: string
  updated_at: string
}

export type PositionSide = 'Management' | 'Labor'
export type PositionUnit = '$/hr' | '% of gross' | '$/wk'

export interface ProposalPosition {
  id: ID
  proposal_id: ID
  session_id: ID | null
  side: PositionSide
  position_text: string
  amount: number | null
  unit: PositionUnit | null
  position_date: string
  created_at: string
}

export type GrievanceStage = 'Filed' | 'LMC' | 'CIR' | 'Arbitration' | 'Closed' | 'Withdrawn'

export interface Grievance {
  id: ID
  chapter_id: ID
  grievance_number: string | null
  title: string
  employer_name: string | null
  employer_id: ID | null
  filed_date: string
  stage: GrievanceStage
  description: string | null
  resolution: string | null
  resolved_date: string | null
  is_locked: boolean
  local_union_id: ID | null
  created_at: string
  updated_at: string
}

export interface GrievanceDocument {
  id: ID
  grievance_id: ID
  file_name: string
  file_path: string
  file_size: number | null
  mime_type: string | null
  uploaded_at: string
}

export type CompanyStatus = 'Active' | 'Inactive'

export interface MemberCompany {
  id: ID
  chapter_id: ID
  company_name: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  status: CompanyStatus
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Committee {
  id: ID
  chapter_id: ID
  name: string
  description: string | null
  created_at: string
}

export interface CommitteeMember {
  id: ID
  committee_id: ID
  member_name: string
  company: string | null
  role: string | null
  term_start: string | null
  term_end: string | null
  created_at: string
}

export interface Document {
  id: ID
  chapter_id: ID
  file_name: string
  file_path: string
  category: string | null
  file_size: number | null
  mime_type: string | null
  uploaded_by: string | null
  uploaded_at: string
}

export interface WorkforceHours {
  id: ID
  chapter_id: ID
  local_union_id: ID | null
  company_id: ID | null
  report_month: string
  total_hours: number
  employer_name: string | null
  classification: string | null
  source: string | null
  created_at: string
}

export type DeadlineType = 'CBA Expiration' | 'Filing Deadline' | 'Meeting' | 'Report Due' | 'Other'

export interface Deadline {
  id: ID
  chapter_id: ID
  title: string
  deadline_date: string
  deadline_type: DeadlineType
  related_cycle_id: ID | null
  notes: string | null
  is_complete: boolean
  created_at: string
}

export interface ActivityLogEntry {
  id: ID
  chapter_id: ID
  user_id: ID | null
  user_email: string | null
  action: string
  entity_type: string
  entity_id: ID | null
  entity_label: string | null
  details: unknown
  created_at: string
}

export type Theme = 'light' | 'dark' | 'system'

export interface UserSettings {
  id: ID
  user_id: ID
  chapter_id: ID | null
  display_name: string | null
  role: string | null
  theme: Theme | null
  notifications_enabled: boolean | null
  created_at: string
  updated_at: string
}

export interface WagePackage {
  id: ID
  local_union_id: ID
  classification: string
  effective_date: string | null
  expiration_date: string | null
  created_at: string
  updated_at: string
}

export type WageComponentCategory = 'wage' | 'benefit' | 'deduction'
export type WageComponentUnit = '$/hr' | '% of gross' | '$/wk'

export interface WageComponent {
  id: ID
  wage_package_id: ID
  component_code: string
  component_name: string
  category: WageComponentCategory
  amount: number
  unit: WageComponentUnit
  is_locked: boolean
  sort_order: number
  notes: string | null
  created_at: string
}
