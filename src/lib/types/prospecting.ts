// Prospecting & ICP Profile Types

// ---------------------------------------------------------------------------
// ICP Criteria — targeting parameters stored as JSONB in icp_profiles.criteria
// ---------------------------------------------------------------------------

export interface ICPCriteria {
  // Firmographic criteria (used by both ICP and persona)
  industries?: string[];
  employee_ranges?: { min: number; max: number }[];
  funding_stages?: string[];
  seniority_levels?: string[];
  departments?: string[];
  title_keywords?: string[];
  title_search_mode?: 'smart' | 'exact' | 'any';
  location_countries?: string[];
  location_regions?: string[];
  location_cities?: string[];
  technology_keywords?: string[];
  revenue_range?: { min: number; max: number };
  custom_keywords?: string[];

  // Persona-specific fields (only used when profile_type = 'persona')
  pain_points?: string[];
  buying_triggers?: string[];
  messaging_angle?: string;
  product_tag?: string;
}

// ---------------------------------------------------------------------------
// ICP Profile — maps to public.icp_profiles table
// ---------------------------------------------------------------------------

export type ICPTargetProvider = 'apollo' | 'ai_ark' | 'both';

export type ICPProfileType = 'icp' | 'persona';

export type ICPStatus =
  | 'draft'
  | 'testing'
  | 'pending_approval'
  | 'approved'
  | 'active'
  | 'archived';

export type ICPVisibility = 'team_only' | 'shared' | 'client_visible';

export interface ICPProfile {
  id: string;
  organization_id: string;
  created_by: string;
  name: string;
  description: string | null;
  criteria: ICPCriteria;
  profile_type?: ICPProfileType;
  parent_icp_id?: string | null;
  target_provider: ICPTargetProvider;
  status: ICPStatus;
  visibility: ICPVisibility;
  is_active: boolean;
  linked_table_id?: string | null;
  fact_profile_id?: string | null;
  product_profile_id?: string | null;
  last_tested_at: string | null;
  last_test_result_count: number | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// ICP Profile mutation payloads
// ---------------------------------------------------------------------------

export interface CreateICPProfilePayload {
  organization_id: string;
  created_by: string;
  name: string;
  description?: string | null;
  criteria: ICPCriteria;
  profile_type?: ICPProfileType;
  parent_icp_id?: string | null;
  target_provider?: ICPTargetProvider;
  status?: ICPStatus;
  visibility?: ICPVisibility;
  is_active?: boolean;
  fact_profile_id?: string | null;
  product_profile_id?: string | null;
}

export interface UpdateICPProfilePayload {
  name?: string;
  description?: string | null;
  criteria?: ICPCriteria;
  profile_type?: ICPProfileType;
  parent_icp_id?: string | null;
  target_provider?: ICPTargetProvider;
  status?: ICPStatus;
  visibility?: ICPVisibility;
  is_active?: boolean;
  fact_profile_id?: string | null;
  product_profile_id?: string | null;
  last_tested_at?: string | null;
  last_test_result_count?: number | null;
}

// ---------------------------------------------------------------------------
// ICP Search History — maps to public.icp_search_history table
// ---------------------------------------------------------------------------

export type SearchProvider = 'apollo' | 'ai_ark';

export interface ICPSearchHistoryEntry {
  id: string;
  icp_profile_id: string | null;
  organization_id: string;
  searched_by: string;
  provider: SearchProvider;
  search_params: Record<string, unknown>;
  result_count: number | null;
  credits_consumed: number | null;
  duration_ms: number | null;
  created_at: string;
}
