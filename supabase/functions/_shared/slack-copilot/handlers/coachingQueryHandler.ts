// supabase/functions/_shared/slack-copilot/handlers/coachingQueryHandler.ts
// Handles coaching, performance, and objection handling queries (PRD-22, CONV-007)

import type { ClassifiedIntent, QueryContext, HandlerResult } from '../types.ts';
import { section, fields, divider, context, actions, formatCurrency } from '../responseFormatter.ts';

export async function handleCoachingQuery(
  intent: ClassifiedIntent,
  queryContext: QueryContext,
  anthropicApiKey: string | null,
  modelId?: string
): Promise<HandlerResult> {
  const query = (intent.entities.rawQuery || '').toLowerCase();
  const resolvedModelId = modelId ?? 'claude-haiku-4-5-20251001';

  // Objection handling — enhanced with cross-deal pattern analysis
  if (intent.entities.objectionType) {
    return handleObjectionAdvice(intent.entities.objectionType, queryContext, anthropicApiKey, resolvedModelId);
  }

  // Performance snapshot
  if (/(?:how am i|performance|doing|stats|metric)/i.test(query)) {
    return handlePerformanceSnapshot(queryContext, anthropicApiKey, resolvedModelId);
  }

  // General coaching
  return handleGeneralCoaching(intent, queryContext, anthropicApiKey, resolvedModelId);
}

// ─── Deal segmentation helpers ───────────────────────────────────────────────

type DealRow = NonNullable<QueryContext['deals']>[number];

function segmentDeals(deals: DealRow[] | undefined): {
  wonDeals: DealRow[];
  lostDeals: DealRow[];
  activeDeals: DealRow[];
} {
  if (!deals || deals.length === 0) {
    return { wonDeals: [], lostDeals: [], activeDeals: [] };
  }

  const wonDeals: DealRow[] = [];
  const lostDeals: DealRow[] = [];
  const activeDeals: DealRow[] = [];

  for (const deal of deals) {
    const stage = (deal.stage || '').toLowerCase();
    if (/\b(won|closed.?won)\b/.test(stage)) {
      wonDeals.push(deal);
    } else if (/\b(lost|closed.?lost|churned|dead)\b/.test(stage)) {
      lostDeals.push(deal);
    } else {
      activeDeals.push(deal);
    }
  }

  return { wonDeals, lostDeals, activeDeals };
}

function formatDealList(deals: DealRow[]): string {
  if (deals.length === 0) return 'None recorded';
  return deals
    .map((d) => {
      const val = d.value != null ? ` (${formatCurrency(d.value)})` : '';
      const health = d.health_status ? ` [${d.health_status}]` : '';
      return `• ${d.title}${val}${health}`;
    })
    .join('\n');
}

// ─── Objection advice — cross-deal pattern analysis ──────────────────────────

