/**
 * calculate-stakeholder-engagement
 *
 * Calculates engagement_status for each stakeholder in a deal based on
 * days_since_last_contact:
 *   active  : < 7 days
 *   warming : 7–21 days
 *   cold    : > 21 days
 *   unknown : no activity data
 *
 * Can be triggered:
 * - Per deal: { dealId }
 * - Per org (batch): { orgId }
 * - Per contact update: { contactId, dealId }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type EngagementStatus = 'active' | 'warming' | 'cold' | 'unknown';

function calcEngagementStatus(daysSince: number | null): EngagementStatus {
  if (daysSince === null || daysSince === undefined) return 'unknown';
  if (daysSince < 7) return 'active';
  if (daysSince <= 21) return 'warming';
  return 'cold';
}

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
    const { dealId, orgId, contactId } = body;

    // Verify user belongs to the org
    const targetOrgId = orgId || null;
    if (targetOrgId) {
      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('id')
        .eq('org_id', targetOrgId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!membership) {
        return new Response(
          JSON.stringify({ success: false, error: 'Forbidden' }),
          { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        );
      }
    }

    if (!dealId && !orgId) {
      return new Response(
        JSON.stringify({ success: false, error: 'dealId or orgId required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Build query for stakeholders to update
    let query = supabase
      .from('deal_stakeholders')
      .select('id, contact_id, last_contacted_at, days_since_last_contact');

    if (dealId) {
      query = query.eq('deal_id', dealId);
    }
    if (orgId) {
      query = query.eq('org_id', orgId);
    }
    if (contactId) {
      query = query.eq('contact_id', contactId);
    }

    const { data: stakeholders, error: fetchError } = await query;

    if (fetchError) {
      return new Response(
        JSON.stringify({ success: false, error: fetchError.message }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    if (!stakeholders || stakeholders.length === 0) {
      return new Response(
        JSON.stringify({ success: true, updated: 0 }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // For each stakeholder, calculate current activity metrics from activities table
    const now = new Date();
    let updatedCount = 0;

    for (const stakeholder of stakeholders) {
      // Get latest activity for this contact
      const { data: latestActivity } = await supabase
        .from('activities')
        .select('date')
        .eq('contact_id', stakeholder.contact_id)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Get meeting count
      const { count: meetingCount } = await supabase
        .from('meetings')
        .select('id', { count: 'exact', head: true })
        .contains('attendee_emails', [])
        .eq('contact_id', stakeholder.contact_id);

      // Get email count from activities
      const { count: emailCount } = await supabase
        .from('activities')
        .select('id', { count: 'exact', head: true })
        .eq('contact_id', stakeholder.contact_id)
        .eq('type', 'email');

      let daysSince: number | null = null;
      let lastContactedAt: string | null = stakeholder.last_contacted_at;

      if (latestActivity?.date) {
        const activityDate = new Date(latestActivity.date);
        daysSince = Math.floor((now.getTime() - activityDate.getTime()) / (1000 * 60 * 60 * 24));
        lastContactedAt = latestActivity.date;
      }

      const engagementStatus = calcEngagementStatus(daysSince);

      const { error: updateError } = await supabase
        .from('deal_stakeholders')
        .update({
          engagement_status: engagementStatus,
          days_since_last_contact: daysSince,
          last_contacted_at: lastContactedAt,
          meeting_count: meetingCount || 0,
          email_count: emailCount || 0,
          updated_at: now.toISOString(),
        })
        .eq('id', stakeholder.id);

      if (!updateError) {
        updatedCount++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        updated: updatedCount,
        total: stakeholders.length,
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
