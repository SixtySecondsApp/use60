// supabase/functions/_shared/slack-copilot/handlers/pipelineQueryHandler.ts
// Handles pipeline, quota, and forecast queries (PRD-22, CONV-004, CC-006)

import type { ClassifiedIntent, QueryContext, HandlerResult } from '../types.ts';
import { header, section, fields, actions, divider, context, formatCurrency, appLink } from '../responseFormatter.ts';

// Stage probability weights — ordered funnel progression
const STAGE_WEIGHTS: Record<string, number> = {
  'Discovery': 0.1,
  'discovery': 0.1,
  'Qualification': 0.2,
  'qualification': 0.2,
  'Demo': 0.4,
  'demo': 0.4,
  'Proposal': 0.6,
  'proposal': 0.6,
  'Negotiation': 0.8,
  'negotiation': 0.8,
  'Verbal Close': 0.9,
  'verbal_close': 0.9,
  'Verbal Commit': 0.9,
  'verbal_commit': 0.9,
};

// Ordered funnel stages for display (early → late)
const STAGE_ORDER = [
  'Discovery', 'discovery',
  'Qualification', 'qualification',
  'Demo', 'demo',
  'Proposal', 'proposal',
  'Negotiation', 'negotiation',
  'Verbal Close', 'verbal_close',
  'Verbal Commit', 'verbal_commit',
];

function stageOrderIndex(stage: string): number {
  const idx = STAGE_ORDER.indexOf(stage);
  return idx === -1 ? 999 : idx;
}

export async function handlePipelineQuery(
  intent: ClassifiedIntent,
  queryContext: QueryContext
): Promise<HandlerResult> {
  const { pipelineSnapshot, deals, riskScores } = queryContext;

  if (!pipelineSnapshot || !deals || deals.length === 0) {
    return { text: 'No pipeline data available. Create some deals to get started.' };
  }

  const snap = pipelineSnapshot;

  // --- Stage breakdown with weighted values ---
  const stageMap: Record<string, { count: number; value: number; weighted: number }> = {};
  for (const deal of deals) {
    const stage = deal.stage || 'Unknown';
    if (!stageMap[stage]) stageMap[stage] = { count: 0, value: 0, weighted: 0 };
    stageMap[stage].count++;
    const v = deal.value || 0;
    stageMap[stage].value += v;
    stageMap[stage].weighted += v * (STAGE_WEIGHTS[stage] || 0.3);
  }

  // Sort stages in funnel order (early first)
  const sortedStages = Object.entries(stageMap).sort(
    (a, b) => stageOrderIndex(a[0]) - stageOrderIndex(b[0])
  );

  const stageLines = sortedStages.map(([stage, data]) => {
    const weight = STAGE_WEIGHTS[stage];
    const weightLabel = weight != null ? ` × ${Math.round(weight * 100)}% = ${formatCurrency(Math.round(data.weighted))}` : '';
    const dealWord = data.count === 1 ? 'deal' : 'deals';
    return `• *${stage}* (${data.count} ${dealWord})  ${formatCurrency(data.value)}${weightLabel}`;
  }).join('\n');

  // --- Coverage & target ---
  const now = new Date();
  const month = now.getMonth();
  const quarterMonth = month % 3;
  const quarterPhase = quarterMonth === 0 ? 'early' : quarterMonth === 1 ? 'mid' : 'late';
  const quarterName = `Q${Math.floor(month / 3) + 1}`;

  // --- Risk signals ---
  const riskLines: string[] = [];

  // Signal: stale deals — no activity-linked deal in 14+ days (use riskScores as proxy when activities absent)
  if (riskScores && riskScores.length > 0) {
    const staleByStage: Record<string, number> = {};
    for (const risk of riskScores) {
      if (risk.score >= 50) {
        const deal = deals.find((d) => d.id === risk.deal_id);
        if (deal) {
          const stage = deal.stage || 'Unknown';
          staleByStage[stage] = (staleByStage[stage] || 0) + 1;
        }
      }
    }
    for (const [stage, count] of Object.entries(staleByStage)) {
      riskLines.push(
        `• ${count} deal${count > 1 ? 's' : ''} in *${stage}* ${count > 1 ? 'have' : 'has'} a risk score ≥ 50`
      );
    }
  }

  // Signal: deal stuck in same stage — flag top long-running stale deal via health_status
  const stickyDeals = deals.filter(
    (d) => d.health_status === 'at_risk' || d.health_status === 'stale'
  );
  if (stickyDeals.length > 0) {
    const topSticky = stickyDeals[0];
    riskLines.push(
      `• *${topSticky.title}* (${formatCurrency(topSticky.value)}) is marked ${topSticky.health_status?.replace('_', ' ')} in ${topSticky.stage}`
    );
  }

  // Determine overall header fields
  const atRiskCount = riskScores?.filter((r) => r.score >= 60).length || 0;

  const overviewFields: Array<{ label: string; value: string }> = [
    { label: 'Unweighted Pipeline', value: formatCurrency(snap.total_value) },
    { label: 'Weighted Pipeline', value: formatCurrency(snap.weighted_value) },
    { label: 'Active Deals', value: `${snap.deal_count}` },
    { label: 'At Risk', value: atRiskCount > 0 ? `:warning: ${atRiskCount} deal${atRiskCount > 1 ? 's' : ''}` : ':white_check_mark: None' },
  ];

  if (snap.target) {
    const weightedCoverage = snap.weighted_value / snap.target;
    const gap = snap.target - snap.weighted_value;
    overviewFields.push(
      { label: 'Target', value: formatCurrency(snap.target) },
      {
        label: 'Weighted Coverage',
        value: `${weightedCoverage.toFixed(2)}x${weightedCoverage >= 1 ? ' :white_check_mark:' : ' :warning:'}`,
      },
      {
        label: 'Gap to Target',
        value: gap > 0 ? `:warning: ${formatCurrency(gap)}` : ':white_check_mark: On track',
      },
      { label: 'Quarter Phase', value: `${quarterPhase} ${quarterName}` }
    );
  }

  const blocks = [
    header(`Pipeline Overview — ${quarterName} ${now.getFullYear()}`),
    fields(overviewFields.slice(0, 4)),
  ];

  if (snap.target) {
    blocks.push(fields(overviewFields.slice(4)));
  }

  blocks.push(divider());
  blocks.push(section(`*Stage Breakdown:*\n${stageLines}`));

  if (riskLines.length > 0) {
    blocks.push(divider());
    blocks.push(section(`*Risks:*\n${riskLines.join('\n')}`));
  }

  blocks.push(divider());
  blocks.push(actions([
    { text: 'Show at-risk deals', actionId: 'copilot_risk_query', value: 'show_risk' },
    { text: 'View pipeline', actionId: 'copilot_open_pipeline', value: 'pipeline' },
  ]));
  blocks.push(context([
    `${appLink('/pipeline', 'Open pipeline')} | Ask "which deals are at risk?" for details | ${quarterPhase} ${quarterName}`,
  ]));

  return { blocks };
}
