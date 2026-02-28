/**
 * update-deal-dossier — Auto-update dossier when new meetings are synced
 *
 * Triggered via database webhook (pg_net) when a meeting's summary_status
 * changes to 'complete'. Checks if the meeting links to a deal with an
 * existing dossier, and if so, appends key takeaways to the timeline
 * and regenerates the narrative.
 *
 * Auth: service_role only (triggered by database webhook)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders } from '../_shared/corsHelper.ts';

interface DossierSnapshot {
  narrative?: string;
  key_facts?: string[];
  stakeholders?: { name: string; role: string; sentiment: string }[];
  commitments?: string[];
  objections?: string[];
  timeline?: { date: string; event: string }[];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceRoleKey,
  );

  try {
    const body = await req.json();

    // Support both webhook payload and direct invocation
    const meetingId: string | undefined = body.record?.id || body.meeting_id;
    if (!meetingId) {
      return new Response(JSON.stringify({ error: 'Missing meeting_id' }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Fetch the meeting with summary
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('id, title, start_time, summary_oneliner, summary, primary_contact_id, company_id')
      .eq('id', meetingId)
      .maybeSingle();

    if (meetingError || !meeting) {
      console.log(`[update-deal-dossier] Meeting ${meetingId} not found or error`);
      return new Response(JSON.stringify({ skipped: true, reason: 'meeting_not_found' }), {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Find deals linked to this meeting via contact or company
    const dealFilters: string[] = [];
    if (meeting.primary_contact_id) dealFilters.push(`primary_contact_id.eq.${meeting.primary_contact_id}`);
    if (meeting.company_id) dealFilters.push(`company_id.eq.${meeting.company_id}`);

    if (dealFilters.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: 'no_contact_or_company_link' }), {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const { data: deals } = await supabase
      .from('deals')
      .select('id, org_id')
      .or(dealFilters.join(','))
      .eq('status', 'active');

    if (!deals || deals.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: 'no_linked_deals' }), {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    let updated = 0;

    for (const deal of deals) {
      // Check if dossier exists for this deal
      const { data: dossier } = await supabase
        .from('deal_dossiers')
        .select('id, snapshot, last_meetings_hash')
        .eq('deal_id', deal.id)
        .maybeSingle();

      if (!dossier) continue; // No existing dossier, skip

      // Check if this meeting was already incorporated
      const existingHash = dossier.last_meetings_hash || '';
      if (existingHash.includes(meetingId)) continue; // Already processed

      // Build timeline entry from meeting
      const meetingDate = meeting.start_time
        ? new Date(meeting.start_time).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      let eventSummary = meeting.summary_oneliner || meeting.title || 'Meeting completed';

      // Try to extract key takeaway from full summary
      if (meeting.summary) {
        try {
          const parsed = typeof meeting.summary === 'string'
            ? JSON.parse(meeting.summary)
            : meeting.summary;
          const markdown: string = parsed?.markdown_formatted || '';
          const boldMatch = markdown.match(/\*\*(.+?)\*\*/);
          if (boldMatch) {
            eventSummary = boldMatch[1].replace(/\[|\]/g, '');
          }
        } catch {
          // Use fallback
        }
      }

      // Update dossier snapshot
      const snapshot: DossierSnapshot = (dossier.snapshot as DossierSnapshot) || {};
      const timeline = snapshot.timeline || [];
      timeline.push({ date: meetingDate, event: eventSummary });

      // Update narrative to mention latest meeting
      if (snapshot.narrative) {
        snapshot.narrative = `${snapshot.narrative} Latest meeting (${meetingDate}): ${eventSummary}.`;
      }

      snapshot.timeline = timeline;

      // Update meetings hash
      const newHash = existingHash ? `${existingHash},${meetingId}` : meetingId;

      const { error: updateError } = await supabase
        .from('deal_dossiers')
        .update({
          snapshot,
          last_meetings_hash: newHash,
          updated_at: new Date().toISOString(),
        })
        .eq('id', dossier.id);

      if (updateError) {
        console.error(`[update-deal-dossier] Failed to update dossier for deal ${deal.id}:`, updateError.message);
      } else {
        updated++;
      }
    }

    console.log(`[update-deal-dossier] Processed meeting ${meetingId}, updated ${updated} dossiers`);

    return new Response(JSON.stringify({ meetingId, dossiersUpdated: updated }), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[update-deal-dossier] Error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
