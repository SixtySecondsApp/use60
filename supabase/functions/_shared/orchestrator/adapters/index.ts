/**
 * Adapter Registry
 *
 * Central registry for all orchestrator skill adapters. Provides a unified
 * interface to retrieve adapters by skill name.
 *
 * Each adapter wraps an existing edge function to conform to the SkillAdapter
 * interface, enabling the orchestrator to chain skills together in sequences.
 */

import type { AdapterRegistry, SkillAdapter } from '../types.ts';
import { callTypeClassifierAdapter } from './callTypeClassifier.ts';
import { actionItemsAdapter } from './actionItems.ts';
import { nextActionsAdapter } from './nextActions.ts';
import { createTasksAdapter } from './createTasks.ts';
import { emailClassifierAdapter } from './emailClassifier.ts';
import { detectIntentsAdapter } from './detectIntents.ts';
import { proposalGeneratorAdapter } from './proposalGenerator.ts';
import { findAvailableSlotsAdapter, presentTimeOptionsAdapter } from './calendar.ts';
import { draftFollowupEmailAdapter, sendEmailAsRepAdapter } from './emailSend.ts';
import {
  pullCampaignMetricsAdapter,
  classifyRepliesAdapter,
  generateCampaignReportAdapter,
  deliverCampaignSlackAdapter,
} from './campaignMonitor.ts';
import {
  coachingMicroFeedbackAdapter,
  aggregateWeeklyMetricsAdapter,
  correlateWinLossAdapter,
  generateCoachingDigestAdapter,
  deliverCoachingSlackAdapter,
} from './coaching.ts';
import {
  enrichAttendeesAdapter,
  pullCrmHistoryAdapter,
  researchCompanyNewsAdapter,
  generateBriefingAdapter,
  deliverSlackBriefingAdapter,
} from './preMeeting.ts';

// =============================================================================
// Stub adapters for steps that don't have full implementations yet
// =============================================================================

const stubAdapter = (name: string, reason: string): SkillAdapter => ({
  name,
  async execute(): Promise<import('../types.ts').StepResult> {
    console.log(`[${name}] Stub — ${reason}`);
    return { success: true, output: { stub: true, reason }, duration_ms: 0 };
  },
});

/**
 * Registry of all available skill adapters
 *
 * Key: skill name (matches SequenceStep.skill)
 * Value: SkillAdapter implementation
 */
export const ADAPTER_REGISTRY: AdapterRegistry = {
  'classify-call-type': callTypeClassifierAdapter,
  'extract-action-items': actionItemsAdapter,
  'suggest-next-actions': nextActionsAdapter,
  'create-tasks-from-actions': createTasksAdapter,
  'classify-email-intent': emailClassifierAdapter,
  'detect-intents': detectIntentsAdapter,
  'select-proposal-template': proposalGeneratorAdapter,
  'find-available-slots': findAvailableSlotsAdapter,
  'present-time-options': presentTimeOptionsAdapter,
  'draft-followup-email': draftFollowupEmailAdapter,
  'send-email-as-rep': sendEmailAsRepAdapter,
  'pull-campaign-metrics': pullCampaignMetricsAdapter,
  'classify-replies': classifyRepliesAdapter,
  'generate-campaign-report': generateCampaignReportAdapter,
  'deliver-campaign-slack': deliverCampaignSlackAdapter,
  'coaching-micro-feedback': coachingMicroFeedbackAdapter,
  'aggregate-weekly-metrics': aggregateWeeklyMetricsAdapter,
  'correlate-win-loss': correlateWinLossAdapter,
  'generate-coaching-digest': generateCoachingDigestAdapter,
  'deliver-coaching-slack': deliverCoachingSlackAdapter,
  // Stubs — prevent 404 fallthrough to callEdgeFunctionDirect
  'update-crm-from-meeting': stubAdapter('update-crm-from-meeting', 'CRM update not yet implemented'),
  'notify-slack-summary': stubAdapter('notify-slack-summary', 'Slack summary not yet implemented'),

  // Pre-Meeting Briefing (pre_meeting_90min sequence)
  'enrich-attendees': enrichAttendeesAdapter,
  'pull-crm-history': pullCrmHistoryAdapter,
  'research-company-news': researchCompanyNewsAdapter,
  'generate-briefing': generateBriefingAdapter,
  'deliver-slack-briefing': deliverSlackBriefingAdapter,

  // Email Received stubs (email_received sequence)
  'match-to-crm-contact': stubAdapter('match-to-crm-contact', 'CRM contact matching not yet implemented'),

  // Proposal stubs (proposal_generation sequence)
  'populate-proposal': stubAdapter('populate-proposal', 'Proposal population not yet implemented'),
  'generate-custom-sections': stubAdapter('generate-custom-sections', 'Custom section generation not yet implemented'),
  'present-for-review': stubAdapter('present-for-review', 'Review presentation not yet implemented'),

  // Calendar stubs (calendar_find_times sequence)
  'parse-scheduling-request': stubAdapter('parse-scheduling-request', 'Scheduling request parsing not yet implemented'),

  // Stale Deal stubs (stale_deal_revival sequence)
  'research-trigger-events': stubAdapter('research-trigger-events', 'Trigger event research not yet implemented'),
  'analyse-stall-reason': stubAdapter('analyse-stall-reason', 'Stall reason analysis not yet implemented'),
  'draft-reengagement': stubAdapter('draft-reengagement', 'Re-engagement draft not yet implemented'),
};

/**
 * Retrieve an adapter by skill name
 *
 * @param skillName - The name of the skill to retrieve
 * @returns The SkillAdapter implementation, or undefined if not found
 */
export function getAdapter(skillName: string): SkillAdapter | undefined {
  return ADAPTER_REGISTRY[skillName];
}

/**
 * Get all registered skill names
 *
 * @returns Array of registered skill names
 */
export function getRegisteredSkills(): string[] {
  return Object.keys(ADAPTER_REGISTRY);
}

/**
 * Check if a skill is registered
 *
 * @param skillName - The name of the skill to check
 * @returns True if the skill is registered, false otherwise
 */
export function isSkillRegistered(skillName: string): boolean {
  return skillName in ADAPTER_REGISTRY;
}
