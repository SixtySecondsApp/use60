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
import { proposalGeneratorAdapter, populateProposalAdapter, generateCustomSectionsAdapter, presentForReviewAdapter } from './proposalGenerator.ts';
import { findAvailableSlotsAdapter, presentTimeOptionsAdapter, parseSchedulingRequestAdapter } from './calendar.ts';
import { draftFollowupEmailAdapter, sendEmailAsRepAdapter } from './emailSend.ts';
import { matchToCrmContactAdapter } from './emailHandler.ts';
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
import { notifySlackSummaryAdapter } from './notifySlackSummary.ts';
import { crmFieldExtractorAdapter } from './crmFieldExtractor.ts';
import { crmUpdateAdapter } from './crmUpdate.ts';
import { crmFieldClassifierAdapter } from './crmFieldClassifier.ts';
import { crmAutoApplyAdapter } from './crmAutoApply.ts';
import { crmHubSpotSyncAdapter } from './crmHubSpotSync.ts';
import { crmSlackNotifyAdapter } from './crmSlackNotify.ts';
import { researchTriggerEventsAdapter, analyseStallReasonAdapter, draftReengagementAdapter } from './reengagement.ts';
import { apolloSignalAdapter } from './reengagementApollo.ts';
import { apifyNewsAdapter } from './reengagementApify.ts';
import { signalRelevanceScorerAdapter } from './reengagementScorer.ts';
import {
  scanActiveDealsAdapter,
  scoreDealRisksAdapter,
  generateRiskAlertsAdapter,
  deliverRiskSlackAdapter,
} from './dealRisk.ts';
import { pingSlackChannelAdapter } from './pingSlackChannel.ts';
import { updateDealTimelineAdapter } from './updateDealTimeline.ts';

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
  // CRM field extraction + update pipeline (legacy direct-write path)
  'extract-crm-fields': crmFieldExtractorAdapter,
  'update-crm-from-meeting': crmUpdateAdapter,
  'notify-slack-summary': notifySlackSummaryAdapter,

  // CRM Auto-Update Agent pipeline (PRD-03: classify → auto-apply → HubSpot sync → Slack HITL)
  'classify-crm-fields': crmFieldClassifierAdapter,
  'auto-apply-crm-fields': crmAutoApplyAdapter,
  'hubspot-sync-crm-fields': crmHubSpotSyncAdapter,
  'slack-crm-notify': crmSlackNotifyAdapter,

  // Pre-Meeting Briefing (pre_meeting_90min sequence)
  'enrich-attendees': enrichAttendeesAdapter,
  'pull-crm-history': pullCrmHistoryAdapter,
  'research-company-news': researchCompanyNewsAdapter,
  'generate-briefing': generateBriefingAdapter,
  'deliver-slack-briefing': deliverSlackBriefingAdapter,

  // Email Received (email_received sequence)
  'match-to-crm-contact': matchToCrmContactAdapter,

  // Proposal (proposal_generation sequence)
  'populate-proposal': populateProposalAdapter,
  'generate-custom-sections': generateCustomSectionsAdapter,
  'present-for-review': presentForReviewAdapter,

  // Calendar (calendar_find_times sequence)
  'parse-scheduling-request': parseSchedulingRequestAdapter,

  // Stale Deal Revival (stale_deal_revival sequence)
  'research-trigger-events': researchTriggerEventsAdapter,
  'analyse-stall-reason': analyseStallReasonAdapter,
  'draft-reengagement': draftReengagementAdapter,

  // Re-engagement signal pipeline (reengagement_trigger sequence — REN-003, REN-004, REN-005)
  'apollo-signal-scan': apolloSignalAdapter,
  'apify-news-scan': apifyNewsAdapter,
  'score-reengagement-signals': signalRelevanceScorerAdapter,

  // Deal Risk Scan (deal_risk_scan sequence)
  'scan-active-deals': scanActiveDealsAdapter,
  'score-deal-risks': scoreDealRisksAdapter,
  'generate-risk-alerts': generateRiskAlertsAdapter,
  'deliver-risk-slack': deliverRiskSlackAdapter,

  // Check-with-team commitment (meeting_ended sequence, check_with_team intent)
  'ping-slack-channel': pingSlackChannelAdapter,

  // CRM intent updates (timeline_signal, pricing_request, competitive_mention, stakeholder_introduction)
  'update-deal-timeline': updateDealTimelineAdapter,
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
