/**
 * Shared Entity Resolution Adapter
 *
 * Resolves ambiguous person references (first-name-only) by searching
 * across CRM contacts, meetings, calendar events, and emails in parallel.
 *
 * Used by both api-copilot and copilot-autonomous edge functions.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type SupabaseClient = ReturnType<typeof createClient>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecentInteraction {
  type: 'meeting' | 'email' | 'calendar';
  date: string;
  title: string;
  description?: string;
  snippet?: string;
  url?: string;
}

interface EntityCandidate {
  id: string;
  type: 'contact' | 'meeting_attendee' | 'calendar_attendee' | 'email_participant' | 'crm_index';
  first_name: string;
  last_name?: string;
  full_name: string;
  email?: string;
  company_name?: string;
  title?: string;
  phone?: string;
  source: string;
  last_interaction: string;
  last_interaction_type: string;
  last_interaction_description?: string;
  recency_score: number;
  contact_id?: string;
  crm_url?: string;
  recent_interactions?: RecentInteraction[];
  is_materialized?: boolean;
  crm_source?: string;
}

export interface ResolveEntityResult {
  success: boolean;
  resolved: boolean;
  message: string;
  search_summary: {
    name_searched: string;
    sources_searched: string[];
    total_candidates: number;
    search_steps: Array<{ source: string; status: 'complete' | 'no_results'; count: number }>;
  };
  contact?: EntityCandidate;
  candidates?: EntityCandidate[];
  disambiguation_needed?: boolean;
  disambiguation_reason?: string;
}

// ---------------------------------------------------------------------------
// Rich Context Fetcher
// ---------------------------------------------------------------------------

async function fetchRichContactContext(
  contact: EntityCandidate,
  client: SupabaseClient,
  userId: string,
  appUrl: string = 'https://app.use60.com'
): Promise<{ crm_url?: string; recent_interactions: RecentInteraction[] }> {
  const recentInteractions: RecentInteraction[] = [];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const crm_url = contact.contact_id
    ? `${appUrl}/crm/contacts/${contact.contact_id}`
    : undefined;

  const promises: Promise<void>[] = [];

  // 1. Recent meetings with this contact
  promises.push((async () => {
    try {
      let meetingIds: string[] = [];

      if (contact.contact_id) {
        const { data: attendees } = await client
          .from('meeting_attendees')
          .select('meeting_id')
          .eq('contact_id', contact.contact_id)
          .limit(10);

        if (attendees) {
          meetingIds = attendees.map((a: { meeting_id: string }) => a.meeting_id);
        }
      }

      if (contact.email && meetingIds.length < 5) {
        const { data: emailAttendees } = await client
          .from('meeting_attendees')
          .select('meeting_id')
          .eq('email', contact.email)
          .limit(10);

        if (emailAttendees) {
          const newIds = emailAttendees.map((a: { meeting_id: string }) => a.meeting_id);
          meetingIds = [...new Set([...meetingIds, ...newIds])];
        }
      }

      if (meetingIds.length === 0) return;

      const { data: meetings } = await client
        .from('meetings')
        .select('id, title, start_time, summary, transcript_text')
        .eq('owner_user_id', userId)
        .in('id', meetingIds.slice(0, 5))
        .gte('start_time', thirtyDaysAgo)
        .order('start_time', { ascending: false })
        .limit(5);

      if (meetings) {
        for (const meeting of meetings) {
          let snippet = meeting.summary || '';
          if (!snippet && meeting.transcript_text) {
            snippet = meeting.transcript_text.substring(0, 200) + '...';
          }

          recentInteractions.push({
            type: 'meeting',
            date: meeting.start_time,
            title: meeting.title || 'Meeting',
            description: `Meeting with ${contact.full_name}`,
            snippet: snippet || undefined,
            url: `${appUrl}/meetings/${meeting.id}`,
          });
        }
      }
    } catch (e) {
      console.error('[RICH_CONTEXT] Error fetching meetings:', e);
    }
  })());

  // 2. Recent calendar events with this contact
  promises.push((async () => {
    try {
      if (!contact.email) return;

      const { data: events } = await client
        .from('calendar_events')
        .select('id, title, start_time, attendees')
        .eq('user_id', userId)
        .gte('start_time', thirtyDaysAgo)
        .order('start_time', { ascending: false })
        .limit(20);

      if (!events) return;

      for (const event of events) {
        const attendees = event.attendees as Array<{ email?: string; displayName?: string }> | null;
        if (!attendees) continue;

        const hasContact = attendees.some(
          (a) => a.email?.toLowerCase() === contact.email?.toLowerCase()
        );

        if (hasContact) {
          recentInteractions.push({
            type: 'calendar',
            date: event.start_time,
            title: event.title || 'Calendar Event',
            description: `Scheduled event with ${contact.full_name}`,
            url: `${appUrl}/meetings?date=${event.start_time.split('T')[0]}`,
          });

          if (recentInteractions.filter((i) => i.type === 'calendar').length >= 3) break;
        }
      }
    } catch (e) {
      console.error('[RICH_CONTEXT] Error fetching calendar events:', e);
    }
  })());

  // 3. Recent emails with this contact
  promises.push((async () => {
    try {
      if (!contact.email) return;

      const { data: emails } = await client
        .from('email_messages')
        .select('id, subject, date, snippet, thread_id')
        .eq('user_id', userId)
        .or(`from_email.eq.${contact.email},to_email.cs.{${contact.email}}`)
        .gte('date', thirtyDaysAgo)
        .order('date', { ascending: false })
        .limit(5);

      if (emails) {
        for (const email of emails) {
          recentInteractions.push({
            type: 'email',
            date: email.date,
            title: email.subject || 'Email',
            description: `Email with ${contact.full_name}`,
            snippet: email.snippet || undefined,
          });
        }
      }
    } catch (_e) {
      // email_messages table may not exist
      console.log('[RICH_CONTEXT] Skipping emails (table may not exist)');
    }
  })());

  await Promise.all(promises);

  recentInteractions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    crm_url,
    recent_interactions: recentInteractions.slice(0, 10),
  };
}

// ---------------------------------------------------------------------------
// Main Resolve Entity Handler
// ---------------------------------------------------------------------------

export async function resolveEntity(
  client: SupabaseClient,
  userId: string,
  orgId: string | null,
  args: { name?: string; context_hint?: string }
): Promise<ResolveEntityResult> {
  const name = args?.name ? String(args.name).trim() : '';
  const contextHint = args?.context_hint ? String(args.context_hint).trim() : '';

  if (!name) {
    return {
      success: false,
      resolved: false,
      message: 'Name is required for entity resolution',
      search_summary: {
        name_searched: '',
        sources_searched: [],
        total_candidates: 0,
        search_steps: [],
      },
    };
  }

  const nameParts = name.split(/\s+/);
  const firstName = nameParts[0];
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;

  console.log('[ENTITY_RESOLUTION] Starting entity resolution:', {
    name,
    firstName,
    lastName,
    userId,
    orgId,
    contextHint,
  });

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const calcRecencyScore = (dateStr: string | null | undefined): number => {
    if (!dateStr) return 0;
    const date = new Date(dateStr);
    const daysSince = Math.max(0, (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, Math.round(100 - (daysSince / 30) * 100));
  };

  const candidates: EntityCandidate[] = [];
  const searchSteps: Array<{ source: string; status: 'complete' | 'no_results'; count: number }> = [];

  // Helper to check if org exists (needed for CRM index search)
  const hasOrgId = !!orgId;

  // 1. Search CRM Contacts
  const contactsPromise = (async () => {
    try {
      let query = client
        .from('contacts')
        .select(`
          id,
          first_name,
          last_name,
          email,
          phone,
          title,
          company_id,
          companies:company_id (name),
          updated_at,
          created_at
        `)
        .eq('owner_id', userId)
        .ilike('first_name', `${firstName}%`)
        .order('updated_at', { ascending: false })
        .limit(10);

      if (lastName) {
        query = query.ilike('last_name', `${lastName}%`);
      }

      const { data: contacts, error } = await query;

      if (error || !contacts || contacts.length === 0) {
        searchSteps.push({ source: 'CRM Contacts', status: 'no_results', count: 0 });
        return;
      }

      searchSteps.push({ source: 'CRM Contacts', status: 'complete', count: contacts.length });

      for (const contact of contacts) {
        const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
        const companyName = (contact.companies as { name?: string } | null)?.name || undefined;

        candidates.push({
          id: contact.id,
          type: 'contact',
          first_name: contact.first_name || '',
          last_name: contact.last_name || undefined,
          full_name: fullName || contact.email || 'Unknown',
          email: contact.email || undefined,
          phone: contact.phone || undefined,
          company_name: companyName,
          title: contact.title || undefined,
          source: 'CRM',
          last_interaction: contact.updated_at || contact.created_at,
          last_interaction_type: 'crm',
          last_interaction_description: 'CRM record updated',
          recency_score: calcRecencyScore(contact.updated_at || contact.created_at),
          contact_id: contact.id,
        });
      }
    } catch (_e) {
      searchSteps.push({ source: 'CRM Contacts', status: 'no_results', count: 0 });
    }
  })();

  // 2. Search Recent Meetings (attendee names)
  const meetingsPromise = (async () => {
    try {
      const { data: meetings, error } = await client
        .from('meetings')
        .select(`
          id,
          title,
          start_time,
          meeting_attendees!inner (
            id,
            name,
            email,
            contact_id
          )
        `)
        .eq('owner_user_id', userId)
        .gte('start_time', thirtyDaysAgo.toISOString())
        .order('start_time', { ascending: false })
        .limit(50);

      if (error || !meetings || meetings.length === 0) {
        searchSteps.push({ source: 'Recent Meetings', status: 'no_results', count: 0 });
        return;
      }

      let matchCount = 0;
      for (const meeting of meetings) {
        const attendees = meeting.meeting_attendees as Array<{
          id: string;
          name?: string;
          email?: string;
          contact_id?: string;
        }>;

        for (const attendee of attendees) {
          if (!attendee.name) continue;

          const attendeeNameLower = attendee.name.toLowerCase();
          const searchNameLower = firstName.toLowerCase();

          if (attendeeNameLower.startsWith(searchNameLower) || attendeeNameLower.includes(searchNameLower)) {
            const parts = attendee.name.split(/\s+/);
            matchCount++;

            candidates.push({
              id: attendee.id,
              type: 'meeting_attendee',
              first_name: parts[0] || '',
              last_name: parts.slice(1).join(' ') || undefined,
              full_name: attendee.name,
              email: attendee.email || undefined,
              source: 'Meeting',
              last_interaction: meeting.start_time,
              last_interaction_type: 'meeting',
              last_interaction_description: `Meeting: ${meeting.title}`,
              recency_score: calcRecencyScore(meeting.start_time),
              contact_id: attendee.contact_id || undefined,
            });
          }
        }
      }

      searchSteps.push({
        source: 'Recent Meetings',
        status: matchCount > 0 ? 'complete' : 'no_results',
        count: matchCount,
      });
    } catch (_e) {
      searchSteps.push({ source: 'Recent Meetings', status: 'no_results', count: 0 });
    }
  })();

  // 3. Search Calendar Events (attendee names)
  const calendarPromise = (async () => {
    try {
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const { data: events, error } = await client
        .from('calendar_events')
        .select('id, title, start_time, attendees')
        .eq('user_id', userId)
        .gte('start_time', thirtyDaysAgo.toISOString())
        .lte('start_time', sevenDaysFromNow.toISOString())
        .order('start_time', { ascending: false })
        .limit(50);

      if (error || !events || events.length === 0) {
        searchSteps.push({ source: 'Calendar Events', status: 'no_results', count: 0 });
        return;
      }

      let matchCount = 0;
      for (const event of events) {
        const attendees = event.attendees as Array<{
          email?: string;
          displayName?: string;
          responseStatus?: string;
        }> | null;

        if (!attendees) continue;

        for (const attendee of attendees) {
          const displayName = attendee.displayName || '';
          const email = attendee.email || '';
          const nameFromEmail = email.split('@')[0]?.replace(/[._-]/g, ' ') || '';
          const searchIn = (displayName || nameFromEmail).toLowerCase();
          const searchNameLower = firstName.toLowerCase();

          if (searchIn.includes(searchNameLower)) {
            const parts = (displayName || nameFromEmail).split(/\s+/);
            matchCount++;

            candidates.push({
              id: `${event.id}-${email}`,
              type: 'calendar_attendee',
              first_name: parts[0] || '',
              last_name: parts.slice(1).join(' ') || undefined,
              full_name: displayName || nameFromEmail || email,
              email: email || undefined,
              source: 'Calendar',
              last_interaction: event.start_time,
              last_interaction_type: 'calendar',
              last_interaction_description: `Calendar: ${event.title}`,
              recency_score: calcRecencyScore(event.start_time),
            });
          }
        }
      }

      searchSteps.push({
        source: 'Calendar Events',
        status: matchCount > 0 ? 'complete' : 'no_results',
        count: matchCount,
      });
    } catch (_e) {
      searchSteps.push({ source: 'Calendar Events', status: 'no_results', count: 0 });
    }
  })();

  // 4. Search CRM Index (only if org is available)
  const crmIndexPromise = (async () => {
    if (!hasOrgId) {
      searchSteps.push({ source: 'CRM Index', status: 'no_results', count: 0 });
      return;
    }

    try {
      // Search by name
      let nameQuery = client
        .from('crm_contact_index')
        .select('id, first_name, last_name, email, company_name, job_title, is_materialized, crm_source, crm_updated_at')
        .eq('org_id', orgId)
        .or(`first_name.ilike.${firstName}%,last_name.ilike.${firstName}%`)
        .order('crm_updated_at', { ascending: false, nullsFirst: false })
        .limit(10);

      if (lastName) {
        nameQuery = nameQuery.or(`first_name.ilike.${firstName}%,last_name.ilike.${lastName}%`);
      }

      const { data: nameMatches, error: nameError } = await nameQuery;

      // Also search by email if we can extract it from context
      // For now, just use name-based search
      const allMatches = nameMatches || [];

      if (nameError || allMatches.length === 0) {
        searchSteps.push({ source: 'CRM Index', status: 'no_results', count: 0 });
        return;
      }

      searchSteps.push({ source: 'CRM Index', status: 'complete', count: allMatches.length });

      for (const match of allMatches) {
        const fullName = [match.first_name, match.last_name].filter(Boolean).join(' ');

        // Give materialized contacts a higher recency score (boost by 20 points)
        const baseRecency = calcRecencyScore(match.crm_updated_at);
        const recencyScore = match.is_materialized ? baseRecency + 20 : baseRecency;

        candidates.push({
          id: match.id,
          type: 'crm_index',
          first_name: match.first_name || '',
          last_name: match.last_name || undefined,
          full_name: fullName || match.email || 'Unknown',
          email: match.email || undefined,
          company_name: match.company_name || undefined,
          title: match.job_title || undefined,
          source: `CRM Index (${match.crm_source})`,
          last_interaction: match.crm_updated_at || new Date().toISOString(),
          last_interaction_type: 'crm_index',
          last_interaction_description: match.is_materialized
            ? `CRM contact (${match.crm_source}, materialized)`
            : `CRM contact (${match.crm_source}, indexed only)`,
          recency_score: recencyScore,
          is_materialized: match.is_materialized || false,
          crm_source: match.crm_source,
        });
      }
    } catch (_e) {
      searchSteps.push({ source: 'CRM Index', status: 'no_results', count: 0 });
    }
  })();

  // Wait for all parallel searches (now including CRM index)
  await Promise.all([contactsPromise, meetingsPromise, calendarPromise, crmIndexPromise]);

  // Deduplicate and score candidates
  const deduped = new Map<string, EntityCandidate>();

  for (const candidate of candidates) {
    const key = candidate.email?.toLowerCase() || candidate.full_name.toLowerCase();
    const existing = deduped.get(key);

    if (!existing) {
      deduped.set(key, candidate);
    } else {
      if (candidate.recency_score > existing.recency_score) {
        deduped.set(key, {
          ...candidate,
          contact_id: candidate.contact_id || existing.contact_id,
        });
      } else if (candidate.contact_id && !existing.contact_id) {
        existing.contact_id = candidate.contact_id;
      }
    }
  }

  const sortedCandidates = Array.from(deduped.values()).sort((a, b) => b.recency_score - a.recency_score);

  const totalCandidates = sortedCandidates.length;

  const sourcesSearched = hasOrgId
    ? ['CRM Contacts', 'Recent Meetings', 'Calendar Events', 'CRM Index']
    : ['CRM Contacts', 'Recent Meetings', 'Calendar Events'];

  // Determine resolution outcome
  if (totalCandidates === 0) {
    return {
      success: true,
      resolved: false,
      message: `No matches found for "${name}". Try providing more context like their email, company, or when you last interacted.`,
      search_summary: {
        name_searched: name,
        sources_searched: sourcesSearched,
        total_candidates: 0,
        search_steps: searchSteps,
      },
    };
  }

  if (totalCandidates === 1) {
    const resolvedContact = sortedCandidates[0];
    const richContext = await fetchRichContactContext(resolvedContact, client, userId);
    resolvedContact.crm_url = richContext.crm_url;
    resolvedContact.recent_interactions = richContext.recent_interactions;

    return {
      success: true,
      resolved: true,
      message: `Found ${resolvedContact.full_name}${resolvedContact.company_name ? ` at ${resolvedContact.company_name}` : ''}${resolvedContact.title ? ` (${resolvedContact.title})` : ''} (${resolvedContact.source})`,
      search_summary: {
        name_searched: name,
        sources_searched: sourcesSearched,
        total_candidates: 1,
        search_steps: searchSteps,
      },
      contact: resolvedContact,
    };
  }

  // Multiple candidates - check if there's a clear winner by recency
  const topCandidate = sortedCandidates[0];
  const secondCandidate = sortedCandidates[1];
  const recencyGap = topCandidate.recency_score - secondCandidate.recency_score;

  if (recencyGap > 20) {
    const richContext = await fetchRichContactContext(topCandidate, client, userId);
    topCandidate.crm_url = richContext.crm_url;
    topCandidate.recent_interactions = richContext.recent_interactions;

    return {
      success: true,
      resolved: true,
      message: `Found ${topCandidate.full_name}${topCandidate.company_name ? ` at ${topCandidate.company_name}` : ''}${topCandidate.title ? ` (${topCandidate.title})` : ''} - your most recent interaction (${topCandidate.last_interaction_description})`,
      search_summary: {
        name_searched: name,
        sources_searched: sourcesSearched,
        total_candidates: totalCandidates,
        search_steps: searchSteps,
      },
      contact: topCandidate,
      candidates: sortedCandidates.slice(0, 5),
    };
  }

  // Multiple candidates with similar recency - need disambiguation
  const topCandidates = sortedCandidates.slice(0, 5);
  const richContextPromises = topCandidates.slice(0, 3).map(async (candidate) => {
    try {
      const richContext = await fetchRichContactContext(candidate, client, userId);
      candidate.crm_url = richContext.crm_url;
      candidate.recent_interactions = richContext.recent_interactions;
    } catch (e) {
      console.error('[ENTITY_RESOLUTION] Error fetching rich context for candidate:', e);
    }
  });

  await Promise.all(richContextPromises);

  return {
    success: true,
    resolved: false,
    message: `Found ${totalCandidates} people named "${firstName}". Which one did you mean?`,
    search_summary: {
      name_searched: name,
      sources_searched: sourcesSearched,
      total_candidates: totalCandidates,
      search_steps: searchSteps,
    },
    disambiguation_needed: true,
    disambiguation_reason: `Multiple contacts with similar recent activity (${topCandidate.full_name} and ${secondCandidate.full_name} both have recent interactions)`,
    candidates: topCandidates,
  };
}
