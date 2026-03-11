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

/** 3-phase pipeline definition (v2: progressive assembly replaces Visuals + Build) */
export const PIPELINE_PHASES: ReadonlyArray<{ id: number; name: string; skill: string }> = [
  { id: 1, name: 'Strategy & Layout', skill: 'website-strategist' },
  { id: 2, name: 'Copy', skill: 'copywriting' },
  { id: 3, name: 'Assembly', skill: 'progressive-assembly' },
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
    3: 'code',
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
export type AgentRole = 'strategist' | 'copywriter' | 'visual-artist' | 'builder' | 'editor';

export const AGENT_BADGES: Record<AgentRole, { label: string; color: string }> = {
  strategist: { label: 'Strategist', color: 'text-blue-500' },
  copywriter: { label: 'Copywriter', color: 'text-violet-500' },
  'visual-artist': { label: 'Visual Artist', color: 'text-pink-500' },
  builder: { label: 'Builder', color: 'text-emerald-500' },
  editor: { label: 'Editor', color: 'text-amber-500' },
};

/** Maps phase index (0-based) to the agent responsible */
export const PHASE_AGENT_MAP: Record<number, AgentRole> = {
  0: 'strategist',
  1: 'copywriter',
  2: 'editor',
};

// ---------------------------------------------------------------------------
// Section data model (progressive assembly)
// ---------------------------------------------------------------------------

export type SectionType =
  | 'hero'
  | 'problem'
  | 'solution'
  | 'features'
  | 'social-proof'
  | 'cta'
  | 'faq'
  | 'footer'
  | 'pricing'
  | 'comparison'
  | 'stats'
  | 'how-it-works';

export type LayoutVariant =
  | 'centered'
  | 'split-left'
  | 'split-right'
  | 'cards-grid'
  | 'gradient'
  | 'alternating'
  | 'logo-banner'
  | 'metrics-bar'
  | 'case-study'
  | 'review-badges';

export type AssetStrategy = 'image' | 'svg' | 'icon' | 'none';

export type SectionDividerType = 'wave' | 'diagonal' | 'curve' | 'mesh' | 'none';

export interface ContentBlock {
  type: 'stat' | 'bullet' | 'quote' | 'step';
  label: string;
  value: string;
  icon?: string;
}

export type AssetStatus = 'idle' | 'generating' | 'complete' | 'failed';

export interface LandingSection {
  id: string;
  type: SectionType;
  order: number;
  copy: {
    headline: string;
    subhead: string;
    body: string;
    cta: string;
    micro_copy?: string;
  };
  layout_variant: LayoutVariant;
  image_url: string | null;
  image_status: AssetStatus;
  svg_code: string | null;
  svg_status: AssetStatus;
  style: {
    bg_color: string;
    text_color: string;
    accent_color: string;
  };
  content_blocks?: ContentBlock[];
  asset_strategy?: AssetStrategy;
  divider?: SectionDividerType;
  icon_name?: string;
  form?: FormConfig;
}

// ---------------------------------------------------------------------------
// Form data model (CTA inline forms)
// ---------------------------------------------------------------------------

export interface FormField {
  name: string;
  type: 'text' | 'email' | 'tel' | 'textarea';
  label: string;
  required: boolean;
  placeholder?: string;
}

export interface FormConfig {
  fields: FormField[];
  submit_label: string;
  success_message: string;
  notification_email?: string;
}

export const DEFAULT_CTA_FORM: FormConfig = {
  fields: [
    { name: 'email', type: 'email', label: 'Email', required: true, placeholder: 'you@company.com' },
    { name: 'name', type: 'text', label: 'Name', required: false, placeholder: 'Your name' },
  ],
  submit_label: 'Get Started',
  success_message: 'Thanks! We\'ll be in touch soon.',
};

export interface BrandConfig {
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  bg_color: string;
  text_color: string;
  font_heading: string;
  font_body: string;
  show_dividers?: boolean;
}

// ---------------------------------------------------------------------------
// SEO configuration (US-021)
// ---------------------------------------------------------------------------

export interface SeoConfig {
  title: string;
  description: string;
  og_image_url?: string;
  keywords?: string[];
  canonical_url?: string;
  gtm_id?: string;
  facebook_pixel_id?: string;
  custom_head_script?: string;
}

/**
 * Auto-generate sensible SEO defaults from the hero section copy.
 * Called when the user opens the SEO panel for the first time (no saved config).
 */
export function generateDefaultSeo(sections: LandingSection[]): SeoConfig {
  const hero = sections.find(s => s.type === 'hero');
  return {
    title: hero?.copy.headline ?? 'Landing Page',
    description: (hero?.copy.subhead ?? hero?.copy.body ?? '').slice(0, 160),
  };
}
