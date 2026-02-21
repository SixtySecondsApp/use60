/**
 * Intent Action Registry
 *
 * Maps commitment intent types (from the `detect-intents` edge function) to
 * concrete platform actions. Consumed by the detectIntents adapter and other
 * orchestrator components.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import type { EventType } from './types.ts';

// =============================================================================
// Types
// =============================================================================

/** All supported commitment intent types detected by detect-intents */
export type CommitmentIntent =
  | 'send_proposal'
  | 'schedule_meeting'
  | 'send_content'
  | 'check_with_team'
  | 'pricing_request'
  | 'stakeholder_introduction'
  | 'competitive_mention'
  | 'timeline_signal'
  | 'objection_blocker'
  | 'general';

/** Configuration for how the platform should respond to a detected commitment intent */
export interface IntentActionConfig {
  /** Task type to create in command centre */
  task_type: 'follow_up' | 'internal_action' | 'meeting_prep' | 'email';
  /** Deliverable type for the AI worker */
  deliverable_type:
    | 'email_draft'
    | 'proposal'
    | 'content_draft'
    | 'research_brief'
    | 'meeting_prep'
    | 'slack_message'
    | 'none';
  /** How to notify via Slack */
  slack_action: 'dm_owner' | 'ping_channel' | 'alert_manager' | 'none';
  /** How to resolve the Slack channel (only for ping_channel) */
  channel_resolver?: 'from_context' | 'fixed';
  /** Fixed channel name (only for channel_resolver: 'fixed') */
  fixed_channel?: string;
  /** Whether to auto-generate deliverable via unified-task-ai-worker */
  auto_generate: boolean;
  /** Where to get the deadline */
  deadline_source: 'extracted' | 'fixed';
  /** Fallback expiry in hours when no deadline extracted */
  fallback_expiry_hours: number;
  /** Linked skill to fire (e.g., 'competitor-intel') */
  linked_skill?: string;
  /** Orchestrator event to queue (if maps to an existing event type) */
  orchestrator_event?: EventType;
  /** Minimum confidence to auto-action (below this = suggestion only) */
  confidence_threshold: number;
  /** CRM field updates to suggest */
  crm_updates?: Array<{
    entity: 'deal' | 'contact';
    field: string;
    value_source: 'extracted' | 'fixed';
    fixed_value?: string;
  }>;
  /** Signal type for task-signal-processor */
  signal_type?: string;
}

// =============================================================================
// Registry
// =============================================================================

/** Maps every CommitmentIntent to its platform action configuration */
export const INTENT_ACTION_REGISTRY: Record<CommitmentIntent, IntentActionConfig> = {
  send_proposal: {
    task_type: 'follow_up',
    deliverable_type: 'proposal',
    slack_action: 'dm_owner',
    auto_generate: true,
    deadline_source: 'extracted',
    fallback_expiry_hours: 48,
    orchestrator_event: 'proposal_generation',
    confidence_threshold: 0.7,
    signal_type: 'proposal_requested',
  },

  schedule_meeting: {
    task_type: 'follow_up',
    deliverable_type: 'email_draft',
    slack_action: 'dm_owner',
    auto_generate: true,
    deadline_source: 'extracted',
    fallback_expiry_hours: 24,
    orchestrator_event: 'calendar_find_times',
    confidence_threshold: 0.7,
    signal_type: 'meeting_requested',
  },

  send_content: {
    task_type: 'follow_up',
    deliverable_type: 'content_draft',
    slack_action: 'dm_owner',
    auto_generate: true,
    deadline_source: 'extracted',
    fallback_expiry_hours: 48,
    confidence_threshold: 0.7,
    signal_type: 'content_requested',
  },

  check_with_team: {
    task_type: 'internal_action',
    deliverable_type: 'slack_message',
    slack_action: 'ping_channel',
    channel_resolver: 'from_context',
    auto_generate: false,
    deadline_source: 'extracted',
    fallback_expiry_hours: 24,
    confidence_threshold: 0.7,
    signal_type: 'internal_check_required',
  },

  pricing_request: {
    task_type: 'follow_up',
    deliverable_type: 'proposal',
    slack_action: 'dm_owner',
    auto_generate: true,
    deadline_source: 'extracted',
    fallback_expiry_hours: 48,
    orchestrator_event: 'proposal_generation',
    confidence_threshold: 0.7,
    signal_type: 'pricing_requested',
    crm_updates: [
      {
        entity: 'deal',
        field: 'tags',
        value_source: 'fixed',
        fixed_value: 'Pricing Requested',
      },
    ],
  },

  stakeholder_introduction: {
    task_type: 'follow_up',
    deliverable_type: 'email_draft',
    slack_action: 'dm_owner',
    auto_generate: true,
    deadline_source: 'extracted',
    fallback_expiry_hours: 48,
    confidence_threshold: 0.7,
    signal_type: 'new_stakeholder_identified',
    crm_updates: [
      {
        entity: 'contact',
        field: 'create_stakeholder',
        value_source: 'extracted',
      },
    ],
  },

  competitive_mention: {
    task_type: 'follow_up',
    deliverable_type: 'research_brief',
    slack_action: 'alert_manager',
    auto_generate: true,
    deadline_source: 'extracted',
    fallback_expiry_hours: 72,
    linked_skill: 'competitor-intel',
    confidence_threshold: 0.6,
    signal_type: 'competitive_risk',
    crm_updates: [
      {
        entity: 'deal',
        field: 'meddicc_competition',
        value_source: 'extracted',
      },
    ],
  },

  timeline_signal: {
    task_type: 'follow_up',
    deliverable_type: 'none',
    slack_action: 'dm_owner',
    auto_generate: false,
    deadline_source: 'extracted',
    fallback_expiry_hours: 48,
    confidence_threshold: 0.6,
    signal_type: 'timeline_change',
    crm_updates: [
      {
        entity: 'deal',
        field: 'close_date',
        value_source: 'extracted',
      },
    ],
  },

  objection_blocker: {
    task_type: 'follow_up',
    deliverable_type: 'research_brief',
    slack_action: 'alert_manager',
    auto_generate: true,
    deadline_source: 'extracted',
    fallback_expiry_hours: 72,
    linked_skill: 'objection-to-playbook',
    confidence_threshold: 0.6,
    signal_type: 'objection_identified',
  },

  general: {
    task_type: 'follow_up',
    deliverable_type: 'email_draft',
    slack_action: 'dm_owner',
    auto_generate: true,
    deadline_source: 'extracted',
    fallback_expiry_hours: 48,
    confidence_threshold: 0.8,
    signal_type: 'general_commitment',
  },
};

