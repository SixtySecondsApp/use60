// Client Fact Profile Types

// ---------------------------------------------------------------------------
// Research data sections
// ---------------------------------------------------------------------------

export interface CompanyOverviewSection {
  name: string;
  tagline: string;
  description: string;
  founded_year: number | null;
  headquarters: string;
  company_type: string;
  website: string;
}

export interface MarketPositionSection {
  industry: string;
  sub_industries: string[];
  target_market: string;
  market_size: string;
  differentiators: string[];
  competitors: string[];
}

export interface ProductsServicesSection {
  products: string[];
  use_cases: string[];
  pricing_model: string;
  key_features: string[];
}

export interface TeamLeadershipSection {
  employee_count: number | null;
  employee_range: string;
  key_people: { name: string; title: string; linkedin?: string }[];
  departments: string[];
  hiring_signals: string[];
}

export interface FinancialsSection {
  revenue_range: string;
  funding_status: string;
  funding_rounds: { round: string; amount: string; date: string }[];
  total_raised: string;
  investors: string[];
  valuation: string;
}

export interface TechnologySection {
  tech_stack: string[];
  platforms: string[];
  integrations: string[];
}

export interface IdealCustomerIndicatorsSection {
  target_industries: string[];
  target_company_sizes: string[];
  target_roles: string[];
  buying_signals: string[];
  pain_points: string[];
  value_propositions: string[];
}

export interface RecentActivitySection {
  news: { title: string; url: string; date: string }[];
  awards: string[];
  milestones: string[];
  reviews_summary: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Research data — all sections combined
// ---------------------------------------------------------------------------

export interface FactProfileResearchData {
  company_overview: CompanyOverviewSection;
  market_position: MarketPositionSection;
  products_services: ProductsServicesSection;
  team_leadership: TeamLeadershipSection;
  financials: FinancialsSection;
  technology: TechnologySection;
  ideal_customer_indicators: IdealCustomerIndicatorsSection;
  recent_activity: RecentActivitySection;
}

// ---------------------------------------------------------------------------
// Research source — provenance tracking for each data point
// ---------------------------------------------------------------------------

export interface ResearchSource {
  url: string;
  title: string;
  confidence: number; // 0-1
  section: string;
}

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type FactProfileType = 'client_org' | 'target_company';
export type ResearchStatus = 'pending' | 'researching' | 'complete' | 'failed';
export type ApprovalStatus = 'draft' | 'pending_review' | 'approved' | 'changes_requested' | 'archived';

// ---------------------------------------------------------------------------
// Fact Profile — maps to public.client_fact_profiles table
// ---------------------------------------------------------------------------

export interface FactProfile {
  id: string;
  organization_id: string;
  created_by: string;
  company_name: string;
  company_domain: string | null;
  company_logo_url: string | null;
  profile_type: FactProfileType;
  research_data: FactProfileResearchData;
  research_sources: ResearchSource[];
  research_status: ResearchStatus;
  approval_status: ApprovalStatus;
  approval_feedback: string | null;
  approved_by: string | null;
  approved_at: string | null;
  share_token: string;
  is_public: boolean;
  share_password_hash: string | null;
  share_views: number;
  last_viewed_at: string | null;
  share_expires_at: string | null;
  linked_icp_profile_ids: string[];
  version: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Fact Profile mutation payloads
// ---------------------------------------------------------------------------

export interface CreateFactProfilePayload {
  organization_id: string;
  created_by: string;
  company_name: string;
  company_domain?: string | null;
  profile_type?: FactProfileType;
}

export interface UpdateFactProfilePayload {
  company_name?: string;
  company_domain?: string | null;
  company_logo_url?: string | null;
  profile_type?: FactProfileType;
  research_data?: Partial<FactProfileResearchData>;
  research_sources?: ResearchSource[];
  research_status?: ResearchStatus;
  approval_status?: ApprovalStatus;
  approval_feedback?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  is_public?: boolean;
  share_password_hash?: string | null;
  share_expires_at?: string | null;
  linked_icp_profile_ids?: string[];
  version?: number;
}
