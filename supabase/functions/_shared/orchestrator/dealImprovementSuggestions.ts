/**
 * Deal Improvement Suggestions (PST-011)
 *
 * Analyses active deals and generates actionable improvement suggestions
 * stored as deal_observations with category='improvement_suggestion'.
 *
 * Suggestion types:
 *   MULTI_THREAD     — only 1 contact linked
 *   URGENCY          — stuck in stage 14+ days with no compelling event
 *   PROOF            — proposal/negotiation stage, no case studies shared
 *   COMPETITOR       — competitor mentions in meeting notes
 *   EXECUTIVE_SPONSOR— no C-level/VP contact on the deal
 *   NEXT_STEP        — no upcoming meeting or task
 *
 * Each deal produces at most ONE improvement_suggestion observation (to respect
 * the unique partial index on deal_observations). Multiple suggestions are
 * bundled into the proposed_action JSONB array.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

// =============================================================================
// Types
// =============================================================================

interface DealForSuggestions {
  id: string;
  name: string;
  company: string | null;
  value: number | null;
  owner_id: string;
  org_id: string;
  stage_id: string | null;
  expected_close_date: string | null;
  created_at: string;
}

interface SuggestionItem {
  tag: string;
  title: string;
  description: string;
  action_type: string;
}

interface StageMeta {
  id: string;
  name: string;
  position: number;
}

// =============================================================================
// Constants
// =============================================================================

/** Days in the same stage before suggesting urgency */
const URGENCY_DAYS_THRESHOLD = 14;

/** Regex patterns for proposal/negotiation stage names */
const PROPOSAL_STAGE_PATTERN = /proposal|negotiation|contract|closing/i;

/** Regex patterns for executive titles */
const EXECUTIVE_TITLE_PATTERN = /\b(c[eofist]{1,3}o|cto|cfo|coo|cio|ciso|cro|cmo|chief|vp|vice\s*president|svp|evp|head\s+of|director|managing\s+director|partner|founder|co-founder|president|owner)\b/i;

/** Regex for competitor-related keywords in meeting notes */
const COMPETITOR_KEYWORD_PATTERN = /\b(competitor|competing|alternative|vs\.?|versus|compared\s+to|switch\s+from|currently\s+using|looking\s+at|also\s+considering|evaluated|benchmark)\b/i;

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Generates deal improvement suggestions and stores them as a single
 * bundled deal_observation with category='improvement_suggestion'.
 *
 * Returns the number of new observations created (0 or 1).
 */
