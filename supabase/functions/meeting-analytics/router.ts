/**
 * Router: URL pattern matching and handler dispatch for meeting-analytics.
 */

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
import { successResponse, errorResponse, getApiPath, jsonResponse } from './helpers.ts';
import { checkRailwayConnection } from './db.ts';

export async function routeRequest(req: Request): Promise<Response> {
  const path = getApiPath(req.url);
  const pathParts = path.replace(/^\/+/, '').split('/').filter(Boolean);

  // Health check
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

  // --- Transcripts ---
  if (apiPath === 'transcripts' && req.method === 'GET') {
    return handleGetTranscripts(req);
  }
  if (apiPath.startsWith('transcripts/') && req.method === 'GET') {
    const id = apiPath.slice('transcripts/'.length).split('/')[0];
    return handleGetTranscript(id, req);
  }

  // --- Dashboard ---
  if (apiPath === 'dashboard/metrics' && req.method === 'GET') {
    return handleGetDashboardMetrics(req);
  }
  if (apiPath === 'dashboard/trends' && req.method === 'GET') {
    const metricsRes = await handleGetDashboardMetrics(req);
    const metricsJson = await metricsRes.json();
    return successResponse(metricsJson?.data?.trends ?? {}, req);
  }
  if (apiPath === 'dashboard/alerts' && req.method === 'GET') {
    const metricsRes = await handleGetDashboardMetrics(req);
    const metricsJson = await metricsRes.json();
    return successResponse(metricsJson?.data?.alerts ?? [], req);
  }
  if (apiPath === 'dashboard/top-performers' && req.method === 'GET') {
    const metricsRes = await handleGetDashboardMetrics(req);
    const metricsJson = await metricsRes.json();
    const topLimit = Math.min(parseInt(new URL(req.url).searchParams.get('limit') || '5'), 20);
    return successResponse((metricsJson?.data?.topPerformers ?? []).slice(0, topLimit), req);
  }
  if (apiPath === 'dashboard/pipeline-health' && req.method === 'GET') {
    const metricsRes = await handleGetDashboardMetrics(req);
    const metricsJson = await metricsRes.json();
    const phLimit = Math.min(parseInt(new URL(req.url).searchParams.get('limit') || '5'), 20);
    return successResponse((metricsJson?.data?.pipelineHealth ?? []).slice(0, phLimit), req);
  }

  // --- Insights ---
  if (apiPath === 'insights/sales-performance' && req.method === 'GET') {
    return handleGetSalesPerformance(req);
  }
  if (apiPath.startsWith('insights/') && req.method === 'GET') {
    const rest = apiPath.slice('insights/'.length);
    const [transcriptId, sub] = rest.split('/');
    if (sub === 'topics') return handleGetInsightSubResource(transcriptId, 'topics', req);
    if (sub === 'sentiment') return handleGetInsightSubResource(transcriptId, 'sentiment', req);
    if (sub === 'action-items') return handleGetInsightSubResource(transcriptId, 'action-items', req);
    if (sub === 'key-moments') return handleGetInsightSubResource(transcriptId, 'key-moments', req);
    if (sub === 'summary') return handleGetInsightSubResource(transcriptId, 'summary', req);
    if (sub === 'qa-pairs') return handleGetInsightSubResource(transcriptId, 'qa-pairs', req);
    if (!sub) return handleGetInsights(transcriptId, req);
  }

  // --- Search ---
  if (apiPath === 'search/ask' && req.method === 'POST') {
    return handleAsk(req);
  }
  if (apiPath === 'search' && req.method === 'POST') {
    return handleSearch(req);
  }
  if (apiPath === 'search/similar' && req.method === 'POST') {
    return handleSearchSimilar(req);
  }
  if (apiPath === 'search/multi' && req.method === 'POST') {
    return handleSearchMulti(req);
  }

  // --- Reports ---
  if (apiPath === 'reports/generate' && req.method === 'POST') {
    return handleGenerateReport(req);
  }
  if (apiPath === 'reports/preview' && req.method === 'GET') {
    return handlePreviewReport(req);
  }
  if (apiPath === 'reports/send' && req.method === 'POST') {
    return handleSendReport(req);
  }
  if (apiPath === 'reports/history' && req.method === 'GET') {
    return handleGetReportHistory(req);
  }
  if (apiPath.startsWith('reports/') && req.method === 'GET') {
    const rest = apiPath.slice('reports/'.length);
    // Only match single-segment IDs (not sub-routes like test/slack)
    if (rest && !rest.includes('/')) {
      return handleGetReport(rest, req);
    }
  }
  if (apiPath === 'reports/test/slack' && req.method === 'POST') {
    return handleTestSlack(req);
  }

  // --- Notification Settings ---
  if (apiPath === 'notifications/settings' && req.method === 'GET') {
    return handleGetNotificationSettings(req);
  }
  if (apiPath === 'notifications/settings' && req.method === 'POST') {
    return handleCreateNotificationSetting(req);
  }
  if (apiPath.startsWith('notifications/settings/') && req.method === 'PUT') {
    const id = apiPath.slice('notifications/settings/'.length);
    return handleUpdateNotificationSetting(id, req);
  }
  if (apiPath.startsWith('notifications/settings/') && req.method === 'DELETE') {
    const id = apiPath.slice('notifications/settings/'.length);
    return handleDeleteNotificationSetting(id, req);
  }

  // --- Sync (pg_net trigger) ---
  if (apiPath === 'sync/meeting' && req.method === 'POST') {
    return handleSyncMeeting(req);
  }

  // --- Analytics ---
  if (apiPath === 'analytics/talk-time' && req.method === 'GET') {
    return handleTalkTime(req);
  }
  if (apiPath === 'analytics/conversion' && req.method === 'GET') {
    return handleConversion(req);
  }
  if (apiPath === 'analytics/sentiment-trends' && req.method === 'GET') {
    return handleSentimentTrends(req);
  }

  return errorResponse(`Cannot ${req.method} ${path}`, 404, req);
}
