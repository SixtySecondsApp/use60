// verify_jwt = false — public endpoint for landing page form submissions
/**
 * Handle Landing Form Submission Edge Function
 *
 * Accepts form submissions from published landing pages and stores them
 * in landing_form_submissions. Public endpoint (no JWT required).
 *
 * Includes simple IP-based rate limiting (10 submissions per minute per page per IP).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    // Parse request body
    let body: { page_id?: string; form_data?: Record<string, string>; source_url?: string };
    try {
      body = await req.json();
    } catch {
      return errorResponse('Invalid JSON body', req, 400);
    }

    const { page_id, form_data, source_url } = body;

    // Validate required fields
    if (!page_id || typeof page_id !== 'string') {
      return errorResponse('page_id is required and must be a string', req, 400);
    }

    if (!form_data || typeof form_data !== 'object' || Array.isArray(form_data)) {
      return errorResponse('form_data is required and must be an object', req, 400);
    }

    // Extract client metadata from request headers
    const ipAddress =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';
    const userAgent = req.headers.get('user-agent') || null;

    // Create service-role client for DB operations
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Validate page_id exists and is published
    const { data: page, error: pageError } = await supabase
      .from('published_landing_pages')
      .select('id, org_id, status')
      .eq('id', page_id)
      .maybeSingle();

    if (pageError) {
      console.error('[handle-landing-form-submission] Page lookup error:', pageError.message);
      return errorResponse('Internal server error', req, 500);
    }

    if (!page) {
      return errorResponse('Page not found', req, 404);
    }

    if (page.status !== 'published') {
      return errorResponse('Page is not accepting submissions', req, 400);
    }

    // Rate limiting: max 10 submissions from same IP per page per minute
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();

    const { count: recentCount, error: countError } = await supabase
      .from('landing_form_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('page_id', page_id)
      .eq('ip_address', ipAddress)
      .gte('submitted_at', oneMinuteAgo);

    if (countError) {
      console.error('[handle-landing-form-submission] Rate limit check error:', countError.message);
      // Don't block submissions on rate limit check failure — fail open
    } else if ((recentCount ?? 0) >= 10) {
      console.warn(`[handle-landing-form-submission] Rate limited IP ${ipAddress} for page ${page_id}`);
      return new Response(
        JSON.stringify({ error: 'Too many submissions. Please try again later.' }),
        {
          status: 429,
          headers: {
            ...getCorsHeaders(req),
            'Content-Type': 'application/json',
            'Retry-After': '60',
          },
        },
      );
    }

    // Insert the form submission
    const { error: insertError } = await supabase
      .from('landing_form_submissions')
      .insert({
        page_id: page.id,
        org_id: page.org_id,
        form_data,
        source_url: source_url || null,
        ip_address: ipAddress,
        user_agent: userAgent,
      });

    if (insertError) {
      console.error('[handle-landing-form-submission] Insert error:', insertError.message);
      return errorResponse('Failed to save submission', req, 500);
    }

    console.log(`[handle-landing-form-submission] Saved submission for page ${page_id} from ${ipAddress}`);

    return jsonResponse({ success: true }, req);
  } catch (error) {
    console.error('[handle-landing-form-submission] Fatal error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      req,
      500,
    );
  }
});
