export type WarmthTier = 'hot' | 'warm' | 'cool' | 'cold';
export type TrendingDirection = 'up' | 'down' | 'stable';

export interface GraphCompany {
  id: string;
  name: string;
  industry: string | null;
  domain: string | null;
}

export interface GraphDeal {
  id: string;
  name: string;
  value: number | null;
  stage_id: string | null;
  probability: number | null;
  status: string | null;
  health_status: string | null;
  health_score: number | null;
  role: string | null;
}

export interface GraphContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string;
  title: string | null;
  company: string | null;
  company_id: string | null;
  owner_id: string | null;

  // Warmth data (nullable — may not have scores yet)
  warmth_score: number | null;
  warmth_delta: number | null;
  tier: WarmthTier | null;
  recency_score: number | null;
  engagement_score: number | null;
  deal_momentum_score: number | null;
  multi_thread_score: number | null;
  sentiment_score: number | null;
  last_interaction_at: string | null;
  trending_direction: TrendingDirection | null;

  // Company object (nullable)
  company_obj: GraphCompany | null;

  // Deals array (may be empty)
  deals: GraphDeal[];
}

export interface GraphNode extends GraphContact {
  // Computed position
  x: number;
  y: number;
  radius: number; // Visual radius of the node
  angle: number;  // Radial angle from centre
}
