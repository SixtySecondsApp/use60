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

// --- Helper: Trajectory Section ---

function buildTrajectorySection(
  deal: QueryContext['deals'][0],
  activities: QueryContext['activities']
): string | null {
  const dealActivities = (activities || []).filter(
    (a) => a.metadata && (a.metadata as Record<string, unknown>).deal_id === deal.id
  );

  if (dealActivities.length === 0) {
    return ':warning: *Trajectory:* No recorded activity on this deal in the past week. Engagement may have gone cold.';
  }

  const now = Date.now();
  const sortedByDate = [...dealActivities].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const mostRecentMs = new Date(sortedByDate[0].created_at).getTime();
  const daysSinceLast = Math.floor((now - mostRecentMs) / (1000 * 60 * 60 * 24));

  // Bucket activities by day to assess frequency trend
  const activityDays = dealActivities.map((a) =>
    Math.floor((now - new Date(a.created_at).getTime()) / (1000 * 60 * 60 * 24))
  );
  const recentCount = activityDays.filter((d) => d <= 3).length;
  const olderCount = activityDays.filter((d) => d > 3 && d <= 7).length;

  let momentumLabel: string;
  let momentumDetail: string;

  if (daysSinceLast >= 5) {
    momentumLabel = ':large_yellow_circle: Slowing';
    momentumDetail = `Last touchpoint was ${daysSinceLast} day${daysSinceLast !== 1 ? 's' : ''} ago`;
  } else if (recentCount > olderCount) {
    momentumLabel = ':large_green_circle: Accelerating';
    momentumDetail = `${recentCount} activities in the last 3 days`;
  } else if (recentCount === olderCount && recentCount > 0) {
    momentumLabel = ':large_blue_circle: Steady';
    momentumDetail = `Consistent cadence — ${dealActivities.length} activities this week`;
  } else {
    momentumLabel = ':large_yellow_circle: Cooling';
    momentumDetail = `Activity tapering — more engagement earlier in the week`;
  }

  const lastActivityType = sortedByDate[0].type;
  const lastActivitySubject = truncate(sortedByDate[0].subject || lastActivityType, 60);

  return `*Trajectory:* ${momentumLabel}\n${momentumDetail}. Most recent: _${lastActivitySubject}_.`;
}

// --- Helper: Key Contacts Section ---

function buildKeyContactsSection(
  contacts: QueryContext['contacts'],
  activities: QueryContext['activities']
): string | null {
  if (!contacts || contacts.length === 0) return null;

  const now = Date.now();
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

  const lines: string[] = contacts.slice(0, 4).map((contact) => {
    const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Unknown';
    const role = contact.title || contact.company || 'No title';

    // Find most recent activity mentioning this contact (by email or name in metadata)
    const contactActivities = (activities || []).filter((a) => {
      const meta = a.metadata as Record<string, unknown>;
      return (
        (contact.email && meta.contact_email === contact.email) ||
        meta.contact_id === contact.id
      );
    });

    let lastContactStr = 'No recent activity';
    let warningFlag = '';

    if (contactActivities.length > 0) {
      const sortedActs = [...contactActivities].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const lastMs = new Date(sortedActs[0].created_at).getTime();
      const daysAgo = Math.floor((now - lastMs) / (1000 * 60 * 60 * 24));
      lastContactStr = daysAgo === 0 ? 'today' : `${daysAgo}d ago`;

      if (now - lastMs > fourteenDaysMs) {
        warningFlag = ' :warning: _No activity in 14+ days_';
      }
    } else {
      warningFlag = ' :warning: _No activity recorded_';
    }

    return `• *${fullName}* — ${truncate(role, 50)}\n  Last contact: ${lastContactStr}${warningFlag}`;
  });

  return `*Key Contacts:*\n${lines.join('\n')}`;
}

// --- Helper: Open Items Section ---

