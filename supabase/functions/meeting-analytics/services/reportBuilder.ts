/**
 * Report Builder Service
 *
 * Generates daily and weekly meeting intelligence reports with
 * Slack Block Kit and HTML email output formats.
 * Ported from meeting-translation/src/services/ReportingService.ts
 */

import { getDashboardMetricsData } from '../handlers/dashboard.ts';

// ---------- Types ----------

export interface ReportHighlights {
  topPerformer: { title: string; score: number; grade: string } | null;
  hottestDeal: { title: string; conversionScore: number } | null;
  meetingCount: number;
  actionItemsCreated: number;
  actionItemsCompleted: number;
  needsAttention: string[];
  recommendations: string[];
}

export interface Report {
  type: 'daily' | 'weekly';
  generatedAt: string;
  period: { start: string; end: string };
  metrics: Record<string, unknown>;
  highlights: ReportHighlights;
}

export interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  elements?: Array<{ type: string; text?: string | { type: string; text: string; emoji?: boolean }; action_id?: string; url?: string }>;
  fields?: Array<{ type: string; text: string }>;
  accessory?: { type: string; text?: { type: string; text: string; emoji?: boolean }; action_id?: string; url?: string };
}

export interface SlackMessage {
  blocks: SlackBlock[];
  text: string;
}

// ---------- Helpers ----------

function getLastWeekStart(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const lastMonday = new Date(now);
  lastMonday.setDate(now.getDate() - diff - 7);
  lastMonday.setHours(0, 0, 0, 0);
  return lastMonday;
}

function generateHighlights(
  metrics: Record<string, unknown>,
  _type: 'daily' | 'weekly'
): ReportHighlights {
  const summary = (metrics.summary ?? {}) as Record<string, unknown>;
  const trends = (metrics.trends ?? {}) as Record<string, unknown>;
  const topPerformers = (metrics.topPerformers ?? []) as Array<Record<string, unknown>>;
  const pipelineHealth = (metrics.pipelineHealth ?? []) as Array<Record<string, unknown>>;
  const alerts = (metrics.alerts ?? []) as Array<Record<string, unknown>>;

  const topPerformer = topPerformers[0]
    ? { title: topPerformers[0].title as string, score: topPerformers[0].score as number, grade: topPerformers[0].grade as string }
    : null;

  const hottestDeal = pipelineHealth[0]
    ? { title: pipelineHealth[0].title as string, conversionScore: pipelineHealth[0].conversionScore as number }
    : null;

  const needsAttention: string[] = [];
  for (const alert of alerts) {
    if (alert.severity === 'critical' || alert.severity === 'warning') {
      needsAttention.push(alert.message as string);
    }
  }

  const recommendations: string[] = [];
  if ((summary.avgPerformanceScore as number) < 60) {
    recommendations.push('Consider scheduling coaching sessions - average performance is below 60%');
  }
  if ((summary.avgTalkTimeBalance as number) < 50) {
    recommendations.push('Focus on active listening - less than 50% of calls are balanced');
  }
  if ((summary.pendingActionItems as number) > 10) {
    recommendations.push(`Clear the backlog: ${summary.pendingActionItems} action items are still pending`);
  }
  if ((trends.meetingsTrend as number) < -20) {
    recommendations.push('Meeting volume is down significantly - review pipeline generation');
  }
  if ((trends.scoreTrend as number) < -10) {
    recommendations.push('Performance scores are trending down - investigate root causes');
  }
  const blockersCount = pipelineHealth.reduce((s, p) => s + ((p.blockerCount as number) || 0), 0);
  if (blockersCount > 0) {
    recommendations.push(`Address ${blockersCount} blocker${blockersCount > 1 ? 's' : ''} in the pipeline`);
  }

  return {
    topPerformer,
    hottestDeal,
    meetingCount: (summary.totalMeetings as number) ?? 0,
    actionItemsCreated: (trends.actionItemsCreated as number) ?? 0,
    actionItemsCompleted: (trends.actionItemsCompleted as number) ?? 0,
    needsAttention: needsAttention.slice(0, 5),
    recommendations: recommendations.slice(0, 5),
  };
}

// ---------- Public API ----------

export async function buildDailyReport(
  req: Request,
  _options: { includeDemo?: boolean; demoOnly?: boolean } = {}
): Promise<Report> {
  const metrics = await getDashboardMetricsData(req);
  const highlights = generateHighlights(metrics, 'daily');

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const yesterdayEnd = new Date(yesterday);
  yesterdayEnd.setHours(23, 59, 59, 999);

  return {
    type: 'daily',
    generatedAt: now.toISOString(),
    period: { start: yesterday.toISOString(), end: yesterdayEnd.toISOString() },
    metrics,
    highlights,
  };
}

