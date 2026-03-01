/**
 * Landing Page Builder Types
 * Type definitions for the 4-phase landing page builder pipeline UI:
 *   1. Strategy & Layout  2. Copy  3. Visuals & Animation  4. Build
 */

export type PhaseStatus = 'pending' | 'active' | 'complete' | 'iterating' | 'skipped';

export interface BuilderPhase {
  id: number;
  name: string;
  skill: string;
  status: PhaseStatus;
  deliverable?: PhaseDeliverable;
  gateResponse?: 'approved' | 'iterating' | 'went_back';
}

export type DeliverableType = 'strategy' | 'copy' | 'style' | 'code';

export interface PhaseDeliverable {
  type: DeliverableType;
  summary: string;
  messageId?: string;
  previewData?: Record<string, unknown>;
}

export interface LandingBuilderState {
  phases: BuilderPhase[];
  currentPhase: number;
  deliverables: Record<number, PhaseDeliverable>;
  isExpressMode: boolean;
  skippedPhases: number[];
}

export interface LandingPageGateData {
  phase: number;
  phaseName: string;
  deliverableSummary: string;
  deliverableDetails: Record<string, unknown>;
  options: Array<{
    label: string;
    action: 'approve' | 'iterate' | 'go_back';
    variant: 'default' | 'secondary' | 'ghost';
  }>;
}

/** 4-phase pipeline definition matching LandingPageBuilder.tsx PHASE_PROMPTS */
export const PIPELINE_PHASES: ReadonlyArray<{ id: number; name: string; skill: string }> = [
  { id: 1, name: 'Strategy & Layout', skill: 'website-strategist' },
  { id: 2, name: 'Copy', skill: 'copywriting' },
  { id: 3, name: 'Visuals & Animation', skill: 'visual-assets' },
  { id: 4, name: 'Build', skill: 'frontend-design' },
];

export function createDefaultPhases(): BuilderPhase[] {
  return PIPELINE_PHASES.map((p) => ({
    id: p.id,
    name: p.name,
    skill: p.skill,
    status: 'pending' as PhaseStatus,
  }));
}

export function getDeliverableType(phase: number): DeliverableType {
  const map: Record<number, DeliverableType> = {
    1: 'strategy',
    2: 'copy',
    3: 'style',
    4: 'code',
  };
  return map[phase] ?? 'strategy';
}

// ---------------------------------------------------------------------------
// Auto-research types (populated by landing-research edge function)
// ---------------------------------------------------------------------------

export interface LandingResearchData {
  status: 'pending' | 'running' | 'complete' | 'failed';
  company: {
    name: string;
    description: string;
    industry: string;
    differentiators: string[];
    products: string[];
    customer_segments: string[];
    pricing_approach: string;
  } | null;
  competitors: Array<{
    name: string;
    website: string;
    tagline: string;
    positioning: string;
    landing_page_patterns: string[];
  }>;
  market_context: {
    messaging_patterns: string[];
    social_proof_examples: string[];
    pricing_signals: string[];
    audience_language: string[];
    market_trends: string[];
    buying_triggers: string[];
    review_ratings: string[];
    notable_customers: string[];
  };
  sources: Array<{ title: string; url: string; provider: string }>;
  data_sources?: {
    company: boolean;
    competitors: boolean;
    social_proof: boolean;
    market_trends: boolean;
    exa: boolean;
    brand_guidelines?: boolean;
  };
  brand_guidelines?: {
    colors: Array<{ hex: string; role: string }>;
    typography: Array<{ family: string; usage: string }>;
    logo_url?: string;
    tone: string;
    visual_style: string;
  };
  cost_credits: number;
  duration_ms: number;
}

/** Agent role labels for visible agent badges in ChatMessage */
export type AgentRole = 'strategist' | 'copywriter' | 'visual-artist' | 'builder';

export const AGENT_BADGES: Record<AgentRole, { label: string; color: string }> = {
  strategist: { label: 'Strategist', color: 'text-blue-500' },
  copywriter: { label: 'Copywriter', color: 'text-violet-500' },
  'visual-artist': { label: 'Visual Artist', color: 'text-pink-500' },
  builder: { label: 'Builder', color: 'text-emerald-500' },
};

/** Maps phase index (0-based) to the agent responsible */
export const PHASE_AGENT_MAP: Record<number, AgentRole> = {
  0: 'strategist',
  1: 'copywriter',
  2: 'visual-artist',
  3: 'builder',
};
