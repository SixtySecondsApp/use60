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
  const totalMeetings = (summary.totalMeetings as number) ?? 0;

  // Only generate recommendations when there's actual meeting data to base them on
  if (totalMeetings > 0) {
    const avgScore = (summary.avgPerformanceScore as number) ?? 0;
    const avgBalance = (summary.avgTalkTimeBalance as number) ?? 0;
    if (avgScore > 0 && avgScore < 60) {
      recommendations.push('Consider scheduling coaching sessions - average performance is below 60%');
    }
    if (avgBalance > 0 && avgBalance < 50) {
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

// ---------- Helpers ----------

/** Ensure includeDemo / demoOnly params are on the request URL so the dashboard handler reads them. */
function applyDemoParams(req: Request, options: { includeDemo?: boolean; demoOnly?: boolean }): Request {
  const url = new URL(req.url);
  if (options.includeDemo !== undefined) url.searchParams.set('includeDemo', String(options.includeDemo));
  if (options.demoOnly !== undefined) url.searchParams.set('demoOnly', String(options.demoOnly));
  return new Request(url.toString(), req);
}

// ---------- Public API ----------

export async function buildDailyReport(
  req: Request,
  orgId: string,
  options: { includeDemo?: boolean; demoOnly?: boolean } = {}
): Promise<Report> {
  const metrics = await getDashboardMetricsData(applyDemoParams(req, options), orgId);
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
  orgId: string,
  options: { includeDemo?: boolean; demoOnly?: boolean } = {}
): Promise<Report> {
  const metrics = await getDashboardMetricsData(applyDemoParams(req, options), orgId);
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
  const trendColor = (v: number) => v > 0 ? '#03AD9C' : v < 0 ? '#ef4444' : '#9ca3af';
  const mt = (trends.meetingsTrend as number) ?? 0;
  const st = (trends.scoreTrend as number) ?? 0;

  // All inline styles for email client + iframe compatibility
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; margin: 0; padding: 0; background: #0f172a; color: #e2e8f0;">
  <div style="padding: 24px 16px; background: #0f172a;">
    <div style="max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 16px; overflow: hidden; border: 1px solid #334155;">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #059669 0%, #0d9488 100%); padding: 28px 24px; text-align: center;">
        <img src="https://app.use60.com/favicon_0_128x128.png" alt="60" width="40" height="40" style="display: inline-block; margin-bottom: 10px; border-radius: 10px;" />
        <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; color: rgba(255,255,255,0.7); margin-bottom: 6px;">60 Meeting Intelligence</div>
        <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.3px;">${isDaily ? 'Daily' : 'Weekly'} Report</h1>
        <p style="margin: 6px 0 0; font-size: 13px; color: rgba(255,255,255,0.8);">${dateStr}</p>
      </div>
      <!-- Stats -->
      <div style="padding: 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: separate; border-spacing: 8px;">
          <tr>
            <td style="background: #0f172a; border: 1px solid #334155; border-radius: 10px; padding: 16px 12px; text-align: center; width: 50%;">
              <div style="font-size: 26px; font-weight: 700; color: #34d399;">${summary.totalMeetings ?? 0}</div>
              <div style="font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; font-weight: 500;">Meetings</div>
            </td>
            <td style="background: #0f172a; border: 1px solid #334155; border-radius: 10px; padding: 16px 12px; text-align: center; width: 50%;">
              <div style="font-size: 26px; font-weight: 700; color: #34d399;">${summary.avgPerformanceScore ?? 0}</div>
              <div style="font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; font-weight: 500;">Avg Score</div>
            </td>
          </tr>
          <tr>
            <td style="background: #0f172a; border: 1px solid #334155; border-radius: 10px; padding: 16px 12px; text-align: center; width: 50%;">
              <div style="font-size: 26px; font-weight: 700; color: #34d399;">${summary.avgConversionScore ?? 0}%</div>
              <div style="font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; font-weight: 500;">Pipeline Health</div>
            </td>
            <td style="background: #0f172a; border: 1px solid #334155; border-radius: 10px; padding: 16px 12px; text-align: center; width: 50%;">
              <div style="font-size: 26px; font-weight: 700; color: #34d399;">${summary.completedActionItems ?? 0}/${summary.totalActionItems ?? 0}</div>
              <div style="font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; font-weight: 500;">Actions Done</div>
            </td>
          </tr>
        </table>
      </div>
      <!-- Highlights -->
      <div style="padding: 0 20px 20px;">
        ${highlights.topPerformer ? `<div style="background: #0f172a; border: 1px solid #334155; border-left: 3px solid #059669; padding: 14px 16px; margin-bottom: 10px; border-radius: 0 10px 10px 0;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #34d399; margin-bottom: 4px;">Top Performer</div>
          <div style="font-size: 15px; font-weight: 600; color: #f1f5f9;">${highlights.topPerformer.title}</div>
          <div style="font-size: 13px; color: #94a3b8; margin-top: 2px;">Score: ${highlights.topPerformer.score}/100 (${highlights.topPerformer.grade})</div>
        </div>` : ''}
        ${highlights.hottestDeal ? `<div style="background: #0f172a; border: 1px solid #334155; border-left: 3px solid #f59e0b; padding: 14px 16px; margin-bottom: 10px; border-radius: 0 10px 10px 0;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #fbbf24; margin-bottom: 4px;">Hottest Deal</div>
          <div style="font-size: 15px; font-weight: 600; color: #f1f5f9;">${highlights.hottestDeal.title}</div>
          <div style="font-size: 13px; color: #94a3b8; margin-top: 2px;">Conversion Probability: ${highlights.hottestDeal.conversionScore}%</div>
        </div>` : ''}
        ${highlights.needsAttention.length > 0 ? `<div style="margin-top: 16px;">
          <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; padding-bottom: 8px; margin-bottom: 10px; border-bottom: 1px solid #334155;">Needs Attention</div>
          ${highlights.needsAttention.map(item => `<div style="padding: 10px 14px; margin-bottom: 6px; background: #0f172a; border: 1px solid #334155; border-radius: 10px; font-size: 13px; color: #cbd5e1;">
            <span style="color: #f59e0b; margin-right: 8px;">&#9888;</span>${item}
          </div>`).join('')}
        </div>` : ''}
        ${highlights.recommendations.length > 0 ? `<div style="margin-top: 16px;">
          <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; padding-bottom: 8px; margin-bottom: 10px; border-bottom: 1px solid #334155;">Recommendations</div>
          ${highlights.recommendations.map(item => `<div style="padding: 10px 14px; margin-bottom: 6px; background: rgba(5,150,105,0.06); border: 1px solid rgba(5,150,105,0.15); border-radius: 10px; font-size: 13px; color: #cbd5e1;">
            <span style="color: #34d399; margin-right: 8px;">&#9670;</span>${item}
          </div>`).join('')}
        </div>` : ''}
        ${!isDaily ? `<div style="margin-top: 16px;">
          <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; padding-bottom: 8px; margin-bottom: 10px; border-bottom: 1px solid #334155;">Week-over-Week Trends</div>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: separate; border-spacing: 8px;">
            <tr>
              <td style="background: #0f172a; border: 1px solid #334155; border-radius: 10px; padding: 14px; text-align: center; width: 50%;">
                <div style="font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Meetings</div>
                <div style="font-size: 18px; font-weight: 700; color: ${trendColor(mt)};">${trendArrow(mt)} ${mt > 0 ? '+' : ''}${mt}%</div>
              </td>
              <td style="background: #0f172a; border: 1px solid #334155; border-radius: 10px; padding: 14px; text-align: center; width: 50%;">
                <div style="font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Scores</div>
                <div style="font-size: 18px; font-weight: 700; color: ${trendColor(st)};">${trendArrow(st)} ${st > 0 ? '+' : ''}${st}%</div>
              </td>
            </tr>
          </table>
        </div>` : ''}
      </div>
      <!-- Footer -->
      <div style="border-top: 1px solid #334155; padding: 14px 24px; text-align: center; font-size: 11px; color: #64748b;">
        Generated at ${new Date(generatedAt).toLocaleTimeString()} &middot; <a href="https://app.use60.com" style="color: #34d399; text-decoration: none;">60 Meeting Intelligence</a>
      </div>
    </div>
  </div>
</body>
</html>`.trim();

  return { subject, html };
}