export async function generateDealImprovementSuggestions(
  supabase: ReturnType<typeof createClient>,
  deal: DealForSuggestions,
  orgId: string,
  userId: string
): Promise<number> {
  // Gather supporting data in parallel
  const [
    contactsWithTitles,
    hasNextMeeting,
    hasPendingTask,
    stageMeta,
    stageEnteredDaysAgo,
    meetingNotesSnippets,
  ] = await Promise.all([
    fetchDealContactsWithTitles(supabase, deal.id),
    checkHasNextMeeting(supabase, deal.id),
    checkHasPendingTask(supabase, deal.id),
    fetchStageMeta(supabase, deal.stage_id),
    estimateDaysInStage(supabase, deal.id, deal.stage_id),
    fetchRecentMeetingNotes(supabase, deal.id),
  ]);

  const suggestions: SuggestionItem[] = [];

  // -------------------------------------------------------------------------
  // 1. MULTI_THREAD — only 1 contact linked
  // -------------------------------------------------------------------------
  if (contactsWithTitles.length <= 1) {
    suggestions.push({
      tag: 'MULTI_THREAD',
      title: 'Add more stakeholders',
      description: `${deal.name} has only ${contactsWithTitles.length} contact linked. Multi-threaded deals close 2x more often. Identify additional decision-makers or influencers.`,
      action_type: 'suggest_contacts',
    });
  }

  // -------------------------------------------------------------------------
  // 2. URGENCY — stuck in stage 14+ days, no compelling event
  // -------------------------------------------------------------------------
  if (stageEnteredDaysAgo >= URGENCY_DAYS_THRESHOLD && !deal.expected_close_date) {
    suggestions.push({
      tag: 'URGENCY',
      title: 'Create urgency',
      description: `${deal.name} has been in "${stageMeta?.name || 'current stage'}" for ${stageEnteredDaysAgo} days with no expected close date set. Consider tying the deal to a business event, deadline, or pain point to create urgency.`,
      action_type: 'create_urgency',
    });
  }

  // -------------------------------------------------------------------------
  // 3. PROOF — proposal/negotiation stage, no case studies shared
  // -------------------------------------------------------------------------
  const isProposalStage = stageMeta?.name
    ? PROPOSAL_STAGE_PATTERN.test(stageMeta.name)
    : false;

  if (isProposalStage) {
    // Check if any activity mentions case study / proof sharing
    const proofShared = meetingNotesSnippets.some(
      (note) => /case\s*study|testimonial|reference\s*call|proof\s*point|success\s*story|roi\s*report/i.test(note)
    );
    if (!proofShared) {
      suggestions.push({
        tag: 'PROOF',
        title: 'Share proof points',
        description: `${deal.name} is at ${stageMeta!.name} stage but no case studies or proof points appear to have been shared. Social proof increases close rates at this stage.`,
        action_type: 'share_proof',
      });
    }
  }

  // -------------------------------------------------------------------------
  // 4. COMPETITOR — competitor mentions in meeting notes
  // -------------------------------------------------------------------------
  const competitorMentions = meetingNotesSnippets.filter((note) =>
    COMPETITOR_KEYWORD_PATTERN.test(note)
  );
  if (competitorMentions.length > 0) {
    suggestions.push({
      tag: 'COMPETITOR',
      title: 'Prepare competitive positioning',
      description: `Competitor-related language detected in ${competitorMentions.length} recent meeting note(s) for ${deal.name}. Prepare a competitive battle card or objection-handling approach.`,
      action_type: 'competitive_positioning',
    });
  }

  // -------------------------------------------------------------------------
  // 5. EXECUTIVE_SPONSOR — no C-level/VP contact
  // -------------------------------------------------------------------------
  const hasExecutive = contactsWithTitles.some(
    (c) => c.title && EXECUTIVE_TITLE_PATTERN.test(c.title)
  );
  if (!hasExecutive && contactsWithTitles.length > 0) {
    suggestions.push({
      tag: 'EXECUTIVE_SPONSOR',
      title: 'Find executive sponsor',
      description: `No executive-level contact (C-suite, VP, Director) is linked to ${deal.name}. Deals with executive sponsors close 3x faster. Ask your champion to introduce you.`,
      action_type: 'find_sponsor',
    });
  }

  // -------------------------------------------------------------------------
  // 6. NEXT_STEP — no upcoming meeting or task
  // -------------------------------------------------------------------------
  if (!hasNextMeeting && !hasPendingTask) {
    suggestions.push({
      tag: 'NEXT_STEP',
      title: 'Schedule next touchpoint',
      description: `${deal.name} has no upcoming meeting or pending task. Deals without next steps are 3x more likely to stall. Schedule a follow-up.`,
      action_type: 'schedule_next_step',
    });
  }

  // No suggestions? Nothing to write.
  if (suggestions.length === 0) return 0;

  // Pick up to 3 most impactful suggestions (order is priority)
  const topSuggestions = suggestions.slice(0, 3);

  // Build the bundled observation
  const title = topSuggestions.length === 1
    ? `${deal.name}: ${topSuggestions[0].title}`
    : `${deal.name}: ${topSuggestions.length} improvement suggestions`;

  const description = topSuggestions
    .map((s, i) => `${i + 1}. **${s.tag}** — ${s.description}`)
    .join('\n');

  // Upsert (dedup on org_id + deal_id + category where status='open')
  return await upsertImprovementSuggestion(supabase, {
    deal_id: deal.id,
    user_id: userId,
    org_id: orgId,
    title,
    description,
    proposed_action: {
      type: 'improvement_suggestions',
      suggestions: topSuggestions.map((s) => ({
        tag: s.tag,
        title: s.title,
        description: s.description,
        action_type: s.action_type,
      })),
    },
  });
}

// =============================================================================
// Data Fetching
// =============================================================================

async function fetchDealContactsWithTitles(
  supabase: ReturnType<typeof createClient>,
  dealId: string
): Promise<Array<{ contact_id: string; title: string | null }>> {
  const { data } = await supabase
    .from('deal_contacts')
    .select('contact_id')
    .eq('deal_id', dealId);

  if (!data?.length) return [];

  const contactIds = data.map((r: { contact_id: string }) => r.contact_id);

  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, title')
    .in('id', contactIds);

  return (contacts || []).map((c: { id: string; title: string | null }) => ({
    contact_id: c.id,
    title: c.title,
  }));
}

async function checkHasNextMeeting(
  supabase: ReturnType<typeof createClient>,
  dealId: string
): Promise<boolean> {
  const now = new Date().toISOString();
  const { data } = await supabase
    .from('calendar_events')
    .select('id')
    .eq('deal_id', dealId)
    .gte('start_time', now)
    .limit(1);

  return (data?.length ?? 0) > 0;
}

async function checkHasPendingTask(
  supabase: ReturnType<typeof createClient>,
  dealId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('tasks')
    .select('id')
    .eq('deal_id', dealId)
    .neq('status', 'completed')
    .limit(1);

  return (data?.length ?? 0) > 0;
}

