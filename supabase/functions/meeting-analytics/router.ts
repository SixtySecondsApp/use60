/**
 * Router: URL pattern matching and handler dispatch for meeting-analytics.
 * All routes except sync/meeting and health require authenticated user with org_id.
 */

import { extractAuthContext } from './auth.ts';
import { handleGetTranscripts, handleGetTranscript } from './handlers/transcripts.ts';
import { handleGetDashboardMetrics, handleGetSalesPerformance } from './handlers/dashboard.ts';
import { handleGetInsights, handleGetInsightSubResource } from './handlers/insights.ts';
import { handleSearch, handleSearchSimilar, handleSearchMulti } from './handlers/search.ts';
import { handleAsk } from './handlers/ask.ts';
import { handleSyncMeeting } from './handlers/sync.ts';
import {
  handleGenerateReport,
  handlePreviewReport,
  handleSendReport,
  handleGetReportHistory,
  handleGetReport,
  handleTestSlack,
} from './handlers/reports.ts';
import {
  handleGetNotificationSettings,
  handleCreateNotificationSetting,
  handleUpdateNotificationSetting,
  handleDeleteNotificationSetting,
} from './handlers/notifications.ts';
import {
  handleTalkTime,
  handleConversion,
  handleSentimentTrends,
} from './handlers/analytics.ts';
import { handleBackfillOrgIds } from './handlers/backfillOrgIds.ts';
import { successResponse, errorResponse, getApiPath, jsonResponse } from './helpers.ts';
import { checkRailwayConnection } from './db.ts';

