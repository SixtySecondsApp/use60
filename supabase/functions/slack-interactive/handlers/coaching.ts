/**
 * Coaching Slack Interactive Handler
 * Handles coaching feedback and digest interactions
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

interface CoachingActionContext {
  actionId: string;
  actionValue: string;
  userId: string;
  orgId: string;
  channelId: string;
  messageTs: string;
  responseUrl: string;
}

export async function handleCoachingAction(ctx: CoachingActionContext): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const parts = ctx.actionId.split('_');
  const action = parts[1]; // view, adjust, dismiss

  if (action === 'view' && parts[2] === 'details') {
    const analysisId = parts.slice(3).join('_');
    const appUrl = Deno.env.get('APP_URL') || 'https://app.use60.com';
    await sendSlackResponse(ctx.responseUrl, `📊 View full analysis: ${appUrl}/coaching/${analysisId}`);

  } else if (action === 'adjust' && parts[2] === 'prefs') {
    // Update coaching preferences in slack_user_preferences
    // For now, acknowledge and provide instructions
    const appUrl = Deno.env.get('APP_URL') || 'https://app.use60.com';
    await sendSlackResponse(ctx.responseUrl, `⚙️ Adjust coaching preferences: ${appUrl}/settings/coaching`);

  } else if (action === 'dismiss') {
    const analysisId = parts.slice(2).join('_');
    // Mark as acknowledged
    await supabase
      .from('coaching_analyses')
      .update({ metadata: { acknowledged: true, acknowledged_at: new Date().toISOString() } })
      .eq('id', analysisId);
    await sendSlackResponse(ctx.responseUrl, '👍 Noted!');
  }
}

async function sendSlackResponse(responseUrl: string, text: string): Promise<void> {
  try {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, replace_original: false }),
    });
  } catch (err) {
    console.error('[coaching-handler] Failed to send Slack response:', err);
  }
}

/**
 * Build Slack blocks for per-meeting micro-feedback
 */
export function buildMeetingCoachingMessage(
  analysis: {
    id: string;
    meeting_title: string;
    talk_ratio: number;
    insights: Array<{ type: string; text: string; severity: 'positive' | 'neutral' | 'improvement' }>;
    question_quality_score: number;
    objection_handling_score: number;
  },
): unknown[] {
  const talkRatioEmoji = analysis.talk_ratio > 60 ? '⚠️' : analysis.talk_ratio < 30 ? '⚠️' : '✅';

  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `🎯 Quick Coaching: ${analysis.meeting_title}`, emoji: true },
    },
    { type: 'divider' },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Talk Ratio:* ${talkRatioEmoji} ${analysis.talk_ratio}% (you)` },
        { type: 'mrkdwn', text: `*Questions:* ${'⭐'.repeat(Math.round(analysis.question_quality_score * 5))}`},
        { type: 'mrkdwn', text: `*Objection Handling:* ${'⭐'.repeat(Math.round(analysis.objection_handling_score * 5))}`},
      ],
    },
  ];

  // Add insights as bullet points
  const insightText = analysis.insights
    .slice(0, 3)
    .map(i => {
      const emoji = i.severity === 'positive' ? '✅' : i.severity === 'improvement' ? '💡' : 'ℹ️';
      return `${emoji} ${i.text}`;
    })
    .join('\n');

  if (insightText) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: insightText },
    });
  }

  // Action buttons
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: '📊 View Details', emoji: true },
        action_id: `coach_view_details_${analysis.id}`,
        value: analysis.id,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '⚙️ Adjust Preferences', emoji: true },
        action_id: `coach_adjust_prefs_${analysis.id}`,
        value: analysis.id,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '👍 Got It', emoji: true },
        action_id: `coach_dismiss_${analysis.id}`,
        value: analysis.id,
      },
    ],
  });

  return blocks;
}

/**
 * Build Slack blocks for weekly coaching digest
 */
export function buildWeeklyCoachingDigest(
  digest: {
    user_name: string;
    meetings_analyzed: number;
    avg_talk_ratio: number;
    avg_question_score: number;
    avg_objection_score: number;
    improving_areas: string[];
    focus_areas: string[];
    winning_patterns: string[];
    week_over_week: {
      talk_ratio_change: number;
      question_score_change: number;
    };
  },
): unknown[] {
  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `📈 Weekly Coaching Digest`, emoji: true },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `${digest.meetings_analyzed} meetings analyzed this week` }],
    },
    { type: 'divider' },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Avg Talk Ratio:* ${digest.avg_talk_ratio}% ${digest.week_over_week.talk_ratio_change > 0 ? '📈' : '📉'} ${Math.abs(digest.week_over_week.talk_ratio_change).toFixed(1)}%` },
        { type: 'mrkdwn', text: `*Avg Question Quality:* ${(digest.avg_question_score * 100).toFixed(0)}%` },
        { type: 'mrkdwn', text: `*Avg Objection Handling:* ${(digest.avg_objection_score * 100).toFixed(0)}%` },
      ],
    },
  ];

  if (digest.improving_areas.length > 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*🎉 Improving:*\n${digest.improving_areas.map(a => `• ${a}`).join('\n')}` },
    });
  }

  if (digest.focus_areas.length > 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*🎯 Focus Areas:*\n${digest.focus_areas.map(a => `• ${a}`).join('\n')}` },
    });
  }

  if (digest.winning_patterns.length > 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*🏆 Winning Patterns:*\n${digest.winning_patterns.map(a => `• ${a}`).join('\n')}` },
    });
  }

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: '📊 Full Report', emoji: true },
        action_id: `coach_view_details_weekly`,
        value: 'weekly',
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '⚙️ Adjust Preferences', emoji: true },
        action_id: `coach_adjust_prefs_weekly`,
        value: 'weekly',
      },
    ],
  });

  return blocks;
}
