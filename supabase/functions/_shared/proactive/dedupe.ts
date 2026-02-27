/**
 * Proactive Notification Deduplication
 * 
 * Prevents duplicate notifications using slack_notifications_sent table
 * with configurable cooldown windows.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import type { ProactiveNotificationType, DedupeKey } from './types.ts';

export interface CooldownConfig {
  windowMinutes: number;
  keySuffix?: string; // Additional key component (e.g., entity ID)
}

// Default cooldown windows per notification type
const DEFAULT_COOLDOWNS: Record<ProactiveNotificationType, CooldownConfig> = {
  morning_brief: { windowMinutes: 24 * 60 }, // 1 day
  sales_assistant_digest: { windowMinutes: 15 }, // 15 minutes
  pre_meeting_nudge: { windowMinutes: 60, keySuffix: 'entity' }, // 1 hour per meeting
  post_call_summary: { windowMinutes: 24 * 60, keySuffix: 'entity' }, // 1 day per meeting
  stale_deal_alert: { windowMinutes: 7 * 24 * 60, keySuffix: 'entity' }, // 7 days per deal
  deal_momentum_nudge: { windowMinutes: 24 * 60, keySuffix: 'entity' }, // 1 day per deal
  deal_clarification_question: { windowMinutes: 4 * 60, keySuffix: 'entity' }, // 4 hours per deal+field
  email_reply_alert: { windowMinutes: 60, keySuffix: 'entity' }, // 1 hour per thread
  hitl_followup_email: { windowMinutes: 24 * 60, keySuffix: 'entity' }, // 1 day per meeting
  meeting_prep: { windowMinutes: 60, keySuffix: 'entity' }, // 1 hour per meeting
  meeting_debrief: { windowMinutes: 24 * 60, keySuffix: 'entity' }, // 1 day per meeting
  daily_digest: { windowMinutes: 24 * 60 }, // 1 day
  account_signal_alert: { windowMinutes: 24 * 60, keySuffix: 'entity' }, // 1 day per account
  account_intelligence_digest: { windowMinutes: 7 * 24 * 60 }, // 7 days (weekly)
};

/**
 * Generate dedupe key for a notification
 */
export function generateDedupeKey(
  type: ProactiveNotificationType,
  orgId: string,
  recipientId: string,
  entityId?: string
): string {
  const config = DEFAULT_COOLDOWNS[type];
  const keyParts = [type, orgId, recipientId];
  
  if (config.keySuffix === 'entity' && entityId) {
    keyParts.push(entityId);
  }
  
  return keyParts.join(':');
}

/**
 * Check if notification should be sent (not within cooldown)
 */
export async function shouldSendNotification(
  supabase: SupabaseClient,
  type: ProactiveNotificationType,
  orgId: string,
  recipientId: string,
  entityId?: string
): Promise<boolean> {
  const dedupeKey = generateDedupeKey(type, orgId, recipientId, entityId);
  const config = DEFAULT_COOLDOWNS[type];
  
  const windowStart = new Date(Date.now() - config.windowMinutes * 60 * 1000);
  
  // Check for recent sends
  const { data, error } = await supabase
    .from('slack_notifications_sent')
    .select('id')
    .eq('dedupe_key', dedupeKey)
    .gte('sent_at', windowStart.toISOString())
    .limit(1);
  
  if (error) {
    console.error('[proactive/dedupe] Error checking dedupe:', error);
    // Fail open: allow send if check fails
    return true;
  }
  
  // If no recent send found, allow notification
  return !data || data.length === 0;
}

/**
 * Record that a notification was sent
 */
export async function recordNotificationSent(
  supabase: SupabaseClient,
  type: ProactiveNotificationType,
  orgId: string,
  recipientId: string,
  slackChannelId?: string,
  slackTs?: string,
  entityId?: string
): Promise<boolean> {
  const dedupeKey = generateDedupeKey(type, orgId, recipientId, entityId);
  
  const { error } = await supabase
    .from('slack_notifications_sent')
    .insert({
      org_id: orgId,
      feature: type,
      recipient_id: recipientId,
      dedupe_key: dedupeKey,
      slack_channel_id: slackChannelId,
      // Keep backwards compatibility with legacy readers/indexes
      slack_ts: slackTs,
      slack_message_ts: slackTs,
      sent_at: new Date().toISOString(),
      entity_key: entityId || null,
      metadata: entityId ? { entity_id: entityId } : {},
    });
  
  if (error) {
    console.error('[proactive/dedupe] Error recording notification:', error);
    return false;
  }
  
  return true;
}
