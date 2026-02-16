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
  const res = await fetch(url, {
    headers: { ...getHeaders(), ...(options?.headers as Record<string, string>) },
    ...options,
  });

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
