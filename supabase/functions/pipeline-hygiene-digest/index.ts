/**
 * Pipeline Hygiene Digest Edge Function
 *
 * Weekly Slack DM to each rep listing their stale deals with quick action buttons.
 * Called by pg_cron every Monday at 9am UTC.
 *
 * Query params:
 *   ?dryRun=true      — returns JSON payload without sending Slack DMs
 *   ?singleUserId=X   — only send to one user (for testing)
 *   ?orgId=X           — only process one org
 *
 * Story: US-A3
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';
import { verifyCronSecret, isServiceRoleAuth } from '../_shared/edgeAuth.ts';
import { writeToCommandCentre } from '../_shared/commandCentre/writeAdapter.ts';
import { sendSlackDM } from '../_shared/proactive/deliverySlack.ts';
import { buildPipelineHygieneDigest } from '../_shared/slackBlocks.ts';
import type { HygieneDigestDeal } from '../_shared/slackBlocks.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface DigestResult {
  orgs_processed: number;
  dms_sent: number;
  dms_skipped: number;
  errors: string[];
  dry_run: boolean;
}

serve(async (req) => {
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  // Auth: service role or cron secret (matches agent-morning-briefing pattern)
  const authHeader = req.headers.get('Authorization');
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!verifyCronSecret(req, cronSecret) && !isServiceRoleAuth(authHeader, SUPABASE_SERVICE_ROLE_KEY)) {
    return errorResponse('Unauthorized — service role required', req, 401);
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dryRun') === 'true';
  const singleUserId = url.searchParams.get('singleUserId');
  const targetOrgId = url.searchParams.get('orgId');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const result: DigestResult = {
    orgs_processed: 0,
    dms_sent: 0,
    dms_skipped: 0,
    errors: [],
    dry_run: dryRun,
  };

  try {
    // 1. Get all active orgs with Slack connected
    let orgsQuery = supabase
      .from('slack_org_settings')
      .select('org_id, bot_access_token')
      .eq('is_connected', true);

    if (targetOrgId) {
      orgsQuery = orgsQuery.eq('org_id', targetOrgId);
    }

    const { data: orgs, error: orgsError } = await orgsQuery;

    if (orgsError) {
      return errorResponse(`Failed to fetch orgs: ${orgsError.message}`, req, 500);
    }

    if (!orgs || orgs.length === 0) {
      return jsonResponse({ ...result, message: 'No orgs with Slack connected' }, req);
    }

    // 2. Process each org
    for (const org of orgs) {
      if (!org.org_id || !org.bot_access_token) continue;

      try {
        result.orgs_processed++;

        // Get stale deals grouped by owner
        const { data: staleDealsByOwner, error: rpcError } = await supabase.rpc(
          'get_stale_deals_for_digest',
          { p_org_id: org.org_id }
        );

        if (rpcError) {
          result.errors.push(`Org ${org.org_id}: RPC error — ${rpcError.message}`);
          continue;
        }

        if (!staleDealsByOwner || Object.keys(staleDealsByOwner).length === 0) {
          continue; // No stale deals in this org
        }

        // Get slack user mappings for this org
        const { data: slackMappings } = await supabase
          .from('slack_user_mappings')
          .select('sixty_user_id, slack_user_id')
          .eq('org_id', org.org_id);

        const userToSlack = new Map<string, string>();
        (slackMappings || []).forEach((m: any) => {
          if (m.sixty_user_id && m.slack_user_id) {
            userToSlack.set(m.sixty_user_id, m.slack_user_id);
          }
        });

        // Get user profiles for names
        const ownerIds = Object.keys(staleDealsByOwner);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', ownerIds);

        const profileMap = new Map<string, string>();
        (profiles || []).forEach((p: any) => {
          if (p.id && p.full_name) profileMap.set(p.id, p.full_name);
        });

        // 3. Send DM to each rep with stale deals
        for (const [ownerId, deals] of Object.entries(staleDealsByOwner)) {
          if (singleUserId && ownerId !== singleUserId) continue;

          const slackUserId = userToSlack.get(ownerId);
          if (!slackUserId) {
            result.dms_skipped++;
            continue;
          }

          const repName = profileMap.get(ownerId) || 'there';
          const dealsList = deals as HygieneDigestDeal[];

          const message = buildPipelineHygieneDigest({
            repName,
            deals: dealsList,
            date: new Date().toLocaleDateString('en-GB', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            }),
          });

          if (dryRun) {
            result.dms_sent++;
            console.log(`[dry-run] Would send to ${repName} (${slackUserId}): ${dealsList.length} deals`);
            continue;
          }

          // Send Slack DM with rate limiting
          const dmResult = await sendSlackDM({
            botToken: org.bot_access_token,
            slackUserId,
            blocks: message.blocks,
            text: message.text,
          });

          if (dmResult.success) {
            result.dms_sent++;

            // Write summary to Command Centre
            await writeToCommandCentre({
              org_id: org.org_id,
              user_id: ownerId,
              source_agent: 'pipeline_hygiene',
              item_type: 'insight',
              title: `Pipeline hygiene: ${dealsList.length} deals need attention`,
              summary: `Sent weekly digest with ${dealsList.length} stale deals`,
              context: { deal_count: dealsList.length, deal_ids: dealsList.map((d: any) => d.id) },
              urgency: dealsList.length > 10 ? 'high' : 'normal',
            });
          } else {
            result.errors.push(`Failed DM to ${ownerId}: ${dmResult.error}`);
          }

          // Rate limiting: 500ms between DMs
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (orgError: any) {
        result.errors.push(`Org ${org.org_id}: ${orgError.message}`);
      }
    }

    return jsonResponse(result, req);
  } catch (error: any) {
    console.error('[pipeline-hygiene-digest] Error:', error);
    return errorResponse(`Digest failed: ${error.message}`, req, 500);
  }
});
