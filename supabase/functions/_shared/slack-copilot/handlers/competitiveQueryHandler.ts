// supabase/functions/_shared/slack-copilot/handlers/competitiveQueryHandler.ts
// Handles competitive intelligence and battlecard queries (PRD-22, CONV-007)

import type { ClassifiedIntent, QueryContext, HandlerResult } from '../types.ts';
import { header, section, fields, divider, context } from '../responseFormatter.ts';

export async function handleCompetitiveQuery(
  intent: ClassifiedIntent,
  queryContext: QueryContext
): Promise<HandlerResult> {
  const { competitive } = queryContext;

  // Specific competitor
  if (intent.entities.competitorName) {
    const match = competitive?.find((c) =>
      c.competitor_name.toLowerCase().includes(intent.entities.competitorName!.toLowerCase())
    );

    if (match) {
      return handleSpecificCompetitor(match);
    }

    return { text: `No competitive intelligence found for "${intent.entities.competitorName}". This data builds up as competitors are mentioned in your sales calls.` };
  }

  // General competitive landscape
  if (competitive && competitive.length > 0) {
    return handleCompetitiveLandscape(competitive);
  }

  return {
    blocks: [
      section("No competitive intelligence data yet. This builds automatically as competitors are mentioned in your sales calls."),
      context(["Once data accumulates, ask me things like \"What works against [competitor]?\" or \"Show competitive landscape\""]),
    ],
  };
}

function handleSpecificCompetitor(
  competitor: QueryContext['competitive'][0]
): HandlerResult {
  const blocks = [
    header(`Battlecard: ${competitor.competitor_name}`),
    fields([
      { label: 'Mentions', value: `${competitor.mention_count} across deals` },
      { label: 'Win Rate', value: competitor.win_rate != null ? `${(competitor.win_rate * 100).toFixed(0)}%` : 'Insufficient data' },
    ]),
  ];

  if (competitor.strengths.length > 0) {
    blocks.push(section(`*Their Strengths:*\n${competitor.strengths.map((s) => `• ${s}`).join('\n')}`));
  }

  if (competitor.weaknesses.length > 0) {
    blocks.push(section(`*Our Advantages:*\n${competitor.weaknesses.map((w) => `• ${w}`).join('\n')}`));
  }

  blocks.push(divider());
  blocks.push(context(['Competitive intel builds from your team\'s sales conversations. More data = better insights.']));

  return { blocks };
}

function handleCompetitiveLandscape(
  competitive: QueryContext['competitive']
): HandlerResult {
  const lines = competitive.map((c) => {
    const winRate = c.win_rate != null ? ` | Win rate: ${(c.win_rate * 100).toFixed(0)}%` : '';
    return `• *${c.competitor_name}* — ${c.mention_count} mentions${winRate}`;
  });

  return {
    blocks: [
      section('*Competitive Landscape:*'),
      section(lines.join('\n')),
      divider(),
      context(['Ask about a specific competitor for their full battlecard.']),
    ],
  };
}
