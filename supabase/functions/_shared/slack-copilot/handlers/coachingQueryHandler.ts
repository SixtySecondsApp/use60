// supabase/functions/_shared/slack-copilot/handlers/coachingQueryHandler.ts
// Handles coaching, performance, and objection handling queries (PRD-22, CONV-007)

import type { ClassifiedIntent, QueryContext, HandlerResult } from '../types.ts';
import { section, fields, divider, context, formatCurrency } from '../responseFormatter.ts';

export async function handleCoachingQuery(
  intent: ClassifiedIntent,
  queryContext: QueryContext,
  anthropicApiKey: string | null
): Promise<HandlerResult> {
  const query = (intent.entities.rawQuery || '').toLowerCase();

  // Objection handling
  if (intent.entities.objectionType) {
    return handleObjectionAdvice(intent.entities.objectionType, anthropicApiKey);
  }

  // Performance snapshot
  if (/(?:how am i|performance|doing|stats|metric)/i.test(query)) {
    return handlePerformanceSnapshot(queryContext);
  }

  // General coaching
  return handleGeneralCoaching(intent, queryContext, anthropicApiKey);
}

async function handleObjectionAdvice(
  objection: string,
  anthropicApiKey: string | null
): Promise<HandlerResult> {
  if (!anthropicApiKey) {
    return {
      blocks: [
        section(`*Handling: "${objection}"*`),
        section("I'd give you specific advice, but the AI service is temporarily unavailable. General tips:"),
        section("• Acknowledge the concern genuinely\n• Ask clarifying questions\n• Reframe around value and outcomes\n• Share relevant proof points"),
        context(["Try again in a moment for AI-powered advice."]),
      ],
    };
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: 'You are a sales coaching expert. Give concise, actionable advice for handling sales objections. Include 2-3 specific response frameworks or phrases. Keep it under 200 words.',
        messages: [{
          role: 'user',
          content: `How should I handle this sales objection: "${objection}"`,
        }],
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const data = await response.json();
    const advice = data.content?.[0]?.text || 'Unable to generate advice.';

    return {
      blocks: [
        section(`*Handling: "${objection}"*`),
        divider(),
        section(advice),
        divider(),
        context(["Based on general sales best practices. Your team's specific win data will improve this over time."]),
      ],
    };
  } catch (err) {
    console.error('[coachingHandler] AI advice generation failed:', err);
    return { text: `I had trouble generating advice for "${objection}". Please try again.` };
  }
}

function handlePerformanceSnapshot(queryContext: QueryContext): HandlerResult {
  const { deals, meetings, pipelineSnapshot } = queryContext;

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());

  const thisWeekMeetings = meetings?.filter((m) =>
    m.start_time && new Date(m.start_time) >= weekStart
  ).length || 0;

  const activeDealCount = deals?.length || 0;
  const totalValue = pipelineSnapshot?.total_value || 0;

  return {
    blocks: [
      section('*Your Performance Snapshot:*'),
      fields([
        { label: 'Active Deals', value: `${activeDealCount}` },
        { label: 'Pipeline Value', value: formatCurrency(totalValue) },
        { label: 'Meetings This Week', value: `${thisWeekMeetings}` },
        { label: 'Weighted Pipeline', value: formatCurrency(pipelineSnapshot?.weighted_value || 0) },
      ]),
      divider(),
      context([
        'For detailed coaching insights, check your weekly coaching digest.',
        'Ask me "which deals are at risk?" or "show my pipeline" for more detail.',
      ]),
    ],
  };
}

async function handleGeneralCoaching(
  intent: ClassifiedIntent,
  queryContext: QueryContext,
  anthropicApiKey: string | null
): Promise<HandlerResult> {
  // Provide context-aware coaching based on pipeline state
  const { deals, riskScores } = queryContext;
  const atRiskDeals = riskScores?.filter((r) => r.score >= 60) || [];

  const tips: string[] = [];

  if (atRiskDeals.length > 0) {
    tips.push(`You have ${atRiskDeals.length} deal${atRiskDeals.length > 1 ? 's' : ''} at risk — consider focused attention there.`);
  }

  if (deals && deals.length > 0) {
    const discoveryDeals = deals.filter((d) => /discovery/i.test(d.stage));
    if (discoveryDeals.length >= 3) {
      tips.push(`${discoveryDeals.length} deals in Discovery — focus on qualifying and advancing these.`);
    }
  }

  if (tips.length === 0) {
    tips.push("Your pipeline looks healthy. Keep up the momentum!");
  }

  return {
    blocks: [
      section('*Quick Coaching:*'),
      section(tips.map((t) => `• ${t}`).join('\n')),
      divider(),
      context([
        'Ask me specific questions like:\n• "How should I handle budget objections?"\n• "Which deals need attention?"\n• "Show my performance stats"',
      ]),
    ],
  };
}
