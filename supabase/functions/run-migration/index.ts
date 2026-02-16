import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders } from '../_shared/corsHelper.ts';

async function fetchAll(svc: any, table: string, selectCols: string, filters: (q: any) => any) {
  const PAGE_SIZE = 1000;
  const all: any[] = [];
  let offset = 0;
  while (true) {
    let q = svc.from(table).select(selectCols);
    q = filters(q);
    q = q.range(offset, offset + PAGE_SIZE - 1);
    const { data, error } = await q;
    if (error || !data?.length) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const svc = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const results: Record<string, any> = {};

  // Step 1: Link leads to meetings by owner + time overlap (±30 min)
  // Paginate to get ALL unlinked leads
  const unlinkedLeads = await fetchAll(svc, 'leads', 'id, meeting_start, owner_id', (q: any) =>
    q.is('meeting_id', null).not('meeting_start', 'is', null)
  );
  results.unlinked_leads_count = unlinkedLeads.length;

  let linkedCount = 0;

  if (unlinkedLeads.length) {
    const ownerIds = [...new Set(unlinkedLeads.map((l: any) => l.owner_id).filter(Boolean))];
    results.unique_owner_ids = ownerIds.length;

    // Paginate to get ALL meetings for these owners
    const meetings = await fetchAll(svc, 'meetings', 'id, meeting_start, owner_user_id', (q: any) =>
      q.in('owner_user_id', ownerIds).not('meeting_start', 'is', null)
    );
    results.meetings_count = meetings.length;

    if (meetings.length) {
      // Group meetings by owner for fast lookup
      const meetingsByOwner = new Map<string, any[]>();
      for (const m of meetings) {
        const list = meetingsByOwner.get(m.owner_user_id) || [];
        list.push(m);
        meetingsByOwner.set(m.owner_user_id, list);
      }

      // Compute matches in memory
      const updates: Array<{ lead_id: string; meeting_id: string }> = [];
      for (const lead of unlinkedLeads) {
        if (!lead.owner_id || !lead.meeting_start) continue;
        const ownerMeetings = meetingsByOwner.get(lead.owner_id);
        if (!ownerMeetings) continue;

        const leadTime = new Date(lead.meeting_start).getTime();
        let bestMeeting: any = null;
        let bestDiff = Infinity;
        for (const m of ownerMeetings) {
          const diff = Math.abs(new Date(m.meeting_start).getTime() - leadTime);
          if (diff < bestDiff && diff <= 1800000) {
            bestDiff = diff;
            bestMeeting = m;
          }
        }
        if (bestMeeting) {
          updates.push({ lead_id: lead.id, meeting_id: bestMeeting.id });
        }
      }

      results.matches_found = updates.length;

      // Batch update: group by meeting_id to do fewer queries
      const byMeeting = new Map<string, string[]>();
      for (const u of updates) {
        const list = byMeeting.get(u.meeting_id) || [];
        list.push(u.lead_id);
        byMeeting.set(u.meeting_id, list);
      }

      for (const [meetingId, leadIds] of byMeeting) {
        const { error } = await svc
          .from('leads')
          .update({ meeting_id: meetingId })
          .in('id', leadIds);
        if (!error) linkedCount += leadIds.length;
      }
    }
  }
  results.linked = linkedCount;

  // Step 2: Mark past leads WITH meeting as completed
  // (covers both newly linked and previously misclassified)
  const { data: completed } = await svc
    .from('leads')
    .update({ meeting_outcome: 'completed' })
    .not('meeting_id', 'is', null)
    .in('meeting_outcome', ['scheduled', 'no_show'])
    .lt('meeting_start', new Date().toISOString())
    .select('id');
  results.completed = completed?.length || 0;

  // Step 3: Mark past leads WITHOUT meeting as no_show
  // (only those still marked 'scheduled')
  const { data: noShows } = await svc
    .from('leads')
    .update({ meeting_outcome: 'no_show' })
    .is('meeting_id', null)
    .eq('meeting_outcome', 'scheduled')
    .not('meeting_start', 'is', null)
    .lt('meeting_start', new Date().toISOString())
    .select('id');
  results.no_show = noShows?.length || 0;

  // Diagnostic: count meeting_outcome distribution
  const allLeads = await fetchAll(svc, 'leads', 'meeting_outcome, meeting_id', (q: any) => q);
  const dist: Record<string, number> = {};
  let withMeetingId = 0;
  for (const l of allLeads) {
    const outcome = l.meeting_outcome || 'null';
    dist[outcome] = (dist[outcome] || 0) + 1;
    if (l.meeting_id) withMeetingId++;
  }
  results.outcome_distribution = dist;
  results.total_leads = allLeads.length;
  results.with_meeting_id = withMeetingId;

  return new Response(JSON.stringify({ success: true, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
});
