// supabase/functions/_shared/slack-copilot/handlers/competitiveQueryHandler.ts
// Handles competitive intelligence and battlecard queries (PRD-22, CONV-007)

import type { ClassifiedIntent, QueryContext, HandlerResult } from '../types.ts';
import { header, section, fields, divider, context, actions } from '../responseFormatter.ts';

// Derive win rate for a named competitor from the deals list in queryContext.
// Deals are considered wins/losses via their stage name (case-insensitive).
function calcWinRate(
  competitorName: string,
  deals: QueryContext['deals']
): { wins: number; losses: number; rate: number | null } | null {
  if (!deals || deals.length === 0) return null;

  const name = competitorName.toLowerCase();
  let wins = 0;
  let losses = 0;

  for (const deal of deals) {
    // Check if competitor is mentioned in deal metadata (future-proofing) or stage text
    const stage = (deal.stage ?? '').toLowerCase();
    const hasCompetitor =
      (deal as unknown as Record<string, unknown>).competitors != null
        ? (
            (deal as unknown as Record<string, string[]>).competitors ?? []
          ).some((c: string) => c.toLowerCase().includes(name))
        : false;

    if (!hasCompetitor) continue;

    if (stage.includes('won') || stage.includes('closed won')) wins++;
    else if (stage.includes('lost') || stage.includes('closed lost')) losses++;
  }

  const total = wins + losses;
  if (total === 0) return null;
  return { wins, losses, rate: wins / total };
}

export async function handleCompetitiveQuery(
  intent: ClassifiedIntent,
  queryContext: QueryContext
): Promise<HandlerResult> {
  const { competitive } = queryContext;

  // Empty state — no data yet
  if (!competitive || competitive.length === 0) {
    return {
      blocks: [
        section("I haven't found competitor mentions in your recent deals yet."),
        context([
          'This builds automatically as competitors come up in your sales calls.',
          'Once data accumulates, ask things like _"What works against [competitor]?"_ or _"Show competitive landscape"_',
        ]),
      ],
    };
  }

  // Specific competitor battlecard
  if (intent.entities.competitorName) {
    const match = competitive.find((c) =>
      c.competitor_name.toLowerCase().includes(intent.entities.competitorName!.toLowerCase())
    );

    if (match) {
      return handleSpecificCompetitor(match, queryContext.deals);
    }

    return {
      blocks: [
        section(`No competitive intelligence found for *"${intent.entities.competitorName}"*.`),
        context(['This data builds as the competitor is mentioned in your sales calls.']),
      ],
    };
  }

  // General competitive landscape
  return handleCompetitiveLandscape(competitive, queryContext.deals);
}

function handleSpecificCompetitor(
  competitor: NonNullable<QueryContext['competitive']>[0],
  deals: QueryContext['deals']
): HandlerResult {
  // Prefer stored win_rate; fall back to calculating from deals
  let winRateDisplay = 'Insufficient data';
  if (competitor.win_rate != null) {
    winRateDisplay = `${(competitor.win_rate * 100).toFixed(0)}%`;
  } else {
    const calc = calcWinRate(competitor.competitor_name, deals);
    if (calc) {
      winRateDisplay = `${(calc.rate! * 100).toFixed(0)}% (${calc.wins}W / ${calc.losses}L)`;
    }
  }

  const mentionLabel =
    competitor.mention_count === 1
      ? '1 deal'
      : `${competitor.mention_count} deals`;

  const blocks: unknown[] = [
    header(`BATTLECARD — ${competitor.competitor_name}`),
    fields([
      { label: 'WIN RATE', value: winRateDisplay },
      { label: 'MENTIONS', value: mentionLabel },
    ]),
  ];

  // Where they come up — surface deals that mention this competitor
  const competingDeals = (deals ?? []).filter((d) => {
    const cs = (d as unknown as Record<string, string[]>).competitors ?? [];
    return cs.some((c: string) =>
      c.toLowerCase().includes(competitor.competitor_name.toLowerCase())
    );
  });

  if (competingDeals.length > 0) {
    const dealLines = competingDeals
      .slice(0, 5)
      .map((d) => `• *${d.title}* (${d.stage})`)
      .join('\n');
    blocks.push(section(`*WHERE THEY COME UP*\n${dealLines}`));
  }

  if (competitor.strengths.length > 0) {
    const strengthLines = competitor.strengths
      .map((s, i) => `${i + 1}. ${s}`)
      .join('\n');
    blocks.push(section(`*THEIR STRENGTHS* _(from your conversations)_\n${strengthLines}`));
  }

  if (competitor.weaknesses.length > 0) {
    const weaknessLines = competitor.weaknesses
      .map((s, i) => `${i + 1}. ${s}`)
      .join('\n');
    blocks.push(section(`*THEIR WEAKNESSES* _(from your conversations)_\n${weaknessLines}`));
  }

  // Best counter-arguments — synthesised from weaknesses when wins exist
  const calc = calcWinRate(competitor.competitor_name, deals);
  if (calc && calc.wins > 0 && competitor.weaknesses.length > 0) {
    const counterLines = competitor.weaknesses
      .slice(0, 3)
      .map((w, i) => `${i + 1}. ${w}`)
      .join('\n');
    blocks.push(
      section(
        `*YOUR BEST COUNTER-ARGUMENTS*\n_Based on ${calc.wins} deal${calc.wins !== 1 ? 's' : ''} won against them:_\n${counterLines}`
      )
    );
  }

  blocks.push(divider());
  blocks.push(
    actions([
      {
        text: 'Draft competitive positioning',
        actionId: 'copilot_draft_email',
        value: JSON.stringify({
          type: 'competitive_positioning',
          competitor: competitor.competitor_name,
          strengths: competitor.strengths,
          weaknesses: competitor.weaknesses,
        }),
        style: 'primary',
      },
      {
        text: 'Show all mentions',
        actionId: 'copilot_competitive_details',
        value: JSON.stringify({ competitor: competitor.competitor_name }),
      },
    ])
  );

  blocks.push(
    context(['Competitive intel builds from your sales conversations. More data = better insights.'])
  );

  return { blocks };
}

