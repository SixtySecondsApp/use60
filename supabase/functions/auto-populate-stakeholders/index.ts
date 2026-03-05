/**
 * auto-populate-stakeholders
 *
 * Automatically creates deal_stakeholders entries from meeting attendees.
 * For each attendee in the meeting that is a known contact:
 * 1. Check if already a stakeholder → skip
 * 2. Create with role=unknown, auto_detected=true, source_meeting_id
 *
 * Called by:
 * - Meeting processing pipeline (after meeting is created/updated)
 * - Frontend when user manually triggers "populate from meeting"
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    // Validate JWT and user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const { dealId, meetingId } = body;

    if (!dealId || !meetingId) {
      return new Response(
        JSON.stringify({ success: false, error: 'dealId and meetingId are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Fetch the deal to get org_id
    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .select('id, clerk_org_id')
      .eq('id', dealId)
      .maybeSingle();

    if (dealError || !deal) {
      return new Response(
        JSON.stringify({ success: false, error: dealError?.message || 'Deal not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const orgId = deal.clerk_org_id;

    // Fetch meeting attendee emails
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('id, attendee_emails, contact_id')
      .eq('id', meetingId)
      .maybeSingle();

    if (meetingError || !meeting) {
      return new Response(
        JSON.stringify({ success: false, error: meetingError?.message || 'Meeting not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Collect emails from meeting (attendee_emails array + primary contact)
    const attendeeEmails: string[] = Array.isArray(meeting.attendee_emails)
      ? meeting.attendee_emails
      : [];

    if (attendeeEmails.length === 0 && !meeting.contact_id) {
      return new Response(
        JSON.stringify({ success: true, added: 0, skipped: 0, message: 'No attendees found' }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Look up contacts by email within the org
    let contactQuery = supabase
      .from('contacts')
      .select('id, email')
      .eq('owner_id', orgId);

    if (attendeeEmails.length > 0) {
      contactQuery = contactQuery.in('email', attendeeEmails);
    }

    const { data: contacts, error: contactsError } = await contactQuery;

    if (contactsError) {
      return new Response(
        JSON.stringify({ success: false, error: contactsError.message }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Also include the primary contact if set
    const contactIds = new Set<string>((contacts || []).map((c: { id: string }) => c.id));
    if (meeting.contact_id) {
      contactIds.add(meeting.contact_id);
    }

    if (contactIds.size === 0) {
      return new Response(
        JSON.stringify({ success: true, added: 0, skipped: 0, message: 'No matching contacts found' }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Fetch existing stakeholders for this deal to deduplicate
    const { data: existing } = await supabase
      .from('deal_stakeholders')
      .select('contact_id')
      .eq('deal_id', dealId);

    const existingContactIds = new Set((existing || []).map((s: { contact_id: string }) => s.contact_id));

    // Build inserts for new stakeholders only
    const toInsert = Array.from(contactIds)
      .filter((id) => !existingContactIds.has(id))
      .map((contactId) => ({
        deal_id: dealId,
        contact_id: contactId,
        org_id: orgId,
        role: 'unknown',
        influence: 'unknown',
        engagement_status: 'unknown',
        auto_detected: true,
        source_meeting_id: meetingId,
        confidence_score: null,
        needs_review: false,
      }));

    if (toInsert.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          added: 0,
          skipped: contactIds.size,
          message: 'All attendees already in buying committee',
        }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const { error: insertError } = await supabase
      .from('deal_stakeholders')
      .insert(toInsert);

    if (insertError) {
      return new Response(
        JSON.stringify({ success: false, error: insertError.message }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        added: toInsert.length,
        skipped: existingContactIds.size,
        meeting_id: meetingId,
      }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
});