// =============================================================================
// Channel Keyword Map
// =============================================================================

/**
 * Maps keywords found in a commitment phrase or context to Slack channel names.
 * Used by `resolveSlackChannel` to route `ping_channel` Slack actions.
 */
export const CHANNEL_KEYWORD_MAP: Record<string, string> = {
  technical: '#engineering',
  engineering: '#engineering',
  integration: '#engineering',
  api: '#engineering',
  development: '#engineering',
  legal: '#legal',
  contract: '#legal',
  compliance: '#legal',
  terms: '#legal',
  security: '#security',
  soc: '#security',
  gdpr: '#security',
  infosec: '#security',
  finance: '#finance',
  billing: '#finance',
  invoice: '#finance',
  pricing: '#sales-ops',
  discount: '#sales-ops',
  product: '#product',
  feature: '#product',
  roadmap: '#product',
};

// =============================================================================
// Functions
// =============================================================================

/**
 * Resolves the action configuration for a detected commitment and determines
 * whether the platform should auto-act or surface it as a suggestion.
 *
 * @param commitment - The detected commitment with intent, confidence, and
 *   optional confidence tier from the detect-intents edge function.
 * @returns Config and action flags, or null if the intent is not in the registry.
 */
export function resolveIntentAction(commitment: {
  intent: string;
  confidence: number;
  confidence_tier?: string;
}): {
  config: IntentActionConfig;
  should_auto_action: boolean;
  should_suggest: boolean;
} | null {
  const config = INTENT_ACTION_REGISTRY[commitment.intent as CommitmentIntent];

  if (!config) {
    return null;
  }

  const { confidence, confidence_tier } = commitment;

  const isStrongTier =
    confidence_tier === 'explicit' || confidence_tier === 'strong_implied';

  const should_auto_action =
    confidence >= config.confidence_threshold && isStrongTier;

  const should_suggest =
    !should_auto_action && confidence >= 0.5;

  return { config, should_auto_action, should_suggest };
}

/**
 * Resolves a Slack channel name by scanning the commitment phrase and optional
 * context for keywords defined in `CHANNEL_KEYWORD_MAP`.
 *
 * Intended for use with `check_with_team` and any config with
 * `channel_resolver: 'from_context'`.
 *
 * @param commitment - Object containing the commitment phrase and optional
 *   surrounding context string.
 * @returns The first matching Slack channel name (e.g. `#engineering`), or
 *   null if no keyword matches.
 */
export function resolveSlackChannel(commitment: {
  phrase: string;
  context?: string;
}): string | null {
  const searchText = [commitment.phrase, commitment.context ?? '']
    .join(' ')
    .toLowerCase();

  for (const [keyword, channel] of Object.entries(CHANNEL_KEYWORD_MAP)) {
    if (searchText.includes(keyword)) {
      return channel;
    }
  }

  return null;
}