async function fetchStageMeta(
  supabase: ReturnType<typeof createClient>,
  stageId: string | null
): Promise<StageMeta | null> {
  if (!stageId) return null;
  const { data } = await supabase
    .from('deal_stages')
    .select('id, name, position')
    .eq('id', stageId)
    .maybeSingle();

  return data as StageMeta | null;
}

/**
 * Estimate how many days the deal has been in its current stage.
 * Uses deal_activities (stage change log) or falls back to created_at.
 */
async function estimateDaysInStage(
  supabase: ReturnType<typeof createClient>,
  dealId: string,
  stageId: string | null
): Promise<number> {
  if (!stageId) return 0;

  // Look for the most recent stage-change activity
  const { data } = await supabase
    .from('deal_activities')
    .select('created_at')
    .eq('deal_id', dealId)
    .eq('activity_type', 'stage_change')
    .order('created_at', { ascending: false })
    .limit(1);

  const referenceDate = data?.[0]?.created_at
    ? new Date(data[0].created_at)
    : null;

  if (!referenceDate) {
    // Fall back: check deal created_at via a quick query
    const { data: dealRow } = await supabase
      .from('deals')
      .select('created_at')
      .eq('id', dealId)
      .maybeSingle();

    const createdAt = dealRow?.created_at ? new Date(dealRow.created_at) : new Date();
    return Math.floor((Date.now() - createdAt.getTime()) / 86_400_000);
  }

  return Math.floor((Date.now() - referenceDate.getTime()) / 86_400_000);
}

/**
 * Fetch recent meeting summaries/notes for this deal (last 30 days).
 * Returns an array of text snippets from meeting summaries and transcript text.
 */
async function fetchRecentMeetingNotes(
  supabase: ReturnType<typeof createClient>,
  dealId: string
): Promise<string[]> {
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const { data } = await supabase
    .from('meetings')
    .select('summary, transcript_text')
    .eq('deal_id', dealId)
    .gte('meeting_start', cutoff)
    .order('meeting_start', { ascending: false })
    .limit(10);

  if (!data?.length) return [];

  const snippets: string[] = [];
  for (const m of data) {
    if (m.summary) snippets.push(m.summary);
    // Only take a truncated portion of transcript to keep analysis lightweight
    if (m.transcript_text) {
      snippets.push(m.transcript_text.slice(0, 2000));
    }
  }
  return snippets;
}

// =============================================================================
// Persistence (custom upsert respecting unique partial index)
// =============================================================================

interface ImprovementObservation {
  deal_id: string;
  user_id: string;
  org_id: string;
  title: string;
  description: string;
  proposed_action: Record<string, unknown>;
}

/**
 * Upserts a bundled improvement_suggestion observation.
 * If an open one already exists for this deal, updates it with the new
 * suggestions. Otherwise inserts a new row.
 *
 * Returns 1 if a new observation was created, 0 if updated or skipped.
 */
async function upsertImprovementSuggestion(
  supabase: ReturnType<typeof createClient>,
  obs: ImprovementObservation
): Promise<number> {
  const now = new Date().toISOString();

  // Check for existing open improvement_suggestion for this deal
  const { data: existing } = await supabase
    .from('deal_observations')
    .select('id, proposed_action')
    .eq('org_id', obs.org_id)
    .eq('deal_id', obs.deal_id)
    .eq('category', 'improvement_suggestion')
    .eq('status', 'open')
    .maybeSingle();

  if (existing) {
    // Update with latest suggestions
    await supabase
      .from('deal_observations')
      .update({
        title: obs.title,
        description: obs.description,
        proposed_action: obs.proposed_action,
        severity: 'medium',
        last_observed_at: now,
      })
      .eq('id', existing.id);
    return 0; // Updated, not new
  }

  // Check for snoozed observation that hasn't expired
  const { data: snoozed } = await supabase
    .from('deal_observations')
    .select('id')
    .eq('org_id', obs.org_id)
    .eq('deal_id', obs.deal_id)
    .eq('category', 'improvement_suggestion')
    .eq('status', 'snoozed')
    .gt('snooze_until', now)
    .maybeSingle();

  if (snoozed) return 0;

  // Insert new observation
  const { error } = await supabase.from('deal_observations').insert({
    org_id: obs.org_id,
    user_id: obs.user_id,
    deal_id: obs.deal_id,
    category: 'improvement_suggestion',
    severity: 'medium',
    title: obs.title,
    description: obs.description,
    affected_contacts: [],
    proposed_action: obs.proposed_action,
    status: 'open',
    first_observed_at: now,
    last_observed_at: now,
  });

  if (error) {
    // Unique constraint violation = race condition, not an error
    if (error.code === '23505') return 0;
    throw error;
  }

  return 1;
}