function handleCompetitiveLandscape(
  competitive: NonNullable<QueryContext['competitive']>,
  deals: QueryContext['deals']
): HandlerResult {
  const ranked = [...competitive].sort((a, b) => b.mention_count - a.mention_count);

  const landscapeLines = ranked
    .map((c, i) => {
      let winRateStr = '';
      if (c.win_rate != null) {
        winRateStr = `, ${(c.win_rate * 100).toFixed(0)}% win rate`;
      } else {
        const calc = calcWinRate(c.competitor_name, deals);
        if (calc) winRateStr = `, ${(calc.rate! * 100).toFixed(0)}% win rate`;
      }
      const dealWord = c.mention_count === 1 ? 'deal' : 'deals';
      return `${i + 1}. *${c.competitor_name}* — mentioned in ${c.mention_count} ${dealWord}${winRateStr}`;
    })
    .join('\n');

  const blocks: unknown[] = [
    header('COMPETITIVE LANDSCAPE'),
    section(`*Top competitors mentioned in your deals:*\n\n${landscapeLines}`),
  ];

  // Surface deals that are actively competitive (not won/lost)
  const activeDeals = (deals ?? []).filter((d) => {
    const stage = (d.stage ?? '').toLowerCase();
    const isActive = !stage.includes('won') && !stage.includes('lost') && !stage.includes('closed');
    const cs = (d as unknown as Record<string, string[]>).competitors ?? [];
    return isActive && cs.length > 0;
  });

  if (activeDeals.length > 0) {
    const activeLines = activeDeals
      .slice(0, 5)
      .map((d) => {
        const cs = (d as unknown as Record<string, string[]>).competitors ?? [];
        const competitorList = cs.slice(0, 2).join(', ');
        const value = d.value != null ? ` £${(d.value / 1000).toFixed(0)}k` : '';
        return `• *${d.title}* (${d.stage}${value}) — ${competitorList}`;
      })
      .join('\n');
    blocks.push(divider());
    blocks.push(section(`*DEALS WITH ACTIVE COMPETITION*\n${activeLines}`));
  }

  // Action buttons for top 2 competitors
  if (ranked.length > 0) {
    blocks.push(divider());
    const battlecardButtons = ranked.slice(0, 2).map((c) => ({
      text: `Battlecard: ${c.competitor_name}`,
      actionId: 'copilot_competitive_details',
      value: JSON.stringify({ competitor: c.competitor_name, view: 'battlecard' }),
    }));
    blocks.push(actions(battlecardButtons));
  }

  blocks.push(
    context(['Ask _"What works against [competitor]?"_ for a full battlecard with counter-arguments.'])
  );

  return { blocks };
}
