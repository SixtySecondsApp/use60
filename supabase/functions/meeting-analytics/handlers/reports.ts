/**
 * Report handlers: generate, preview, send, history
 * Ported from meeting-translation/src/api/routes/reports.ts
 */

import { getRailwayDb } from '../db.ts';
import { successResponse, errorResponse } from '../helpers.ts';
import { sendEmail } from '../../_shared/ses.ts';
import {
  buildDailyReport,
  buildWeeklyReport,
  formatForSlack,
  formatForEmail,
  type Report,
} from '../services/reportBuilder.ts';

// ---------- Report generation ----------

export async function handleGenerateReport(req: Request, orgId: string): Promise<Response> {
  const url = new URL(req.url);
  const type = url.searchParams.get('type') || 'daily';
  const includeDemo = url.searchParams.get('includeDemo') === 'true';
  const demoOnly = url.searchParams.get('demoOnly') === 'true';

  if (type !== 'daily' && type !== 'weekly') {
    return errorResponse('Invalid report type. Must be "daily" or "weekly".', 400, req);
  }

  const report = type === 'daily'
    ? await buildDailyReport(req, orgId, { includeDemo, demoOnly })
    : await buildWeeklyReport(req, orgId, { includeDemo, demoOnly });

  return successResponse(report, req);
}

