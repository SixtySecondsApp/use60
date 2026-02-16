/**
 * Meeting Analytics API Service
 *
 * Thin HTTP client wrapping the meeting-translation REST API on Railway.
 * All data stays on the Railway PostgreSQL database — no Supabase migration needed.
 */

import type {
  MaTranscript,
  MaTranscriptWithStats,
  MaDashboardMetrics,
  MaSearchResponse,
  MaTopic,
  MaSentimentAnalysis,
  MaActionItem,
  MaKeyMoment,
  MaSummary,
  MaQAPair,
  MaApiResponse,
  MaPaginatedResponse,
  MaTopPerformer,
  MaPipelineHealth,
  MaDashboardTrends,
  MaDashboardAlert,
  MaSalesPerformance,
  MaTranscriptInsights,
  MaSearchResult,
  MaReport,
  MaReportHistoryEntry,
  MaNotificationSetting,
  MaNotificationSettingInput,
  MaTalkTimeEntry,
  MaConversionEntry,
  MaSentimentTrends,
} from '@/lib/types/meetingAnalytics';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const EDGE_FUNCTION_URL = SUPABASE_URL ? `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/meeting-analytics` : '';
const BASE_URL =
  import.meta.env.VITE_MEETING_ANALYTICS_API_URL || EDGE_FUNCTION_URL || 'http://localhost:3000';

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (BASE_URL.includes('/functions/v1/') && import.meta.env.VITE_SUPABASE_ANON_KEY) {
    headers['Authorization'] = `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`;
    headers['apikey'] = import.meta.env.VITE_SUPABASE_ANON_KEY;
  }
  return headers;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { ...getHeaders(), ...(options?.headers as Record<string, string>) },
      ...options,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const hint =
      BASE_URL.includes('/functions/v1/') && msg === 'Failed to fetch'
        ? ' Ensure the meeting-analytics Edge Function is deployed and RAILWAY_DATABASE_URL is set. Or set VITE_MEETING_ANALYTICS_API_URL to your Railway API URL.'
        : msg === 'Failed to fetch'
          ? ' Check that the Meeting Analytics API is running (e.g. meeting-translation on port 3000) or set VITE_MEETING_ANALYTICS_API_URL.'
          : '';
    throw new Error(`Meeting Analytics request failed: ${msg}${hint}`);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `API error: ${res.status}`);
  }

  const json = await res.json();

  // The Railway API wraps data in { success, data } — unwrap it
  if (json.success === true && json.data !== undefined) {
    return json.data as T;
  }

  return json as T;
}

// =====================================================
// Transcripts
// =====================================================

export interface TranscriptListParams {
  limit?: number;
  offset?: number;
  orderBy?: string;
  order?: 'ASC' | 'DESC';
  includeDemo?: boolean;
  demoOnly?: boolean;
}

export async function getTranscripts(params: TranscriptListParams = {}) {
  const qs = new URLSearchParams();
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.offset) qs.set('offset', String(params.offset));
  if (params.orderBy) qs.set('orderBy', params.orderBy);
  if (params.order) qs.set('order', params.order);
  if (params.includeDemo !== undefined) qs.set('includeDemo', String(params.includeDemo));
  if (params.demoOnly !== undefined) qs.set('demoOnly', String(params.demoOnly));
  const query = qs.toString();
  return apiFetch<MaTranscript[]>(`/api/transcripts${query ? `?${query}` : ''}`);
}

export async function getTranscript(id: string) {
  return apiFetch<MaTranscriptWithStats>(`/api/transcripts/${id}`);
}

export async function deleteTranscript(id: string) {
  return apiFetch<void>(`/api/transcripts/${id}`, { method: 'DELETE' });
}

// =====================================================
// Dashboard
// =====================================================

export interface DashboardParams {
  includeDemo?: boolean;
  demoOnly?: boolean;
}

export async function getDashboardMetrics(params: DashboardParams = {}) {
  const qs = new URLSearchParams();
  if (params.includeDemo !== undefined) qs.set('includeDemo', String(params.includeDemo));
  if (params.demoOnly !== undefined) qs.set('demoOnly', String(params.demoOnly));
  const query = qs.toString();
  return apiFetch<MaDashboardMetrics>(`/api/dashboard/metrics${query ? `?${query}` : ''}`);
}

