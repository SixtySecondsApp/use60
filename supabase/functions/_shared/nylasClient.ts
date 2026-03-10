// supabase/functions/_shared/nylasClient.ts
// Shared Nylas API v3 client for calendar operations

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

const NYLAS_API_URI = 'https://api.us.nylas.com';

interface NylasError {
  type: string;
  message: string;
  statusCode: number;
}

interface NylasIntegration {
  grantId: string;
  email: string;
  isActive: boolean;
}

/**
 * Get Nylas API key from environment
 */
function getNylasApiKey(): string {
  const key = Deno.env.get('NYLAS_API_KEY');
  if (!key) {
    throw new Error('NYLAS_API_KEY not configured');
  }
  return key;
}

/**
 * Get Nylas client ID from environment
 */
export function getNylasClientId(): string {
  const id = Deno.env.get('NYLAS_CLIENT_ID');
  if (!id) {
    throw new Error('NYLAS_CLIENT_ID not configured');
  }
  return id;
}

/**
 * Make an authenticated request to the Nylas API v3
 */
export async function nylasRequest(
  grantId: string,
  path: string,
  options: {
    method?: string;
    body?: Record<string, unknown>;
    params?: Record<string, string>;
  } = {}
): Promise<Response> {
  const apiKey = getNylasApiKey();
  const { method = 'GET', body, params } = options;

  const url = new URL(`/v3/grants/${encodeURIComponent(grantId)}${path}`, NYLAS_API_URI);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${apiKey}`,
    'Accept': 'application/json',
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const nylasError: NylasError = {
      type: errorBody.type || 'api_error',
      message: errorBody.message || `Nylas API error: ${response.status}`,
      statusCode: response.status,
    };

    if (response.status === 401) {
      nylasError.type = 'authentication_error';
      nylasError.message = 'Nylas authentication failed — grant may be revoked';
    }

    throw nylasError;
  }

  return response;
}

/**
 * Get the active Nylas integration for a user
 */
export async function getNylasIntegration(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<NylasIntegration | null> {
  const { data, error } = await supabase
    .from('nylas_integrations')
    .select('id, grant_id, email, is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    grantId: data.grant_id,
    email: data.email,
    isActive: data.is_active,
  };
}

/**
 * Maps a Nylas v3 calendar event to the calendar_events table shape
 * so the sync pipeline works identically regardless of provider.
 */
export function mapNylasEventToCalendarEvent(
  ev: Record<string, unknown>,
  userId: string,
  calendarRecordId: string,
  orgId: string | null,
): Record<string, unknown> {
  if (!ev) return {};

  const when = ev.when as Record<string, unknown> | undefined;
  const startTime = when?.start_time
    ? new Date((when.start_time as number) * 1000).toISOString()
    : when?.start_date as string || new Date().toISOString();
  const endTime = when?.end_time
    ? new Date((when.end_time as number) * 1000).toISOString()
    : when?.end_date as string || startTime;
  const allDay = when?.object === 'date';

  const participants = (ev.participants as Array<{ email: string; name?: string; status?: string }>) || [];
  const organizer = ev.organizer as { email?: string; name?: string } | undefined;
  const creator = ev.creator as { email?: string; name?: string } | undefined;

  // Extract meeting URL from conferencing data
  const conferencing = ev.conferencing as { details?: { url?: string }; provider?: string } | undefined;
  const meetingUrl = conferencing?.details?.url || null;
  const meetingProvider = conferencing?.provider
    ? inferMeetingProvider(conferencing.provider)
    : null;

  const now = new Date().toISOString();
  const isCancelled = ev.status === 'cancelled';

  const payload: Record<string, unknown> = {
    user_id: userId,
    calendar_id: calendarRecordId,
    external_id: ev.id,
    title: ev.title || '(No title)',
    description: ev.description || null,
    location: ev.location || null,
    start_time: startTime,
    end_time: endTime,
    all_day: allDay,
    status: (ev.status as string) || 'confirmed',
    meeting_url: meetingUrl,
    meeting_provider: meetingProvider,
    attendees_count: participants.length,
    attendees: participants.map((p) => ({
      email: p.email,
      displayName: p.name || null,
      responseStatus: mapNylasStatus(p.status),
    })),
    creator_email: creator?.email || null,
    organizer_email: organizer?.email || null,
    html_link: (ev.html_link as string) || null,
    hangout_link: null,
    etag: null,
    external_updated_at: ev.updated_at
      ? new Date((ev.updated_at as number) * 1000).toISOString()
      : null,
    sync_status: isCancelled ? 'deleted' : 'synced',
    synced_at: now,
    raw_data: ev,
  };

  if (orgId) {
    payload.org_id = orgId;
  }

  return payload;
}

function mapNylasStatus(status?: string): string {
  switch (status) {
    case 'yes': return 'accepted';
    case 'no': return 'declined';
    case 'maybe': return 'tentative';
    default: return 'needsAction';
  }
}

function inferMeetingProvider(provider: string): string {
  const lower = provider.toLowerCase();
  if (lower.includes('zoom')) return 'zoom';
  if (lower.includes('meet') || lower.includes('google')) return 'google_meet';
  if (lower.includes('teams') || lower.includes('microsoft')) return 'microsoft_teams';
  if (lower.includes('webex')) return 'webex';
  return 'other';
}
