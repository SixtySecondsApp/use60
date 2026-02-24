/**
 * agent-relationship-graph (KNW-002)
 *
 * Builds and maintains the contact relationship graph across deals.
 * Three modes:
 *   1. post_meeting  — extract attendee relationships from a completed meeting
 *   2. enrichment    — process Apollo enrichment data for job history + former colleagues
 *   3. batch         — recalculate relationship_strength for all edges in an org
 *
 * Auth: accepts CRON_SECRET (x-cron-secret header) or service-role Bearer token.
 * Deploy: npx supabase functions deploy agent-relationship-graph --project-ref <ref> --no-verify-jwt
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { verifyCronSecret, isServiceRoleAuth } from '../_shared/edgeAuth.ts';
import {
  handleCorsPreflightRequest,
  errorResponse,
  jsonResponse,
} from '../_shared/corsHelper.ts';

// =============================================================================
// Config
// =============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Strength weights
const WEIGHT_INTERACTION = 0.4;
const WEIGHT_RECENCY = 0.3;
const WEIGHT_SENTIMENT = 0.2;
const WEIGHT_DEAL_VALUE = 0.1;

// =============================================================================
// Types
// =============================================================================

interface PostMeetingPayload {
  mode: 'post_meeting';
  meeting_id: string;
  org_id: string;
}

interface EnrichmentPayload {
  mode: 'enrichment';
  contact_id: string;
  org_id: string;
  apollo_data?: {
    employment_history?: Array<{
      organization_name: string;
      domain?: string;
      title?: string;
      start_date?: string;
      end_date?: string;
      current?: boolean;
    }>;
  };
}

interface BatchPayload {
  mode: 'batch';
  org_id: string;
}

type Payload = PostMeetingPayload | EnrichmentPayload | BatchPayload;

interface GraphResult {
  mode: string;
  edges_created: number;
  edges_updated: number;
  history_entries: number;
  company_changes_detected: number;
}

// =============================================================================
// Main handler
// =============================================================================

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    const cronSecret = Deno.env.get('CRON_SECRET');
    const authHeader = req.headers.get('Authorization');

    if (
      !verifyCronSecret(req, cronSecret) &&
      !isServiceRoleAuth(authHeader, SUPABASE_SERVICE_ROLE_KEY)
    ) {
      return errorResponse('Unauthorized', req, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body: Payload = await req.json().catch(() => ({ mode: 'batch', org_id: '' }));
    const mode = body.mode || 'batch';

    console.log(`[agent-relationship-graph] Starting in ${mode} mode`);

    let result: GraphResult;

    switch (mode) {
      case 'post_meeting':
        result = await handlePostMeeting(supabase, body as PostMeetingPayload);
        break;
      case 'enrichment':
        result = await handleEnrichment(supabase, body as EnrichmentPayload);
        break;
      case 'batch':
        result = await handleBatch(supabase, body as BatchPayload);
        break;
      default:
        return errorResponse(`Unknown mode: ${mode}`, req, 400);
    }

    console.log(`[agent-relationship-graph] Complete:`, JSON.stringify(result));
    return jsonResponse(result, req);

  } catch (error) {
    console.error('[agent-relationship-graph] Fatal error:', error);
    return errorResponse((error as Error).message, req, 500);
  }
});

// =============================================================================
// Mode: post_meeting
// =============================================================================

async function handlePostMeeting(
  supabase: ReturnType<typeof createClient>,
  payload: PostMeetingPayload
): Promise<GraphResult> {
  const { meeting_id, org_id } = payload;
  const result: GraphResult = { mode: 'post_meeting', edges_created: 0, edges_updated: 0, history_entries: 0, company_changes_detected: 0 };

  // 1. Get meeting attendees via calendar_events or contacts linked to this meeting
  const { data: meeting } = await supabase
    .from('meetings')
    .select('id, title, meeting_start, org_id')
    .eq('id', meeting_id)
    .maybeSingle();

  if (!meeting) {
    console.warn(`[agent-relationship-graph] Meeting ${meeting_id} not found`);
    return result;
  }

  const effectiveOrgId = org_id || meeting.org_id;

  // Get contacts associated with this meeting
  const { data: meetingContacts } = await supabase
    .from('deal_meetings')
    .select('deal_id, deals!inner(id, org_id, company_name)')
    .eq('meeting_id', meeting_id);

  // Get attendees from calendar events linked to the meeting
  const { data: calEvents } = await supabase
    .from('calendar_events')
    .select('attendees, meeting_id')
    .eq('meeting_id', meeting_id)
    .limit(1)
    .maybeSingle();

  const attendeeEmails: string[] = [];
  if (calEvents?.attendees && Array.isArray(calEvents.attendees)) {
    for (const att of calEvents.attendees) {
      const email = (att as { email?: string }).email;
      if (email) attendeeEmails.push(email.toLowerCase());
    }
  }

  if (attendeeEmails.length < 2) {
    console.log(`[agent-relationship-graph] < 2 attendees, skipping`);
    return result;
  }

  // Resolve attendee emails to contact IDs
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, email, company_name')
    .eq('org_id', effectiveOrgId)
    .in('email', attendeeEmails);

  if (!contacts || contacts.length < 2) return result;

  // 2. Create edges for all contact pairs (co-attendees)
  for (let i = 0; i < contacts.length; i++) {
    for (let j = i + 1; j < contacts.length; j++) {
      const a = contacts[i];
      const b = contacts[j];

      // Determine relationship type
      const sameCompany = a.company_name && b.company_name &&
        a.company_name.toLowerCase() === b.company_name.toLowerCase();
      const relType = sameCompany ? 'colleague' : 'unknown';
      const sharedCo = sameCompany ? a.company_name : null;

      // Upsert edge (increment interaction_count if exists)
      const { data: existing } = await supabase
        .from('contact_graph')
        .select('id, interaction_count')
        .eq('org_id', effectiveOrgId)
        .eq('contact_id', a.id)
        .eq('linked_contact_id', b.id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('contact_graph')
          .update({
            interaction_count: existing.interaction_count + 1,
            last_interaction_at: meeting.meeting_start || new Date().toISOString(),
          })
          .eq('id', existing.id);
        result.edges_updated++;
      } else {
        const { error: insertErr } = await supabase
          .from('contact_graph')
          .insert({
            org_id: effectiveOrgId,
            contact_id: a.id,
            linked_contact_id: b.id,
            relationship_type: relType,
            shared_company: sharedCo,
            interaction_count: 1,
            last_interaction_at: meeting.meeting_start || new Date().toISOString(),
            discovery_source: 'meeting_attendees',
          });
        if (!insertErr) result.edges_created++;
      }
    }
  }

  return result;
}

// =============================================================================
// Mode: enrichment
// =============================================================================

async function handleEnrichment(
  supabase: ReturnType<typeof createClient>,
  payload: EnrichmentPayload
): Promise<GraphResult> {
  const { contact_id, org_id, apollo_data } = payload;
  const result: GraphResult = { mode: 'enrichment', edges_created: 0, edges_updated: 0, history_entries: 0, company_changes_detected: 0 };

  if (!apollo_data?.employment_history?.length) return result;

  // 1. Upsert employment history
  for (const job of apollo_data.employment_history) {
    const { error } = await supabase
      .from('contact_company_history')
      .upsert({
        org_id,
        contact_id,
        company_name: job.organization_name,
        company_domain: job.domain || null,
        title: job.title || null,
        started_at: job.start_date || null,
        ended_at: job.end_date || null,
        is_current: job.current ?? (!job.end_date),
        source: 'apollo',
      }, { onConflict: 'org_id,contact_id,company_name,started_at' });

    if (!error) result.history_entries++;
  }

  // 2. Detect company changes vs existing data
  const { data: existingCurrent } = await supabase
    .from('contact_company_history')
    .select('id, company_name, company_domain')
    .eq('org_id', org_id)
    .eq('contact_id', contact_id)
    .eq('is_current', true)
    .eq('source', 'crm');

  if (existingCurrent && existingCurrent.length > 0) {
    const crmCompany = existingCurrent[0].company_name?.toLowerCase();
    const apolloCurrent = apollo_data.employment_history.find(j => j.current || !j.end_date);
    if (apolloCurrent && crmCompany && apolloCurrent.organization_name.toLowerCase() !== crmCompany) {
      result.company_changes_detected++;
      console.log(`[agent-relationship-graph] Company change detected for contact ${contact_id}: ${crmCompany} → ${apolloCurrent.organization_name}`);
    }
  }

  // 3. Find former colleagues — contacts who share company history with overlapping dates
  const pastCompanies = apollo_data.employment_history.filter(j => !j.current && j.end_date);

  for (const pastJob of pastCompanies) {
    if (!pastJob.organization_name) continue;

    const { data: sharedHistory } = await supabase
      .from('contact_company_history')
      .select('contact_id, company_name, started_at, ended_at')
      .eq('org_id', org_id)
      .ilike('company_name', pastJob.organization_name)
      .neq('contact_id', contact_id);

    if (!sharedHistory?.length) continue;

    for (const other of sharedHistory) {
      // Check date overlap (loose — if either has no dates, assume overlap)
      const hasOverlap = !pastJob.start_date || !other.started_at ||
        !(pastJob.end_date && other.started_at && new Date(pastJob.end_date) < new Date(other.started_at as string)) &&
        !(other.ended_at && pastJob.start_date && new Date(other.ended_at as string) < new Date(pastJob.start_date));

      if (!hasOverlap) continue;

      // Upsert former_colleague edge
      const { data: existing } = await supabase
        .from('contact_graph')
        .select('id')
        .eq('org_id', org_id)
        .eq('contact_id', contact_id)
        .eq('linked_contact_id', other.contact_id)
        .eq('shared_company', pastJob.organization_name)
        .maybeSingle();

      if (!existing) {
        const { error: insertErr } = await supabase
          .from('contact_graph')
          .insert({
            org_id,
            contact_id,
            linked_contact_id: other.contact_id,
            relationship_type: 'former_colleague',
            shared_company: pastJob.organization_name,
            overlap_start_date: pastJob.start_date || null,
            overlap_end_date: pastJob.end_date || null,
            interaction_count: 0,
            discovery_source: 'apollo_enrichment',
          });
        if (!insertErr) result.edges_created++;
      }
    }
  }

  return result;
}

// =============================================================================
// Mode: batch — recalculate relationship_strength for all edges in an org
// =============================================================================

async function handleBatch(
  supabase: ReturnType<typeof createClient>,
  payload: BatchPayload
): Promise<GraphResult> {
  const { org_id } = payload;
  const result: GraphResult = { mode: 'batch', edges_created: 0, edges_updated: 0, history_entries: 0, company_changes_detected: 0 };

  if (!org_id) {
    console.warn('[agent-relationship-graph] batch mode requires org_id');
    return result;
  }

  // Fetch all edges for org
  const { data: edges } = await supabase
    .from('contact_graph')
    .select('id, contact_id, linked_contact_id, interaction_count, last_interaction_at')
    .eq('org_id', org_id);

  if (!edges?.length) return result;

  const now = Date.now();

  for (const edge of edges) {
    // Interaction score (0-100): log scale, capped at 50 interactions
    const interactionScore = Math.min(100, (Math.log2(edge.interaction_count + 1) / Math.log2(51)) * 100);

    // Recency score (0-100): full score if < 7 days, decays over 180 days
    let recencyScore = 0;
    if (edge.last_interaction_at) {
      const daysSince = (now - new Date(edge.last_interaction_at).getTime()) / (1000 * 60 * 60 * 24);
      recencyScore = Math.max(0, 100 - (daysSince / 180) * 100);
    }

    // Sentiment score: average from relationship_health_scores (if available)
    let sentimentScore = 50; // default neutral
    const { data: healthData } = await supabase
      .from('relationship_health_scores')
      .select('sentiment_score')
      .eq('contact_id', edge.contact_id)
      .maybeSingle();
    if (healthData?.sentiment_score != null) {
      sentimentScore = healthData.sentiment_score;
    }

    // Deal value score: normalize by total deal value involving both contacts
    let dealValueScore = 0;
    const { data: deals } = await supabase
      .from('deals')
      .select('value')
      .eq('org_id', org_id)
      .or(`primary_contact_id.eq.${edge.contact_id},primary_contact_id.eq.${edge.linked_contact_id}`)
      .limit(20);

    if (deals?.length) {
      const totalValue = deals.reduce((sum, d) => sum + (d.value || 0), 0);
      dealValueScore = Math.min(100, (totalValue / 100000) * 100); // 100k = max score
    }

    // Weighted strength
    const strength = Math.round(
      (interactionScore * WEIGHT_INTERACTION +
       recencyScore * WEIGHT_RECENCY +
       sentimentScore * WEIGHT_SENTIMENT +
       dealValueScore * WEIGHT_DEAL_VALUE) * 100
    ) / 100;

    await supabase
      .from('contact_graph')
      .update({ relationship_strength: Math.min(100, strength) })
      .eq('id', edge.id);

    result.edges_updated++;
  }

  console.log(`[agent-relationship-graph] Batch: updated ${result.edges_updated} edges`);
  return result;
}
