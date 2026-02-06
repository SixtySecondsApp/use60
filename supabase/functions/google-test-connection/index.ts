/**
 * Google Test Connection Edge Function
 * 
 * Provides a safe way to test Google integration by performing
 * lightweight API calls to verify tokens and scopes work correctly.
 * 
 * SECURITY:
 * - POST only
 * - User JWT authentication required (no service-role)
 * - Allowlist-based CORS
 * 
 * Tests:
 * - Google userinfo endpoint (basic connectivity)
 * - Gmail profile (if gmail scope present)
 * - Calendar list (if calendar scope present)
 * - Tasks list (if tasks scope present)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';
import { authenticateRequest } from '../_shared/edgeAuth.ts';

async function refreshAccessToken(refreshToken: string, supabase: any, userId: string): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID') || '';
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';
  
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Failed to refresh token: ${errorData.error_description || 'Unknown error'}`);
  }

  const data = await response.json();
  
  const expiresAt = new Date();
  expiresAt.setSeconds(expiresAt.getSeconds() + (data.expires_in || 3600));
  
  await supabase
    .from('google_integrations')
    .update({
      access_token: data.access_token,
      expires_at: expiresAt.toISOString(),
    })
    .eq('user_id', userId);
  
  return data.access_token;
}

interface ServiceTestResult {
  ok: boolean;
  message?: string;
  data?: any;
}

serve(async (req) => {
  // Diagnostic endpoints
  const url = new URL(req.url);

  // Ping endpoint - ?ping=1
  if (url.searchParams.get('ping') === '1') {
    return new Response(JSON.stringify({
      success: true,
      message: 'Function is reachable',
      timestamp: new Date().toISOString(),
      version: '46',
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // Debug mode - ?debug=1 returns detailed step info without trying full test
  const debugMode = url.searchParams.get('debug') === '1';

  // Track current step for error reporting
  let currentStep = 'init';

  try {
    console.log('[google-test-connection] === REQUEST START ===');
    console.log('[google-test-connection] Method:', req.method);
    console.log('[google-test-connection] URL:', req.url);

    // Safely log headers
    try {
      console.log('[google-test-connection] Headers:', JSON.stringify(Object.fromEntries(req.headers.entries())));
    } catch (headerError) {
      console.log('[google-test-connection] Could not stringify headers');
    }

    // Handle CORS preflight
    const preflightResponse = handleCorsPreflightRequest(req);
    if (preflightResponse) {
      console.log('[google-test-connection] Returning CORS preflight response');
      return preflightResponse;
    }

    // POST only
    if (req.method !== 'POST' && req.method !== 'OPTIONS') {
      console.log('[google-test-connection] Method not allowed:', req.method);
      return jsonResponse({
        error: 'Method not allowed. Use POST.',
        debugInfo: 'method-check',
        actualMethod: req.method,
        url: req.url,
      }, req, 405);
    }

    console.log('[google-test-connection] Method check passed, proceeding to auth');

    // Main logic block
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    console.log('[google-test-connection] Supabase URL:', supabaseUrl ? 'set' : 'NOT SET');
    console.log('[google-test-connection] Service key:', supabaseServiceKey ? 'set' : 'NOT SET');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[google-test-connection] Missing env vars');
      return jsonResponse({
        success: false,
        error: 'Server configuration error',
        debugInfo: 'missing-env',
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseServiceKey,
      }, req, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    currentStep = 'step-1-client-created';
    console.log('[google-test-connection] Step 1: Supabase client created');

    // Authenticate using shared helper (supports JWT fallback)
    let userId: string;
    let mode: string;
    try {
      currentStep = 'step-2-auth-start';
      console.log('[google-test-connection] Step 2: Starting authentication');
      const authResult = await authenticateRequest(req, supabase, supabaseServiceKey);
      userId = authResult.userId;
      mode = authResult.mode;
      currentStep = 'step-3-auth-success';
      console.log(`[google-test-connection] Step 3: Auth success: mode=${mode}, userId=${userId}`);
    } catch (authError: any) {
      console.error('[google-test-connection] Auth error at step:', currentStep);
      console.error('[google-test-connection] Auth error name:', authError.name);
      console.error('[google-test-connection] Auth error message:', authError.message);
      console.error('[google-test-connection] Auth error stack:', authError.stack);
      // Return 200 with error details so supabase.functions.invoke passes the data through
      return jsonResponse({
        success: false,
        error: authError.message || 'Authentication failed',
        debugInfo: 'auth-error',
        currentStep,
        authErrorName: authError.name,
        authErrorMessage: authError.message,
        authErrorStack: authError.stack?.substring(0, 500),
        connected: false,
        services: {
          userinfo: { ok: false, message: 'Auth failed' },
          gmail: { ok: false, message: 'Auth failed' },
          calendar: { ok: false, message: 'Auth failed' },
          tasks: { ok: false, message: 'Auth failed' },
        },
      }, req, 200);  // Return 200 so data is passed through
    }

    // Get user's Google integration
    currentStep = 'step-4-query-integration';
    console.log('[google-test-connection] Step 4: Fetching integration for user:', userId);
    let integration = null;
    let integrationError = null;
    try {
      const result = await supabase
        .from('google_integrations')
        .select('access_token, refresh_token, expires_at, email, scopes, is_active')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle();
      integration = result.data;
      integrationError = result.error;
      currentStep = 'step-5-query-complete';
      console.log('[google-test-connection] Step 5: Integration query completed, found:', !!integration);
    } catch (queryError: any) {
      console.error('[google-test-connection] Integration query THREW at step:', currentStep);
      console.error('[google-test-connection] Error:', queryError.message);
      return jsonResponse({
        success: false,
        error: 'Database query failed',
        debugInfo: 'integration-query-error',
        currentStep,
        queryError: queryError.message,
        connected: false,
        services: {
          userinfo: { ok: false, message: 'Query failed' },
          gmail: { ok: false, message: 'Query failed' },
          calendar: { ok: false, message: 'Query failed' },
          tasks: { ok: false, message: 'Query failed' },
        },
      }, req, 200);  // Return 200 so data is passed through
    }

    if (integrationError) {
      console.error('[google-test-connection] Integration query error:', integrationError);
    }

    if (integrationError || !integration) {
      return jsonResponse({
        success: false,
        connected: false,
        message: 'No Google integration found. Please connect your Google account.',
        debugInfo: 'no-integration',
        integrationError: integrationError?.message,
        integrationErrorCode: integrationError?.code,
        userId: userId,
        services: {
          userinfo: { ok: false, message: 'Not connected' },
          gmail: { ok: false, message: 'Not connected' },
          calendar: { ok: false, message: 'Not connected' },
          tasks: { ok: false, message: 'Not connected' },
        },
      }, req);
    }

    // Check if token needs refresh
    currentStep = 'step-6-check-token-expiry';
    console.log('[google-test-connection] Step 6: Checking token expiry...');
    let accessToken = integration.access_token;
    const expiresAt = new Date(integration.expires_at);
    const now = new Date();
    console.log('[google-test-connection] Token expires at:', expiresAt.toISOString(), 'now:', now.toISOString());

    if (expiresAt <= now) {
      currentStep = 'step-7-refresh-token';
      console.log('[google-test-connection] Step 7: Token expired, attempting refresh...');
      try {
        accessToken = await refreshAccessToken(integration.refresh_token, supabase, userId);
        console.log('[google-test-connection] Token refreshed successfully');
      } catch (refreshError: any) {
        console.error('[google-test-connection] Token refresh failed:', refreshError.message);
        return jsonResponse({
          success: false,
          connected: true,
          message: 'Token refresh failed. Please reconnect your Google account.',
          error: refreshError.message,
          debugInfo: 'token-refresh-failed',
          currentStep,
          services: {
            userinfo: { ok: false, message: 'Token expired' },
            gmail: { ok: false, message: 'Token expired' },
            calendar: { ok: false, message: 'Token expired' },
            tasks: { ok: false, message: 'Token expired' },
          },
        }, req);
      }
    } else {
      console.log('[google-test-connection] Token still valid');
    }

    // Parse scopes to determine which services to test
    console.log('[google-test-connection] Parsing scopes:', integration.scopes);
    const scopes = integration.scopes?.toLowerCase() || '';
    const hasGmailScope = scopes.includes('gmail') || scopes.includes('mail');
    const hasCalendarScope = scopes.includes('calendar');
    const hasTasksScope = scopes.includes('tasks');
    console.log('[google-test-connection] Scopes detected - Gmail:', hasGmailScope, 'Calendar:', hasCalendarScope, 'Tasks:', hasTasksScope);

    // Test results
    const results: {
      userinfo: ServiceTestResult;
      gmail: ServiceTestResult;
      calendar: ServiceTestResult;
      tasks: ServiceTestResult;
    } = {
      userinfo: { ok: false },
      gmail: { ok: false, message: hasGmailScope ? undefined : 'No Gmail scope' },
      calendar: { ok: false, message: hasCalendarScope ? undefined : 'No Calendar scope' },
      tasks: { ok: false, message: hasTasksScope ? undefined : 'No Tasks scope' },
    };

    // Test 1: Google userinfo (always test this)
    currentStep = 'step-8-test-userinfo';
    console.log('[google-test-connection] Step 8: Testing Google userinfo API...');
    try {
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });

      if (userInfoResponse.ok) {
        const userInfo = await userInfoResponse.json();
        results.userinfo = {
          ok: true,
          message: 'Connected',
          data: {
            email: userInfo.email,
            name: userInfo.name,
            picture: userInfo.picture,
          },
        };
      } else {
        const error = await userInfoResponse.json().catch(() => ({}));
        results.userinfo = {
          ok: false,
          message: error.error?.message || `HTTP ${userInfoResponse.status}`,
        };
      }
    } catch (error: any) {
      results.userinfo = {
        ok: false,
        message: error.message || 'Connection failed',
      };
    }

    // Test 2: Gmail profile (if scope present)
    currentStep = 'step-9-test-gmail';
    if (hasGmailScope) {
      console.log('[google-test-connection] Step 9: Testing Gmail API...');
      try {
        const gmailResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });

        if (gmailResponse.ok) {
          const profile = await gmailResponse.json();
          results.gmail = {
            ok: true,
            message: 'Connected',
            data: {
              emailAddress: profile.emailAddress,
              messagesTotal: profile.messagesTotal,
              threadsTotal: profile.threadsTotal,
            },
          };
        } else {
          const error = await gmailResponse.json().catch(() => ({}));
          results.gmail = {
            ok: false,
            message: error.error?.message || `HTTP ${gmailResponse.status}`,
          };
        }
      } catch (error: any) {
        results.gmail = {
          ok: false,
          message: error.message || 'Connection failed',
        };
      }
    }

    // Test 3: Calendar list (if scope present)
    currentStep = 'step-10-test-calendar';
    if (hasCalendarScope) {
      console.log('[google-test-connection] Step 10: Testing Calendar API...');
      try {
        const calendarResponse = await fetch(
          'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1',
          {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          }
        );

        if (calendarResponse.ok) {
          const calendars = await calendarResponse.json();
          results.calendar = {
            ok: true,
            message: 'Connected',
            data: {
              calendarCount: calendars.items?.length || 0,
              primaryCalendar: calendars.items?.find((c: any) => c.primary)?.summary || 'Unknown',
            },
          };
        } else {
          const error = await calendarResponse.json().catch(() => ({}));
          results.calendar = {
            ok: false,
            message: error.error?.message || `HTTP ${calendarResponse.status}`,
          };
        }
      } catch (error: any) {
        results.calendar = {
          ok: false,
          message: error.message || 'Connection failed',
        };
      }
    }

    // Test 4: Tasks list (if scope present)
    currentStep = 'step-11-test-tasks';
    if (hasTasksScope) {
      console.log('[google-test-connection] Step 11: Testing Tasks API...');
      try {
        const tasksResponse = await fetch(
          'https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=1',
          {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          }
        );

        if (tasksResponse.ok) {
          const taskLists = await tasksResponse.json();
          results.tasks = {
            ok: true,
            message: 'Connected',
            data: {
              taskListCount: taskLists.items?.length || 0,
            },
          };
        } else {
          const error = await tasksResponse.json().catch(() => ({}));
          results.tasks = {
            ok: false,
            message: error.error?.message || `HTTP ${tasksResponse.status}`,
          };
        }
      } catch (error: any) {
        results.tasks = {
          ok: false,
          message: error.message || 'Connection failed',
        };
      }
    }

    // Determine overall success
    currentStep = 'step-12-calculate-results';
    console.log('[google-test-connection] Step 12: Calculating overall results...');
    const allOk = results.userinfo.ok &&
      (!hasGmailScope || results.gmail.ok) &&
      (!hasCalendarScope || results.calendar.ok) &&
      (!hasTasksScope || results.tasks.ok);

    // Log the test (non-critical, wrapped in try/catch)
    currentStep = 'step-13-log-results';
    console.log('[google-test-connection] Step 13: Logging results...');
    try {
      await supabase
        .from('google_service_logs')
        .insert({
          integration_id: null,
          service: 'test-connection',
          action: 'test',
          status: allOk ? 'success' : 'partial',
          request_data: { userId: userId },
          response_data: results,
        });
    } catch (logError) {
      // Non-critical - continue even if logging fails
      console.warn('[google-test-connection] Failed to log results:', logError);
    }

    currentStep = 'step-14-return-success';
    console.log('[google-test-connection] Step 14: Returning success response');
    return jsonResponse({
      success: true,
      connected: true,
      email: integration.email,
      scopes: integration.scopes,
      allServicesOk: allOk,
      services: results,
      testedAt: new Date().toISOString(),
    }, req);

  } catch (error: unknown) {
    // Handle any type of thrown value (Error object, string, or other)
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorName = error instanceof Error ? error.name : typeof error;
    const errorStack = error instanceof Error ? error.stack?.substring(0, 500) : undefined;
    const errorCode = (error as any)?.code;

    console.error('[google-test-connection] OUTER CATCH at step:', currentStep);
    console.error('[google-test-connection] OUTER CATCH - Message:', errorMessage);
    console.error('[google-test-connection] OUTER CATCH - Name:', errorName);
    console.error('[google-test-connection] OUTER CATCH - Stack:', errorStack);
    console.error('[google-test-connection] OUTER CATCH - Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error || {}), 2));

    // Try to return a proper JSON response with error details
    // Return 200 so supabase.functions.invoke passes the data through
    try {
      return jsonResponse({
        success: false,
        error: errorMessage || 'Test connection failed',
        errorName: errorName,
        errorCode: errorCode,
        errorStack: errorStack,
        currentStep: currentStep,
        debugInfo: 'outer-catch-block',
        connected: false,
        services: {
          userinfo: { ok: false, message: 'Error occurred' },
          gmail: { ok: false, message: 'Error occurred' },
          calendar: { ok: false, message: 'Error occurred' },
          tasks: { ok: false, message: 'Error occurred' },
        },
      }, req, 200);  // Return 200 so data is passed through
    } catch (jsonError) {
      // If even jsonResponse fails, return a minimal response
      console.error('[google-test-connection] jsonResponse failed:', jsonError);
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Content-Type': 'application/json',
      };
      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage || 'Unknown error',
          debugInfo: 'fallback-response',
          connected: false,
          services: {
            userinfo: { ok: false, message: 'Error' },
            gmail: { ok: false, message: 'Error' },
            calendar: { ok: false, message: 'Error' },
            tasks: { ok: false, message: 'Error' },
          },
        }),
        { status: 200, headers: corsHeaders }  // Return 200 so data is passed through
      );
    }
  }
});

