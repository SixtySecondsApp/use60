import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders } from '../_shared/corsHelper.ts';
import { extractBusinessDomain, matchOrCreateCompany } from '../_shared/companyMatching.ts';

/**
 * Lightweight backfill: Fetches calendar_invitees from Fathom API
 * and populates meeting_attendees + meeting_contacts for meetings
 * that are missing contact data.
 *
 * Much faster than a full fathom-sync re-run since it skips
 * thumbnails, transcripts, summaries, and meeting upserts.
 */

const FATHOM_API_BASE = 'https://api.fathom.ai/external/v1';

interface FathomInvitee {
  name: string;
  email?: string;
  email_domain?: string;
  is_external?: boolean;
}

async function fetchFathomPage(
  token: string,
  cursor?: string
): Promise<{ items: any[]; next_cursor?: string }> {
  const url = cursor
    ? `${FATHOM_API_BASE}/meetings?limit=100&cursor=${cursor}`
    : `${FATHOM_API_BASE}/meetings?limit=100`;

  let resp = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (resp.status === 401) {
    resp = await fetch(url, {
      headers: { 'X-Api-Key': token },
    });
  }

  if (resp.status === 429) {
    // Rate limited — wait and retry
    await new Promise(r => setTimeout(r, 2000));
    return fetchFathomPage(token, cursor);
  }

  if (!resp.ok) {
    throw new Error(`Fathom API ${resp.status}: ${await resp.text()}`);
  }

  const data = await resp.json();
  const items = data.items || data.meetings || data.data || (Array.isArray(data) ? data : []);
  return { items, next_cursor: data.next_cursor };
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: cors });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { org_id, user_id, max_pages, skip_pages } = body;

    if (!org_id) {
      return new Response(JSON.stringify({ error: 'org_id required' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get Fathom token — try org credential first, then user integration
    let token: string | null = null;

    if (user_id) {
      const { data: userInt } = await supabase
        .from('fathom_integrations')
        .select('access_token, token_expires_at')
        .eq('user_id', user_id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (userInt?.access_token) token = userInt.access_token;
    }

    if (!token) {
      const { data: orgCred } = await supabase
        .from('fathom_org_credentials')
        .select('access_token, token_expires_at')
        .eq('org_id', org_id)
        .maybeSingle();

      if (orgCred?.access_token) token = orgCred.access_token;
    }

    if (!token) {
      return new Response(JSON.stringify({ error: 'No valid Fathom token found' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // Get all meetings in our DB with their fathom_recording_id
    const { data: dbMeetings } = await supabase
      .from('meetings')
      .select('id, fathom_recording_id, owner_user_id')
      .eq('org_id', org_id)
      .not('fathom_recording_id', 'is', null);

    if (!dbMeetings?.length) {
      return new Response(JSON.stringify({ success: true, message: 'No meetings found', stats: {} }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // Build lookup: fathom_recording_id → meeting
    const meetingByRecordingId = new Map<string, { id: string; owner_user_id: string }>();
    for (const m of dbMeetings) {
      meetingByRecordingId.set(String(m.fathom_recording_id), {
        id: m.id,
        owner_user_id: m.owner_user_id,
      });
    }

    // Get meetings that already have meeting_contacts
    const { data: existingContacts } = await supabase
      .from('meeting_contacts')
      .select('meeting_id')
      .in('meeting_id', dbMeetings.map(m => m.id));

    const hasContacts = new Set((existingContacts || []).map((c: any) => c.meeting_id));

    // Get org member emails to identify internal participants
    const { data: orgMembers } = await supabase
      .from('organization_members')
      .select('user_id, profiles(email)')
      .eq('organization_id', org_id);

    const internalEmails = new Set<string>();
    orgMembers?.forEach((m: any) => {
      if (m.profiles?.email) internalEmails.add(m.profiles.email.toLowerCase());
    });

    // Also get the org's email domains
    const internalDomains = new Set<string>();
    internalEmails.forEach(email => {
      const domain = email.split('@')[1];
      if (domain) internalDomains.add(domain);
    });

    // Paginate through Fathom API
    let cursor: string | undefined;
    let pagesProcessed = 0;
    let pagesSkipped = 0;
    const pagesToSkip = skip_pages || 0;
    const pageLimit = max_pages || 999;
    let meetingsMatched = 0;
    let contactsCreated = 0;
    let attendeesCreated = 0;
    let alreadyHadContacts = 0;

    const startTime = Date.now();

    // Skip ahead if skip_pages specified
    while (pagesSkipped < pagesToSkip) {
      const skipPage = await fetchFathomPage(token, cursor);
      pagesSkipped++;
      cursor = skipPage.next_cursor;
      if (!cursor) break;
      await new Promise(r => setTimeout(r, 100));
    }

    while (pagesProcessed < pageLimit) {
      // Safety timeout at 250s
      if (Date.now() - startTime > 250_000) {
        console.log(`Timeout safety — stopping after ${pagesProcessed} pages`);
        break;
      }

      const page = await fetchFathomPage(token, cursor);
      pagesProcessed++;

      if (!page.items.length) break;

      for (const call of page.items) {
        const recordingId = String(call.recording_id || call.id);
        const meeting = meetingByRecordingId.get(recordingId);
        if (!meeting) continue;

        meetingsMatched++;

        // Skip if already has contacts
        if (hasContacts.has(meeting.id)) {
          alreadyHadContacts++;
          continue;
        }

        const invitees: FathomInvitee[] = call.calendar_invitees || call.participants || [];
        const externalInvitees = invitees.filter(inv => {
          if (!inv.email) return false;
          const emailLower = inv.email.toLowerCase();
          // Check is_external flag or infer from email domain
          if (inv.is_external === false) return false;
          if (inv.is_external === true) return true;
          // Infer: not in internal emails and domain not internal
          if (internalEmails.has(emailLower)) return false;
          const domain = emailLower.split('@')[1];
          if (domain && internalDomains.has(domain)) return false;
          return true;
        });

        if (externalInvitees.length === 0) continue;

        const userId = meeting.owner_user_id;

        for (const invitee of externalInvitees) {
          if (!invitee.email) continue;

          // Create/match company from email domain
          let companyId: string | null = null;
          try {
            const { company } = await matchOrCreateCompany(
              supabase, invitee.email, userId, invitee.name
            );
            companyId = company?.id || null;
          } catch {
            // Non-fatal
          }

          // Check for existing contact by email
          const { data: existingContact } = await supabase
            .from('contacts')
            .select('id, company_id, owner_id')
            .eq('email', invitee.email)
            .maybeSingle();

          let contactId: string;

          if (existingContact) {
            contactId = existingContact.id;
            // Update company if missing
            if (!existingContact.company_id && companyId) {
              await supabase
                .from('contacts')
                .update({ company_id: companyId })
                .eq('id', contactId);
            }
          } else {
            // Create new contact
            const nameParts = (invitee.name || '').split(' ');
            const firstName = nameParts[0] || '';
            const lastName = nameParts.slice(1).join(' ') || '';

            const { data: newContact, error: contactErr } = await supabase
              .from('contacts')
              .insert({
                email: invitee.email,
                first_name: firstName,
                last_name: lastName,
                owner_id: userId,
                company_id: companyId,
              })
              .select('id')
              .single();

            if (contactErr) {
              // May fail on unique constraint — try to fetch existing
              const { data: retryContact } = await supabase
                .from('contacts')
                .select('id')
                .eq('email', invitee.email)
                .maybeSingle();

              if (retryContact) {
                contactId = retryContact.id;
              } else {
                continue;
              }
            } else {
              contactId = newContact.id;
              contactsCreated++;
            }
          }

          // Create meeting_contacts junction
          const { error: junctionErr } = await supabase
            .from('meeting_contacts')
            .upsert({
              meeting_id: meeting.id,
              contact_id: contactId,
              is_primary: true,
              role: 'attendee',
            }, { onConflict: 'meeting_id,contact_id' });

          if (!junctionErr) {
            hasContacts.add(meeting.id);
          }

          // Create meeting_attendees entry
          const { data: existingAttendee } = await supabase
            .from('meeting_attendees')
            .select('id')
            .eq('meeting_id', meeting.id)
            .eq('email', invitee.email)
            .maybeSingle();

          if (!existingAttendee) {
            await supabase
              .from('meeting_attendees')
              .insert({
                meeting_id: meeting.id,
                name: invitee.name || '',
                email: invitee.email,
                is_external: true,
                role: 'attendee',
              });
            attendeesCreated++;
          }

          // Update meeting primary_contact_id if not set
          await supabase
            .from('meetings')
            .update({ primary_contact_id: contactId, company_id: companyId })
            .eq('id', meeting.id)
            .is('primary_contact_id', null);

          // Only process first external invitee as primary
          break;
        }
      }

      console.log(`Page ${pagesProcessed}: ${page.items.length} items, matched=${meetingsMatched}, new_contacts=${contactsCreated}, new_attendees=${attendeesCreated}`);

      cursor = page.next_cursor;
      if (!cursor) break;

      // Small delay to respect rate limits
      await new Promise(r => setTimeout(r, 200));
    }

    const stats = {
      pages_processed: pagesProcessed,
      meetings_matched: meetingsMatched,
      already_had_contacts: alreadyHadContacts,
      contacts_created: contactsCreated,
      attendees_created: attendeesCreated,
      duration_ms: Date.now() - startTime,
      has_more: !!cursor,
    };

    console.log('Backfill complete:', JSON.stringify(stats));

    return new Response(JSON.stringify({ success: true, stats }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Backfill error:', message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
