/**
 * Triage Rules for Always-On Agent Notifications
 *
 * Implements suppression, deduplication, batching, and priority routing.
 * HEARTBEAT_OK equivalent: suppress empty/low-value notifications.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ============================================================================
// Types
// ============================================================================

export type TriagePriority = 'low' | 'medium' | 'high' | 'urgent';
export type TriageDecision = 'deliver' | 'batch' | 'suppress';
export type DeliveryChannel = 'slack_dm' | 'in_app' | 'email' | 'batch';

export interface TriageInput {
  id: string;
  userId: string;
  orgId: string;
  notificationType: string;
  priority: TriagePriority;
  entityType?: string;
  entityId?: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface TriageResult {
  decision: TriageDecision;
  channel?: DeliveryChannel;
  reason: string;
  batchType?: string;
  batchId?: string;
}

// ============================================================================
// Priority x Action Matrix
// ============================================================================

interface TriageRule {
  defaultPriority: TriagePriority;
  action: TriageDecision;
  batchType?: string;
}

const TRIAGE_MATRIX: Record<string, TriageRule> = {
  pre_meeting_90min:     { defaultPriority: 'high',   action: 'deliver' },
  pre_meeting_nudge:     { defaultPriority: 'high',   action: 'deliver' },
  meeting_prep:          { defaultPriority: 'high',   action: 'deliver' },
  deal_risk_scan:        { defaultPriority: 'high',   action: 'deliver' },
  stale_deal_alert:      { defaultPriority: 'high',   action: 'deliver' },
  meeting_ended:         { defaultPriority: 'medium', action: 'deliver' },
  meeting_debrief:       { defaultPriority: 'medium', action: 'deliver' },
  post_call_summary:     { defaultPriority: 'medium', action: 'deliver' },
  deal_momentum_nudge:   { defaultPriority: 'medium', action: 'batch', batchType: 'daily_digest' },
  email_reply_alert:     { defaultPriority: 'medium', action: 'deliver' },
  campaign_daily_check:  { defaultPriority: 'low',    action: 'batch', batchType: 'daily_digest' },
  coaching_weekly:       { defaultPriority: 'low',    action: 'batch', batchType: 'coaching_digest' },
  account_signal_alert:  { defaultPriority: 'low',    action: 'batch', batchType: 'daily_digest' },
  account_intelligence_digest: { defaultPriority: 'low', action: 'batch', batchType: 'weekly_digest' },
};

// ============================================================================
// Suppression Rules
// ============================================================================

const DEDUP_WINDOW_HOURS = 4;
const COOLDOWN_MAX_PER_HOUR = 3;
const MIN_BATCH_ITEMS = 2;

/**
 * Rule 1: Deduplication — same entity + notification_type within 4 hours
 */
async function checkDeduplication(
  supabase: SupabaseClient,
  input: TriageInput
): Promise<{ suppress: boolean; reason?: string }> {
  if (!input.entityType || !input.entityId) {
    return { suppress: false };
  }

  const windowStart = new Date(Date.now() - DEDUP_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('notification_queue')
    .select('id')
    .eq('user_id', input.userId)
    .eq('entity_type', input.entityType)
    .eq('entity_id', input.entityId)
    .eq('notification_type', input.notificationType)
    .gte('created_at', windowStart)
    .neq('id', input.id)
    .neq('triage_status', 'suppressed')
    .limit(1);

  if (error) {
    console.warn('[triageRules] Dedup check failed, allowing:', error.message);
    return { suppress: false };
  }

  if (data && data.length > 0) {
    return { suppress: true, reason: `Duplicate: same ${input.entityType}+${input.notificationType} within ${DEDUP_WINDOW_HOURS}h` };
  }

  return { suppress: false };
}

/**
 * Rule 2: Cool-down — max N per hour for same notification_type per user
 */
async function checkCooldown(
  supabase: SupabaseClient,
  input: TriageInput
): Promise<{ suppress: boolean; reason?: string }> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from('notification_queue')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', input.userId)
    .eq('notification_type', input.notificationType)
    .gte('created_at', oneHourAgo)
    .neq('id', input.id)
    .neq('triage_status', 'suppressed');

  if (error) {
    console.warn('[triageRules] Cooldown check failed, allowing:', error.message);
    return { suppress: false };
  }

  if ((count || 0) >= COOLDOWN_MAX_PER_HOUR) {
    return { suppress: true, reason: `Cooldown: ${count} ${input.notificationType} notifications in last hour (max ${COOLDOWN_MAX_PER_HOUR})` };
  }

  return { suppress: false };
}

/**
 * Rule 3: Quiet hours — check agent_persona quiet hours config
 */
async function checkQuietHours(
  supabase: SupabaseClient,
  input: TriageInput
): Promise<{ isQuiet: boolean; reason?: string }> {
  const { data: persona } = await supabase
    .rpc('get_agent_persona', { p_user_id: input.userId });

  if (!persona || !Array.isArray(persona) || persona.length === 0) {
    return { isQuiet: false };
  }

  const p = persona[0];
  if (!p.quiet_hours_start || !p.quiet_hours_end) {
    return { isQuiet: false };
  }

  try {
    const now = new Date();
    const userNow = new Date(now.toLocaleString('en-US', { timeZone: p.timezone || 'UTC' }));
    const currentMinutes = userNow.getHours() * 60 + userNow.getMinutes();

    const [startH, startM] = p.quiet_hours_start.split(':').map(Number);
    const [endH, endM] = p.quiet_hours_end.split(':').map(Number);
    const quietStart = startH * 60 + startM;
    const quietEnd = endH * 60 + endM;

    const isQuiet = quietStart > quietEnd
      ? currentMinutes >= quietStart || currentMinutes < quietEnd
      : currentMinutes >= quietStart && currentMinutes < quietEnd;

    if (isQuiet) {
      return { isQuiet: true, reason: 'Outside business hours — queued for morning briefing' };
    }
  } catch {
    // Invalid timezone, proceed
  }

  return { isQuiet: false };
}

