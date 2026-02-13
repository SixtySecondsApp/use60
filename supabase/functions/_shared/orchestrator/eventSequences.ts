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
    {
      skill: 'extract-action-items',
      requires_context: ['tier1', 'tier2'],
      requires_approval: false,
      criticality: 'critical',
      available: true,
    },
    {
      skill: 'detect-intents',
      requires_context: ['tier1'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
    },
    {
      skill: 'suggest-next-actions',
      requires_context: ['tier1', 'tier2'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
    },
    {
      skill: 'draft-followup-email',
      requires_context: ['tier1', 'tier2'],
      requires_approval: true,
      criticality: 'critical',
      available: true,
    },
    {
      skill: 'update-crm-from-meeting',
      requires_context: ['tier2'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
    },
    {
      skill: 'create-tasks-from-actions',
      requires_context: ['tier2'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
    },
    {
      skill: 'notify-slack-summary',
      requires_context: ['tier1'],
      requires_approval: false,
      criticality: 'critical',
      available: true,
    },
    {
      skill: 'coaching-micro-feedback',
      requires_context: ['tier1', 'tier2'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
    },
  ],

  /**
   * Pre-Meeting Briefing
   * Triggered 90 minutes before a meeting (cron:morning)
   */
  pre_meeting_90min: [
    {
      skill: 'enrich-attendees',
      requires_context: ['tier1', 'tier3:apollo'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
    },
    {
      skill: 'pull-crm-history',
      requires_context: ['tier2'],
      requires_approval: false,
      criticality: 'critical',
      available: true,
    },
    {
      skill: 'check-previous-action-items',
      requires_context: ['tier2'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
    },
    {
      skill: 'research-company-news',
      requires_context: ['tier3:news'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
    },
    {
      skill: 'generate-briefing',
      requires_context: ['tier1', 'tier2'],
      requires_approval: false,
      criticality: 'critical',
      available: true,
    },
    {
      skill: 'deliver-slack-briefing',
      requires_context: ['tier1'],
      requires_approval: false,
      criticality: 'critical',
      available: true,
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
   */
  stale_deal_revival: [
    {
      skill: 'research-trigger-events',
      requires_context: ['tier2', 'tier3:news', 'tier3:linkedin'],
      requires_approval: false,
      criticality: 'best-effort',
      available: true,
    },
    {
      skill: 'analyse-stall-reason',
      requires_context: ['tier2'],
      requires_approval: false,
      criticality: 'critical',
      available: true,
    },
    {
      skill: 'draft-reengagement',
      requires_context: ['tier1', 'tier2'],
      requires_approval: true,
      criticality: 'critical',
      available: true,
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