export async function buildWeeklyReport(
  req: Request,
  _options: { includeDemo?: boolean; demoOnly?: boolean } = {}
): Promise<Report> {
  const metrics = await getDashboardMetricsData(req);
  const highlights = generateHighlights(metrics, 'weekly');

  const startDate = getLastWeekStart();
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);
  endDate.setHours(23, 59, 59, 999);

  return {
    type: 'weekly',
    generatedAt: new Date().toISOString(),
    period: { start: startDate.toISOString(), end: endDate.toISOString() },
    metrics,
    highlights,
  };
}

export function formatForSlack(report: Report): SlackMessage {
  const { type, generatedAt, metrics, highlights } = report;
  const isDaily = type === 'daily';
  const summary = (metrics.summary ?? {}) as Record<string, unknown>;
  const trends = (metrics.trends ?? {}) as Record<string, unknown>;

  const dateStr = new Date(generatedAt).toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric', year: 'numeric',
  });

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: isDaily
          ? `Daily Meeting Intelligence Report - ${dateStr}`
          : `Weekly Meeting Intelligence Report - ${dateStr}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: isDaily ? '*Current Summary:*' : "*This Week's Summary:*" },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Meetings:*\n${summary.totalMeetings ?? 0}` },
        { type: 'mrkdwn', text: `*Avg Score:*\n${summary.avgPerformanceScore ?? 0}/100` },
        { type: 'mrkdwn', text: `*Pipeline Health:*\n${summary.avgConversionScore ?? 0}% avg` },
        { type: 'mrkdwn', text: `*Action Items:*\n${summary.completedActionItems ?? 0}/${summary.totalActionItems ?? 0} done` },
      ],
    },
    { type: 'divider' },
  ];

  if (highlights.topPerformer) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Top Performer:*\n:trophy: ${highlights.topPerformer.title} - Score: ${highlights.topPerformer.score} (${highlights.topPerformer.grade})`,
      },
    });
  }

  if (highlights.hottestDeal) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Hottest Deal:*\n:fire: ${highlights.hottestDeal.title} - ${highlights.hottestDeal.conversionScore}% conversion probability`,
      },
    });
  }

  if (highlights.needsAttention.length > 0) {
    blocks.push(
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Needs Attention:*\n' + highlights.needsAttention.map(item => `:warning: ${item}`).join('\n'),
        },
      }
    );
  }

  if (highlights.recommendations.length > 0) {
    blocks.push(
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Recommendations:*\n' + highlights.recommendations.map(item => `:bulb: ${item}`).join('\n'),
        },
      }
    );
  }

  if (!isDaily) {
    const trendEmoji = (v: number) => v > 0 ? ':chart_with_upwards_trend:' : v < 0 ? ':chart_with_downwards_trend:' : ':left_right_arrow:';
    const trendSign = (v: number) => v > 0 ? '+' : '';
    const mt = (trends.meetingsTrend as number) ?? 0;
    const st = (trends.scoreTrend as number) ?? 0;

    blocks.push(
      { type: 'divider' },
      { type: 'section', text: { type: 'mrkdwn', text: '*Week-over-Week Trends:*' } },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `${trendEmoji(mt)} *Meetings:* ${trendSign(mt)}${mt}%` },
          { type: 'mrkdwn', text: `${trendEmoji(st)} *Scores:* ${trendSign(st)}${st}%` },
        ],
      }
    );
  }

  blocks.push(
    { type: 'divider' },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `Generated at ${new Date(generatedAt).toLocaleTimeString()} | Meeting Intelligence Dashboard` },
      ],
    }
  );

  return {
    blocks,
    text: isDaily
      ? `Daily Meeting Report: ${summary.totalMeetings ?? 0} meetings, avg score ${summary.avgPerformanceScore ?? 0}/100`
      : `Weekly Meeting Report: ${summary.totalMeetings ?? 0} meetings, avg score ${summary.avgPerformanceScore ?? 0}/100`,
  };
}

