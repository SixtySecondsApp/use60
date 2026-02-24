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