export async function routeRequest(req: Request): Promise<Response> {
  const path = getApiPath(req.url);
  const pathParts = path.replace(/^\/+/, '').split('/').filter(Boolean);

  // Health check (no auth)
  if (pathParts[0] === 'health' || path === '/health') {
    const dbOk = await checkRailwayConnection();
    return jsonResponse(
      { status: dbOk ? 'healthy' : 'degraded', database: dbOk ? 'connected' : 'disconnected', timestamp: new Date().toISOString() },
      200,
      req
    );
  }

  if (pathParts[0] !== 'api') {
    return errorResponse(`Cannot ${req.method} ${path}`, 404, req);
  }

  const apiPath = pathParts.slice(1).join('/');

  // Sync route: server-to-server (service_role), no org_id required
  if (apiPath === 'sync/meeting' && req.method === 'POST') {
    return handleSyncMeeting(req);
  }

  // Admin backfill: CRON_SECRET or service_role, no org_id required
  if (apiPath === 'admin/backfill-org-ids' && req.method === 'POST') {
    return handleBackfillOrgIds(req);
  }

  // All other routes require user auth with org_id (service_role has no orgId)
  const auth = await extractAuthContext(req);
  if (!auth || !auth.orgId) {
    return errorResponse('Authentication required', 401, req);
  }
  const orgId = auth.orgId;

  // --- Transcripts ---
  if (apiPath === 'transcripts' && req.method === 'GET') {
    return handleGetTranscripts(req, orgId);
  }
  if (apiPath.startsWith('transcripts/') && req.method === 'GET') {
    const id = apiPath.slice('transcripts/'.length).split('/')[0];
    return handleGetTranscript(id, req, orgId);
  }

  // --- Dashboard ---
  if (apiPath === 'dashboard/metrics' && req.method === 'GET') {
    return handleGetDashboardMetrics(req, orgId);
  }
  if (apiPath === 'dashboard/trends' && req.method === 'GET') {
    const metricsRes = await handleGetDashboardMetrics(req, orgId);
    const metricsJson = await metricsRes.json();
    return successResponse(metricsJson?.data?.trends ?? {}, req);
  }
  if (apiPath === 'dashboard/alerts' && req.method === 'GET') {
    const metricsRes = await handleGetDashboardMetrics(req, orgId);
    const metricsJson = await metricsRes.json();
    return successResponse(metricsJson?.data?.alerts ?? [], req);
  }
  if (apiPath === 'dashboard/top-performers' && req.method === 'GET') {
    const metricsRes = await handleGetDashboardMetrics(req, orgId);
    const metricsJson = await metricsRes.json();
    const topLimit = Math.min(parseInt(new URL(req.url).searchParams.get('limit') || '5'), 20);
    return successResponse((metricsJson?.data?.topPerformers ?? []).slice(0, topLimit), req);
  }
  if (apiPath === 'dashboard/pipeline-health' && req.method === 'GET') {
    const metricsRes = await handleGetDashboardMetrics(req, orgId);
    const metricsJson = await metricsRes.json();
    const phLimit = Math.min(parseInt(new URL(req.url).searchParams.get('limit') || '5'), 20);
    return successResponse((metricsJson?.data?.pipelineHealth ?? []).slice(0, phLimit), req);
  }

  // --- Insights ---
  if (apiPath === 'insights/sales-performance' && req.method === 'GET') {
    return handleGetSalesPerformance(req, orgId);
  }
  if (apiPath.startsWith('insights/') && req.method === 'GET') {
    const rest = apiPath.slice('insights/'.length);
    const [transcriptId, sub] = rest.split('/');
    if (sub === 'topics') return handleGetInsightSubResource(transcriptId, 'topics', req, orgId);
    if (sub === 'sentiment') return handleGetInsightSubResource(transcriptId, 'sentiment', req, orgId);
    if (sub === 'action-items') return handleGetInsightSubResource(transcriptId, 'action-items', req, orgId);
    if (sub === 'key-moments') return handleGetInsightSubResource(transcriptId, 'key-moments', req, orgId);
    if (sub === 'summary') return handleGetInsightSubResource(transcriptId, 'summary', req, orgId);
    if (sub === 'qa-pairs') return handleGetInsightSubResource(transcriptId, 'qa-pairs', req, orgId);
    if (!sub) return handleGetInsights(transcriptId, req, orgId);
  }

  // --- Search ---
  if (apiPath === 'search/ask' && req.method === 'POST') {
    return handleAsk(req, orgId);
  }
  if (apiPath === 'search' && req.method === 'POST') {
    return handleSearch(req, orgId);
  }
  if (apiPath === 'search/similar' && req.method === 'POST') {
    return handleSearchSimilar(req, orgId);
  }
  if (apiPath === 'search/multi' && req.method === 'POST') {
    return handleSearchMulti(req, orgId);
  }

  // --- Reports ---
  if (apiPath === 'reports/generate' && req.method === 'POST') {
    return handleGenerateReport(req, orgId);
  }
  if (apiPath === 'reports/preview' && req.method === 'GET') {
    return handlePreviewReport(req, orgId);
  }
  if (apiPath === 'reports/send' && req.method === 'POST') {
    return handleSendReport(req, orgId);
  }
  if (apiPath === 'reports/history' && req.method === 'GET') {
    return handleGetReportHistory(req, orgId);
  }
  if (apiPath.startsWith('reports/') && req.method === 'GET') {
    const rest = apiPath.slice('reports/'.length);
    if (rest && !rest.includes('/')) {
      return handleGetReport(rest, req, orgId);
    }
  }
  if (apiPath === 'reports/test/slack' && req.method === 'POST') {
    return handleTestSlack(req, orgId);
  }

  // --- Notification Settings ---
  if (apiPath === 'notifications/settings' && req.method === 'GET') {
    return handleGetNotificationSettings(req, orgId);
  }
  if (apiPath === 'notifications/settings' && req.method === 'POST') {
    return handleCreateNotificationSetting(req, orgId);
  }
  if (apiPath.startsWith('notifications/settings/') && req.method === 'PUT') {
    const id = apiPath.slice('notifications/settings/'.length);
    return handleUpdateNotificationSetting(id, req, orgId);
  }
  if (apiPath.startsWith('notifications/settings/') && req.method === 'DELETE') {
    const id = apiPath.slice('notifications/settings/'.length);
    return handleDeleteNotificationSetting(id, req, orgId);
  }

  // --- Analytics ---
  if (apiPath === 'analytics/talk-time' && req.method === 'GET') {
    return handleTalkTime(req, orgId);
  }
  if (apiPath === 'analytics/conversion' && req.method === 'GET') {
    return handleConversion(req, orgId);
  }
  if (apiPath === 'analytics/sentiment-trends' && req.method === 'GET') {
    return handleSentimentTrends(req, orgId);
  }

  return errorResponse(`Cannot ${req.method} ${path}`, 404, req);
}
