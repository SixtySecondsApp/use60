/**
 * Competitive Intelligence Adapters (KNW-007)
 *
 * Extracts competitor mentions from meetings, aggregates profiles,
 * and delivers weekly competitive trend summaries via Slack.
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { getServiceClient } from './contextEnrichment.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const APP_URL_FALLBACK = 'https://app.use60.com';

// ─── Slack Block Kit helpers ────────────────────────────────────────────────

interface SlackBlock { type: string; [key: string]: unknown; }
interface SlackMessage { text: string; blocks: SlackBlock[]; }

function section(mrkdwn: string): SlackBlock {
  return { type: 'section', text: { type: 'mrkdwn', text: mrkdwn } };
}
function divider(): SlackBlock { return { type: 'divider' }; }
function header(text: string): SlackBlock {
  return { type: 'header', text: { type: 'plain_text', text, emoji: true } };
}
function ctx(text: string): SlackBlock {
  return { type: 'context', elements: [{ type: 'mrkdwn', text }] };
}

// ─── Extract Competitive Mentions ───────────────────────────────────────────

export const extractCompetitiveMentionsAdapter: SkillAdapter = {
  name: 'extract-competitive-mentions',

  async execute(state: SequenceState, _step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      console.log('[extract-competitive-mentions] Starting...');

      const orgId = state.event.org_id;
      const meetingId = state.event.payload?.meeting_id as string
        || state.context?.tier2?.meeting?.id;

      if (!meetingId) {
        return { success: true, output: { skipped: true, reason: 'no_meeting_id' }, duration_ms: Date.now() - start };
      }

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/agent-competitive-intel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ mode: 'extract', meeting_id: meetingId, org_id: orgId }),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        return { success: false, error: `edge_function_${resp.status}: ${text}`, duration_ms: Date.now() - start };
      }

      const result = await resp.json();
      console.log(`[extract-competitive-mentions] Found ${result.mentions_found} mentions`);
      return { success: true, output: result, duration_ms: Date.now() - start };

    } catch (err) {
      console.error('[extract-competitive-mentions] Error:', err);
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};

// ─── Aggregate Competitor Profile ───────────────────────────────────────────

export const aggregateCompetitorProfileAdapter: SkillAdapter = {
  name: 'aggregate-competitor-profile',

  async execute(state: SequenceState, _step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      console.log('[aggregate-competitor-profile] Starting...');

      const orgId = state.event.org_id;
      // Get profiles to aggregate from extract step output
      const extractOutput = state.outputs?.['extract-competitive-mentions'] as Record<string, unknown> | undefined;
      const profilesToAggregate = (extractOutput?.profiles_to_aggregate as string[]) || [];

      if (profilesToAggregate.length === 0) {
        return { success: true, output: { aggregated: 0, reason: 'no_profiles_at_threshold' }, duration_ms: Date.now() - start };
      }

      const results = [];
      for (const name of profilesToAggregate) {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/agent-competitive-intel`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ mode: 'aggregate', org_id: orgId, competitor_name: name }),
        });

        if (resp.ok) {
          results.push(await resp.json());
        }
      }

      console.log(`[aggregate-competitor-profile] Aggregated ${results.length} profiles`);
      return { success: true, output: { aggregated: results.length, results }, duration_ms: Date.now() - start };

    } catch (err) {
      console.error('[aggregate-competitor-profile] Error:', err);
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};

// ─── Deliver Competitive Intel Slack Notification ───────────────────────────

export const deliverCompetitiveIntelSlackAdapter: SkillAdapter = {
  name: 'deliver-competitive-intel-slack',

  async execute(state: SequenceState, _step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      console.log('[deliver-competitive-intel-slack] Starting...');

      const supabase = getServiceClient();
      const orgId = state.event.org_id;

      const extractOutput = state.outputs?.['extract-competitive-mentions'] as Record<string, unknown> | undefined;
      const mentions = (extractOutput?.mentions as Array<Record<string, unknown>>) || [];

      if (mentions.length === 0) {
        return { success: true, output: { delivered: 0, reason: 'no_mentions' }, duration_ms: Date.now() - start };
      }

      // Get Slack bot token
      const { data: slackIntegration } = await supabase
        .from('slack_integrations')
        .select('access_token')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      const botToken = slackIntegration?.access_token as string | null;
      if (!botToken) {
        return { success: true, output: { delivered: 0, skipped_reason: 'no_slack_integration' }, duration_ms: Date.now() - start };
      }

      // Get meeting owner's Slack ID
      const meetingId = state.event.payload?.meeting_id as string;
      let ownerSlackId: string | null = null;

      if (meetingId) {
        const { data: meeting } = await supabase
          .from('meetings')
          .select('owner_user_id')
          .eq('id', meetingId)
          .maybeSingle();

        if (meeting?.owner_user_id) {
          const { data: mapping } = await supabase
            .from('slack_user_mappings')
            .select('slack_user_id')
            .eq('org_id', orgId)
            .eq('sixty_user_id', meeting.owner_user_id)
            .maybeSingle();
          ownerSlackId = mapping?.slack_user_id || null;
        }
      }

      if (!ownerSlackId) {
        return { success: true, output: { delivered: 0, skipped_reason: 'no_slack_mapping' }, duration_ms: Date.now() - start };
      }

      // Build Slack message
      const appUrl = Deno.env.get('APP_URL') || APP_URL_FALLBACK;
      const competitorNames = [...new Set(mentions.map(m => m.competitor_name))];

      const blocks: SlackBlock[] = [
        header(`Competitor Intel Detected`),
        section(`*${competitorNames.length} competitor${competitorNames.length > 1 ? 's' : ''}* mentioned in your recent call:`),
        divider(),
      ];

      for (const name of competitorNames.slice(0, 3)) {
        const compMentions = mentions.filter(m => m.competitor_name === name);
        const sentiments = compMentions.map(m => m.sentiment);
        const sentimentEmoji = sentiments.includes('negative') ? ':small_red_triangle_down:' : sentiments.includes('positive') ? ':small_red_triangle:' : ':white_circle:';

        let detail = `*${name}* ${sentimentEmoji}\n`;
        if (compMentions[0]?.context) detail += `> ${(compMentions[0].context as string).slice(0, 150)}\n`;
        if ((compMentions[0]?.strengths as string[])?.length) detail += `Strengths: ${(compMentions[0].strengths as string[]).join(', ')}\n`;
        if ((compMentions[0]?.weaknesses as string[])?.length) detail += `Weaknesses: ${(compMentions[0].weaknesses as string[]).join(', ')}`;

        blocks.push(section(detail));
      }

      blocks.push(
        divider(),
        ctx(`<${appUrl}/intelligence/competitive|View all competitive intelligence>`)
      );

      const message: SlackMessage = {
        text: `Competitor intel: ${competitorNames.join(', ')} mentioned in call`,
        blocks,
      };

      // Send DM
      const openResp = await fetch('https://slack.com/api/conversations.open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${botToken}` },
        body: JSON.stringify({ users: ownerSlackId }),
      });
      const openData = await openResp.json();
      if (!openData.ok) {
        return { success: false, error: `slack_open: ${openData.error}`, duration_ms: Date.now() - start };
      }

      const sendResp = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${botToken}` },
        body: JSON.stringify({ channel: openData.channel.id, ...message }),
      });
      const sendData = await sendResp.json();

      console.log(`[deliver-competitive-intel-slack] ${sendData.ok ? 'Delivered' : 'Failed'}`);
      return {
        success: true,
        output: { delivered: sendData.ok ? 1 : 0, error: sendData.error },
        duration_ms: Date.now() - start,
      };

    } catch (err) {
      console.error('[deliver-competitive-intel-slack] Error:', err);
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};
