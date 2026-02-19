/**
 * Facebook Leads Webhook
 *
 * Receives lead form submissions from Facebook via Make/n8n and creates
 * partial waitlist signups in the meetings_waitlist table.
 *
 * Authentication: Requires x-webhook-secret header matching FACEBOOK_LEADS_WEBHOOK_SECRET
 *
 * Expected payload from Make/n8n:
 * {
 *   email: string (required)
 *   full_name?: string
 *   first_name?: string
 *   last_name?: string
 *   company_name?: string
 *   phone?: string
 *   tools_they_use?: string
 * }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const webhookSecret = Deno.env.get('FACEBOOK_LEADS_WEBHOOK_SECRET');

interface FacebookLeadPayload {
  email: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  phone?: string;
  tools_they_use?: string;
  utm_source?: string;
  utm_campaign?: string;
  utm_medium?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Validate webhook secret
    const providedSecret = req.headers.get('x-webhook-secret');

    if (!webhookSecret) {
      console.error('[facebook-leads-webhook] FACEBOOK_LEADS_WEBHOOK_SECRET not configured');
      return new Response(
        JSON.stringify({ error: 'Webhook not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!providedSecret || providedSecret !== webhookSecret) {
      console.error('[facebook-leads-webhook] Invalid or missing webhook secret');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: FacebookLeadPayload = await req.json();
    console.log('[facebook-leads-webhook] Received payload:', {
      email: body.email,
      hasName: !!(body.full_name || body.first_name),
      hasCompany: !!body.company_name,
      hasPhone: !!body.phone
    });

    // Validate required fields
    const email = (body.email || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email || !emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Valid email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build full name from parts if not provided directly
    let fullName = (body.full_name || '').trim();
    if (!fullName && (body.first_name || body.last_name)) {
      fullName = [body.first_name, body.last_name].filter(Boolean).join(' ').trim();
    }

    // Default to partial signup marker if no name
    if (!fullName) {
      fullName = '[Facebook Lead]';
    }

    const companyName = (body.company_name || '').trim() || '[Not Provided]';

    // Build admin notes with extra fields (phone, tools)
    const extraFields: string[] = [];
    if (body.phone) {
      extraFields.push(`Phone: ${body.phone.trim()}`);
    }
    if (body.tools_they_use) {
      extraFields.push(`Tools: ${body.tools_they_use.trim()}`);
    }
    const adminNotes = extraFields.length > 0
      ? `Facebook Lead - ${extraFields.join(' | ')}`
      : 'Facebook Lead';

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if email already exists
    const { data: existing } = await supabase
      .from('meetings_waitlist')
      .select('id, full_name, admin_notes')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      // Email exists - check if it's a partial/incomplete signup we should update
      const isIncomplete = existing.full_name?.includes('[Incomplete') ||
                          existing.full_name?.includes('[Facebook Lead]') ||
                          existing.full_name?.includes('[Not Provided]');

      if (isIncomplete && fullName !== '[Facebook Lead]') {
        // Update incomplete signup with new data
        const { error: updateError } = await supabase
          .from('meetings_waitlist')
          .update({
            full_name: fullName,
            company_name: companyName !== '[Not Provided]' ? companyName : existing.full_name,
            admin_notes: existing.admin_notes
              ? `${existing.admin_notes} | ${adminNotes}`
              : adminNotes,
            signup_source: 'facebook_lead_form',
          })
          .eq('id', existing.id);

        if (updateError) {
          console.error('[facebook-leads-webhook] Update error:', updateError);
          return new Response(
            JSON.stringify({ error: 'Failed to update existing signup' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('[facebook-leads-webhook] Updated existing partial signup:', email);
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Existing signup updated',
            entry_id: existing.id
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Already has a complete signup - don't overwrite
      console.log('[facebook-leads-webhook] Email already exists with complete signup:', email);
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Email already registered',
          entry_id: existing.id
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert new partial signup
    // Note: referral_code is auto-generated by database trigger
    const { data: entry, error: insertError } = await supabase
      .from('meetings_waitlist')
      .insert({
        email,
        full_name: fullName,
        company_name: companyName,
        admin_notes: adminNotes,
        registration_url: 'facebook_lead_form',
        signup_source: 'facebook_lead_form',
        utm_source: body.utm_source || 'facebook',
        utm_campaign: body.utm_campaign || null,
        utm_medium: body.utm_medium || 'paid_social',
        referral_code: '', // Will be overwritten by database trigger
      })
      .select('id, email, full_name, effective_position')
      .single();

    if (insertError) {
      console.error('[facebook-leads-webhook] Insert error:', insertError);

      // Handle unique constraint (shouldn't happen due to check above, but safety net)
      if (insertError.code === '23505') {
        return new Response(
          JSON.stringify({ success: true, message: 'Email already registered' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'Failed to create signup' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[facebook-leads-webhook] Created new signup:', {
      id: entry.id,
      email: entry.email,
      position: entry.effective_position
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Lead captured successfully',
        entry_id: entry.id,
        position: entry.effective_position
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[facebook-leads-webhook] Error:', error);

    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
