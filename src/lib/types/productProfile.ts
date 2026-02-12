// Product Profile Types

import type { ResearchSource, ResearchStatus } from './factProfile';

// ---------------------------------------------------------------------------
// Research data sections (10 sections for product deep-dive)
// ---------------------------------------------------------------------------

export interface ProductOverviewSection {
  description: string;
  tagline: string;
  category: string;
  product_url: string;
}

export interface ProductTargetMarketSection {
  industries: string[];
  company_sizes: string[];
  regions: string[];
  buyer_personas: string[];
}

export interface ProductValuePropositionsSection {
  primary_value_prop: string;
  supporting_points: string[];
  proof_points: string[];
}

export interface ProductPricingSection {
  model: string;
  tiers: { name: string; price: string; features: string[] }[];
  price_range: string;
  billing_options: string[];
}

export interface ProductCompetitorsSection {
  direct_competitors: { name: string; domain: string; differentiator: string }[];
  indirect_competitors: string[];
}

export interface ProductUseCasesSection {
  primary_use_cases: { title: string; description: string; persona: string }[];
  secondary_use_cases: string[];
}

export interface ProductDifferentiatorsSection {
  key_differentiators: string[];
  unique_capabilities: string[];
  awards: string[];
}

export interface ProductPainPointsSolvedSection {
  pain_points: { pain: string; solution: string; impact: string }[];
}

export interface ProductKeyFeaturesSection {
  features: { name: string; description: string; category: string }[];
}

export interface ProductIntegrationsSection {
  native_integrations: string[];
  api_available: boolean;
  platforms: string[];
}

// ---------------------------------------------------------------------------
// Research data — all sections combined
// ---------------------------------------------------------------------------

export interface ProductProfileResearchData {
  overview: ProductOverviewSection;
  target_market: ProductTargetMarketSection;
  value_propositions: ProductValuePropositionsSection;
  pricing: ProductPricingSection;
  competitors: ProductCompetitorsSection;
  use_cases: ProductUseCasesSection;
  differentiators: ProductDifferentiatorsSection;
  pain_points_solved: ProductPainPointsSolvedSection;
  key_features: ProductKeyFeaturesSection;
  integrations: ProductIntegrationsSection;
}

// ---------------------------------------------------------------------------
// Product Profile — maps to public.product_profiles table
// ---------------------------------------------------------------------------

export interface ProductProfile {
  id: string;
  organization_id: string;
  fact_profile_id: string | null;
  created_by: string;
  name: string;
  description: string;
  category: string;
  product_url: string;
  logo_url: string | null;
  research_data: ProductProfileResearchData;
  research_sources: ResearchSource[];
  research_status: ResearchStatus;
  is_primary: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Product Profile mutation payloads
// ---------------------------------------------------------------------------

export interface CreateProductProfilePayload {
  organization_id: string;
  created_by: string;
  name: string;
  description?: string;
  category?: string;
  product_url?: string;
  fact_profile_id?: string;
}

export interface UpdateProductProfilePayload {
  name?: string;
  description?: string;
  category?: string;
  product_url?: string;
  logo_url?: string | null;
  fact_profile_id?: string | null;
  research_data?: Partial<ProductProfileResearchData>;
  research_sources?: ResearchSource[];
  research_status?: ResearchStatus;
  is_primary?: boolean;
}