async function handleObjectionAdvice(
  objection: string,
  queryContext: QueryContext,
  anthropicApiKey: string | null,
  modelId: string
): Promise<HandlerResult> {
  const { wonDeals, lostDeals } = segmentDeals(queryContext.deals);
  const recentMeetings = (queryContext.meetings || []).slice(0, 5);

  if (!anthropicApiKey) {
    return {
      blocks: [
        section(`*Handling: "${objection}"*`),
        section("AI service temporarily unavailable. General tips:"),
        section("• Acknowledge the concern genuinely\n• Ask clarifying questions\n• Reframe around value and outcomes\n• Share relevant proof points"),
        context(["Try again in a moment for AI-powered advice based on your own deal history."]),
      ],
    };
  }

  // Build deal context strings for the prompt
  const wonList = wonDeals.length > 0
    ? wonDeals.map((d) => `${d.title}${d.value != null ? ` — ${formatCurrency(d.value)}` : ''}`).join(', ')
    : 'No won deals recorded yet';

  const lostList = lostDeals.length > 0
    ? lostDeals.map((d) => `${d.title}${d.value != null ? ` — ${formatCurrency(d.value)}` : ''}${d.stage ? ` (stage: ${d.stage})` : ''}`).join(', ')
    : 'No lost deals recorded yet';

  const meetingList = recentMeetings.length > 0
    ? recentMeetings.map((m) => m.title || 'Untitled meeting').join(', ')
    : 'No recent meetings';

  const systemPrompt = `You are a sales coach analyzing a rep's actual deal history. Be specific, concise, and reference their real deals by name where relevant. Keep your total response under 300 words. Use plain text — no markdown headers or bullets beyond what's requested.`;

  const userPrompt = `You are a sales coach analyzing this rep's history. They're asking about: ${objection}

WON DEALS: ${wonList}
LOST DEALS: ${lostList}
RECENT MEETINGS: ${meetingList}

Based on their actual deal history, provide coaching advice in this format:

FROM YOUR WON DEALS
Specific examples from their won deals where similar situations were handled well. If no won deals exist, give general advice for this context.

FROM YOUR LOST DEALS
Specific examples where the issue wasn't addressed and may have contributed to the loss. If no lost deals exist, skip this section.

PATTERNS
- 3-4 tactical patterns derived from their actual history
- Each pattern should be actionable and specific

Keep it conversational and reference their actual deals by name.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const data = await response.json();
    const advice = data.content?.[0]?.text || 'Unable to generate advice.';

    const dealCount = wonDeals.length + lostDeals.length;
    const sourceNote = dealCount > 0
      ? `Based on your ${wonDeals.length} won and ${lostDeals.length} lost deal${lostDeals.length !== 1 ? 's' : ''}.`
      : 'Based on general sales best practices — your win/loss data will improve this over time.';

    return {
      blocks: [
        section(`*Handling: "${objection}"*`),
        divider(),
        section(advice),
        divider(),
        context([sourceNote]),
      ],
    };
  } catch (err) {
    console.error('[coachingHandler] AI advice generation failed:', err);
    return { text: `I had trouble generating advice for "${objection}". Please try again.` };
  }
}

// ─── Performance snapshot ─────────────────────────────────────────────────────

async function handlePerformanceSnapshot(
  queryContext: QueryContext,
  anthropicApiKey: string | null,
  modelId: string
): Promise<HandlerResult> {
  const { deals, meetings, pipelineSnapshot, riskScores } = queryContext;
  const { wonDeals, lostDeals, activeDeals } = segmentDeals(deals);

  const now = new Date();
  const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);

  // Deals closed this quarter (won + lost)
  const closedThisQuarter = [...wonDeals, ...lostDeals].filter((d) => {
    if (!d.close_date) return false;
    return new Date(d.close_date) >= quarterStart;
  });
  const wonThisQuarter = closedThisQuarter.filter((d) => wonDeals.includes(d));
  const winRate = closedThisQuarter.length > 0
    ? Math.round((wonThisQuarter.length / closedThisQuarter.length) * 100)
    : null;

  // Average deal size from won deals (all time)
  const wonWithValue = wonDeals.filter((d) => d.value != null && d.value > 0);
  const avgDealSize = wonWithValue.length > 0
    ? wonWithValue.reduce((sum, d) => sum + (d.value || 0), 0) / wonWithValue.length
    : null;

  // Average cycle length: close_date vs a proxy (we don't have created_at in QueryContext, skip if absent)
  const atRiskCount = riskScores?.filter((r) => r.score >= 60).length || 0;

  const totalValue = pipelineSnapshot?.total_value || 0;
  const weightedValue = pipelineSnapshot?.weighted_value || 0;
  const dealCount = activeDeals.length;

  // Build strengths + areas from deal data
  const strengths: string[] = [];
  const improvements: string[] = [];

  if (wonDeals.length > 0) {
    const topWon = wonDeals
      .filter((d) => d.value != null)
      .sort((a, b) => (b.value || 0) - (a.value || 0))
      .slice(0, 2);
    if (topWon.length > 0) {
      strengths.push(`Strong closing on enterprise deals — ${topWon.map((d) => d.title).join(', ')}`);
    }
    if (winRate !== null && winRate >= 50) {
      strengths.push(`Win rate of ${winRate}% this quarter`);
    }
  }

  if (atRiskCount > 0) {
    improvements.push(`${atRiskCount} active deal${atRiskCount !== 1 ? 's' : ''} flagged at risk — needs attention`);
  }

  if (lostDeals.length > 0 && wonDeals.length > 0) {
    const lossRatio = Math.round((lostDeals.length / (wonDeals.length + lostDeals.length)) * 100);
    if (lossRatio > 50) {
      improvements.push(`Loss rate of ${lossRatio}% — review lost deals for patterns`);
    }
  }

  // AI-generated insights when we have enough data
  if (anthropicApiKey && (wonDeals.length > 0 || lostDeals.length > 0)) {
    try {
      const insightPrompt = `Sales rep performance data:
Won deals (${wonDeals.length}): ${wonDeals.map((d) => d.title).join(', ') || 'none'}
Lost deals (${lostDeals.length}): ${lostDeals.map((d) => d.title).join(', ') || 'none'}
Active pipeline: ${activeDeals.length} deals worth ${formatCurrency(totalValue)}
At-risk deals: ${atRiskCount}

Give 1 strength and 1 improvement area in exactly this format:
STRENGTH: [one sentence]
IMPROVE: [one sentence]`;

      const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: modelId,
          max_tokens: 150,
          system: 'You are a concise sales performance coach. Respond only in the exact format requested.',
          messages: [{ role: 'user', content: insightPrompt }],
        }),
      });

      if (aiResp.ok) {
        const aiData = await aiResp.json();
        const aiText: string = aiData.content?.[0]?.text || '';
        const strengthMatch = aiText.match(/STRENGTH:\s*(.+)/i);
        const improveMatch = aiText.match(/IMPROVE:\s*(.+)/i);

        if (strengthMatch?.[1]) strengths.unshift(strengthMatch[1].trim());
        if (improveMatch?.[1]) improvements.unshift(improveMatch[1].trim());
      }
    } catch (err) {
      console.error('[coachingHandler] AI insights generation failed:', err);
    }
  }

  if (strengths.length === 0) strengths.push('Keep logging activity to build your coaching baseline');
  if (improvements.length === 0 && atRiskCount === 0) improvements.push('Pipeline looks healthy — focus on advancing deals to next stage');

  const statsFields = [
    { label: 'Pipeline', value: `${formatCurrency(weightedValue)} weighted (${dealCount} deals)` },
    ...(winRate !== null ? [{ label: 'Win Rate', value: `${winRate}% (${wonThisQuarter.length} won / ${closedThisQuarter.length} total this quarter)` }] : []),
    ...(avgDealSize !== null ? [{ label: 'Avg Deal Size', value: formatCurrency(avgDealSize) }] : []),
    { label: 'At-Risk Deals', value: `${atRiskCount}` },
  ];

  const blocks: unknown[] = [
    section('*YOUR PERFORMANCE SNAPSHOT*'),
    divider(),
    fields(statsFields),
    divider(),
    section(`*STRENGTHS*\n${strengths.map((s) => `• ${s}`).join('\n')}`),
    section(`*AREAS TO IMPROVE*\n${improvements.map((i) => `• ${i}`).join('\n')}`),
    divider(),
    actions([
      { text: 'At-risk deals', actionId: 'view_at_risk', value: 'at_risk' },
      { text: 'View pipeline', actionId: 'view_pipeline', value: 'pipeline' },
    ]),
  ];

  return { blocks };
}

// ─── General coaching ─────────────────────────────────────────────────────────

async function handleGeneralCoaching(
  intent: ClassifiedIntent,
  queryContext: QueryContext,
  anthropicApiKey: string | null,
  modelId: string
): Promise<HandlerResult> {
  const { deals, riskScores } = queryContext;
  const { wonDeals, lostDeals, activeDeals } = segmentDeals(deals);
  const atRiskDeals = riskScores?.filter((r) => r.score >= 60) || [];

  // Build pipeline summary for AI prompt
  const stageGroups: Record<string, number> = {};
  for (const deal of activeDeals) {
    const stage = deal.stage || 'Unknown';
    stageGroups[stage] = (stageGroups[stage] || 0) + 1;
  }
  const stageSummary = Object.entries(stageGroups)
    .map(([stage, count]) => `${count} in ${stage}`)
    .join(', ');

  // Attempt AI-powered contextual tips
  if (anthropicApiKey) {
    try {
      const prompt = `Sales rep's current pipeline:
Active deals by stage: ${stageSummary || 'none'}
At-risk deals: ${atRiskDeals.length}
Won deals: ${wonDeals.length}, Lost deals: ${lostDeals.length}
User query: "${intent.entities.rawQuery || 'general coaching'}"

Give 2-3 specific, actionable coaching tips based on their pipeline state. Each tip should reference their actual pipeline (e.g., "You have X deals in Y stage — do Z"). Keep it under 150 words. Use bullet points.`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: modelId,
          max_tokens: 250,
          system: 'You are a practical sales coach. Be direct and specific. Reference actual numbers from the pipeline data.',
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const tips = data.content?.[0]?.text || '';

        if (tips) {
          return {
            blocks: [
              section('*Quick Coaching:*'),
              section(tips),
              divider(),
              context([
                'Ask me specific questions like:\n• "How should I handle budget objections?"\n• "Which deals need attention?"\n• "Show my performance stats"',
              ]),
            ],
          };
        }
      }
    } catch (err) {
      console.error('[coachingHandler] General coaching AI call failed:', err);
    }
  }

  // Fallback: rule-based tips from pipeline state
  const tips: string[] = [];

  if (atRiskDeals.length > 0) {
    tips.push(`You have ${atRiskDeals.length} deal${atRiskDeals.length > 1 ? 's' : ''} at risk — consider focused attention there.`);
  }

  for (const [stage, count] of Object.entries(stageGroups)) {
    if (count >= 3) {
      const stageAdvice: Record<string, string> = {
        qualification: `${count} deals in Qualification — focus on multi-threading to get champions identified.`,
        discovery: `${count} deals in Discovery — push for next steps and proposal timelines.`,
        proposal: `${count} deals in Proposal — follow up within 48 hours if you haven't heard back.`,
        negotiation: `${count} deals in Negotiation — get legal and procurement involved early to avoid late-stage slippage.`,
      };
      const key = stage.toLowerCase();
      const advice = Object.entries(stageAdvice).find(([k]) => key.includes(k));
      if (advice) tips.push(advice[1]);
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
