// supabase/functions/_shared/slack-copilot/handlers/riskQueryHandler.ts
// CC-006: Dedicated risk query handler
// "Which deals are at risk?", "What deals are stale?", "Any ghosting signals?"

import type { QueryContext, HandlerResult, ClassifiedIntent } from '../types.ts';
import {
  header,
  section,
  actions,
  divider,
  context,
  riskBadge,
  formatCurrency,
  appLink,
} from '../responseFormatter.ts';

// Risk thresholds
const RISK_SCORE_THRESHOLD = 50;
const STALE_ACTIVITY_DAYS = 14;
// LONG_IN_STAGE_DAYS = 30 — reserved for when deals.stage_entered_at is available in QueryContext
const NO_REPLY_DAYS = 7;
const MAX_DEALS_SHOWN = 5;

interface RiskSignal {
  label: string;
  severity: number; // 1 = low, 2 = medium, 3 = high
}

interface RankedDeal {
  id: string;
  title: string;
  value: number | null;
  stage: string;
  compositeScore: number;
  riskLevel: string;
  signals: RiskSignal[];
  recommendedAction: string;
}

/**
 * Derive risk signals for a deal from available context data.
 * Uses risk scores when present; falls back to activity-based heuristics.
 */
function buildRiskSignals(
  deal: NonNullable<QueryContext['deals']>[number],
  riskScores: QueryContext['riskScores'],
  activities: QueryContext['activities']
): { signals: RiskSignal[]; compositeScore: number; riskLevel: string } {
  const signals: RiskSignal[] = [];
  let compositeScore = 0;

  // --- Signal: risk score from pre-computed scores ---
  const scoreEntry = riskScores?.find((r) => r.deal_id === deal.id);
  if (scoreEntry) {
    compositeScore = scoreEntry.score;
    // Include up to 2 top signals from the score record
    for (const sig of scoreEntry.top_signals.slice(0, 2)) {
      signals.push({ label: sig, severity: compositeScore >= 75 ? 3 : compositeScore >= 50 ? 2 : 1 });
    }
  }

  // --- Signal: stale deal (health_status) ---
  if (deal.health_status === 'at_risk' || deal.health_status === 'stale') {
    signals.push({
      label: `Deal marked as ${deal.health_status.replace('_', ' ')}`,
      severity: deal.health_status === 'at_risk' ? 3 : 2,
    });
    if (compositeScore < 55) compositeScore = Math.max(compositeScore, 55);
  }

  // --- Signal: no recent activity in 14+ days ---
  const dealActivities = (activities || []).filter((a) => {
    const meta = a.metadata as Record<string, unknown>;
    return meta?.deal_id === deal.id;
  });

  if (dealActivities.length > 0) {
    const latestAt = new Date(
      Math.max(...dealActivities.map((a) => new Date(a.created_at).getTime()))
    );
    const daysSinceActivity = Math.floor((Date.now() - latestAt.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceActivity >= STALE_ACTIVITY_DAYS) {
      signals.push({
        label: `No activity in ${daysSinceActivity} days`,
        severity: daysSinceActivity >= 30 ? 3 : 2,
      });
      if (compositeScore < 45) compositeScore = Math.max(compositeScore, 45);
    }

    // Signal: email sent but no reply in 7+ days
    const emailActivities = dealActivities.filter((a) => a.type === 'email');
    if (emailActivities.length > 0) {
      const latestEmail = emailActivities.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];
      const daysSinceEmail = Math.floor(
        (Date.now() - new Date(latestEmail.created_at).getTime()) / (1000 * 60 * 60 * 24)
      );
      const subject = latestEmail.subject || 'email';
      if (daysSinceEmail >= NO_REPLY_DAYS) {
        signals.push({
          label: `No reply to "${subject.substring(0, 40)}" (${daysSinceEmail}d ago)`,
          severity: 2,
        });
        if (compositeScore < 50) compositeScore = Math.max(compositeScore, 50);
      }
    }
  }

  // --- Derive risk level from composite score ---
  let riskLevel: string;
  if (compositeScore >= 75) riskLevel = 'critical';
  else if (compositeScore >= 60) riskLevel = 'high';
  else if (compositeScore >= 40) riskLevel = 'medium';
  else riskLevel = 'low';

  // Use scoreEntry risk level if it's more severe
  if (scoreEntry) {
    const scoreLevels = ['low', 'medium', 'high', 'critical'];
    const derivedIdx = scoreLevels.indexOf(riskLevel);
    const scoreIdx = scoreLevels.indexOf(scoreEntry.risk_level);
    if (scoreIdx > derivedIdx) {
      riskLevel = scoreEntry.risk_level;
      compositeScore = Math.max(compositeScore, scoreEntry.score);
    }
  }

  return { signals, compositeScore, riskLevel };
}