// =============================================================================
// Intent Categories
// =============================================================================

/**
 * Maps intent category names to the keywords that classify a commitment phrase
 * into that category. Used by `classifyIntentCategory` and
 * `resolveSlackChannelAsync` to route alerts to org-configured channels.
 */
export const INTENT_CATEGORIES = {
  engineering: ['technical', 'engineering', 'integration', 'api', 'development'],
  legal: ['legal', 'contract', 'compliance', 'terms'],
  security: ['security', 'soc', 'gdpr', 'infosec'],
  pricing: ['pricing', 'discount', 'billing', 'invoice', 'finance'],
  product: ['product', 'feature', 'roadmap'],
  competitive: ['competitor', 'competitive', 'alternative', 'comparison'],
  deal_risk: ['risk', 'objection', 'blocker', 'concern', 'pushback', 'delay', 'stall'],
  default: [] as string[], // fallback — matches nothing, used when no other category matches
} as const;

export type IntentCategory = keyof typeof INTENT_CATEGORIES;

// =============================================================================
// Intent Category Classifier
// =============================================================================

/**
 * Classifies a commitment phrase (and optional context) into an intent category
 * by scanning for keywords defined in `INTENT_CATEGORIES`.
 *
 * @param phrase - The commitment phrase to classify.
 * @param context - Optional surrounding context to include in keyword scan.
 * @returns The first matching `IntentCategory`, or `'default'` if no match.
 */
export function classifyIntentCategory(phrase: string, context?: string): IntentCategory {
  const searchText = [phrase, context ?? ''].join(' ').toLowerCase();

  for (const [category, keywords] of Object.entries(INTENT_CATEGORIES)) {
    if (category === 'default') continue;
    for (const keyword of keywords) {
      if (searchText.includes(keyword)) {
        return category as IntentCategory;
      }
    }
  }

  return 'default';
}

// =============================================================================
// Org Alert Channel Map
// =============================================================================

/**
 * Fetches the org-configured Slack alert channels from `slack_notification_settings`.
 * Only returns rows with `feature` prefixed `agent_alert_` that are enabled.
 *
 * Uses the service role key because this runs in edge functions processing
 * signals — not user-facing requests.
 *
 * @param orgId - The organisation ID to look up settings for.
 * @returns A map of intent category name → `{ channel_id, channel_name }`.
 */
export async function getOrgAlertChannelMap(
  orgId: string
): Promise<Record<string, { channel_id: string; channel_name: string }>> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data, error } = await supabase
    .from('slack_notification_settings')
    .select('feature, channel_id, channel_name, is_enabled')
    .eq('org_id', orgId)
    .like('feature', 'agent_alert_%')
    .eq('is_enabled', true);

  if (error || !data) return {};

  const map: Record<string, { channel_id: string; channel_name: string }> = {};
  for (const row of data) {
    if (row.channel_id && row.channel_name) {
      const category = row.feature.replace('agent_alert_', '');
      map[category] = { channel_id: row.channel_id, channel_name: row.channel_name };
    }
  }
  return map;
}

// =============================================================================
// Async Channel Resolver (org-aware)
// =============================================================================

/**
 * Resolves a Slack channel for a commitment, checking org-configured channels
 * first before falling back to the keyword-based `resolveSlackChannel`.
 *
 * Resolution order:
 *   1. Classify the phrase into an `IntentCategory`.
 *   2. If `orgId` provided, look up org-configured channel for that category.
 *   3. If no category match, try the org's `default` fallback channel.
 *   4. Fall back to keyword-based resolution (existing behaviour).
 *
 * @param commitment - Phrase, optional context, and optional org ID.
 * @returns `{ channel_name, channel_id? }` or null if nothing matched.
 */
export async function resolveSlackChannelAsync(commitment: {
  phrase: string;
  context?: string;
  orgId?: string;
}): Promise<{ channel_name: string; channel_id?: string } | null> {
  // 1. If orgId provided, try org-configured channels first
  if (commitment.orgId) {
    const orgChannels = await getOrgAlertChannelMap(commitment.orgId);
    const category = classifyIntentCategory(commitment.phrase, commitment.context);

    if (orgChannels[category]) {
      return orgChannels[category];
    }
    // Try default fallback channel
    if (orgChannels['default']) {
      return orgChannels['default'];
    }
  }

  // 2. Fall back to keyword-based resolution (existing behavior)
  const channelName = resolveSlackChannel(commitment);
  return channelName ? { channel_name: channelName } : null;
}
