// supabase/functions/visitor-track/index.ts
// Receives visitor events from the JS snippet, stores in website_visitors,
// triggers async IP resolution + contact enrichment.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';
import { extractClientIP, resolveIPToCompany } from '../_shared/ipResolution.ts';

// Simple in-memory rate limiter (per edge function instance)
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

serve(async (req) => {
  // CORS — snippet calls from customer websites
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  // This endpoint accepts POST from any origin (customer websites)
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { token, page_url, page_title, referrer, session_id, user_agent: clientUA } = body;

    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing token' }), { status: 400, headers: corsHeaders });
    }

    // Extract real client IP from headers
    const visitorIP = extractClientIP(req);
    if (!visitorIP) {
      return new Response(JSON.stringify({ error: 'Cannot determine client IP' }), { status: 400, headers: corsHeaders });
    }

    // Rate limit by IP
    if (isRateLimited(visitorIP)) {
      return new Response(JSON.stringify({ error: 'Rate limited' }), { status: 429, headers: corsHeaders });
    }

    // Init Supabase with service role (snippet has no auth)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate snippet token + get config
    const { data: config, error: configError } = await supabase
      .from('visitor_snippet_configs')
      .select('id, org_id, is_active, allowed_domains, exclude_paths, auto_enrich, auto_create_lead, rb2b_enabled')
      .eq('snippet_token', token)
      .eq('is_active', true)
      .maybeSingle();

    if (configError || !config) {
      return new Response(JSON.stringify({ error: 'Invalid or inactive token' }), { status: 403, headers: corsHeaders });
    }

    // Validate domain
    if (config.allowed_domains && config.allowed_domains.length > 0 && page_url) {
      try {
        const pageHost = new URL(page_url).hostname;
        const domainAllowed = config.allowed_domains.some((d: string) =>
          pageHost === d || pageHost.endsWith(`.${d}`)
        );
        if (!domainAllowed) {
          return new Response(JSON.stringify({ error: 'Domain not allowed' }), { status: 403, headers: corsHeaders });
        }
      } catch {
        // Invalid URL — allow through (don't block on parse errors)
      }
    }

    // Check exclude paths
    if (config.exclude_paths && config.exclude_paths.length > 0 && page_url) {
      try {
        const pagePath = new URL(page_url).pathname;
        const isExcluded = config.exclude_paths.some((pattern: string) => pagePath.startsWith(pattern));
        if (isExcluded) {
          return new Response(JSON.stringify({ ok: true, skipped: 'excluded_path' }), { status: 200, headers: corsHeaders });
        }
      } catch {
        // Invalid URL — allow through
      }
    }

    // Insert visitor record
    const { data: visitor, error: insertError } = await supabase
      .from('website_visitors')
      .insert({
        org_id: config.org_id,
        visitor_ip: visitorIP,
        user_agent: clientUA || req.headers.get('user-agent'),
        session_id: session_id || null,
        referrer: referrer || null,
        page_url: page_url || null,
        page_title: page_title || null,
        resolution_status: 'pending',
        enrichment_status: 'pending',
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[visitor-track] Insert error:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to record visit' }), { status: 500, headers: corsHeaders });
    }

    // Async: resolve IP to company (don't block the response)
    const visitorId = visitor.id;
    const orgId = config.org_id;

    // Fire-and-forget IP resolution
    (async () => {
      try {
        // Check cache first
        const { data: cached } = await supabase
          .from('ip_resolution_cache')
          .select('company_name, company_domain, company_data, resolution_status, provider')
          .eq('ip_address', visitorIP)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();

        let resolution;
        if (cached) {
          resolution = {
            companyName: cached.company_name,
            companyDomain: cached.company_domain,
            companyData: cached.company_data,
            resolutionStatus: cached.resolution_status,
            provider: cached.provider,
          };
        } else {
          resolution = await resolveIPToCompany(visitorIP, 'pdl');

          // Cache the result
          await supabase
            .from('ip_resolution_cache')
            .upsert({
              ip_address: visitorIP,
              provider: resolution.provider,
              company_name: resolution.companyName,
              company_domain: resolution.companyDomain,
              company_data: resolution.companyData,
              resolution_status: resolution.resolutionStatus,
              resolved_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            }, { onConflict: 'ip_address' });
        }

        // Update visitor record with resolution
        await supabase
          .from('website_visitors')
          .update({
            resolved_company_name: resolution.companyName,
            resolved_company_domain: resolution.companyDomain,
            resolved_company_data: resolution.companyData,
            resolution_provider: resolution.provider,
            resolution_status: resolution.resolutionStatus,
          })
          .eq('id', visitorId);

        // If resolved to a company and auto_enrich is on, trigger contact enrichment
        if (resolution.resolutionStatus === 'resolved' && config.auto_enrich) {
          try {
            await fetch(`${supabaseUrl}/functions/v1/visitor-enrich-contact`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                visitorId,
                orgId,
                companyDomain: resolution.companyDomain,
                companyName: resolution.companyName,
                autoCreateLead: config.auto_create_lead,
              }),
            });
          } catch (enrichErr) {
            console.error('[visitor-track] Enrich trigger failed:', enrichErr);
          }
        }
      } catch (err) {
        console.error('[visitor-track] Async resolution error:', err);
        // Mark as unresolvable on error
        await supabase
          .from('website_visitors')
          .update({ resolution_status: 'unresolvable' })
          .eq('id', visitorId);
      }
    })();

    return new Response(JSON.stringify({ ok: true, visitorId }), { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error('[visitor-track] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: corsHeaders });
  }
});