export function formatForEmail(report: Report): { subject: string; html: string } {
  const { type, generatedAt, metrics, highlights } = report;
  const isDaily = type === 'daily';
  const summary = (metrics.summary ?? {}) as Record<string, unknown>;
  const trends = (metrics.trends ?? {}) as Record<string, unknown>;

  const dateStr = new Date(generatedAt).toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric', year: 'numeric',
  });

  const subject = isDaily
    ? `Daily Meeting Intelligence Report - ${dateStr}`
    : `Weekly Meeting Intelligence Report - ${dateStr}`;

  const trendArrow = (v: number) => v > 0 ? '&#9650;' : v < 0 ? '&#9660;' : '&#8596;';
  const trendColor = (v: number) => v > 0 ? '#22c55e' : v < 0 ? '#ef4444' : '#6b7280';
  const mt = (trends.meetingsTrend as number) ?? 0;
  const st = (trends.scoreTrend as number) ?? 0;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background: #f3f4f6; }
    .container { max-width: 600px; margin: 0 auto; background: white; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
    .header p { margin: 8px 0 0; opacity: 0.9; font-size: 14px; }
    .content { padding: 24px; }
    .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 24px; }
    .stat-card { background: #f9fafb; border-radius: 8px; padding: 16px; text-align: center; }
    .stat-value { font-size: 28px; font-weight: 700; color: #667eea; }
    .stat-label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
    .section { margin-bottom: 24px; }
    .section h2 { font-size: 16px; color: #374151; margin: 0 0 12px; padding-bottom: 8px; border-bottom: 2px solid #e5e7eb; }
    .highlight { background: #f0fdf4; border-left: 4px solid #22c55e; padding: 12px; margin-bottom: 12px; border-radius: 0 8px 8px 0; }
    .highlight.hot { background: #fef3c7; border-color: #f59e0b; }
    .highlight strong { color: #374151; }
    .alert-list { list-style: none; padding: 0; margin: 0; }
    .alert-list li { padding: 8px 0; border-bottom: 1px solid #e5e7eb; display: flex; align-items: flex-start; gap: 8px; }
    .alert-list li:last-child { border-bottom: none; }
    .recommendation { background: #eff6ff; padding: 8px 12px; margin-bottom: 8px; border-radius: 6px; font-size: 14px; }
    .trend { display: inline-flex; align-items: center; gap: 4px; font-size: 14px; }
    .footer { background: #f9fafb; padding: 16px 24px; text-align: center; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${isDaily ? 'Daily' : 'Weekly'} Meeting Intelligence Report</h1>
      <p>${dateStr}</p>
    </div>
    <div class="content">
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-value">${summary.totalMeetings ?? 0}</div><div class="stat-label">Meetings</div></div>
        <div class="stat-card"><div class="stat-value">${summary.avgPerformanceScore ?? 0}</div><div class="stat-label">Avg Score</div></div>
        <div class="stat-card"><div class="stat-value">${summary.avgConversionScore ?? 0}%</div><div class="stat-label">Pipeline Health</div></div>
        <div class="stat-card"><div class="stat-value">${summary.completedActionItems ?? 0}/${summary.totalActionItems ?? 0}</div><div class="stat-label">Actions Done</div></div>
      </div>
      ${highlights.topPerformer ? `<div class="highlight"><strong>Top Performer:</strong> ${highlights.topPerformer.title}<br>Score: ${highlights.topPerformer.score}/100 (${highlights.topPerformer.grade})</div>` : ''}
      ${highlights.hottestDeal ? `<div class="highlight hot"><strong>Hottest Deal:</strong> ${highlights.hottestDeal.title}<br>Conversion Probability: ${highlights.hottestDeal.conversionScore}%</div>` : ''}
      ${highlights.needsAttention.length > 0 ? `<div class="section"><h2>Needs Attention</h2><ul class="alert-list">${highlights.needsAttention.map(item => `<li><span style="color:#f59e0b">&#9888;</span><span>${item}</span></li>`).join('')}</ul></div>` : ''}
      ${highlights.recommendations.length > 0 ? `<div class="section"><h2>Recommendations</h2>${highlights.recommendations.map(item => `<div class="recommendation">&#128161; ${item}</div>`).join('')}</div>` : ''}
      ${!isDaily ? `<div class="section"><h2>Week-over-Week Trends</h2><p><span class="trend" style="color:${trendColor(mt)}">${trendArrow(mt)} Meetings: ${mt > 0 ? '+' : ''}${mt}%</span>&nbsp;&nbsp;|&nbsp;&nbsp;<span class="trend" style="color:${trendColor(st)}">${trendArrow(st)} Scores: ${st > 0 ? '+' : ''}${st}%</span></p></div>` : ''}
    </div>
    <div class="footer">Generated at ${new Date(generatedAt).toLocaleTimeString()} | Meeting Intelligence Dashboard</div>
  </div>
</body>
</html>`.trim();

  return { subject, html };
}
