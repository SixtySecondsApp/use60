import type { EventCategory } from './types.ts';

// Event type → category mapping + detail schema description
export interface EventTypeDefinition {
  category: EventCategory;
  description: string;
  detailSchema: Record<string, string>; // field → description (for documentation, not runtime validation)
}

// All 18 event types from the PRD
export const EVENT_TYPES: Record<string, EventTypeDefinition> = {
  commitment_made: {
    category: 'commitment',
    description: 'A promise or commitment was made',
    detailSchema: {
      owner: "'rep' | 'prospect'",
      action: 'string — what was committed',
      deadline: 'string | null — ISO date if mentioned',
      status: "'pending' | 'fulfilled' | 'broken'",
    },
  },
  commitment_fulfilled: {
    category: 'commitment',
    description: 'A previous commitment was completed',
    detailSchema: {
      original_commitment_id: 'uuid — the commitment_made event ID',
      fulfilled_at: 'string — ISO timestamp',
      method: 'string — how it was fulfilled',
    },
  },
  commitment_broken: {
    category: 'commitment',
    description: 'A commitment deadline passed without completion',
    detailSchema: {
      original_commitment_id: 'uuid',
      days_overdue: 'number',
      acknowledged: 'boolean — did the person acknowledge the miss',
    },
  },
  objection_raised: {
    category: 'objection',
    description: 'Prospect raised a concern or pushback',
    detailSchema: {
      objection_type: "'budget' | 'timeline' | 'authority' | 'need' | 'competition' | 'technical' | 'other'",
      severity: "'blocking' | 'concern' | 'minor'",
    },
  },
  objection_handled: {
    category: 'objection',
    description: "Rep's response to an objection",
    detailSchema: {
      original_objection_id: 'uuid',
      handling_approach: 'string',
      resolution: "'resolved' | 'deferred' | 'unresolved'",
    },
  },
  competitor_mentioned: {
    category: 'competitive',
    description: 'A competitor was referenced',
    detailSchema: {
      competitor_name: 'string',
      context: "'evaluating' | 'using_currently' | 'considered_previously' | 'mentioned_casually'",
      sentiment: "'positive' | 'neutral' | 'negative'",
    },
  },
  stakeholder_identified: {
    category: 'stakeholder',
    description: 'New person entered the deal',
    detailSchema: {
      contact_id: 'string',
      name: 'string',
      role: 'string',
      influence_level: "'decision_maker' | 'champion' | 'influencer' | 'blocker' | 'user' | 'unknown'",
    },
  },
  stakeholder_change: {
    category: 'stakeholder',
    description: 'Role change, departure, or engagement shift',
    detailSchema: {
      contact_id: 'string',
      change_type: "'departed' | 'promoted' | 'role_changed' | 'disengaged' | 're-engaged'",
      previous_state: 'string',
      new_state: 'string',
    },
  },
  sentiment_shift: {
    category: 'sentiment',
    description: 'Overall deal sentiment changed notably',
    detailSchema: {
      direction: "'positive' | 'negative' | 'neutral'",
      from_score: 'number',
      to_score: 'number',
      trigger: 'string — what caused the shift',
    },
  },
  timeline_signal: {
    category: 'timeline',
    description: 'Close date or timeline indication',
    detailSchema: {
      signal_type: "'target_date_mentioned' | 'date_pushed' | 'urgency_expressed' | 'stall_language' | 'acceleration'",
      date_mentioned: 'string | null',
      confidence: 'number',
    },
  },
  budget_signal: {
    category: 'commercial',
    description: 'Financial information signal',
    detailSchema: {
      signal_type: "'budget_stated' | 'budget_objection' | 'budget_approved' | 'budget_increased' | 'budget_reduced'",
      amount: 'number | null',
      currency: 'string | null',
      context: 'string',
    },
  },
  authority_signal: {
    category: 'signal',
    description: 'Decision-making process indicator',
    detailSchema: {
      signal_type: "'decision_maker_identified' | 'approval_process_described' | 'committee_mentioned' | 'sign_off_required'",
      details: 'string',
    },
  },
  need_signal: {
    category: 'signal',
    description: 'Pain point or requirement',
    detailSchema: {
      signal_type: "'pain_point_stated' | 'requirement_defined' | 'use_case_described' | 'priority_ranked'",
      importance: "'critical' | 'important' | 'nice_to_have'",
    },
  },
  next_step_agreed: {
    category: 'commitment',
    description: 'Specific next action agreed upon',
    detailSchema: {
      action: 'string',
      owner: "'rep' | 'prospect' | 'mutual'",
      target_date: 'string | null',
      type: "'meeting' | 'deliverable' | 'decision' | 'introduction' | 'other'",
    },
  },
  meeting_summary: {
    category: 'signal',
    description: 'High-level meeting record',
    detailSchema: {
      meeting_type: "'discovery' | 'demo' | 'negotiation' | 'review' | 'other'",
      duration_minutes: 'number',
      attendees: 'string[]',
      key_topics: 'string[]',
      overall_sentiment: 'number',
    },
  },
  email_exchange: {
    category: 'signal',
    description: 'Notable email interaction',
    detailSchema: {
      direction: "'inbound' | 'outbound'",
      tone: "'positive' | 'neutral' | 'negative' | 'urgent'",
      response_time_hours: 'number | null',
      thread_depth: 'number',
    },
  },
  stage_progression: {
    category: 'signal',
    description: 'Deal stage changed',
    detailSchema: {
      from_stage: 'string',
      to_stage: 'string',
      reason: 'string',
      confidence: 'number',
    },
  },
  risk_flag: {
    category: 'signal',
    description: 'Compound risk pattern detected',
    detailSchema: {
      risk_type: 'string',
      severity: "'critical' | 'high' | 'medium' | 'low'",
      contributing_events: 'string[] — event IDs',
      recommended_action: 'string',
    },
  },
};

// Valid event categories
export const EVENT_CATEGORIES: EventCategory[] = [
  'commitment',
  'objection',
  'signal',
  'stakeholder',
  'sentiment',
  'competitive',
  'timeline',
  'commercial',
];

// Type guard
export function isValidEventType(type: string): type is keyof typeof EVENT_TYPES {
  return type in EVENT_TYPES;
}

// Get category for an event type
export function getCategoryForType(type: string): EventCategory | null {
  return EVENT_TYPES[type]?.category ?? null;
}

// Validate that event detail has the required fields for its type.
// Lightweight runtime check — returns list of missing fields.
export function validateEventDetail(eventType: string, detail: Record<string, unknown>): string[] {
  const def = EVENT_TYPES[eventType];
  if (!def) return [`Unknown event type: ${eventType}`];

  const missing: string[] = [];
  for (const field of Object.keys(def.detailSchema)) {
    if (!(field in detail)) {
      missing.push(field);
    }
  }
  return missing;
}

// Get all event types for a category
export function getTypesForCategory(category: EventCategory): string[] {
  return Object.entries(EVENT_TYPES)
    .filter(([_, def]) => def.category === category)
    .map(([type]) => type);
}
