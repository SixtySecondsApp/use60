/**
 * Demo Experience — Shared Types
 *
 * Types for the interactive demo flow: research data, agent states,
 * flow steps, and demo actions.
 */

// ============================================================================
// Flow
// ============================================================================

export type DemoStep =
  | 'hero'
  | 'bridge'
  | 'research'
  | 'bento'
  | 'results'
  | 'copilot'
  | 'signup';

// ============================================================================
// Research Data (output of multi-agent research)
// ============================================================================

export interface ResearchData {
  company: {
    name: string;
    domain: string;
    vertical: string;
    product_summary: string;
    value_props: string[];
    employee_range?: string;
    competitors?: string[];
    icp: {
      title: string;
      company_size: string;
      industry: string;
    };
    // v2 enrichment fields (all optional for backward compat)
    funding_stage?: string | null;
    funding_total?: string | null;
    revenue_range?: string | null;
    tech_stack?: string[];
    leadership_team?: { name: string; title: string }[];
    recent_news?: string[];
    founded_year?: number | null;
    headquarters?: string | null;
  };
  competitive?: {
    competitors: {
      name: string;
      domain: string;
      differentiators: string[];
    }[];
  };
  prospect?: {
    first_name?: string | null;
    last_name?: string | null;
    full_name?: string | null;
    title?: string | null;
    seniority?: string | null;
    department?: string | null;
    headline?: string | null;
    linkedin_url?: string | null;
    photo_url?: string | null;
    company_name?: string | null;
    recent_activity?: string[];
    interests?: string[];
  };
  demo_actions: {
    cold_outreach: {
      target_name: string;
      target_title: string;
      target_company: string;
      personalised_hook: string;
      email_preview: string;
    };
    proposal_draft: {
      prospect_name: string;
      prospect_company: string;
      proposal_title: string;
      key_sections: string[];
    };
    meeting_prep: {
      attendee_name: string;
      attendee_company: string;
      context: string;
      talking_points: string[];
    };
    pipeline_action: {
      deal_name: string;
      deal_value: string;
      days_stale: number;
      health_score: number;
      risk_signal: string;
      suggested_action: string;
      signals: { label: string; type: 'positive' | 'warning' | 'neutral' }[];
    };
  };
  stats: {
    signals_found: number;
    actions_queued: number;
    contacts_identified: number;
    opportunities_mapped: number;
  };
  copilot_responses?: {
    outreach: string;
    proposal: string;
    meeting: string;
    pipeline: string;
  };
  suggested_skills?: {
    id: string;
    label: string;
    desc: string;
    defaultOn: boolean;
  }[];
}

// ============================================================================
// Discovered Contact (AI Ark / Apollo people search)
// ============================================================================

/** Contact discovered via AI Ark / Apollo people search */
export interface DiscoveredContact {
  first_name: string;
  last_name: string;
  full_name: string;
  title: string;
  seniority: string;
  department?: string;
  linkedin_url?: string | null;
  photo_url?: string | null;
  email?: string | null;
  company_name: string;
  location?: string | null;
  recent_posts?: string[];
}

// ============================================================================
// Agent Research State
// ============================================================================

export interface AgentStatus {
  id: string;
  name: string;
  icon: string;
  status: 'idle' | 'working' | 'found' | 'complete';
  finding: string;
  detail: string;
}

// ============================================================================
// Copilot Demo
// ============================================================================

export interface DemoPrompt {
  id: string;
  label: string;
  description: string;
  icon: string;
  iconColor: string;
  prompt: string;
  response: string;
}
