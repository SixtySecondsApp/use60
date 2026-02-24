// supabase/functions/_shared/slack-copilot/handlers/pipelineQueryHandler.ts
// Handles pipeline, quota, and forecast queries (PRD-22, CONV-004)

import type { ClassifiedIntent, QueryContext, HandlerResult } from '../types.ts';
import { header, section, fields, divider, context, formatCurrency, appLink } from '../responseFormatter.ts';

export async function handlePipelineQuery(
  intent: ClassifiedIntent,
  queryContext: QueryContext
): Promise<HandlerResult> {
  const { pipelineSnapshot, deals, riskScores } = queryContext;

  if (!pipelineSnapshot || !deals || deals.length === 0) {
    return { text: 'No pipeline data available. Create some deals to get started.' };
  }

  const snap = pipelineSnapshot;
  const atRiskCount = riskScores?.filter((r) => r.score >= 60).length || 0;

  // Calculate stage distribution
  const stageMap: Record<string, { count: number; value: number }> = {};
  for (const deal of deals) {
    const stage = deal.stage || 'Unknown';
    if (!stageMap[stage]) stageMap[stage] = { count: 0, value: 0 };
    stageMap[stage].count++;
    stageMap[stage].value += deal.value || 0;
  }

  const stageLines = Object.entries(stageMap)
    .sort((a, b) => b[1].value - a[1].value)
    .map(([stage, data]) => `• *${stage}*: ${data.count} deal${data.count > 1 ? 's' : ''} — ${formatCurrency(data.value)}`)
    .join('\n');

  // Determine quarter phase
  const now = new Date();
  const month = now.getMonth();
  const quarterMonth = month % 3;
  const quarterPhase = quarterMonth === 0 ? 'early' : quarterMonth === 1 ? 'mid' : 'late';
  const quarterName = `Q${Math.floor(month / 3) + 1}`;

  const blocks = [
    header(`Pipeline Summary — ${quarterName} ${now.getFullYear()}`),
    fields([
      { label: 'Total Pipeline', value: formatCurrency(snap.total_value) },
      { label: 'Weighted Value', value: formatCurrency(snap.weighted_value) },
      { label: 'Active Deals', value: `${snap.deal_count}` },
      { label: 'At Risk', value: atRiskCount > 0 ? `:warning: ${atRiskCount} deal${atRiskCount > 1 ? 's' : ''}` : ':white_check_mark: None' },
    ]),
    divider(),
    section(`*By Stage:*\n${stageLines}`),
  ];

  if (snap.target) {
    const gap = snap.target - snap.weighted_value;
    const coverage = snap.total_value / snap.target;
    blocks.push(divider());
    blocks.push(fields([
      { label: 'Target', value: formatCurrency(snap.target) },
      { label: 'Gap to Target', value: gap > 0 ? `:warning: ${formatCurrency(gap)}` : `:white_check_mark: On track` },
      { label: 'Pipeline Coverage', value: `${coverage.toFixed(1)}x` },
      { label: 'Quarter Phase', value: `${quarterPhase} ${quarterName}` },
    ]));
  }

  blocks.push(divider());
  blocks.push(context([
    `${appLink('/pipeline', 'View full pipeline')} | Ask me "which deals are at risk?" for details`,
  ]));

  return { blocks };
}