/**
 * Pick a recommended action based on the top risk signal.
 */
function recommendAction(signals: RiskSignal[], stage: string): string {
  const top = signals.sort((a, b) => b.severity - a.severity)[0];
  if (!top) return 'Review deal and plan next step';

  const label = top.label.toLowerCase();
  if (label.includes('no reply') || label.includes('email')) {
    return 'Send a direct "go/no-go" check-in email';
  }
  if (label.includes('no activity') || label.includes('stale')) {
    return `Re-engage — send a value-add touchpoint`;
  }
  if (label.includes('negotiation') || stage.toLowerCase().includes('negotiation')) {
    return 'Confirm timeline and decision criteria';
  }
  if (stage.toLowerCase().includes('proposal')) {
    return 'Send demo recap with clear next steps';
  }
  if (label.includes('ghosting') || label.includes('unresponsive')) {
    return 'Try a different channel (call, LinkedIn)';
  }
  return 'Review deal and plan next step';
}

export async function handleRiskQuery(
  _intent: ClassifiedIntent,
  queryContext: QueryContext
): Promise<HandlerResult> {
  const { deals, riskScores, activities } = queryContext;

  if (!deals || deals.length === 0) {
    return {
      text: 'No active deals found. Create some deals to start tracking risk.',
    };
  }

  // Build ranked list of at-risk deals
  const ranked: RankedDeal[] = [];

  for (const deal of deals) {
    const { signals, compositeScore, riskLevel } = buildRiskSignals(deal, riskScores, activities);

    // Include deal only if it has at least one risk signal or score >= threshold
    const hasRisk = compositeScore >= RISK_SCORE_THRESHOLD || signals.length > 0;
    if (!hasRisk) continue;

    ranked.push({
      id: deal.id,
      title: deal.title,
      value: deal.value,
      stage: deal.stage || 'Unknown',
      compositeScore,
      riskLevel,
      signals,
      recommendedAction: recommendAction(signals, deal.stage || ''),
    });
  }

  // Sort by composite score descending (highest risk first), take top 5
  ranked.sort((a, b) => b.compositeScore - a.compositeScore);
  const topRisk = ranked.slice(0, MAX_DEALS_SHOWN);

  if (topRisk.length === 0) {
    return {
      blocks: [
        section(':large_green_circle: *No at-risk deals!* Your pipeline looks healthy.'),
        context([
          `${deals.length} deal${deals.length === 1 ? '' : 's'} reviewed. ${appLink('/pipeline', 'View pipeline')}`,
        ]),
      ],
    };
  }

  const blocks = [
    header(`AT-RISK DEALS — ${topRisk.length} deal${topRisk.length === 1 ? '' : 's'} need${topRisk.length === 1 ? 's' : ''} attention`),
  ];

  topRisk.forEach((deal, idx) => {
    const valueStr = formatCurrency(deal.value);
    const topSignal = deal.signals.sort((a, b) => b.severity - a.severity)[0];
    const signalText = topSignal ? `\n_${topSignal.label}_` : '';

    blocks.push(section(
      `*${idx + 1}. ${deal.title.toUpperCase()}* — ${valueStr}, ${deal.stage}\n` +
      `${riskBadge(deal.riskLevel)} (score ${deal.compositeScore}/100)` +
      signalText +
      `\n:arrow_right: *Action:* ${deal.recommendedAction}`
    ));

    if (idx < topRisk.length - 1) {
      blocks.push(divider());
    }
  });

  blocks.push(divider());
  blocks.push(actions([
    { text: 'Draft check-ins for all', actionId: 'copilot_draft_checkins', value: topRisk.map((d) => d.id).join(','), style: 'primary' },
    { text: 'View pipeline', actionId: 'copilot_open_pipeline', value: 'pipeline' },
  ]));
  blocks.push(context([
    `${appLink('/pipeline', 'Open pipeline')} | Risk scores update daily | Showing top ${topRisk.length} of ${ranked.length} at-risk deal${ranked.length === 1 ? '' : 's'}`,
  ]));

  return { blocks };
}