export async function getDashboardTrends(params: DashboardParams = {}) {
  const qs = new URLSearchParams();
  if (params.includeDemo !== undefined) qs.set('includeDemo', String(params.includeDemo));
  if (params.demoOnly !== undefined) qs.set('demoOnly', String(params.demoOnly));
  const query = qs.toString();
  return apiFetch<MaDashboardTrends>(`/api/dashboard/trends${query ? `?${query}` : ''}`);
}

export async function getDashboardAlerts(params: DashboardParams = {}) {
  const qs = new URLSearchParams();
  if (params.includeDemo !== undefined) qs.set('includeDemo', String(params.includeDemo));
  if (params.demoOnly !== undefined) qs.set('demoOnly', String(params.demoOnly));
  const query = qs.toString();
  return apiFetch<MaDashboardAlert[]>(`/api/dashboard/alerts${query ? `?${query}` : ''}`);
}

export async function getTopPerformers(params: DashboardParams & { limit?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.includeDemo !== undefined) qs.set('includeDemo', String(params.includeDemo));
  if (params.demoOnly !== undefined) qs.set('demoOnly', String(params.demoOnly));
  if (params.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return apiFetch<MaTopPerformer[]>(`/api/dashboard/top-performers${query ? `?${query}` : ''}`);
}

export async function getPipelineHealth(params: DashboardParams & { limit?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.includeDemo !== undefined) qs.set('includeDemo', String(params.includeDemo));
  if (params.demoOnly !== undefined) qs.set('demoOnly', String(params.demoOnly));
  if (params.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return apiFetch<MaPipelineHealth[]>(`/api/dashboard/pipeline-health${query ? `?${query}` : ''}`);
}

// =====================================================
// Search
// =====================================================

export interface SearchParams {
  query: string;
  transcriptId?: string;
  threshold?: number;
  limit?: number;
}

export async function search(params: SearchParams) {
  return apiFetch<MaSearchResponse>('/api/search', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function searchSimilar(segmentId: string, options?: { threshold?: number; limit?: number }) {
  return apiFetch<{ segmentId: string; similarSegments: MaSearchResult[]; count: number }>(
    '/api/search/similar',
    {
      method: 'POST',
      body: JSON.stringify({ segmentId, ...options }),
    }
  );
}

// =====================================================
// Insights (per-transcript)
// =====================================================

export async function getInsights(transcriptId: string) {
  return apiFetch<MaTranscriptInsights>(`/api/insights/${transcriptId}`);
}

export async function getTopics(transcriptId: string) {
  return apiFetch<MaTopic[]>(`/api/insights/${transcriptId}/topics`);
}

export async function getSentiment(transcriptId: string) {
  return apiFetch<{ overall: MaSentimentAnalysis | null }>(`/api/insights/${transcriptId}/sentiment`);
}

export async function getActionItems(transcriptId: string) {
  return apiFetch<MaActionItem[]>(`/api/insights/${transcriptId}/action-items`);
}

export async function getKeyMoments(transcriptId: string) {
  return apiFetch<MaKeyMoment[]>(`/api/insights/${transcriptId}/key-moments`);
}

export async function getSummary(transcriptId: string) {
  return apiFetch<MaSummary[]>(`/api/insights/${transcriptId}/summary`);
}

export async function getQAPairs(transcriptId: string) {
  return apiFetch<MaQAPair[]>(`/api/insights/${transcriptId}/qa-pairs`);
}

// =====================================================
// Sales Performance (cross-meeting)
// =====================================================

export async function getSalesPerformance(params: DashboardParams = {}) {
  const qs = new URLSearchParams();
  if (params.includeDemo !== undefined) qs.set('includeDemo', String(params.includeDemo));
  if (params.demoOnly !== undefined) qs.set('demoOnly', String(params.demoOnly));
  const query = qs.toString();
  return apiFetch<MaSalesPerformance[]>(`/api/insights/sales-performance${query ? `?${query}` : ''}`);
}

// =====================================================
// Reports
// =====================================================

export interface GenerateReportParams {
  type: 'daily' | 'weekly';
  includeDemo?: boolean;
  demoOnly?: boolean;
}

export async function generateReport(params: GenerateReportParams) {
  const qs = new URLSearchParams();
  qs.set('type', params.type);
  if (params.includeDemo !== undefined) qs.set('includeDemo', String(params.includeDemo));
  if (params.demoOnly !== undefined) qs.set('demoOnly', String(params.demoOnly));
  return apiFetch<MaReport>(`/api/reports/generate?${qs.toString()}`, { method: 'POST' });
}

export async function previewReport(params: GenerateReportParams & { format?: 'json' | 'slack' | 'email' }) {
  const qs = new URLSearchParams();
  qs.set('type', params.type);
  if (params.format) qs.set('format', params.format);
  if (params.includeDemo !== undefined) qs.set('includeDemo', String(params.includeDemo));
  if (params.demoOnly !== undefined) qs.set('demoOnly', String(params.demoOnly));
  return apiFetch<MaReport>(`/api/reports/preview?${qs.toString()}`);
}

export async function sendReport(params: { type: 'daily' | 'weekly'; settingId?: string }) {
  return apiFetch<{ results: Array<{ channel: string; success: boolean; error?: string }>; summary: { sent: number; failed: number; total: number } }>(
    '/api/reports/send',
    { method: 'POST', body: JSON.stringify(params) }
  );
}

export async function getReportHistory(limit?: number) {
  const qs = limit ? `?limit=${limit}` : '';
  return apiFetch<MaReportHistoryEntry[]>(`/api/reports/history${qs}`);
}

export async function getReport(id: string) {
  return apiFetch<MaReportHistoryEntry>(`/api/reports/${id}`);
}

export async function testSlackWebhook(webhookUrl: string) {
  return apiFetch<{ success: boolean; error?: string }>('/api/reports/test/slack', {
    method: 'POST',
    body: JSON.stringify({ webhookUrl }),
  });
}

// =====================================================
// Notification Settings
// =====================================================

export async function getNotificationSettings() {
  return apiFetch<MaNotificationSetting[]>('/api/notifications/settings');
}

export async function createNotificationSetting(data: MaNotificationSettingInput) {
  return apiFetch<MaNotificationSetting>('/api/notifications/settings', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateNotificationSetting(id: string, data: Partial<MaNotificationSettingInput>) {
  return apiFetch<MaNotificationSetting>(`/api/notifications/settings/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteNotificationSetting(id: string) {
  return apiFetch<{ deleted: boolean }>(`/api/notifications/settings/${id}`, {
    method: 'DELETE',
  });
}

// =====================================================
// Analytics
// =====================================================

export async function getTalkTimeAnalytics(params: DashboardParams & { limit?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.includeDemo !== undefined) qs.set('includeDemo', String(params.includeDemo));
  if (params.demoOnly !== undefined) qs.set('demoOnly', String(params.demoOnly));
  if (params.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return apiFetch<MaTalkTimeEntry[]>(`/api/analytics/talk-time${query ? `?${query}` : ''}`);
}

export async function getConversionAnalytics(params: DashboardParams & { limit?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.includeDemo !== undefined) qs.set('includeDemo', String(params.includeDemo));
  if (params.demoOnly !== undefined) qs.set('demoOnly', String(params.demoOnly));
  if (params.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return apiFetch<MaConversionEntry[]>(`/api/analytics/conversion${query ? `?${query}` : ''}`);
}

export async function getSentimentTrends(params: DashboardParams & { days?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.includeDemo !== undefined) qs.set('includeDemo', String(params.includeDemo));
  if (params.demoOnly !== undefined) qs.set('demoOnly', String(params.demoOnly));
  if (params.days) qs.set('days', String(params.days));
  const query = qs.toString();
  return apiFetch<MaSentimentTrends>(`/api/analytics/sentiment-trends${query ? `?${query}` : ''}`);
}

// =====================================================
// Multi-transcript Search
// =====================================================

export interface MultiSearchParams {
  query: string;
  transcriptIds: string[];
  threshold?: number;
  limitPerTranscript?: number;
}

export async function searchMulti(params: MultiSearchParams) {
  return apiFetch<{ query: string; resultsByTranscript: Record<string, MaSearchResult[]>; totalResults: number; searchTimeMs: number }>(
    '/api/search/multi',
    { method: 'POST', body: JSON.stringify(params) }
  );
}
