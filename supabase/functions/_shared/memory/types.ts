// ---- Database row types ----

export interface DealMemoryEvent {
  id: string;
  org_id: string;
  deal_id: string;
  event_type: string;
  event_category: EventCategory;
  source_type: SourceType;
  source_id: string | null;
  source_timestamp: string; // ISO timestamp
  summary: string;
  detail: Record<string, unknown>;
  verbatim_quote: string | null;
  speaker: string | null;
  confidence: number;
  salience: 'high' | 'medium' | 'low';
  is_active: boolean;
  superseded_by: string | null;
  contact_ids: string[];
  extracted_by: string;
  model_used: string | null;
  credit_cost: number;
  created_at: string;
  updated_at: string;
}

export interface DealMemorySnapshot {
  id: string;
  org_id: string;
  deal_id: string;
  narrative: string;
  key_facts: KeyFacts;
  stakeholder_map: Stakeholder[];
  risk_assessment: RiskAssessment;
  sentiment_trajectory: SentimentPoint[];
  open_commitments: Commitment[];
  events_included_through: string;
  event_count: number;
  generated_by: 'scheduled' | 'on_demand' | 'event_threshold';
  model_used: string | null;
  created_at: string;
}

export interface ContactMemory {
  id: string;
  org_id: string;
  contact_id: string;
  communication_style: CommunicationStyle;
  decision_style: DecisionStyle;
  interests: Interest[];
  buying_role_history: BuyingRole[];
  relationship_strength: number;
  total_meetings: number;
  total_emails_sent: number;
  total_emails_received: number;
  last_interaction_at: string | null;
  avg_response_time_hours: number | null;
  summary: string | null;
  summary_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RepMemory {
  id: string;
  org_id: string;
  user_id: string;
  approval_stats: Record<string, ApprovalStat>;
  autonomy_profile: Record<string, AutonomyLevel>;
  talk_ratio_avg: number | null;
  discovery_depth_avg: number | null;
  objection_handling_score: number | null;
  follow_up_speed_avg_hours: number | null;
  win_patterns: DealPattern[];
  loss_patterns: DealPattern[];
  working_hours_observed: WorkingHours;
  feature_usage: Record<string, FeatureUsage>;
  coaching_summary: string | null;
  coaching_summary_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---- Enums / union types ----

export type EventCategory =
  | 'commitment'
  | 'objection'
  | 'signal'
  | 'stakeholder'
  | 'sentiment'
  | 'competitive'
  | 'timeline'
  | 'commercial';

export type SourceType =
  | 'transcript'
  | 'email'
  | 'crm_update'
  | 'agent_inference'
  | 'manual';

// ---- Nested types ----

export interface KeyFacts {
  close_date: string | null;
  amount: number | null;
  stage: string | null;
  champion: { name: string; contact_id: string } | null;
  blockers: string[];
  competitors: string[];
  open_commitments_count: number;
}

export interface Stakeholder {
  contact_id: string;
  name: string;
  role: 'decision_maker' | 'champion' | 'influencer' | 'blocker' | 'user' | 'unknown';
  engagement_level: 'active' | 'passive' | 'disengaged';
  last_active: string | null;
}

export interface RiskAssessment {
  overall_score: number; // 0.0-1.0, higher = more at risk
  factors: RiskFactor[];
}

export interface RiskFactor {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  detail: string;
  contributing_event_ids?: string[];
}

export interface SentimentPoint {
  date: string;
  score: number;
  trigger: string;
}

export interface Commitment {
  event_id: string;
  owner: 'rep' | 'prospect';
  action: string;
  deadline: string | null;
  status: 'pending' | 'fulfilled' | 'broken';
  created_at: string;
}

export interface CommunicationStyle {
  preferred_channel?: string;
  response_speed?: 'fast' | 'moderate' | 'slow';
  formality_level?: 'formal' | 'casual' | 'mixed';
  best_time_to_reach?: string;
}

export interface DecisionStyle {
  approach?: 'data_driven' | 'intuitive' | 'consensus' | 'unilateral';
  risk_tolerance?: 'high' | 'medium' | 'low';
}

export interface Interest {
  topic: string;
  context: string;
  first_mentioned: string;
  times_mentioned: number;
}

export interface BuyingRole {
  deal_id: string;
  role: string;
  confidence: number;
  observed_at: string;
}

export interface ApprovalStat {
  total: number;
  approved: number;
  edited: number;
  rejected: number;
  auto_approved: number;
}

export interface AutonomyLevel {
  level: 'manual' | 'suggest' | 'auto';
  confidence: number;
  last_updated: string;
}

export interface DealPattern {
  pattern: string;
  deals_matched: number;
  confidence: number;
}

export interface WorkingHours {
  typical_start?: string;
  typical_end?: string;
  active_days?: number[];
}

export interface FeatureUsage {
  times_used: number;
  last_used: string;
}

// ---- Reader types ----

export interface EventFilters {
  event_types?: string[];
  event_categories?: EventCategory[];
  source_types?: SourceType[];
  since?: string; // ISO timestamp
  until?: string;
  min_confidence?: number;
  salience?: ('high' | 'medium' | 'low')[];
  contact_ids?: string[];
  limit?: number;
}

export interface ContextOptions {
  tokenBudget?: number;
  includeRAGDepth?: boolean;
  ragQuestions?: string[];
  eventCategories?: EventCategory[];
}

export interface DealContext {
  snapshot: DealMemorySnapshot | null;
  recentEvents: DealMemoryEvent[];
  openCommitments: Commitment[];
  stakeholderMap: Stakeholder[];
  riskFactors: RiskFactor[];
  contactProfiles: ContactMemory[];
  ragContext?: RAGResult[];
  eventCount: number;
  lastMeetingDate: string | null;
  ragQueryCost: number;
}

export interface RAGResult {
  answer: string;
  sources: RAGSource[];
  query_metadata: {
    semantic_query: string | null;
    filters_applied: Record<string, unknown>;
    meetings_searched: number;
    response_time_ms: number;
  };
}

export interface RAGSource {
  source_type: 'meeting' | 'call';
  source_id: string;
  title: string;
  date: string;
  company_name: string | null;
  owner_name: string | null;
  relevance_snippet: string;
  sentiment_score: number | null;
  speaker_name: string | null;
}

export interface RAGFilters {
  deal_id?: string;
  meeting_id?: string;
  contact_id?: string;
  date_from?: string;
  date_to?: string;
  owner_user_id?: string | null;
}
