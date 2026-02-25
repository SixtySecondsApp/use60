// supabase/functions/_shared/slack-copilot/handlers/dealQueryHandler.ts
// Handles deal-related queries: status, risk, details (PRD-22, CONV-004)

import type { ClassifiedIntent, QueryContext, HandlerResult } from '../types.ts';
import { header, section, fields, actions, divider, context, riskBadge, formatCurrency, appLink, truncate } from '../responseFormatter.ts';

export async function handleDealQuery(
  intent: ClassifiedIntent,
  queryContext: QueryContext
): Promise<HandlerResult> {
  const { deals, riskScores } = queryContext;

  // Check for risk-specific query
  const isRiskQuery = /(?:at risk|risky|risk|danger|slipping|stalling)/i.test(
    intent.entities.rawQuery || ''
  );

  if (isRiskQuery) {
    return handleAtRiskDeals(queryContext);
  }

  // Specific deal query
  if (intent.entities.dealName && deals && deals.length > 0) {
    if (deals.length === 1) {
      return handleSingleDeal(deals[0], riskScores, queryContext);
    }
    // Multiple matches
    return handleMultipleDeals(deals, intent.entities.dealName);
  }

  // No specific deal — show pipeline overview
  if (deals && deals.length > 0) {
    return handleDealOverview(deals, riskScores);
  }

  return { text: "I couldn't find any deals in your pipeline. Start by creating a deal in the app." };
}

function handleSingleDeal(
  deal: QueryContext['deals'][0],
  riskScores: QueryContext['riskScores'],
  queryContext: QueryContext
): HandlerResult {
  const risk = riskScores?.find((r) => r.deal_id === deal.id);
  const recentActivity = queryContext.activities?.filter((a) =>
    a.metadata && (a.metadata as Record<string, unknown>).deal_id === deal.id
  ).slice(0, 3);

  const blocks = [
    header(`${deal.title}`),
    fields([
      { label: 'Stage', value: deal.stage || 'Unknown' },
      { label: 'Value', value: formatCurrency(deal.value) },
      { label: 'Close Date', value: deal.close_date ? new Date(deal.close_date).toLocaleDateString() : 'Not set' },
      { label: 'Risk', value: risk ? riskBadge(risk.risk_level) : ':white_circle: Not scored' },
    ]),
  ];

  if (risk && risk.top_signals.length > 0) {
    blocks.push(section(`*Risk Signals:*\n${risk.top_signals.map((s) => `• ${s}`).join('\n')}`));
  }

  if (recentActivity && recentActivity.length > 0) {
    blocks.push(divider());
    blocks.push(section('*Recent Activity:*'));
    for (const act of recentActivity) {
      blocks.push(context([`${act.type} — ${truncate(act.subject || 'No subject', 80)} — ${new Date(act.created_at).toLocaleDateString()}`]));
    }
  }

  blocks.push(divider());
  blocks.push(context([appLink(`/deals/${deal.id}`, 'View Deal')]));
  blocks.push(actions([
    { text: 'Open in 60', actionId: 'copilot_open_deal', value: deal.id, style: 'primary' },
    { text: 'Draft Follow-up', actionId: 'copilot_draft_followup', value: deal.id },
  ]));

  return { blocks };
}

function handleMultipleDeals(
  deals: QueryContext['deals'],
  searchTerm: string
): HandlerResult {
  const lines = deals.slice(0, 5).map(
    (d) => `• ${appLink(`/deals/${d.id}`, d.title)} — ${d.stage} | ${formatCurrency(d.value)}`
  );

  return {
    blocks: [
      section(`Found ${deals.length} deals matching "${searchTerm}":`),
      section(lines.join('\n')),
      context(['Be more specific, e.g. "What\'s happening with Acme Corp?"']),
    ],
  };
}

function handleAtRiskDeals(queryContext: QueryContext): HandlerResult {
  const { deals, riskScores } = queryContext;

  if (!riskScores || riskScores.length === 0) {
    return { text: 'No risk scores available yet. Risk scoring runs daily — check back tomorrow.' };
  }

  // Sort by score descending (highest risk first)
  const highRisk = riskScores
    .filter((r) => r.score >= 50)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (highRisk.length === 0) {
    return {
      blocks: [
        section(':large_green_circle: *No high-risk deals!* All your active deals look healthy.'),
        context([`${riskScores.length} deals scored. Lowest risk: ${Math.min(...riskScores.map((r) => r.score))}`]),
      ],
    };
  }

  const blocks = [
    header(`${highRisk.length} Deal${highRisk.length > 1 ? 's' : ''} At Risk`),
  ];

  for (const risk of highRisk) {
    const deal = deals?.find((d) => d.id === risk.deal_id);
    const dealTitle = deal?.title || 'Unknown Deal';
    const dealLink = deal ? appLink(`/deals/${deal.id}`, dealTitle) : `*${dealTitle}*`;
    const topSignal = risk.top_signals[0] || 'No details';

    blocks.push(section(
      `${riskBadge(risk.risk_level)} ${dealLink} (${risk.score}/100)\n_${topSignal}_`
    ));
  }

  blocks.push(divider());
  blocks.push(context(['Risk scores update daily. Ask me about any specific deal for details.']));

  return { blocks };
}

function handleDealOverview(
  deals: QueryContext['deals'],
  riskScores: QueryContext['riskScores']
): HandlerResult {
  const atRiskCount = riskScores?.filter((r) => r.score >= 60).length || 0;
  const topDeals = deals.slice(0, 5);

  const lines = topDeals.map((d) => {
    const risk = riskScores?.find((r) => r.deal_id === d.id);
    const badge = risk ? riskBadge(risk.risk_level) : '';
    return `• ${appLink(`/deals/${d.id}`, d.title)} — ${d.stage} | ${formatCurrency(d.value)} ${badge}`;
  });

  return {
    blocks: [
      section(`*Your Active Deals* (${deals.length} total${atRiskCount > 0 ? `, ${atRiskCount} at risk` : ''})`),
      section(lines.join('\n')),
      ...(deals.length > 5 ? [context([`Showing top 5. ${appLink('/deals', 'View all deals')}`])] : []),
    ],
  };
}
