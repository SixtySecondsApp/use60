/**
 * Event-to-Sequence Mappings
 *
 * Defines the skill sequences for each event type.
 * Each sequence is a declarative pipeline of steps with context requirements,
 * approval gates, and criticality levels.
 */

import type { EventType, SequenceStep } from './types.ts';

// =============================================================================
// Event Sequences
// =============================================================================

export const EVENT_SEQUENCES: Record<EventType, SequenceStep[]> = {
  /**
   * Post-Meeting Sequence
   * Triggered when a meeting ends (webhook:meetingbaas)
   */
  meeting_ended: [
    // Wave 1: Classify call type first (gates downstream sales-only steps)
    {
      skill: 'classify-call-type',
      requires_context: ['tier1'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
      depends_on: [],
    },
    // Wave 2: Extract, detect, and coaching run in parallel (all depend on classify for gating)
    {
      skill: 'extract-action-items',
      requires_context: ['tier1', 'tier2'],
      requires_approval: false,
      criticality: 'critical',
      available: true,
      depends_on: ['classify-call-type'],
    },
    {
      skill: 'detect-intents',
      requires_context: ['tier1'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
      depends_on: ['classify-call-type'],
    },
    {
      skill: 'coaching-micro-feedback',
      requires_context: ['tier1', 'tier2'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
      depends_on: ['classify-call-type'],
    },
    // Wave 2b: Check for scheduling intent from detect-intents output
    {
      skill: 'detect-scheduling-intent',
      requires_context: ['tier1'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
      depends_on: ['detect-intents'],
    },
    // Wave 2b: Detect send_proposal intent and kick off proposal generation (PROP-001)
    {
      skill: 'detect-proposal-intent',
      requires_context: ['tier1', 'tier2'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
      depends_on: ['detect-intents'],
    },
    // Wave 3: PROP-002 — Slack HITL DM for proposal approval; pauses sequence for rep action
    {
      skill: 'proposal-approval',
      requires_context: ['tier1'],
      requires_approval: true,
      criticality: 'best-effort',
      available: true,
      depends_on: ['detect-proposal-intent'],
    },
    // Wave 2b: Detect verbal commitment / buying signals
    {
      skill: 'detect-verbal-commitment',
      requires_context: ['tier1'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
      depends_on: ['detect-intents'],
    },
    // Wave 2b: Extract pricing discussion details
    {
      skill: 'extract-pricing-discussion',
      requires_context: ['tier1'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
      depends_on: ['detect-intents'],
    },
    // Wave 2b: Detect new stakeholders mentioned but not in CRM
    {
      skill: 'detect-new-stakeholders',
      requires_context: ['tier1', 'tier2'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
      depends_on: ['extract-action-items'],
    },
    // Wave 2b: Infer attendee stakeholder roles from transcript (REL-003)
    {
      skill: 'infer-attendee-roles',
      requires_context: ['tier1', 'tier2'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
      depends_on: ['classify-call-type'],
    },
    // Wave 3: These depend on extract/detect outputs
    {
      skill: 'suggest-next-actions',
      requires_context: ['tier1', 'tier2'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
      depends_on: ['extract-action-items', 'detect-intents'],
    },
    {
      skill: 'draft-followup-email',
      requires_context: ['tier1', 'tier2'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
      depends_on: ['extract-action-items', 'detect-intents', 'extract-pricing-discussion'],
    },
    // Wave 3: CAL-002 — Slack HITL DM with top 3 slot options; pauses sequence for rep approval
    {
      skill: 'calendar-slot-approval',
      requires_context: ['tier1'],
      requires_approval: true,
      criticality: 'best-effort',
      available: true,
      depends_on: ['detect-scheduling-intent'],
    },
    // Wave 3.5: HITL approval gate — pauses the sequence until the rep acts on the email draft
    {
      skill: 'email-draft-approval',
      requires_context: ['tier1'],
      requires_approval: true,
      criticality: 'best-effort',
      available: true,
      depends_on: ['draft-followup-email'],
    },
    {
      skill: 'update-crm-from-meeting',
      requires_context: ['tier2'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
      depends_on: ['extract-action-items'],
    },
    {
      skill: 'create-tasks-from-actions',
      requires_context: ['tier2'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
      depends_on: ['extract-action-items', 'detect-new-stakeholders'],
    },
    // Wave 4: Create unified Command Centre task from meeting signals
    {
      skill: 'signal-task-processor',
      requires_context: ['tier1', 'tier2'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
      depends_on: ['extract-action-items'],
    },
    // Wave 5: Slack summary after all substantive steps complete (including email-draft-approval gate)
    {
      skill: 'notify-slack-summary',
      requires_context: ['tier1'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
      depends_on: ['suggest-next-actions', 'create-tasks-from-actions', 'signal-task-processor'],
    },
  ],

  /**
   * Pre-Meeting Briefing
   * Triggered 90 minutes before a meeting (cron:morning)
   *
   * Wave 1: enrich-attendees (resolve contacts, company, deal)
   * Wave 2: pull-crm-history + research-company-news (parallel, both use enrich output)
   * Wave 3: generate-briefing (AI synthesis from all upstream)
   * Wave 4: deliver-slack-briefing (Slack Block Kit delivery)
   */
  pre_meeting_90min: [
    // Wave 1: Parallel — attendee enrichment + CRM history
    {
      skill: 'enrich-attendees',
      requires_context: ['tier1', 'tier2'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
      depends_on: [],
    },
    {
      skill: 'pull-crm-history',
      requires_context: ['tier1', 'tier2'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
      depends_on: ['enrich-attendees'],
    },
    // Wave 2: Company research (needs company from enrich-attendees)
    {
      skill: 'research-company-news',
      requires_context: ['tier1'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
      depends_on: ['enrich-attendees'],
    },
    // Wave 3: AI briefing synthesis (needs all upstream data)
    {
      skill: 'generate-briefing',
      requires_context: ['tier1', 'tier2'],
      requires_approval: false,
      criticality: 'critical',
      available: true,
      depends_on: ['enrich-attendees', 'pull-crm-history', 'research-company-news'],
    },
    // Wave 4: Deliver to Slack
    {
      skill: 'deliver-slack-briefing',
      requires_context: ['tier1'],
      requires_approval: false,
      criticality: 'critical',
      available: true,
      depends_on: ['generate-briefing'],
    },
  ],

  /**
   * Email Received Handler
   * Triggered by email webhook, branches based on classification
   */
  email_received: [
    {
      skill: 'classify-email-intent',
      requires_context: ['tier1'],
      requires_approval: false,
      criticality: 'critical',
      available: true,
    },
    {
      skill: 'match-to-crm-contact',
      requires_context: ['tier2'],
      requires_approval: false,
      criticality: 'critical',
      available: true,
    },
    // Branching handled by runner based on classification output
    // (e.g., if reply_required → draft-reply, if booking_request → calendar_find_times)
  ],

  /**
   * Proposal Generation
   * Triggered by user action (slack:button or manual)
   */
  proposal_generation: [
    {
      skill: 'select-proposal-template',
      requires_context: ['tier1', 'tier2'],
      requires_approval: false,
      criticality: 'critical',
      available: true,
    },
    {
      skill: 'populate-proposal',
      requires_context: ['tier2', 'tier3:template'],
      requires_approval: false,
      criticality: 'critical',
      available: true,
    },
    {
      skill: 'generate-custom-sections',
      requires_context: ['tier1', 'tier2'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
    },
    {
      skill: 'present-for-review',
      requires_context: ['tier1'],
      requires_approval: true,
      criticality: 'critical',
      available: true,
    },
  ],

  /**
   * Calendar Scheduling Assistant
   * Triggered by email classification or user request
   */
  calendar_find_times: [
    {
      skill: 'parse-scheduling-request',
      requires_context: ['tier1'],
      requires_approval: false,
      criticality: 'critical',
      available: true,
    },
    {
      skill: 'find-available-slots',
      requires_context: ['tier2'],
      requires_approval: false,
      criticality: 'critical',
      available: true, // CAL-003 completed
    },
    {
      skill: 'present-time-options',
      requires_context: ['tier1'],
      requires_approval: true,
      criticality: 'critical',
      available: true, // CAL-003 completed
    },
  ],

  /**
   * Stale Deal Re-engagement
   * Triggered by cron or manual nudge
   *
   * Wave 1: research-trigger-events (starts immediately)
   * Wave 2: analyse-stall-reason (needs research output)
   * Wave 3: draft-reengagement (needs scored opportunities)
   */
  stale_deal_revival: [
    {
      skill: 'research-trigger-events',
      requires_context: ['tier2', 'tier3:news', 'tier3:linkedin'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
      depends_on: [],  // Wave 1: starts immediately
    },
    {
      skill: 'analyse-stall-reason',
      requires_context: ['tier2'],
      requires_approval: false,
      criticality: 'critical',
      available: true,
      depends_on: ['research-trigger-events'],  // Wave 2: needs research output
    },
    {
      skill: 'draft-reengagement',
      requires_context: ['tier1', 'tier2'],
      requires_approval: true,
      criticality: 'critical',
      available: true,
      depends_on: ['analyse-stall-reason'],  // Wave 3: needs scored opportunities
    },
    // Wave 4: Create unified Command Centre task for stale deal re-engagement
    {
      skill: 'signal-task-processor',
      requires_context: ['tier2'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
      depends_on: ['analyse-stall-reason'],
    },
  ],

  /**
   * Campaign Daily Monitoring
   * Triggered by cron:morning
   */
  campaign_daily_check: [
    {
      skill: 'pull-campaign-metrics',
      requires_context: ['tier1'],
      requires_approval: false,
      criticality: 'critical',
      available: true,
    },
    {
      skill: 'classify-replies',
      requires_context: ['tier1'],
      requires_approval: false,
      criticality: 'critical',
      available: true,
    },
    {
      skill: 'generate-campaign-report',
      requires_context: ['tier1'],
      requires_approval: false,
      criticality: 'critical',
      available: true,
    },
    {
      skill: 'deliver-campaign-slack',
      requires_context: ['tier1'],
      requires_approval: false,
      criticality: 'critical',
      available: true,
    },
  ],

  /**
   * Weekly Coaching Digest
   * Triggered by cron:weekly
   */
  coaching_weekly: [
    {
      skill: 'aggregate-weekly-metrics',
      requires_context: ['tier1', 'tier2'],
      requires_approval: false,
      criticality: 'critical',
      available: true,
    },
    {
      skill: 'correlate-win-loss',
      requires_context: ['tier1', 'tier2'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
    },
    {
      skill: 'generate-coaching-digest',
      requires_context: ['tier1'],
      requires_approval: false,
      criticality: 'critical',
      available: true,
    },
    {
      skill: 'deliver-coaching-slack',
      requires_context: ['tier1'],
      requires_approval: false,
      criticality: 'critical',
      available: true,
    },
  ],

  /**
   * Deal Risk Scan
   * Triggered by cron:daily
   *
   * Wave 1: scan-active-deals (identify at-risk deals)
   * Wave 2: score-deal-risks (calculate risk scores)
   * Wave 3: generate-risk-alerts (create actionable alerts)
   * Wave 4: deliver-risk-slack (Slack delivery)
   */
  deal_risk_scan: [
    // Wave 1: Scan active deals for risk indicators
    {
      skill: 'scan-active-deals',
      requires_context: ['tier2'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
      depends_on: [],
    },
    // Wave 2: Score deal risks based on scan results
    {
      skill: 'score-deal-risks',
      requires_context: ['tier2'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
      depends_on: ['scan-active-deals'],
    },
    // Wave 3: Generate risk alerts
    {
      skill: 'generate-risk-alerts',
      requires_context: ['tier2'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
      depends_on: ['score-deal-risks'],
    },
    // Wave 4: Deliver to Slack + create Command Centre tasks
    {
      skill: 'deliver-risk-slack',
      requires_context: ['tier1'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
      depends_on: ['generate-risk-alerts'],
    },
    {
      skill: 'signal-task-processor',
      requires_context: ['tier2'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
      depends_on: ['score-deal-risks'],
    },
  ],
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the sequence for a given event type
 */
export function getSequenceForEvent(eventType: EventType): SequenceStep[] {
  const sequence = EVENT_SEQUENCES[eventType];
  if (!sequence) {
    throw new Error(`No sequence defined for event type: ${eventType}`);
  }
  return sequence;
}

/**
 * Get only the available (implemented) steps for an event
 */
export function getAvailableSteps(eventType: EventType): SequenceStep[] {
  return getSequenceForEvent(eventType).filter((step) => step.available);
}

/**
 * Get all required context tiers for a sequence
 */
export function getRequiredContextTiers(steps: SequenceStep[]): Set<string> {
  const tiers = new Set<string>();
  for (const step of steps) {
    if (step.available) {
      for (const tier of step.requires_context) {
        tiers.add(tier);
      }
    }
  }
  return tiers;
}

/**
 * Check if a sequence has any approval gates
 */
export function hasApprovalGates(eventType: EventType): boolean {
  return getAvailableSteps(eventType).some((step) => step.requires_approval);
}

/**
 * Get the list of critical steps (failures block sequence)
 */
export function getCriticalSteps(eventType: EventType): SequenceStep[] {
  return getAvailableSteps(eventType).filter(
    (step) => step.criticality === 'critical'
  );
}

// =============================================================================
// Call Type Gating Helpers
// =============================================================================

/** Sales call type keywords (case-insensitive substring match) */
const SALES_TYPE_KEYWORDS = ['discovery', 'demo', 'close'];

/**
 * Extract call type classification from sequence state outputs.
 * Returns the output of the classify-call-type step if present.
 */
export function getCallTypeFromState(
  state: { outputs: Record<string, unknown> }
): { call_type_name: string | null; is_sales: boolean; enable_coaching: boolean } | null {
  const output = state.outputs['classify-call-type'] as
    | { call_type_name?: string; is_sales?: boolean; enable_coaching?: boolean }
    | undefined;
  if (!output) return null;
  return {
    call_type_name: output.call_type_name || null,
    is_sales: output.is_sales ?? true,
    enable_coaching: output.enable_coaching ?? true,
  };
}

/**
 * Check if a call type name indicates a sales conversation.
 * Sales types: Discovery, Demo, Close (names containing those keywords).
 */
export function isSalesCallType(name: string | null | undefined): boolean {
  if (!name) return true; // Default to sales when unknown
  const lower = name.toLowerCase();
  return SALES_TYPE_KEYWORDS.some(kw => lower.includes(kw));
}