function buildOpenItemsSection(
  deal: QueryContext['deals'][0],
  activities: QueryContext['activities']
): string | null {
  // Build open items from activities flagged as follow-ups or tasks in metadata
  const dealActivities = (activities || []).filter(
    (a) => a.metadata && (a.metadata as Record<string, unknown>).deal_id === deal.id
  );

  const pending = dealActivities.filter((a) => {
    const meta = a.metadata as Record<string, unknown>;
    return meta.status === 'pending' || meta.requires_followup === true || a.type === 'task';
  });

  if (pending.length === 0) return null;

  const now = Date.now();
  const lines = pending.slice(0, 5).map((a) => {
    const meta = a.metadata as Record<string, unknown>;
    const dueDate = meta.due_date as string | undefined;
    const isOverdue = dueDate && new Date(dueDate).getTime() < now;
    const subject = truncate(a.subject || a.type, 70);
    const indicator = isOverdue ? ':red_circle:' : ':large_yellow_circle:';
    const duePart = dueDate
      ? ` — due ${new Date(dueDate).toLocaleDateString()}`
      : '';
    return `${indicator} ${subject}${duePart}`;
  });

  return `*Open Items:*\n${lines.join('\n')}`;
}

// --- Single Deal View (enhanced) ---

function handleSingleDeal(
  deal: QueryContext['deals'][0],
  riskScores: QueryContext['riskScores'],
  queryContext: QueryContext
): HandlerResult {
  const risk = riskScores?.find((r) => r.deal_id === deal.id);

  // --- Header ---
  const dealTypeLabel = deal.health_status ? ` — ${deal.health_status}` : '';
  const blocks: unknown[] = [
    header(`${deal.title}${dealTypeLabel}`),
  ];

  // --- Core metrics row ---
  const closeDateStr = deal.close_date
    ? new Date(deal.close_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'No close date';
  const riskStr = risk ? riskBadge(risk.risk_level) : ':white_circle: Not scored';

  blocks.push(fields([
    { label: 'Value', value: formatCurrency(deal.value) },
    { label: 'Stage', value: deal.stage || 'Unknown' },
    { label: 'Close Date', value: closeDateStr },
    { label: 'Risk', value: riskStr },
  ]));

  blocks.push(divider());

  // --- Trajectory section ---
  const trajectoryText = buildTrajectorySection(deal, queryContext.activities);
  if (trajectoryText) {
    blocks.push(section(trajectoryText));
  }

  // --- Key contacts section ---
  const contactsText = buildKeyContactsSection(queryContext.contacts, queryContext.activities);
  if (contactsText) {
    blocks.push(section(contactsText));
  }

  // --- Risk signals (if any) ---
  if (risk && risk.top_signals.length > 0) {
    blocks.push(section(`*Risk Signals:*\n${risk.top_signals.map((s) => `• ${s}`).join('\n')}`));
  }

  // --- Open items ---
  const openItemsText = buildOpenItemsSection(deal, queryContext.activities);
  if (openItemsText) {
    blocks.push(section(openItemsText));
  }

  blocks.push(divider());

  // --- Action buttons ---
  blocks.push(actions([
    { text: 'Draft check-in', actionId: 'copilot_draft_email', value: JSON.stringify({ deal_id: deal.id }), style: 'primary' },
    { text: 'View in 60', actionId: 'copilot_open_deal', value: deal.id },
  ]));

  return { blocks };
}

function handleMultipleDeals(
  deals: QueryContext['deals'],
  searchTerm: string
): HandlerResult {
  const lines = deals.slice(0, 5).map(
    (d) => `• *${d.title}* — ${d.stage} | ${formatCurrency(d.value)}`
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

  const blocks: unknown[] = [
    header(`${highRisk.length} Deal${highRisk.length > 1 ? 's' : ''} At Risk`),
  ];

  for (const risk of highRisk) {
    const deal = deals?.find((d) => d.id === risk.deal_id);
    const dealTitle = deal?.title || 'Unknown Deal';
    const topSignal = risk.top_signals[0] || 'No details';

    blocks.push(section(
      `${riskBadge(risk.risk_level)} *${dealTitle}* (${risk.score}/100)\n_${topSignal}_`
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
    return `• *${d.title}* — ${d.stage} | ${formatCurrency(d.value)} ${badge}`;
  });

  return {
    blocks: [
      section(`*Your Active Deals* (${deals.length} total${atRiskCount > 0 ? `, ${atRiskCount} at risk` : ''})`),
      section(lines.join('\n')),
      ...(deals.length > 5 ? [context([`Showing top 5. ${appLink('/deals', 'View all deals')}`])] : []),
    ],
  };
}
