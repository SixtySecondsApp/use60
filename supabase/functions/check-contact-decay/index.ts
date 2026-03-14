/**
 * Check Contact Decay Edge Function (BA-005b)
 *
 * Runs relationship decay for all orgs and fires alerts for contacts
 * crossing below the strength threshold (0.4).
 *
 * For each org:
 *   1. Check if the decay ability is enabled (cron preference gate)
 *   2. Run relationship decay via shared module
 *   3. If contacts crossed below threshold:
 *      a. Resolve contact names from the contacts table
 *      b. Send ONE grouped Slack message via daily thread
 *      c. Create ONE CC item with item_type 'decay_alert'
 *
 * Auth: service role or cron secret.
 * Schedule: weekly Sunday 3am UTC (via pg_cron or external scheduler).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';
import { verifyCronSecret, isServiceRoleAuth } from '../_shared/edgeAuth.ts';
import { runRelationshipDecay } from '../_shared/memory/decay.ts';
import type { CrossedContact } from '../_shared/memory/decay.ts';
import { getDailyThreadTs } from '../_shared/slack/dailyThread.ts';
import { isAbilityEnabledForOrg } from '../_shared/proactive/cronPreferenceGate.ts';
import { writeToCommandCentre } from '../_shared/commandCentre/writeAdapter.ts';
import { sendSlackDM } from '../_shared/proactive/deliverySlack.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const SEQUENCE_TYPE = 'contact_decay';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrgResult {
  org_id: string;
  updated: number;
  skipped: number;
  alerts_sent: number;
  gate_skipped: boolean;
  error?: string;
}

interface ResolvedContact {
  contact_id: string;
  name: string;
  company: string | null;
  days_since_interaction: number | null;
  strength_pct: number;
}

// ---------------------------------------------------------------------------
// Serve
// ---------------------------------------------------------------------------

serve(async (req) => {
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  // Auth: cron secret OR service role
  const cronSecret = Deno.env.get('CRON_SECRET');
  const authHeader = req.headers.get('Authorization');
  if (!verifyCronSecret(req, cronSecret) && !isServiceRoleAuth(authHeader, SUPABASE_SERVICE_ROLE_KEY)) {
    return errorResponse('Unauthorized', req, 401);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // Optional body params: target a single org for testing
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* batch mode */ }
    const targetOrgId = body.org_id as string | undefined;

    // -----------------------------------------------------------------------
    // 1. Discover orgs with contact_memory rows
    // -----------------------------------------------------------------------
    let orgIds: string[];

    if (targetOrgId) {
      orgIds = [targetOrgId];
    } else {
      const { data: orgRows, error: orgError } = await supabase
        .from('contact_memory')
        .select('org_id')
        .not('last_interaction_at', 'is', null)
        .limit(1000);

      if (orgError) {
        console.error('[check-contact-decay] Failed to fetch orgs:', orgError.message);
        return errorResponse('Failed to fetch orgs', req, 500);
      }

      // Deduplicate org_ids
      orgIds = [...new Set((orgRows || []).map((r: { org_id: string }) => r.org_id))];
    }

    console.log(`[check-contact-decay] Processing ${orgIds.length} org(s)`);

    // -----------------------------------------------------------------------
    // 2. Process each org
    // -----------------------------------------------------------------------
    const results: OrgResult[] = [];

    for (const orgId of orgIds) {
      const orgResult: OrgResult = {
        org_id: orgId,
        updated: 0,
        skipped: 0,
        alerts_sent: 0,
        gate_skipped: false,
      };

      try {
        // 2a. Check cron preference gate
        const gate = await isAbilityEnabledForOrg(supabase, orgId, SEQUENCE_TYPE);
        if (!gate.allowed) {
          console.log(`[check-contact-decay] ${gate.reason} -- skipping org ${orgId}`);
          orgResult.gate_skipped = true;
          results.push(orgResult);
          continue;
        }

        // 2b. Run decay
        const decayResult = await runRelationshipDecay(orgId, supabase);
        orgResult.updated = decayResult.updated;
        orgResult.skipped = decayResult.skipped;

        console.log(
          `[check-contact-decay] org=${orgId} updated=${decayResult.updated} skipped=${decayResult.skipped} crossedBelow=${decayResult.crossedBelow.length}`,
        );

        // 2c. Fire alerts if contacts crossed below threshold
        if (decayResult.crossedBelow.length > 0) {
          const alertCount = await fireDecayAlerts(
            supabase,
            orgId,
            decayResult.crossedBelow,
          );
          orgResult.alerts_sent = alertCount;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[check-contact-decay] Error for org ${orgId}:`, msg);
        orgResult.error = msg;
      }

      results.push(orgResult);
    }

    const totalUpdated = results.reduce((s, r) => s + r.updated, 0);
    const totalAlerts = results.reduce((s, r) => s + r.alerts_sent, 0);
    const totalErrors = results.filter((r) => r.error).length;

    console.log(
      `[check-contact-decay] Complete: ${orgIds.length} orgs, ${totalUpdated} updated, ${totalAlerts} alerts, ${totalErrors} errors`,
    );

    return jsonResponse({ orgs: orgIds.length, results }, req);
  } catch (err) {
    console.error('[check-contact-decay] Unhandled error:', err);
    return errorResponse((err as Error).message, req, 500);
  }
});

// ---------------------------------------------------------------------------
// Alert Logic
// ---------------------------------------------------------------------------

/**
 * Resolve contact names, send a grouped Slack message, and create a CC item.
 * Returns the number of alerts delivered (0 or 1 — we group into one message).
 */
async function fireDecayAlerts(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  crossedBelow: CrossedContact[],
): Promise<number> {
  // -----------------------------------------------------------------------
  // A. Resolve contact names + company from contacts table
  // -----------------------------------------------------------------------
  const contactIds = crossedBelow.map((c) => c.contact_id);

  const { data: contactRows, error: contactError } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, company')
    .in('id', contactIds);

  if (contactError) {
    console.error('[check-contact-decay] Failed to resolve contact names:', contactError.message);
  }

  const contactMap = new Map<string, { name: string; company: string | null }>();
  for (const row of contactRows || []) {
    const name = [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Unknown';
    contactMap.set(row.id as string, { name, company: row.company as string | null });
  }

  const resolved: ResolvedContact[] = crossedBelow.map((c) => {
    const info = contactMap.get(c.contact_id);
    const daysSince = c.last_interaction_at
      ? Math.floor((Date.now() - new Date(c.last_interaction_at).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    return {
      contact_id: c.contact_id,
      name: info?.name || 'Unknown contact',
      company: info?.company || null,
      days_since_interaction: daysSince,
      strength_pct: Math.round(c.new_strength * 100),
    };
  });

  // -----------------------------------------------------------------------
  // B. Get org members to send alerts to (all members get the alert)
  // -----------------------------------------------------------------------
  const { data: members, error: memberError } = await supabase
    .from('organization_memberships')
    .select('user_id')
    .eq('org_id', orgId);

  if (memberError || !members || members.length === 0) {
    console.warn(`[check-contact-decay] No org members found for org ${orgId}, skipping alerts`);
    return 0;
  }

  let alertsSent = 0;

  for (const member of members) {
    const userId = member.user_id as string;

    // -------------------------------------------------------------------
    // C. Send grouped Slack message via daily thread
    // -------------------------------------------------------------------
    try {
      await sendSlackAlert(supabase, orgId, userId, resolved);
    } catch (err) {
      // Slack failure must not block CC write
      console.error(`[check-contact-decay] Slack alert failed for user ${userId}:`, err);
    }

    // -------------------------------------------------------------------
    // D. Create ONE CC item per user
    // -------------------------------------------------------------------
    try {
      const contactListSummary = resolved
        .slice(0, 5)
        .map((c) => {
          const parts = [c.name];
          if (c.company) parts.push(`(${c.company})`);
          parts.push(`-- ${c.strength_pct}% strength`);
          if (c.days_since_interaction !== null) {
            parts.push(`${c.days_since_interaction}d since last interaction`);
          }
          return parts.join(' ');
        })
        .join('; ');

      const moreText = resolved.length > 5
        ? ` and ${resolved.length - 5} more`
        : '';

      await writeToCommandCentre({
        org_id: orgId,
        user_id: userId,
        source_agent: 'contact_decay',
        item_type: 'decay_alert',
        title: `${resolved.length} contact${resolved.length !== 1 ? 's' : ''} going cold`,
        summary: `${contactListSummary}${moreText}`,
        context: {
          decay_alert: true,
          contacts: resolved.map((c) => ({
            contact_id: c.contact_id,
            name: c.name,
            company: c.company,
            days_since_interaction: c.days_since_interaction,
            strength_pct: c.strength_pct,
          })),
        },
        urgency: 'normal',
      });

      alertsSent++;
    } catch (ccErr) {
      // CC failure must not break the agent's primary flow
      console.error(`[check-contact-decay] CC write failed for user ${userId}:`, ccErr);
    }
  }

  return alertsSent;
}

// ---------------------------------------------------------------------------
// Slack Alert
// ---------------------------------------------------------------------------

async function sendSlackAlert(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  userId: string,
  contacts: ResolvedContact[],
): Promise<void> {
  // Look up Slack credentials
  const { data: slackOrg } = await supabase
    .from('slack_org_settings')
    .select('bot_access_token')
    .eq('org_id', orgId)
    .eq('is_connected', true)
    .maybeSingle();

  if (!slackOrg?.bot_access_token) return;

  // Look up user's Slack ID
  const { data: mapping } = await supabase
    .from('slack_user_mappings')
    .select('slack_user_id')
    .eq('org_id', orgId)
    .eq('sixty_user_id', userId)
    .maybeSingle();

  if (!mapping?.slack_user_id) return;

  // Get or create daily thread
  const threadTs = await getDailyThreadTs(userId, orgId, supabase);

  // Build contact lines
  const contactLines = contacts.slice(0, 10).map((c) => {
    const parts = [`*${c.name}*`];
    if (c.company) parts.push(`at ${c.company}`);
    if (c.days_since_interaction !== null) {
      parts.push(`| ${c.days_since_interaction}d since last interaction`);
    }
    parts.push(`| ${c.strength_pct}% strength`);
    return `  ${parts.join(' ')}`;
  });

  if (contacts.length > 10) {
    contactLines.push(`  ...and ${contacts.length - 10} more`);
  }

  const messageText = [
    `*${contacts.length} contact${contacts.length !== 1 ? 's' : ''} going cold*`,
    '',
    ...contactLines,
    '',
    'Consider reaching out to keep these relationships warm.',
  ].join('\n');

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: messageText,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View in 60' },
          url: 'https://app.use60.com/contacts',
          action_id: 'view_decaying_contacts',
        },
      ],
    },
  ];

  await sendSlackDM({
    botToken: slackOrg.bot_access_token,
    slackUserId: mapping.slack_user_id,
    text: `${contacts.length} contact${contacts.length !== 1 ? 's' : ''} going cold`,
    blocks,
    ...(threadTs ? { thread_ts: threadTs } : {}),
  });
}
