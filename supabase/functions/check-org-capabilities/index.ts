/**
 * check-org-capabilities
 *
 * Edge function to check which capabilities are available for an organization.
 * Returns capability status for CRM, Calendar, Email, Meetings, and Messaging.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';

type Capability = 'crm' | 'calendar' | 'email' | 'meetings' | 'messaging' | 'tasks';

interface CapabilityStatus {
  capability: Capability;
  available: boolean;
  provider?: string;
  features?: string[];
}

serve(async (req) => {
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return errorResponse('No authorization header', req, 401);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verify user token
    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return errorResponse('Invalid authentication token', req, 401);
    }

    const body = await req.json();
    const organizationId = String(body.organization_id || '').trim();

    if (!organizationId) {
      return errorResponse('organization_id is required', req, 400);
    }

    // Verify user is member of org
    const { data: membership, error: membershipError } = await supabase
      .from('organization_memberships')
      .select('role')
      .eq('org_id', organizationId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError || !membership) {
      return errorResponse('Access denied to this organization', req, 403);
    }

    // Check capabilities
    const capabilities: CapabilityStatus[] = [];

    // CRM capability
    const { data: hubspotData } = await supabase
      .from('hubspot_org_integrations')
      .select('is_connected')
      .eq('org_id', organizationId)
      .eq('is_connected', true)
      .maybeSingle();
    const hasHubSpot = !!hubspotData;
    capabilities.push({
      capability: 'crm',
      available: true, // DB adapter always available
      provider: hasHubSpot ? 'hubspot' : 'db',
      features: hasHubSpot ? ['contacts', 'deals', 'companies'] : ['contacts', 'deals'],
    });

    // Calendar capability - check Google Calendar direct integration first
    const { data: googleData } = await supabase
      .from('google_integrations')
      .select('scopes')
      .eq('org_id', organizationId)
      .eq('is_active', true)
      .maybeSingle();
    const hasGoogleCalendar = !!(
      googleData?.scopes &&
      Array.isArray(googleData.scopes) &&
      googleData.scopes.some((s: string) =>
        s.includes('calendar') || s.includes('https://www.googleapis.com/auth/calendar')
      )
    );

    // Check MeetingBaaS calendars (provides calendar read access for bot deployment)
    const { data: meetingBaaSData } = await supabase
      .from('meetingbaas_calendars')
      .select('id, platform')
      .eq('org_id', organizationId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    const hasMeetingBaaS = !!meetingBaaSData;
    const meetingBaaSPlatform = meetingBaaSData?.platform as string | undefined;

    // Calendar: prefer direct Google integration, fall back to MeetingBaaS
    const hasCalendar = hasGoogleCalendar || hasMeetingBaaS;
    let calendarProvider: string | undefined;
    let calendarFeatures: string[] = [];

    if (hasGoogleCalendar) {
      calendarProvider = 'google';
      calendarFeatures = ['events', 'attendees', 'availability'];
    } else if (hasMeetingBaaS) {
      calendarProvider = meetingBaaSPlatform === 'microsoft' ? 'microsoft' : 'google';
      calendarFeatures = ['events']; // Limited features via MeetingBaaS
    }

    capabilities.push({
      capability: 'calendar',
      available: hasCalendar,
      provider: calendarProvider,
      features: calendarFeatures,
    });

    // Email capability
    const hasGmail = !!(
      googleData?.scopes &&
      Array.isArray(googleData.scopes) &&
      googleData.scopes.some((s: string) =>
        s.includes('gmail') || s.includes('https://www.googleapis.com/auth/gmail')
      )
    );
    capabilities.push({
      capability: 'email',
      available: hasGmail || true, // DB may have stored emails
      provider: hasGmail ? 'google' : 'db',
      features: hasGmail ? ['search', 'draft', 'send'] : ['search'],
    });

    // Meetings capability (records: transcripts, recordings, summaries)
    const { data: fathomData } = await supabase
      .from('fathom_integrations')
      .select('is_connected')
      .eq('org_id', organizationId)
      .eq('is_connected', true)
      .maybeSingle();
    const hasFathom = !!fathomData;
    capabilities.push({
      capability: 'meetings',
      available: hasFathom || hasMeetingBaaS,
      provider: hasFathom ? 'fathom' : hasMeetingBaaS ? 'meetingbaas' : undefined,
      features: hasFathom || hasMeetingBaaS ? ['transcripts', 'recordings', 'summaries'] : [],
    });

    // Messaging capability (Slack)
    const { data: slackData } = await supabase
      .from('slack_org_settings')
      .select('is_connected')
      .eq('org_id', organizationId)
      .eq('is_connected', true)
      .maybeSingle();
    const hasSlack = !!slackData;
    capabilities.push({
      capability: 'messaging',
      available: hasSlack,
      provider: hasSlack ? 'slack' : undefined,
      features: hasSlack ? ['channels', 'messages', 'notifications'] : [],
    });

    // Tasks capability - always available via platform
    capabilities.push({
      capability: 'tasks',
      available: true, // Tasks are stored in the platform
      provider: 'sixty',
      features: ['create', 'update', 'list', 'complete'],
    });

    return jsonResponse({ success: true, capabilities }, req);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[check-org-capabilities] Error:', message);
    return errorResponse(message, req, 500);
  }
});
