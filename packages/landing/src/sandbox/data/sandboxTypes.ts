/**
 * Sandbox Data Types
 *
 * Mirrors the real 60 app's data structures for pixel-perfect demo rendering.
 * No Supabase dependencies — all data is mock/generated.
 */

export interface SandboxUser {
  id: string;
  full_name: string;
  email: string;
  avatar_url?: string;
  initials: string;
}

export interface SandboxOrg {
  id: string;
  name: string;
  logo_url?: string;
  currency_symbol: string;
}

export interface SandboxCompany {
  id: string;
  name: string;
  domain: string;
  industry?: string;
  size?: string;
  location?: string;
  logo_url?: string;
  isVisitorCompany?: boolean;
}

export interface SandboxContact {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  title?: string;
  phone?: string;
  company_id: string;
  company_name: string;
  linkedin_url?: string;
  avatar_url?: string;
  owner_id?: string;
  owner_initials?: string;
  is_primary?: boolean;
  engagement_level: 'hot' | 'warm' | 'cold';
  last_interaction_at?: string;
  isVisitor?: boolean;
}

export type DealStage =
  | 'lead'
  | 'qualified'
  | 'proposal'
  | 'negotiation'
  | 'closed_won'
  | 'closed_lost';

export interface SandboxDeal {
  id: string;
  name: string;
  company_id: string;
  company_name: string;
  company_domain?: string;
  value: number;
  stage: DealStage;
  stage_color: string;
  health_score: number;
  health_status: 'healthy' | 'warning' | 'critical' | 'stalled';
  momentum_score: number;
  probability: number;
  owner_id: string;
  owner_initials: string;
  primary_contact_id?: string;
  primary_contact_name?: string;
  expected_close_date?: string;
  days_in_stage: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  risk_factors?: string[];
  next_steps?: string;
  next_actions?: string[];
  relationship_health_status?: 'healthy' | 'at_risk' | 'critical' | 'ghost';
  contact_count?: number;
  created_at: string;
  isVisitorDeal?: boolean;
}

export interface SandboxMeeting {
  id: string;
  title: string;
  summary?: string;
  meeting_start: string;
  meeting_end: string;
  duration_minutes: number;
  attendees: { name: string; title?: string; company?: string }[];
  company_id?: string;
  company_name?: string;
  deal_id?: string;
  source: 'fathom' | 'zoom' | 'teams' | 'google_meet' | '60_notetaker';
  sentiment_score?: number;
  sentiment_label?: 'positive' | 'neutral' | 'challenging';
  coach_rating?: number;
  talk_time_rep_pct?: number;
  talk_time_customer_pct?: number;
  talk_time_judgement?: 'good' | 'high' | 'low';
  coach_summary?: string;
  action_items?: { text: string; completed: boolean }[];
  summary_oneliner?: string;
  next_steps_oneliner?: string;
  next_actions?: string[];
  talking_points?: string[];
  risk_signals?: string[];
  has_recording?: boolean;
  prep?: SandboxMeetingPrep;
}

export interface SandboxMeetingPrep {
  company_overview: string;
  talking_points: string[];
  risk_signals: string[];
  questions_to_ask: string[];
  deal_context: string;
}

export type ActivityType = 'call' | 'email' | 'meeting' | 'task' | 'note' | 'deal_update';

export interface SandboxActivity {
  id: string;
  type: ActivityType;
  subject: string;
  details?: string;
  contact_name?: string;
  company_name?: string;
  deal_name?: string;
  created_at: string;
}

export interface SandboxEmailDraft {
  to_name: string;
  to_email: string;
  to_title?: string;
  to_company: string;
  subject: string;
  body: string;
  reasoning?: string;
}

/** Dashboard KPIs matching real app's 4 MetricCards */
export interface SandboxMetricCard {
  title: string;
  value: number;
  target: number;
  trend: number;
  previousPeriodTotal?: number;
  totalTrend?: number;
  icon: 'revenue' | 'outbound' | 'meetings' | 'proposals';
  color: 'emerald' | 'blue' | 'violet' | 'orange';
}

export interface SandboxKPIs {
  metrics: SandboxMetricCard[];
}

export interface SandboxSlackMessage {
  channel: string;
  title: string;
  body: string;
  accent_color: string;
  fields?: { label: string; value: string }[];
  actions?: string[];
  timestamp: string;
}

/** Complete sandbox dataset */
export interface SandboxCompetitor {
  name: string;
  domain: string;
  differentiators: string[];
}

export interface SandboxData {
  user: SandboxUser;
  org: SandboxOrg;
  companies: SandboxCompany[];
  contacts: SandboxContact[];
  deals: SandboxDeal[];
  meetings: SandboxMeeting[];
  activities: SandboxActivity[];
  kpis: SandboxKPIs;
  emailDraft: SandboxEmailDraft;
  slackMessages: SandboxSlackMessage[];
  proposals: SandboxProposal[];
  visitorCompany: SandboxCompany;
  visitorDeal: SandboxDeal;
  competitive?: SandboxCompetitor[];
}

/** A pre-loaded proposal for the sandbox demo */
export interface SandboxProposal {
  id: string;
  title: string;
  deal_name: string;
  company_name: string;
  contact_name: string;
  status: 'draft' | 'sent' | 'viewed' | 'signed';
  created_at: string;
  value: number;
  sections: {
    id: string;
    type: 'cover' | 'executive_summary' | 'problem' | 'solution' | 'approach' | 'timeline' | 'pricing' | 'terms';
    title: string;
    content: string;
    order: number;
  }[];
  brand_color: string;
}

/** Active sandbox view */
export type SandboxView =
  | 'dashboard'
  | 'pipeline'
  | 'contacts'
  | 'meetings'
  | 'email'
  | 'proposals'
  | 'copilot';

/** Logo.dev URL for company logos — uses public token from main app */
const LOGODEV_TOKEN = 'pk_X-1ZO13GSgeOoUrIuJ6GMQ';

export function getLogoDevUrl(domain: string, size = 128): string {
  const clean = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  return `https://img.logo.dev/${clean}?token=${LOGODEV_TOKEN}&size=${size}&format=png`;
}

/** Extract a plausible domain from a company name */
export function companyToDomain(companyName: string): string {
  return companyName.toLowerCase().replace(/[^a-z0-9]+/g, '') + '.com';
}

/** Stage metadata matching real pipeline */
export const STAGE_META: Record<DealStage, { label: string; color: string }> = {
  lead: { label: 'Lead', color: '#6366f1' },
  qualified: { label: 'Qualified', color: '#3b82f6' },
  proposal: { label: 'Proposal', color: '#8b5cf6' },
  negotiation: { label: 'Negotiation', color: '#f59e0b' },
  closed_won: { label: 'Closed Won', color: '#10b981' },
  closed_lost: { label: 'Closed Lost', color: '#ef4444' },
};
