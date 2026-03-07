/**
 * Microsoft Test Connection Edge Function
 *
 * Verifies the Microsoft integration is working by testing
 * lightweight API calls against Microsoft Graph.
 *
 * SECURITY:
 * - POST only
 * - User JWT authentication required
 * - Allowlist-based CORS
 *
 * Tests:
 * - /v1.0/me (profile: displayName, mail)
 * - /v1.0/me/messages (mail access)
 * - /v1.0/me/calendars (calendar access)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';
import { authenticateRequest } from '../_shared/edgeAuth.ts';
import { getMicrosoftIntegration, MicrosoftTokenRevokedError } from '../_shared/microsoftOAuth.ts';

interface ServiceTestResult {
  ok: boolean;
  displayName?: string;
  email?: string;
  latestSubject?: string;
  calendarName?: string;
  message?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !supabaseServiceKey) {
      return errorResponse('Server configuration error', req, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Authenticate user
    const { userId } = await authenticateRequest(req, supabase, supabaseServiceKey);

    // Get Microsoft integration with valid access token
    let msResult;
    try {
      msResult = await getMicrosoftIntegration(supabase, userId);
    } catch (error) {
      if (error instanceof MicrosoftTokenRevokedError) {
        return jsonResponse(
          {
            success: false,
            message: 'Microsoft token revoked. Please reconnect your Microsoft account.',
            services: {
              profile: { ok: false, message: 'Token revoked' },
              mail: { ok: false, message: 'Token revoked' },
              calendar: { ok: false, message: 'Token revoked' },
            },
          },
          req
        );
      }
      throw error;
    }

    if (!msResult) {
      return jsonResponse(
        {
          success: false,
          message: 'No active Microsoft integration found. Please connect your Microsoft account.',
          services: {
            profile: { ok: false, message: 'Not connected' },
            mail: { ok: false, message: 'Not connected' },
            calendar: { ok: false, message: 'Not connected' },
          },
        },
        req
      );
    }

    const { accessToken } = msResult;
    const headers = { Authorization: `Bearer ${accessToken}` };

    // Test profile, mail, and calendar in parallel
    const [profileResult, mailResult, calendarResult] = await Promise.all([
      testProfile(headers),
      testMail(headers),
      testCalendar(headers),
    ]);

    const allOk = profileResult.ok && mailResult.ok && calendarResult.ok;

    return jsonResponse(
      {
        success: allOk,
        services: {
          profile: profileResult,
          mail: mailResult,
          calendar: calendarResult,
        },
      },
      req
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[microsoft-test-connection] Error:', message);
    return errorResponse(message, req, 500);
  }
});

async function testProfile(headers: Record<string, string>): Promise<ServiceTestResult> {
  try {
    const response = await fetch('https://graph.microsoft.com/v1.0/me?$select=displayName,mail', {
      headers,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { ok: false, message: err.error?.message || `HTTP ${response.status}` };
    }

    const data = await response.json();
    return { ok: true, displayName: data.displayName, email: data.mail };
  } catch (error: unknown) {
    return { ok: false, message: error instanceof Error ? error.message : 'Connection failed' };
  }
}

async function testMail(headers: Record<string, string>): Promise<ServiceTestResult> {
  try {
    const response = await fetch(
      'https://graph.microsoft.com/v1.0/me/messages?$top=1&$select=subject,receivedDateTime',
      { headers }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { ok: false, message: err.error?.message || `HTTP ${response.status}` };
    }

    const data = await response.json();
    const latestSubject = data.value?.[0]?.subject || null;
    return { ok: true, latestSubject };
  } catch (error: unknown) {
    return { ok: false, message: error instanceof Error ? error.message : 'Connection failed' };
  }
}

async function testCalendar(headers: Record<string, string>): Promise<ServiceTestResult> {
  try {
    const response = await fetch(
      'https://graph.microsoft.com/v1.0/me/calendars?$top=1&$select=name',
      { headers }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { ok: false, message: err.error?.message || `HTTP ${response.status}` };
    }

    const data = await response.json();
    const calendarName = data.value?.[0]?.name || null;
    return { ok: true, calendarName };
  } catch (error: unknown) {
    return { ok: false, message: error instanceof Error ? error.message : 'Connection failed' };
  }
}