/**
 * Rule 4: Empty check — suppress if payload has no actionable content
 */
function checkEmptyPayload(input: TriageInput): { suppress: boolean; reason?: string } {
  const payload = input.payload;

  // Check for explicit empty signals
  if (payload.isEmpty === true || payload.itemCount === 0) {
    return { suppress: true, reason: 'Empty check: no actionable content' };
  }

  // Check for empty summary/message
  if (!payload.summary && !payload.message && !payload.blocks) {
    return { suppress: true, reason: 'Empty check: no content to deliver' };
  }

  return { suppress: false };
}

// ============================================================================
// Main Triage Engine
// ============================================================================

/**
 * Run triage rules on a notification and return the decision
 */
export async function triageNotification(
  supabase: SupabaseClient,
  input: TriageInput
): Promise<TriageResult> {
  // Rule 4: Empty check (cheapest, run first)
  const emptyCheck = checkEmptyPayload(input);
  if (emptyCheck.suppress) {
    return { decision: 'suppress', reason: emptyCheck.reason! };
  }

  // Look up the triage matrix for this notification type
  const rule = TRIAGE_MATRIX[input.notificationType];
  const priority = input.priority || rule?.defaultPriority || 'low';

  // Urgent items always deliver immediately (bypass all rules)
  if (priority === 'urgent') {
    return { decision: 'deliver', channel: 'slack_dm', reason: 'Urgent priority — immediate delivery' };
  }

  // Rule 1: Deduplication
  const dedupCheck = await checkDeduplication(supabase, input);
  if (dedupCheck.suppress) {
    return { decision: 'suppress', reason: dedupCheck.reason! };
  }

  // Rule 2: Cool-down
  const cooldownCheck = await checkCooldown(supabase, input);
  if (cooldownCheck.suppress) {
    return { decision: 'suppress', reason: cooldownCheck.reason! };
  }

  // Rule 3: Quiet hours
  const quietCheck = await checkQuietHours(supabase, input);
  if (quietCheck.isQuiet) {
    return { decision: 'batch', batchType: 'morning_briefing', reason: quietCheck.reason! };
  }

  // Apply the matrix rule
  if (!rule) {
    // Unknown type — deliver at medium priority
    return { decision: 'deliver', channel: 'slack_dm', reason: `Unknown type ${input.notificationType}, delivering by default` };
  }

  if (rule.action === 'batch') {
    return {
      decision: 'batch',
      batchType: rule.batchType || 'daily_digest',
      reason: `${input.notificationType} routes to ${rule.batchType} per triage matrix`,
    };
  }

  // Deliver immediately
  return { decision: 'deliver', channel: 'slack_dm', reason: `${priority} priority ${input.notificationType} — immediate delivery` };
}

/**
 * Assign a notification to a batch, creating one if needed
 */
export async function assignToBatch(
  supabase: SupabaseClient,
  notificationId: string,
  userId: string,
  orgId: string,
  batchType: string
): Promise<string | null> {
  // Look for an existing collecting batch
  const { data: existingBatch } = await supabase
    .from('notification_batches')
    .select('id, item_count, items')
    .eq('user_id', userId)
    .eq('batch_type', batchType)
    .eq('status', 'collecting')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingBatch) {
    // Add to existing batch
    const items = Array.isArray(existingBatch.items) ? existingBatch.items : [];
    items.push(notificationId);

    await supabase
      .from('notification_batches')
      .update({
        item_count: items.length,
        items: items,
        status: items.length >= MIN_BATCH_ITEMS ? 'ready' : 'collecting',
      })
      .eq('id', existingBatch.id);

    return existingBatch.id;
  }

  // Create new batch
  const scheduledFor = getNextBatchDeliveryTime(batchType);

  const { data: newBatch, error } = await supabase
    .from('notification_batches')
    .insert({
      user_id: userId,
      org_id: orgId,
      batch_type: batchType,
      item_count: 1,
      items: [notificationId],
      scheduled_for: scheduledFor,
      status: 'collecting',
    })
    .select('id')
    .single();

  if (error) {
    console.error('[triageRules] Failed to create batch:', error.message);
    return null;
  }

  return newBatch.id;
}

/**
 * Calculate next delivery time for a batch type
 */
function getNextBatchDeliveryTime(batchType: string): string {
  const now = new Date();

  switch (batchType) {
    case 'morning_briefing':
      // Next 8am (handled by morning briefing cron, just set a reasonable time)
      const tomorrow8am = new Date(now);
      tomorrow8am.setDate(tomorrow8am.getDate() + 1);
      tomorrow8am.setHours(8, 0, 0, 0);
      return tomorrow8am.toISOString();

    case 'daily_digest':
      // End of business day (6pm)
      const eod = new Date(now);
      if (now.getHours() >= 18) {
        eod.setDate(eod.getDate() + 1);
      }
      eod.setHours(18, 0, 0, 0);
      return eod.toISOString();

    case 'weekly_digest':
    case 'coaching_digest':
      // Next Monday 9am
      const nextMonday = new Date(now);
      const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
      nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
      nextMonday.setHours(9, 0, 0, 0);
      return nextMonday.toISOString();

    default:
      // Default: 1 hour from now
      return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  }
}
