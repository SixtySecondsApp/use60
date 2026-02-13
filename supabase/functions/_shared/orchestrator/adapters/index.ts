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

/**
 * Registry of all available skill adapters
 *
 * Key: skill name (matches SequenceStep.skill)
 * Value: SkillAdapter implementation
 */
export const ADAPTER_REGISTRY: AdapterRegistry = {
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
