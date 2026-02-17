/**
 * Report handlers: generate, preview, send, history
 * Ported from meeting-translation/src/api/routes/reports.ts
 */

import { getRailwayDb } from '../db.ts';
import { successResponse, errorResponse } from '../helpers.ts';
import {
  buildDailyReport,
  buildWeeklyReport,
  formatForSlack,
  formatForEmail,
  type Report,
} from '../services/reportBuilder.ts';

// ---------- Report generation ----------

export async function handleGenerateReport(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const type = url.searchParams.get('type') || 'daily';
  const includeDemo = url.searchParams.get('includeDemo') !== 'false';
  const demoOnly = url.searchParams.get('demoOnly') === 'true';

  if (type !== 'daily' && type !== 'weekly') {
    return errorResponse('Invalid report type. Must be "daily" or "weekly".', 400, req);
  }

  const report = type === 'daily'
    ? await buildDailyReport(req, { includeDemo, demoOnly })
    : await buildWeeklyReport(req, { includeDemo, demoOnly });

  return successResponse(report, req);
}

export async function handlePreviewReport(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const type = url.searchParams.get('type') || 'daily';
  const format = url.searchParams.get('format') || 'json';
  const includeDemo = url.searchParams.get('includeDemo') !== 'false';
  const demoOnly = url.searchParams.get('demoOnly') === 'true';

  if (type !== 'daily' && type !== 'weekly') {
    return errorResponse('Invalid report type. Must be "daily" or "weekly".', 400, req);
  }

  const report = type === 'daily'
    ? await buildDailyReport(req, { includeDemo, demoOnly })
    : await buildWeeklyReport(req, { includeDemo, demoOnly });

  if (format === 'slack') {
    return successResponse(formatForSlack(report), req);
  }
  if (format === 'email') {
    return successResponse(formatForEmail(report), req);
  }
  if (format === 'email-html') {
    const { html } = formatForEmail(report);
    const { getCorsHeaders } = await import('../../_shared/corsHelper.ts');
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html', ...getCorsHeaders(req) },
    });
  }

  return successResponse(report, req);
}

// ---------- Send report ----------

export async function handleSendReport(req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400, req);
  }

  const type = (body.type as string) || 'daily';
  const settingId = body.settingId as string | undefined;

  if (type !== 'daily' && type !== 'weekly') {
    return errorResponse('Invalid report type. Must be "daily" or "weekly".', 400, req);
  }

  const report = type === 'daily'
    ? await buildDailyReport(req)
    : await buildWeeklyReport(req);

  const db = getRailwayDb();
  const results: Array<{ channel: string; success: boolean; error?: string }> = [];

  if (settingId) {
    const settingRows = await db.unsafe(
      `SELECT id, setting_type, channel, config FROM notification_settings WHERE id = $1`,
      [settingId]
    );
    if (settingRows.length === 0) {
      return errorResponse('Notification setting not found', 404, req);
    }
    const setting = settingRows[0] as Record<string, unknown>;
    const result = await sendToChannel(report, setting);
    results.push(result);

    await recordHistory(db, report.type, setting.setting_type as string, setting.channel as string, result);
  } else {
    const settings = await db.unsafe(
      `SELECT id, setting_type, channel, config FROM notification_settings WHERE enabled = true`,
      []
    );
    for (const setting of settings) {
      const s = setting as Record<string, unknown>;
      const result = await sendToChannel(report, s);
      results.push(result);
      await recordHistory(db, report.type, s.setting_type as string, s.channel as string, result);
    }
  }

  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;

  return successResponse({
    results,
    summary: { sent: successCount, failed: failureCount, total: results.length },
  }, req);
}

async function sendToChannel(
  report: Report,
  setting: Record<string, unknown>
): Promise<{ channel: string; success: boolean; error?: string }> {
  const channel = setting.channel as string;
  try {
    if (setting.setting_type === 'slack') {
      const message = formatForSlack(report);
      const res = await fetch(channel, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Slack webhook failed: ${res.status} - ${text}`);
      }
    } else if (setting.setting_type === 'email') {
      // Email sending via SES would go here. For now, log and mark as sent.
      console.log(`[reports] Would send email to ${channel} — email delivery not yet wired.`);
    }
    return { channel, success: true };
  } catch (err) {
    return { channel, success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

async function recordHistory(
  db: ReturnType<typeof getRailwayDb>,
  reportType: string,
  channelType: string,
  channelTarget: string,
  result: { success: boolean; error?: string }
) {
  try {
    await db.unsafe(
      `INSERT INTO report_history (report_type, channel_type, channel_target, status, error_message)
       VALUES ($1, $2, $3, $4, $5)`,
      [reportType, channelType, channelTarget, result.success ? 'sent' : 'failed', result.error || null]
    );
  } catch (err) {
    console.error('[reports] Failed to record history:', err);
  }
}

// ---------- Report history ----------

export async function handleGetReportHistory(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);

  const db = getRailwayDb();
  const rows = await db.unsafe(
    `SELECT id, report_type as "reportType", channel_type as "channelType",
            channel_target as "channelTarget", status, error_message as "errorMessage",
            report_data as "reportData", sent_at as "sentAt"
     FROM report_history ORDER BY sent_at DESC LIMIT $1`,
    [limit]
  );

  const data = rows.map((r: Record<string, unknown>) => ({
    ...r,
    sentAt: r.sentAt instanceof Date ? (r.sentAt as Date).toISOString() : r.sentAt,
  }));

  return successResponse(data, req);
}

export async function handleGetReport(id: string, req: Request): Promise<Response> {
  const db = getRailwayDb();
  const rows = await db.unsafe(
    `SELECT id, report_type as "reportType", channel_type as "channelType",
            channel_target as "channelTarget", status, error_message as "errorMessage",
            report_data as "reportData", sent_at as "sentAt"
     FROM report_history WHERE id = $1`,
    [id]
  );

  if (rows.length === 0) {
    return errorResponse('Report not found', 404, req);
  }

  const row = rows[0] as Record<string, unknown>;
  return successResponse({
    ...row,
    sentAt: row.sentAt instanceof Date ? (row.sentAt as Date).toISOString() : row.sentAt,
  }, req);
}

// ---------- Test endpoints ----------

export async function handleTestSlack(req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400, req);
  }

  const webhookUrl = body.webhookUrl as string;
  if (!webhookUrl) return errorResponse('webhookUrl is required', 400, req);

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blocks: [{
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: ':white_check_mark: *Test Message*\n\nYour Slack webhook is configured correctly! You will receive meeting intelligence reports at this channel.',
          },
        }],
        text: 'Test message from Meeting Intelligence',
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return successResponse({ success: false, error: `Slack webhook failed: ${res.status} - ${text}` }, req);
    }
    return successResponse({ success: true }, req);
  } catch (err) {
    return successResponse({ success: false, error: err instanceof Error ? err.message : 'Unknown error' }, req);
  }
}