export async function handlePreviewReport(req: Request, orgId: string): Promise<Response> {
  const url = new URL(req.url);
  const type = url.searchParams.get('type') || 'daily';
  const format = url.searchParams.get('format') || 'json';
  const includeDemo = url.searchParams.get('includeDemo') === 'true';
  const demoOnly = url.searchParams.get('demoOnly') === 'true';

  if (type !== 'daily' && type !== 'weekly') {
    return errorResponse('Invalid report type. Must be "daily" or "weekly".', 400, req);
  }

  const report = type === 'daily'
    ? await buildDailyReport(req, orgId, { includeDemo, demoOnly })
    : await buildWeeklyReport(req, orgId, { includeDemo, demoOnly });

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

export async function handleSendReport(req: Request, orgId: string): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400, req);
  }

  const type = (body.type as string) || 'daily';
  const settingId = body.settingId as string | undefined;
  const channels = body.channels as string | undefined; // 'slack' | 'email' | undefined (all)

  if (type !== 'daily' && type !== 'weekly') {
    return errorResponse('Invalid report type. Must be "daily" or "weekly".', 400, req);
  }

  let report: Report;
  try {
    report = type === 'daily'
      ? await buildDailyReport(req, orgId, { includeDemo: false })
      : await buildWeeklyReport(req, orgId, { includeDemo: false });
  } catch (err) {
    console.error('[reports] Failed to build report:', err);
    return errorResponse(`Failed to generate report data: ${err instanceof Error ? err.message : 'Unknown error'}`, 500, req);
  }

  const db = getRailwayDb();
  const results: Array<{ channel: string; success: boolean; error?: string }> = [];

  try {
    if (settingId) {
      const settingRows = await db.unsafe(
        `SELECT id, setting_type, channel, config FROM notification_settings WHERE id = $1 AND org_id = $2`,
        [settingId, orgId]
      );
      if (settingRows.length === 0) {
        return errorResponse('Notification setting not found', 404, req);
      }
      const setting = settingRows[0] as Record<string, unknown>;
      const result = await sendToChannel(report, setting);
      results.push(result);

      await recordHistory(db, orgId, report.type, setting.setting_type as string, setting.channel as string, result);
    } else {
      let query = `SELECT id, setting_type, channel, config FROM notification_settings WHERE enabled = true AND org_id = $1`;
      const params: unknown[] = [orgId];
      if (channels === 'slack' || channels === 'email') {
        query += ` AND setting_type = $2`;
        params.push(channels);
      }
      const settings = await db.unsafe(query, params);
      for (const setting of settings) {
        const s = setting as Record<string, unknown>;
        const result = await sendToChannel(report, s);
        results.push(result);
        await recordHistory(db, orgId, report.type, s.setting_type as string, s.channel as string, result);
      }
    }
  } catch (err) {
    console.error('[reports] Failed to query notification settings or send:', err);
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg.includes('does not exist') || msg.includes('relation')) {
      return errorResponse('Notification settings table not found. Please contact support.', 500, req);
    }
    return errorResponse(`Failed to send report: ${msg}`, 500, req);
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
      const { subject, html } = formatForEmail(report);
      const result = await sendEmail({
        to: channel,
        subject,
        html,
        from: 'app@use60.com',
        fromName: '60',
      });
      if (!result.success) {
        throw new Error(`Email send failed: ${result.error}`);
      }
    }
    return { channel, success: true };
  } catch (err) {
    return { channel, success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

async function recordHistory(
  db: ReturnType<typeof getRailwayDb>,
  orgId: string,
  reportType: string,
  channelType: string,
  channelTarget: string,
  result: { success: boolean; error?: string }
) {
  try {
    await db.unsafe(
      `INSERT INTO report_history (org_id, report_type, channel_type, channel_target, status, error_message)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [orgId, reportType, channelType, channelTarget, result.success ? 'sent' : 'failed', result.error || null]
    );
  } catch (err) {
    console.error('[reports] Failed to record history:', err);
  }
}

// ---------- Report history ----------

export async function handleGetReportHistory(req: Request, orgId: string): Promise<Response> {
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);

  const db = getRailwayDb();
  const rows = await db.unsafe(
    `SELECT id, report_type as "reportType", channel_type as "channelType",
            channel_target as "channelTarget", status, error_message as "errorMessage",
            report_data as "reportData", sent_at as "sentAt"
     FROM report_history WHERE org_id = $1 ORDER BY sent_at DESC LIMIT $2`,
    [orgId, limit]
  );

  const data = rows.map((r: Record<string, unknown>) => ({
    ...r,
    sentAt: r.sentAt instanceof Date ? (r.sentAt as Date).toISOString() : r.sentAt,
  }));

  return successResponse(data, req);
}

export async function handleGetReport(id: string, req: Request, orgId: string): Promise<Response> {
  const db = getRailwayDb();
  const rows = await db.unsafe(
    `SELECT id, report_type as "reportType", channel_type as "channelType",
            channel_target as "channelTarget", status, error_message as "errorMessage",
            report_data as "reportData", sent_at as "sentAt"
     FROM report_history WHERE id = $1 AND org_id = $2`,
    [id, orgId]
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

export async function handleTestEmail(req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400, req);
  }

  const emailAddress = body.emailAddress as string;
  if (!emailAddress) return errorResponse('emailAddress is required', 400, req);

  try {
    const testHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Test — 60 Meeting Intelligence</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; margin: 0; padding: 0; background: #0f172a; color: #e2e8f0;">
  <div style="padding: 24px 16px; background: #0f172a;">
    <div style="max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 16px; overflow: hidden; border: 1px solid #334155;">
      <div style="background: linear-gradient(135deg, #059669 0%, #0d9488 100%); padding: 28px 24px; text-align: center;">
        <img src="https://app.use60.com/favicon_0_128x128.png" alt="60" width="40" height="40" style="display: inline-block; margin-bottom: 10px; border-radius: 10px;" />
        <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; color: rgba(255,255,255,0.7); margin-bottom: 6px;">60 Meeting Intelligence</div>
        <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #ffffff;">Email Configured Successfully</h1>
      </div>
      <div style="padding: 24px 20px;">
        <p style="font-size: 14px; color: #cbd5e1; line-height: 1.7; margin: 0 0 20px;">
          Your email is set up to receive meeting intelligence reports from 60. You'll get automated daily or weekly summaries with performance metrics, coaching tips, and deal highlights.
        </p>
        <div style="background: rgba(5,150,105,0.08); border: 1px solid rgba(5,150,105,0.2); border-radius: 10px; padding: 14px 16px; font-size: 13px; color: #34d399;">
          This is a test message. No action required.
        </div>
      </div>
      <div style="border-top: 1px solid #334155; padding: 14px 24px; text-align: center; font-size: 11px; color: #64748b;">
        <a href="https://app.use60.com" style="color: #34d399; text-decoration: none;">60 Meeting Intelligence</a>
      </div>
    </div>
  </div>
</body>
</html>`;
    const result = await sendEmail({
      to: emailAddress,
      subject: 'Test — 60 Meeting Intelligence Reports',
      html: testHtml,
      text: 'Your email is configured correctly for 60 Meeting Intelligence Reports. This is a test message — no action required.',
      from: 'app@use60.com',
      fromName: '60',
    });

    if (!result.success) {
      return successResponse({ success: false, error: result.error }, req);
    }
    return successResponse({ success: true }, req);
  } catch (err) {
    return successResponse({ success: false, error: err instanceof Error ? err.message : 'Unknown error' }, req);
  }
}
