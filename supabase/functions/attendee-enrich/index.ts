// supabase/functions/attendee-enrich/index.ts
// WS-021/022: Calendar Attendee Enrichment + Pre-Meeting Slack Alert
//
// Enriches meeting attendees with contact data and sends
// Slack alerts 2 hours before meetings with research briefs.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const { user_id } = await req.json();
    if (!user_id) return errorResponse('user_id required', 400, corsHeaders);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Get upcoming events in next 3 hours
    const now = new Date();
    const threeHoursLater = new Date(now.getTime() + 3 * 60 * 60 * 1000);

    const { data: events } = await supabase
      .from('calendar_events')
      .select('id, title, start_time, end_time, attendees, metadata')
      .eq('user_id', user_id)
      .gte('start_time', now.toISOString())
      .lte('start_time', threeHoursLater.toISOString())
      .order('start_time', { ascending: true });

    if (!events || events.length === 0) {
      return jsonResponse({ enriched: 0, alerts: 0 }, corsHeaders);
    }

    let enrichedCount = 0;
    let alertsSent = 0;

    for (const event of events) {
      const attendees = (event.attendees || []) as Array<{ email: string; name?: string }>;

      // Enrich attendees
      for (const attendee of attendees) {
        if (!attendee.email) continue;

        // Check if contact already exists
        const { data: existing } = await supabase
          .from('contacts')
          .select('id, name, company, title')
          .eq('email', attendee.email)
          .eq('owner_id', user_id)
          .maybeSingle();

        if (!existing) {
          // Create contact from attendee
          const { error: insertErr } = await supabase
            .from('contacts')
            .insert({
              owner_id: user_id,
              email: attendee.email,
              name: attendee.name || attendee.email.split('@')[0],
              source: 'calendar_enrichment',
            });

          if (!insertErr) enrichedCount++;

          // Trigger background enrichment via existing lead-research
          try {
            await supabase.functions.invoke('api-skill-execute', {
              body: {
                skill_key: 'lead-research',
                input: { query: attendee.email },
                user_id,
              },
            });
          } catch {
            // Non-critical — contact created, enrichment can retry later
          }
        }
      }

      // WS-022: Send pre-meeting Slack alert (2h window)
      const startTime = new Date(event.start_time);
      const hoursUntil = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);

      if (hoursUntil <= 2 && hoursUntil > 0) {
        // Check if alert already sent
        const metadata = (event.metadata || {}) as Record<string, unknown>;
        if (metadata.meeting_prep_sent) continue;

        // Build attendee brief
        const attendeeProfiles = await Promise.all(
          attendees.slice(0, 5).map(async (a) => {
            const { data: contact } = await supabase
              .from('contacts')
              .select('name, company, title, email')
              .eq('email', a.email)
              .eq('owner_id', user_id)
              .maybeSingle();
            return contact || { name: a.name || a.email, email: a.email, company: null, title: null };
          })
        );

        // Check for linked deals
        const contactEmails = attendees.map((a) => a.email).filter(Boolean);
        const { data: linkedDeals } = await supabase
          .from('contacts')
          .select('id, deals!deals_primary_contact_id_fkey(id, company, stage_id)')
          .in('email', contactEmails)
          .eq('owner_id', user_id)
          .limit(5);

        // Check for recent email exchanges
        const { data: recentEmails } = await supabase
          .from('email_messages')
          .select('subject, from_email, received_at')
          .eq('user_id', user_id)
          .in('from_email', contactEmails)
          .order('received_at', { ascending: false })
          .limit(3);

        // Send Slack notification
        try {
          await supabase.functions.invoke('slack-meeting-prep', {
            body: {
              user_id,
              meeting: {
                title: event.title,
                start_time: event.start_time,
                attendees: attendeeProfiles,
              },
              context: {
                deals: linkedDeals?.flatMap((c: Record<string, unknown>) => (c.deals as Array<Record<string, unknown>>) || []) || [],
                recentEmails: recentEmails || [],
              },
            },
          });
          alertsSent++;

          // Mark as sent
          await supabase
            .from('calendar_events')
            .update({ metadata: { ...metadata, meeting_prep_sent: true } })
            .eq('id', event.id);
        } catch (err) {
          console.error(`[attendee-enrich] Slack alert failed for event ${event.id}:`, err);
        }
      }
    }

    return jsonResponse({ enriched: enrichedCount, alerts: alertsSent, events: events.length }, corsHeaders);
  } catch (error) {
    console.error('[attendee-enrich] Error:', error);
    return errorResponse((error as Error).message, 500, corsHeaders);
  }
});
