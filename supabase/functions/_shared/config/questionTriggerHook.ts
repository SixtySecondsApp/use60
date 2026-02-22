/**
 * Question Trigger Hook
 *
 * Fires evaluate-config-questions after agent step completions that map to
 * a known question trigger event (LEARN-005). Always fire-and-forget — never
 * blocks agent execution.
 *
 * Trigger events (from PRD):
 *   morning_briefing_delivered  — after morning briefing fires
 *   meeting_processed           — after meeting transcript processed
 *   crm_update_approved         — after user approves a CRM update
 *   eod_synthesis_delivered     — after EOD wrap fires
 *   risk_alert_fired            — after first risk alert
 *   coaching_digest_generated   — after coaching digest
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

// Map orchestrator step/adapter names to question trigger events
const STEP_TO_TRIGGER_EVENT: Record<string, string> = {
  'deliver-slack-briefing': 'morning_briefing_delivered',
  'morning-briefing': 'morning_briefing_delivered',
  'process-meeting': 'meeting_processed',
  'meeting-transcript': 'meeting_processed',
  'crm-update-approved': 'crm_update_approved',
  'approve-crm-update': 'crm_update_approved',
  'deliver-eod-synthesis': 'eod_synthesis_delivered',
  'eod-synthesis': 'eod_synthesis_delivered',
  'deliver-risk-slack': 'risk_alert_fired',
  'risk-alert': 'risk_alert_fired',
  'coaching-digest': 'coaching_digest_generated',
};

/**
 * After a step completes successfully, check whether the step maps to a
 * question trigger event and, if so, asynchronously invoke
 * `evaluate-config-questions`. The call is fire-and-forget — errors are
 * logged as warnings and never bubble up to the caller.
 *
 * @param supabase  - Supabase client (used only for env var access pattern; actual call uses fetch)
 * @param orgId     - Organisation ID for the running sequence
 * @param userId    - User ID for the running sequence (may be undefined)
 * @param stepName  - The skill/step name that just completed (e.g. 'deliver-slack-briefing')
 * @param eventData - Optional additional context forwarded to the question evaluator
 */
export function maybeEvaluateConfigQuestion(
  _supabase: SupabaseClient,
  orgId: string,
  userId: string | undefined,
  stepName: string,
  eventData?: Record<string, unknown>,
): void {
  const triggerEvent = STEP_TO_TRIGGER_EVENT[stepName];
  if (!triggerEvent) return; // Step doesn't map to a question trigger

  // Resolve env vars synchronously — if missing, bail silently
  const baseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!baseUrl || !serviceKey) {
    console.warn('[questionTriggerHook] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — skipping question evaluation');
    return;
  }

  // Fire-and-forget — never await
  fetch(`${baseUrl}/functions/v1/evaluate-config-questions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      org_id: orgId,
      user_id: userId,
      trigger_event: triggerEvent,
      event_data: eventData,
    }),
  }).catch((err: Error) => {
    console.warn('[questionTriggerHook] Fire-and-forget delivery failed:', err?.message ?? err);
  });
}
