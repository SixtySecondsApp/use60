import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders } from '../_shared/corsHelper.ts';

const BATCH_SIZE = 100;

interface ColumnMap {
  [key: string]: string;
}

interface SupabaseClient {
  from: (table: string) => any;
  auth: {
    getUser: () => Promise<{ data: { user: any | null } }>;
  };
}

// Helper to insert rows and cells in batches
async function insertRowsAndCells(
  svc: SupabaseClient,
  tableId: string,
  rows: Array<{ source_type: string; source_id: string }>,
  cellsData: Array<{ column_id: string; value: any }[]>
): Promise<number> {
  if (rows.length === 0) return 0;

  const { data: insertedRows, error: rowError } = await svc
    .from('dynamic_table_rows')
    .insert(rows.map(r => ({ ...r, table_id: tableId })))
    .select('id');

  if (rowError) throw new Error(`Failed to insert rows: ${rowError.message}`);
  if (!insertedRows?.length) return 0;

  const allCells: any[] = [];
  insertedRows.forEach((row: any, idx: number) => {
    const rowCells = cellsData[idx];
    rowCells.forEach(cell => {
      if (cell.value !== null && cell.value !== undefined) {
        allCells.push({
          row_id: row.id,
          column_id: cell.column_id,
          value: String(cell.value)
        });
      }
    });
  });

  if (allCells.length > 0) {
    // Insert in chunks of 500 to avoid payload limits
    for (let i = 0; i < allCells.length; i += 500) {
      const chunk = allCells.slice(i, i + 500);
      const { error: cellError } = await svc
        .from('dynamic_table_cells')
        .insert(chunk);
      if (cellError) throw new Error(`Failed to insert cells: ${cellError.message}`);
    }
  }

  return insertedRows.length;
}

// Resolve owner UUIDs to display names via profiles table
async function resolveOwnerNames(
  svc: SupabaseClient,
  ownerIds: string[]
): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>();
  if (ownerIds.length === 0) return nameMap;

  const { data: profiles } = await svc
    .from('profiles')
    .select('id, first_name, last_name')
    .in('id', ownerIds);

  profiles?.forEach((p: any) => {
    const name = `${p.first_name || ''} ${p.last_name || ''}`.trim();
    if (name) nameMap.set(p.id, name);
  });

  return nameMap;
}

// Extract readable summary from potentially JSON-encoded summary field
function extractSummaryText(summary: any): string | null {
  if (!summary) return null;
  if (typeof summary !== 'string') return null;

  const trimmed = summary.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.markdown_formatted) {
        return parsed.markdown_formatted
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // [text](url) → text
          .replace(/^#{1,6}\s+/gm, '')               // ## Header → Header
          .replace(/\*\*/g, '')                       // **bold** → bold
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      }
      return parsed.summary || parsed.text || parsed.content || trimmed;
    } catch {
      // Not valid JSON, use as-is
    }
  }

  return summary;
}

// Derive meeting outcome from leads.meeting_outcome + meetings table presence.
// The meetings table is the source of truth — if no meeting record exists, it didn't happen.
function deriveMeetingOutcome(lead: any, meeting: any): string | null {
  const outcome = lead.meeting_outcome;

  // If explicitly set to a terminal state, trust it
  if (outcome === 'completed' || outcome === 'no_show' || outcome === 'cancelled' || outcome === 'rescheduled') {
    return outcome;
  }

  // Lead status cancelled overrides
  if (lead.status === 'cancelled') return 'cancelled';

  const meetingStart = meeting?.meeting_start || lead.meeting_start;

  // Meeting exists in meetings table — it happened (or is upcoming)
  if (meeting) {
    if (meetingStart && new Date(meetingStart) > new Date()) return 'scheduled';
    return 'completed';
  }

  // No meeting record — if date has passed, it was a no-show
  if (meetingStart) {
    return new Date(meetingStart) > new Date() ? 'scheduled' : 'no_show';
  }

  return outcome || null;
}

// ============================================================================
// Backfill: Leads
// Scoped by owner_id IN memberUserIds (Supabase Auth, no Clerk)
// ============================================================================
async function backfillLeads(
  svc: SupabaseClient,
  memberUserIds: string[],
  tableId: string,
  colMap: ColumnMap
): Promise<number> {
  let totalInserted = 0;
  let offset = 0;

  const { data: existingRows } = await svc
    .from('dynamic_table_rows')
    .select('source_id')
    .eq('table_id', tableId)
    .eq('source_type', 'app');

  const existingIds = new Set(existingRows?.map((r: any) => r.source_id) || []);

  // Note: leads.meeting_id should be backfilled via SQL migration
  // (matching by owner + meeting_start ±30min). The backfill function
  // relies on meeting_id FK for meeting presence checks.

  while (true) {
    const { data: leads, error } = await svc
      .from('leads')
      .select(`
        id,
        contact_name,
        contact_email,
        domain,
        meeting_title,
        meeting_start,
        meeting_end,
        external_source,
        booking_link_name,
        source_channel,
        utm_source,
        status,
        priority,
        owner_id,
        meeting_id,
        meeting_outcome,
        created_at
      `)
      .in('owner_id', memberUserIds)
      .order('created_at', { ascending: false })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) throw new Error(`Failed to query leads: ${error.message}`);
    if (!leads?.length) break;

    const newLeads = leads.filter((l: any) => !existingIds.has(l.id));
    if (newLeads.length === 0) {
      offset += BATCH_SIZE;
      continue;
    }

    // Resolve owner names
    const ownerIds = [...new Set(newLeads.map((l: any) => l.owner_id).filter(Boolean))];
    const ownerMap = await resolveOwnerNames(svc, ownerIds);

    // Batch-query meetings by direct FK
    const meetingIds = [...new Set(newLeads.map((l: any) => l.meeting_id).filter(Boolean))];
    const meetingMap = new Map<string, any>();
    if (meetingIds.length > 0) {
      const { data: meetings } = await svc
        .from('meetings')
        .select('id, transcript_text, share_url, meeting_start, meeting_end')
        .in('id', meetingIds);
      meetings?.forEach((m: any) => meetingMap.set(m.id, m));
    }


    const rows = newLeads.map((l: any) => ({
      source_type: 'app' as const,
      source_id: l.id
    }));

    const cellsData = newLeads.map((l: any) => {
      const cells: Array<{ column_id: string; value: any }> = [];

      if (colMap.contact_name) cells.push({ column_id: colMap.contact_name, value: l.contact_name });
      if (colMap.contact_email) cells.push({ column_id: colMap.contact_email, value: l.contact_email });
      if (colMap.domain) cells.push({ column_id: colMap.domain, value: l.domain });
      if (colMap.meeting_title) cells.push({ column_id: colMap.meeting_title, value: l.meeting_title });
      if (colMap.meeting_start) cells.push({ column_id: colMap.meeting_start, value: l.meeting_start });
      if (colMap.source) cells.push({ column_id: colMap.source, value: l.booking_link_name || l.source_channel || l.utm_source || l.external_source });
      if (colMap.status) cells.push({ column_id: colMap.status, value: l.status });
      if (colMap.priority) cells.push({ column_id: colMap.priority, value: l.priority });
      if (colMap.owner) {
        cells.push({ column_id: colMap.owner, value: l.owner_id ? (ownerMap.get(l.owner_id) || null) : null });
      }
      // Resolve meeting via FK
      const meeting = l.meeting_id ? meetingMap.get(l.meeting_id) : null;

      const derivedOutcome = deriveMeetingOutcome(l, meeting);
      if (colMap.meeting_outcome) cells.push({ column_id: colMap.meeting_outcome, value: derivedOutcome });
      if (colMap.meeting_held) cells.push({ column_id: colMap.meeting_held, value: derivedOutcome });

      // Meeting recording URL
      if (colMap.meeting_recording_url) {
        cells.push({ column_id: colMap.meeting_recording_url, value: meeting?.share_url || null });
      }

      if (colMap.created_at) cells.push({ column_id: colMap.created_at, value: l.created_at });

      return cells;
    });

    const inserted = await insertRowsAndCells(svc, tableId, rows, cellsData);
    totalInserted += inserted;
    newLeads.forEach((l: any) => existingIds.add(l.id));

    if (leads.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  return totalInserted;
}

// ============================================================================
// Backfill: All Contacts
// Scoped by owner_id IN memberUserIds
// ============================================================================
async function backfillContacts(
  svc: SupabaseClient,
  memberUserIds: string[],
  tableId: string,
  colMap: ColumnMap
): Promise<number> {
  let totalInserted = 0;
  let offset = 0;

  const { data: existingRows } = await svc
    .from('dynamic_table_rows')
    .select('source_id')
    .eq('table_id', tableId)
    .eq('source_type', 'app');

  const existingIds = new Set(existingRows?.map((r: any) => r.source_id) || []);

  while (true) {
    const { data: contacts, error } = await svc
      .from('contacts')
      .select(`
        id,
        first_name,
        last_name,
        email,
        title,
        phone,
        linkedin_url,
        engagement_level,
        created_at,
        company_id,
        companies(name)
      `)
      .in('owner_id', memberUserIds)
      .order('created_at', { ascending: false })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) throw new Error(`Failed to query contacts: ${error.message}`);
    if (!contacts?.length) break;

    const newContacts = contacts.filter((c: any) => !existingIds.has(c.id));
    if (newContacts.length === 0) {
      offset += BATCH_SIZE;
      continue;
    }

    const rows = newContacts.map((c: any) => ({
      source_type: 'app' as const,
      source_id: c.id
    }));

    const cellsData = newContacts.map((c: any) => {
      const cells: Array<{ column_id: string; value: any }> = [];

      if (colMap.first_name) cells.push({ column_id: colMap.first_name, value: c.first_name });
      if (colMap.last_name) cells.push({ column_id: colMap.last_name, value: c.last_name });
      if (colMap.email) cells.push({ column_id: colMap.email, value: c.email });
      if (colMap.title) cells.push({ column_id: colMap.title, value: c.title });
      if (colMap.phone) cells.push({ column_id: colMap.phone, value: c.phone });
      if (colMap.company_name) cells.push({ column_id: colMap.company_name, value: (c.companies as any)?.name });
      if (colMap.linkedin_url) cells.push({ column_id: colMap.linkedin_url, value: c.linkedin_url });
      if (colMap.lifecycle_stage) cells.push({ column_id: colMap.lifecycle_stage, value: c.engagement_level || 'lead' });
      if (colMap.sync_status) cells.push({ column_id: colMap.sync_status, value: 'synced' });

      return cells;
    });

    const inserted = await insertRowsAndCells(svc, tableId, rows, cellsData);
    totalInserted += inserted;
    newContacts.forEach((c: any) => existingIds.add(c.id));

    if (contacts.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  return totalInserted;
}

// ============================================================================
// Backfill: All Companies
// Scoped by owner_id IN memberUserIds
// ============================================================================
async function backfillCompanies(
  svc: SupabaseClient,
  memberUserIds: string[],
  tableId: string,
  colMap: ColumnMap
): Promise<number> {
  let totalInserted = 0;
  let offset = 0;

  const { data: existingRows } = await svc
    .from('dynamic_table_rows')
    .select('source_id')
    .eq('table_id', tableId)
    .eq('source_type', 'app');

  const existingIds = new Set(existingRows?.map((r: any) => r.source_id) || []);

  while (true) {
    const { data: companies, error } = await svc
      .from('companies')
      .select(`
        id,
        name,
        domain,
        website,
        industry,
        size,
        phone,
        description
      `)
      .in('owner_id', memberUserIds)
      .order('created_at', { ascending: false })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) throw new Error(`Failed to query companies: ${error.message}`);
    if (!companies?.length) break;

    const newCompanies = companies.filter((c: any) => !existingIds.has(c.id));
    if (newCompanies.length === 0) {
      offset += BATCH_SIZE;
      continue;
    }

    // Get active contacts count per company
    const companyIds = newCompanies.map((c: any) => c.id);
    const { data: contactCounts } = await svc
      .from('contacts')
      .select('company_id')
      .in('owner_id', memberUserIds)
      .in('company_id', companyIds);

    const countMap = new Map<string, number>();
    contactCounts?.forEach((c: any) => {
      countMap.set(c.company_id, (countMap.get(c.company_id) || 0) + 1);
    });

    const rows = newCompanies.map((c: any) => ({
      source_type: 'app' as const,
      source_id: c.id
    }));

    const cellsData = newCompanies.map((c: any) => {
      const cells: Array<{ column_id: string; value: any }> = [];

      if (colMap.name) cells.push({ column_id: colMap.name, value: c.name });
      if (colMap.domain) cells.push({ column_id: colMap.domain, value: c.domain });
      if (colMap.website) cells.push({ column_id: colMap.website, value: c.website });
      if (colMap.industry) cells.push({ column_id: colMap.industry, value: c.industry });
      if (colMap.company_size) cells.push({ column_id: colMap.company_size, value: c.size });
      if (colMap.phone) cells.push({ column_id: colMap.phone, value: c.phone });
      if (colMap.description) cells.push({ column_id: colMap.description, value: c.description });
      if (colMap.active_contacts_count) {
        cells.push({ column_id: colMap.active_contacts_count, value: countMap.get(c.id) || 0 });
      }

      return cells;
    });

    const inserted = await insertRowsAndCells(svc, tableId, rows, cellsData);
    totalInserted += inserted;
    newCompanies.forEach((c: any) => existingIds.add(c.id));

    if (companies.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  return totalInserted;
}

// ============================================================================
// Backfill: Meetings
// Scoped by org_id UUID. Contact resolution chain (7 steps):
//   1. meeting_contacts junction → contacts table (best: Fathom-resolved)
//   2. ALL meeting_attendees with emails (prefer external)
//   3. primary_contact_id FK → contacts table
//   4. leads.meeting_id FK (direct link)
//   5. leads matched by email + meeting time overlap
//   6. Name-only attendees → search contacts by full_name (no email required)
//   7. Parse meeting title as contact name → search contacts (last resort)
// ============================================================================
async function backfillMeetings(
  svc: SupabaseClient,
  orgId: string,
  memberUserIds: string[],
  tableId: string,
  colMap: ColumnMap
): Promise<number> {
  let totalInserted = 0;
  let offset = 0;

  const { data: existingRows } = await svc
    .from('dynamic_table_rows')
    .select('source_id')
    .eq('table_id', tableId)
    .eq('source_type', 'app');

  const existingIds = new Set(existingRows?.map((r: any) => r.source_id) || []);

  while (true) {
    // Query meetings with company join AND contact join via primary_contact_id
    const { data: meetings, error } = await svc
      .from('meetings')
      .select(`
        id,
        title,
        start_time,
        meeting_start,
        meeting_end,
        duration_minutes,
        company_id,
        primary_contact_id,
        owner_email,
        summary,
        sentiment_score,
        owner_user_id,
        share_url,
        transcript_text,
        companies!meetings_company_id_fkey(name),
        contacts!meetings_primary_contact_id_fkey(first_name, last_name, email, company_id)
      `)
      .eq('org_id', orgId)
      .order('meeting_start', { ascending: false })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) throw new Error(`Failed to query meetings: ${error.message}`);
    if (!meetings?.length) break;

    const newMeetings = meetings.filter((m: any) => !existingIds.has(m.id));
    if (newMeetings.length === 0) {
      offset += BATCH_SIZE;
      continue;
    }

    // --- Contact resolution chain (5 steps) ---
    const meetingIds = newMeetings.map((m: any) => m.id);
    const contactMap = new Map<string, { name: string; email: string; company: string | null }>();
    const leadSourceMap = new Map<string, string>();

    // Step 1: meeting_contacts junction → contacts table (Fathom-resolved, best quality)
    const { data: junctionContacts } = await svc
      .from('meeting_contacts')
      .select('meeting_id, is_primary, contacts(first_name, last_name, email, company_id, companies(name))')
      .in('meeting_id', meetingIds);

    // Group by meeting_id, prefer primary contact
    const junctionByMeeting = new Map<string, any[]>();
    junctionContacts?.forEach((jc: any) => {
      const list = junctionByMeeting.get(jc.meeting_id) || [];
      list.push(jc);
      junctionByMeeting.set(jc.meeting_id, list);
    });

    for (const [meetingId, junctions] of junctionByMeeting) {
      // Pick primary contact first, otherwise first external contact
      const primary = junctions.find((j: any) => j.is_primary)?.contacts;
      const fallback = junctions[0]?.contacts;
      const contact = primary || fallback;
      if (contact?.first_name || contact?.last_name || contact?.email) {
        const name = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
        const companyName = contact.companies?.name || null;
        contactMap.set(meetingId, { name, email: contact.email || '', company: companyName });
      }
    }

    // Step 2: ALL meeting_attendees with emails (not just is_external)
    const needStep2 = meetingIds.filter((id: string) => !contactMap.has(id));
    if (needStep2.length > 0) {
      const { data: attendees } = await svc
        .from('meeting_attendees')
        .select('meeting_id, name, email, is_external')
        .in('meeting_id', needStep2)
        .not('email', 'is', null);

      // Prefer external attendees (they're the prospect), but use any with email
      const attendeesByMeeting = new Map<string, any[]>();
      attendees?.forEach((a: any) => {
        if (!a.email) return;
        const list = attendeesByMeeting.get(a.meeting_id) || [];
        list.push(a);
        attendeesByMeeting.set(a.meeting_id, list);
      });

      for (const [meetingId, atts] of attendeesByMeeting) {
        if (contactMap.has(meetingId)) continue;
        // Sort: external first, then by name presence
        atts.sort((a: any, b: any) => (b.is_external ? 1 : 0) - (a.is_external ? 1 : 0));
        const best = atts[0];
        if (best) {
          contactMap.set(meetingId, { name: best.name || '', email: best.email || '', company: null });
        }
      }
    }

    // Step 3: primary_contact_id FK (already joined on meetings query)
    for (const m of newMeetings) {
      if (contactMap.has(m.id)) continue;
      const contact = m.contacts as any;
      if (contact?.first_name || contact?.last_name || contact?.email) {
        const name = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
        contactMap.set(m.id, { name, email: contact.email || '', company: null });
      }
    }

    // Step 4: leads with meeting_id FK (direct link)
    const needStep4 = meetingIds.filter((id: string) => !contactMap.has(id));
    if (needStep4.length > 0) {
      const { data: linkedLeads } = await svc
        .from('leads')
        .select('meeting_id, contact_name, contact_email, domain, booking_link_name, source_channel, utm_source')
        .in('meeting_id', needStep4)
        .not('meeting_id', 'is', null);

      linkedLeads?.forEach((l: any) => {
        if (l.meeting_id && !contactMap.has(l.meeting_id) && (l.contact_name || l.contact_email)) {
          contactMap.set(l.meeting_id, {
            name: l.contact_name || '',
            email: l.contact_email || '',
            company: null
          });
        }
      });

      // Build lead source map for Meetings lead_source column
      linkedLeads?.forEach((l: any) => {
        if (l.meeting_id && !leadSourceMap.has(l.meeting_id)) {
          const source = l.booking_link_name || l.source_channel || l.utm_source || null;
          if (source) leadSourceMap.set(l.meeting_id, source);
        }
      });
    }

    // Step 5: Match leads by email overlap with meeting_attendees
    // For meetings still without contacts, collect all attendee emails and match against leads
    const needStep5 = meetingIds.filter((id: string) => !contactMap.has(id));
    if (needStep5.length > 0) {
      // Get all attendee emails for remaining meetings
      const { data: remainingAttendees } = await svc
        .from('meeting_attendees')
        .select('meeting_id, email')
        .in('meeting_id', needStep5)
        .not('email', 'is', null);

      const emailsByMeeting = new Map<string, string[]>();
      remainingAttendees?.forEach((a: any) => {
        if (!a.email) return;
        const list = emailsByMeeting.get(a.meeting_id) || [];
        list.push(a.email.toLowerCase());
        emailsByMeeting.set(a.meeting_id, list);
      });

      // Collect all unique emails across remaining meetings
      const allEmails = [...new Set([...emailsByMeeting.values()].flat())];
      if (allEmails.length > 0) {
        // Find leads matching those emails
        const { data: matchedLeads } = await svc
          .from('leads')
          .select('id, contact_name, contact_email, meeting_start, domain')
          .in('owner_id', memberUserIds)
          .in('contact_email', allEmails);

        if (matchedLeads?.length) {
          // Build email → lead lookup
          const leadsByEmail = new Map<string, any[]>();
          matchedLeads.forEach((l: any) => {
            if (!l.contact_email) return;
            const key = l.contact_email.toLowerCase();
            const list = leadsByEmail.get(key) || [];
            list.push(l);
            leadsByEmail.set(key, list);
          });

          // Match meetings to leads by email, prefer closest meeting_start overlap
          for (const [meetingId, emails] of emailsByMeeting) {
            if (contactMap.has(meetingId)) continue;
            const meeting = newMeetings.find((m: any) => m.id === meetingId);
            const meetingTime = meeting?.meeting_start ? new Date(meeting.meeting_start).getTime() : null;

            for (const email of emails) {
              const candidates = leadsByEmail.get(email);
              if (!candidates?.length) continue;

              // Pick lead with closest meeting_start (within 24h window)
              let bestLead = candidates[0];
              if (meetingTime && candidates.length > 1) {
                let bestDiff = Infinity;
                for (const c of candidates) {
                  if (c.meeting_start) {
                    const diff = Math.abs(new Date(c.meeting_start).getTime() - meetingTime);
                    if (diff < bestDiff) { bestDiff = diff; bestLead = c; }
                  }
                }
              }

              contactMap.set(meetingId, {
                name: bestLead.contact_name || '',
                email: bestLead.contact_email || '',
                company: null
              });
              break; // Found match for this meeting
            }
          }
        }
      }
    }

    // Step 6: Name-only attendees → search contacts by full_name
    // For meetings with attendees that have names but no emails
    const needStep6 = meetingIds.filter((id: string) => !contactMap.has(id));
    if (needStep6.length > 0) {
      const { data: nameOnlyAttendees } = await svc
        .from('meeting_attendees')
        .select('meeting_id, name, email, is_external')
        .in('meeting_id', needStep6);

      // Group by meeting, prefer external attendees, exclude owner
      const namesByMeeting = new Map<string, string[]>();
      nameOnlyAttendees?.forEach((a: any) => {
        if (!a.name?.trim()) return;
        const meeting = newMeetings.find((m: any) => m.id === a.meeting_id);
        // Skip if this attendee's email matches the meeting owner
        if (a.email && meeting?.owner_email && a.email.toLowerCase() === meeting.owner_email.toLowerCase()) return;
        const list = namesByMeeting.get(a.meeting_id) || [];
        // Put external attendees first
        if (a.is_external) list.unshift(a.name.trim());
        else list.push(a.name.trim());
        namesByMeeting.set(a.meeting_id, list);
      });

      // Collect all unique names to search
      const allNames = [...new Set([...namesByMeeting.values()].flat())];
      if (allNames.length > 0) {
        // Search contacts by full_name (exact case-insensitive match)
        const { data: nameMatchedContacts } = await svc
          .from('contacts')
          .select('id, first_name, last_name, email, company_id, companies(name)')
          .in('owner_id', memberUserIds)
          .or(allNames.map(n => {
            // Try to split "First Last" and match first_name + last_name
            const parts = n.split(/\s+/);
            if (parts.length >= 2) {
              const first = parts[0];
              const last = parts.slice(1).join(' ');
              return `and(first_name.ilike.${first},last_name.ilike.${last})`;
            }
            return `first_name.ilike.${n}`;
          }).join(','));

        if (nameMatchedContacts?.length) {
          // Build name → contact lookup (lowercase full name)
          const contactsByName = new Map<string, any>();
          nameMatchedContacts.forEach((c: any) => {
            const fullName = `${c.first_name || ''} ${c.last_name || ''}`.trim().toLowerCase();
            if (fullName && !contactsByName.has(fullName)) {
              contactsByName.set(fullName, c);
            }
          });

          // Match meetings to contacts by attendee name
          for (const [meetingId, names] of namesByMeeting) {
            if (contactMap.has(meetingId)) continue;
            for (const name of names) {
              const contact = contactsByName.get(name.toLowerCase());
              if (contact) {
                const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
                const companyName = (contact.companies as any)?.name || null;
                contactMap.set(meetingId, {
                  name: fullName,
                  email: contact.email || '',
                  company: companyName
                });
                break;
              }
            }
          }
        }
      }
    }

    // Step 7: Parse meeting title as contact name (last resort)
    // Titles like "Alex William", "Amy Lawson" are often the external contact's name
    const needStep7 = meetingIds.filter((id: string) => !contactMap.has(id));
    if (needStep7.length > 0) {
      // Filter to titles that look like person names (2-3 capitalized words, no special chars)
      const titleCandidates: Array<{ meetingId: string; title: string }> = [];
      for (const m of newMeetings) {
        if (contactMap.has(m.id)) continue;
        if (!m.title) continue;
        const title = m.title.trim();
        // Match "FirstName LastName" or "FirstName MiddleName LastName"
        // Exclude common non-name patterns
        if (/^[A-Z][a-z]+(\s+[A-Z][a-z]+){1,2}$/.test(title) &&
            !/^(Dev |Test |Internal |Friday |Monday |Weekly |Daily |Team |Sprint |Standup|Stand Up)/i.test(title)) {
          titleCandidates.push({ meetingId: m.id, title });
        }
      }

      if (titleCandidates.length > 0) {
        // Search contacts by matching first + last name from title
        const { data: titleMatchedContacts } = await svc
          .from('contacts')
          .select('id, first_name, last_name, email, company_id, companies(name)')
          .in('owner_id', memberUserIds)
          .or(titleCandidates.map(tc => {
            const parts = tc.title.split(/\s+/);
            const first = parts[0];
            const last = parts.slice(1).join(' ');
            return `and(first_name.ilike.${first},last_name.ilike.${last})`;
          }).join(','));

        if (titleMatchedContacts?.length) {
          const contactsByName = new Map<string, any>();
          titleMatchedContacts.forEach((c: any) => {
            const fullName = `${c.first_name || ''} ${c.last_name || ''}`.trim().toLowerCase();
            if (fullName && !contactsByName.has(fullName)) {
              contactsByName.set(fullName, c);
            }
          });

          for (const tc of titleCandidates) {
            if (contactMap.has(tc.meetingId)) continue;
            const contact = contactsByName.get(tc.title.toLowerCase());
            if (contact) {
              const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
              const companyName = (contact.companies as any)?.name || null;
              contactMap.set(tc.meetingId, {
                name: fullName,
                email: contact.email || '',
                company: companyName
              });
            }
          }
        }

        // For title candidates with NO contact match, still use the title as contact name
        // (it's better than nothing — the user named the calendar event with the person's name)
        for (const tc of titleCandidates) {
          if (contactMap.has(tc.meetingId)) continue;
          contactMap.set(tc.meetingId, {
            name: tc.title,
            email: '',
            company: null
          });
        }
      }
    }

    // --- Company resolution chain ---
    // For meetings without a company, try to get it from:
    //   1. Direct company FK (already joined)
    //   2. Contact's company from meeting_contacts junction (resolved in step 1)
    //   3. Contact's company_id from primary_contact_id FK
    const companyIdSet = new Set<string>();
    const meetingsNeedingCompany: any[] = [];
    for (const m of newMeetings) {
      const directCompany = (m.companies as any)?.name;
      if (!directCompany) {
        // Check if step 1 already resolved company
        const resolved = contactMap.get(m.id);
        if (resolved?.company) continue; // Already have company name from junction

        const contact = m.contacts as any;
        if (contact?.company_id) {
          companyIdSet.add(contact.company_id);
          meetingsNeedingCompany.push({ meetingId: m.id, companyId: contact.company_id });
        }
      }
    }

    const companyNameMap = new Map<string, string>();
    if (companyIdSet.size > 0) {
      const { data: companies } = await svc
        .from('companies')
        .select('id, name')
        .in('id', [...companyIdSet]);
      companies?.forEach((c: any) => {
        if (c.name) companyNameMap.set(c.id, c.name);
      });
    }

    // For meetings still without company, try resolving from contact email domain
    for (const m of newMeetings) {
      const resolved = contactMap.get(m.id);
      if (resolved?.company) continue;
      const directCompany = (m.companies as any)?.name;
      if (directCompany) continue;

      // Check if we have an email to extract domain from
      const email = resolved?.email;
      if (email && email.includes('@')) {
        const domain = email.split('@')[1]?.toLowerCase();
        if (domain && !['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'live.com', 'me.com', 'msn.com', 'protonmail.com'].includes(domain)) {
          // Search companies by domain
          const { data: domainCompanies } = await svc
            .from('companies')
            .select('name')
            .eq('domain', domain)
            .limit(1)
            .maybeSingle();

          if (domainCompanies?.name && resolved) {
            resolved.company = domainCompanies.name;
          }
        }
      }
    }

    // Resolve owner names
    const ownerIds = [...new Set(newMeetings.map((m: any) => m.owner_user_id).filter(Boolean))];
    const ownerMap = await resolveOwnerNames(svc, ownerIds);

    // --- Build rows & cells ---
    const rows = newMeetings.map((m: any) => ({
      source_type: 'app' as const,
      source_id: m.id
    }));

    const cellsData = newMeetings.map((m: any) => {
      const cells: Array<{ column_id: string; value: any }> = [];
      const contactInfo = contactMap.get(m.id);

      if (colMap.title) cells.push({ column_id: colMap.title, value: m.title });

      // Meeting date: meeting_start (start_time is null on all records)
      if (colMap.meeting_date) {
        cells.push({ column_id: colMap.meeting_date, value: m.meeting_start || m.start_time || null });
      }

      // Duration
      if (colMap.duration_minutes) {
        let duration = m.duration_minutes;
        if (!duration && m.meeting_start && m.meeting_end) {
          duration = Math.round(
            (new Date(m.meeting_end).getTime() - new Date(m.meeting_start).getTime()) / 60000
          );
        }
        cells.push({ column_id: colMap.duration_minutes, value: duration || null });
      }

      // Contact name
      if (colMap.contact_name) {
        cells.push({ column_id: colMap.contact_name, value: contactInfo?.name || null });
      }

      // Contact email
      if (colMap.contact_email) {
        cells.push({ column_id: colMap.contact_email, value: contactInfo?.email || null });
      }

      // Company: direct FK → junction contact's company → primary_contact's company
      if (colMap.contact_company) {
        let companyName = (m.companies as any)?.name || null;
        if (!companyName) {
          // Check if junction resolution (step 1) found a company
          companyName = contactInfo?.company || null;
        }
        if (!companyName) {
          const contact = m.contacts as any;
          if (contact?.company_id) {
            companyName = companyNameMap.get(contact.company_id) || null;
          }
        }
        cells.push({ column_id: colMap.contact_company, value: companyName });
      }

      // Summary: extract readable text from JSON
      if (colMap.summary) {
        cells.push({ column_id: colMap.summary, value: extractSummaryText(m.summary) });
      }

      // Sentiment: convert numeric score to label
      if (colMap.sentiment) {
        let sentiment = 'Neutral';
        if (m.sentiment_score !== null && m.sentiment_score !== undefined) {
          if (m.sentiment_score < -0.3) sentiment = 'Negative';
          else if (m.sentiment_score > 0.7) sentiment = 'Very Positive';
          else if (m.sentiment_score > 0.3) sentiment = 'Positive';
        }
        cells.push({ column_id: colMap.sentiment, value: sentiment });
      }

      // Owner
      if (colMap.owner) {
        cells.push({ column_id: colMap.owner, value: m.owner_user_id ? (ownerMap.get(m.owner_user_id) || null) : null });
      }

      if (colMap.recording_url) cells.push({ column_id: colMap.recording_url, value: m.share_url });
      if (colMap.transcript) cells.push({ column_id: colMap.transcript, value: m.transcript_text });
      if (colMap.lead_source) {
        cells.push({ column_id: colMap.lead_source, value: leadSourceMap.get(m.id) || 'Direct' });
      }

      return cells;
    });

    const inserted = await insertRowsAndCells(svc, tableId, rows, cellsData);
    totalInserted += inserted;
    newMeetings.forEach((m: any) => existingIds.add(m.id));

    if (meetings.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  return totalInserted;
}

// ============================================================================
// Backfill: Clients
// Scoped by owner_id IN memberUserIds
// ============================================================================
async function backfillClients(
  svc: SupabaseClient,
  memberUserIds: string[],
  tableId: string,
  colMap: ColumnMap
): Promise<number> {
  let totalInserted = 0;
  let offset = 0;

  const { data: existingRows } = await svc
    .from('dynamic_table_rows')
    .select('source_id')
    .eq('table_id', tableId)
    .eq('source_type', 'app');

  const existingIds = new Set(existingRows?.map((r: any) => r.source_id) || []);

  while (true) {
    const { data: clients, error } = await svc
      .from('clients')
      .select(`
        id,
        company_name,
        contact_name,
        contact_email,
        subscription_amount,
        status,
        subscription_start_date,
        owner_id,
        deal_id,
        created_at
      `)
      .in('owner_id', memberUserIds)
      .order('created_at', { ascending: false })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) throw new Error(`Failed to query clients: ${error.message}`);
    if (!clients?.length) break;

    const newClients = clients.filter((c: any) => !existingIds.has(c.id));
    if (newClients.length === 0) {
      offset += BATCH_SIZE;
      continue;
    }

    // Batch-resolve deal names and lead_source_channel
    const dealIds = [...new Set(newClients.map((c: any) => c.deal_id).filter(Boolean))];
    const dealMap = new Map<string, { name: string; source: string | null }>();
    if (dealIds.length > 0) {
      const { data: deals } = await svc
        .from('deals')
        .select('id, name, lead_source_channel')
        .in('id', dealIds);
      deals?.forEach((d: any) => {
        dealMap.set(d.id, { name: d.name, source: d.lead_source_channel || null });
      });
    }

    // Resolve owner names
    const ownerIds = [...new Set(newClients.map((c: any) => c.owner_id).filter(Boolean))];
    const ownerMap = await resolveOwnerNames(svc, ownerIds);

    const rows = newClients.map((c: any) => ({
      source_type: 'app' as const,
      source_id: c.id
    }));

    const cellsData = newClients.map((c: any) => {
      const cells: Array<{ column_id: string; value: any }> = [];
      const deal = c.deal_id ? dealMap.get(c.deal_id) : null;

      if (colMap.company_name) cells.push({ column_id: colMap.company_name, value: c.company_name });
      if (colMap.contact_name) cells.push({ column_id: colMap.contact_name, value: c.contact_name });
      if (colMap.contact_email) cells.push({ column_id: colMap.contact_email, value: c.contact_email });
      if (colMap.deal_name) cells.push({ column_id: colMap.deal_name, value: deal?.name || null });
      if (colMap.deal_value) cells.push({ column_id: colMap.deal_value, value: c.subscription_amount });
      if (colMap.status) cells.push({ column_id: colMap.status, value: c.status });
      if (colMap.subscription_start) cells.push({ column_id: colMap.subscription_start, value: c.subscription_start_date });
      if (colMap.owner) {
        cells.push({ column_id: colMap.owner, value: c.owner_id ? (ownerMap.get(c.owner_id) || null) : null });
      }
      if (colMap.lead_source) cells.push({ column_id: colMap.lead_source, value: deal?.source || null });
      if (colMap.created_at) cells.push({ column_id: colMap.created_at, value: c.created_at });

      return cells;
    });

    const inserted = await insertRowsAndCells(svc, tableId, rows, cellsData);
    totalInserted += inserted;
    newClients.forEach((c: any) => existingIds.add(c.id));

    if (clients.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  return totalInserted;
}

// ============================================================================
// Backfill: CRM Contacts (crm_contact_index → "All Contacts")
// Only "active" contacts:
//   - has_active_deal = true
//   - OR crm_updated_at within last 90 days
// Deduplicates against app rows already in the table by email.
// ============================================================================
async function backfillCrmContacts(
  svc: SupabaseClient,
  orgId: string,
  tableId: string,
  colMap: ColumnMap
): Promise<number> {
  let totalInserted = 0;
  let offset = 0;

  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  // Clear existing CRM rows for this table
  await svc
    .from('dynamic_table_rows')
    .delete()
    .eq('table_id', tableId)
    .in('source_type', ['hubspot', 'attio']);

  // Collect emails already present as app rows to avoid duplicates
  const appEmails = new Set<string>();
  if (colMap.email) {
    const { data: appCells } = await svc
      .from('dynamic_table_cells')
      .select('value, row_id')
      .eq('column_id', colMap.email)
      .not('value', 'is', null);

    // Only count cells belonging to rows in this table
    if (appCells?.length) {
      const { data: tableRows } = await svc
        .from('dynamic_table_rows')
        .select('id')
        .eq('table_id', tableId)
        .eq('source_type', 'app');

      const tableRowIds = new Set(tableRows?.map((r: any) => r.id) || []);
      appCells.forEach((c: any) => {
        if (tableRowIds.has(c.row_id) && c.value) {
          appEmails.add(String(c.value).toLowerCase());
        }
      });
    }
  }

  while (true) {
    const { data: contacts, error } = await svc
      .from('crm_contact_index')
      .select(`
        crm_source,
        crm_record_id,
        first_name,
        last_name,
        email,
        phone,
        company_name,
        job_title,
        lifecycle_stage,
        lead_status,
        has_active_deal,
        crm_updated_at
      `)
      .eq('org_id', orgId)
      .or(`has_active_deal.eq.true,crm_updated_at.gte.${cutoff}`)
      .order('crm_updated_at', { ascending: false })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) throw new Error(`Failed to query CRM contacts: ${error.message}`);
    if (!contacts?.length) break;

    // Skip contacts whose email already exists as an app row
    const deduped = contacts.filter((c: any) => {
      if (!c.email) return true; // keep contacts without email (can't dedup)
      return !appEmails.has(String(c.email).toLowerCase());
    });

    if (deduped.length > 0) {
      const rows = deduped.map((c: any) => ({
        source_type: c.crm_source,
        source_id: c.crm_record_id,
      }));

      const cellsData = deduped.map((c: any) => {
        const cells: Array<{ column_id: string; value: any }> = [];

        if (colMap.first_name) cells.push({ column_id: colMap.first_name, value: c.first_name });
        if (colMap.last_name) cells.push({ column_id: colMap.last_name, value: c.last_name });
        if (colMap.email) cells.push({ column_id: colMap.email, value: c.email });
        if (colMap.title) cells.push({ column_id: colMap.title, value: c.job_title });
        if (colMap.phone) cells.push({ column_id: colMap.phone, value: c.phone });
        if (colMap.company_name) cells.push({ column_id: colMap.company_name, value: c.company_name });
        if (colMap.lifecycle_stage) {
          cells.push({ column_id: colMap.lifecycle_stage, value: c.lifecycle_stage || c.lead_status || 'lead' });
        }
        if (colMap.sync_status) cells.push({ column_id: colMap.sync_status, value: 'synced' });

        return cells;
      });

      const inserted = await insertRowsAndCells(svc, tableId, rows, cellsData);
      totalInserted += inserted;
    }

    if (contacts.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  return totalInserted;
}

// ============================================================================
// Backfill: CRM Companies (crm_company_index → "All Companies")
// Only "active" companies:
//   - crm_updated_at within last 90 days
//   - OR has contacts with active deals (via crm_contact_index)
// Deduplicates against app rows by domain.
// ============================================================================
async function backfillCrmCompanies(
  svc: SupabaseClient,
  orgId: string,
  tableId: string,
  colMap: ColumnMap
): Promise<number> {
  let totalInserted = 0;
  let offset = 0;

  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  // Clear existing CRM rows for this table
  await svc
    .from('dynamic_table_rows')
    .delete()
    .eq('table_id', tableId)
    .in('source_type', ['hubspot', 'attio']);

  // Collect domains already present as app rows to avoid duplicates
  const appDomains = new Set<string>();
  if (colMap.domain) {
    const { data: appCells } = await svc
      .from('dynamic_table_cells')
      .select('value, row_id')
      .eq('column_id', colMap.domain)
      .not('value', 'is', null);

    if (appCells?.length) {
      const { data: tableRows } = await svc
        .from('dynamic_table_rows')
        .select('id')
        .eq('table_id', tableId)
        .eq('source_type', 'app');

      const tableRowIds = new Set(tableRows?.map((r: any) => r.id) || []);
      appCells.forEach((c: any) => {
        if (tableRowIds.has(c.row_id) && c.value) {
          appDomains.add(String(c.value).toLowerCase());
        }
      });
    }
  }

  // Find company domains that have contacts with active deals
  const { data: activeDealCompanies } = await svc
    .from('crm_contact_index')
    .select('company_domain')
    .eq('org_id', orgId)
    .eq('has_active_deal', true)
    .not('company_domain', 'is', null);

  const activeDealDomains = new Set<string>();
  activeDealCompanies?.forEach((c: any) => {
    if (c.company_domain) activeDealDomains.add(String(c.company_domain).toLowerCase());
  });

  while (true) {
    // Fetch companies updated in last 90 days (we'll also include deal-associated ones below)
    const { data: companies, error } = await svc
      .from('crm_company_index')
      .select(`
        crm_source,
        crm_record_id,
        name,
        domain,
        industry,
        employee_count,
        annual_revenue,
        crm_updated_at
      `)
      .eq('org_id', orgId)
      .gte('crm_updated_at', cutoff)
      .order('crm_updated_at', { ascending: false })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) throw new Error(`Failed to query CRM companies: ${error.message}`);
    if (!companies?.length) break;

    // Include companies with active-deal contacts even if not recently updated
    // (handled by the gte filter above catching most; we'll do a second pass below)

    // Skip companies whose domain already exists as an app row
    const deduped = companies.filter((c: any) => {
      if (!c.domain) return true;
      return !appDomains.has(String(c.domain).toLowerCase());
    });

    if (deduped.length > 0) {
      const rows = deduped.map((c: any) => ({
        source_type: c.crm_source,
        source_id: c.crm_record_id,
      }));

      const cellsData = deduped.map((c: any) => {
        const cells: Array<{ column_id: string; value: any }> = [];

        if (colMap.name) cells.push({ column_id: colMap.name, value: c.name });
        if (colMap.domain) cells.push({ column_id: colMap.domain, value: c.domain });
        if (colMap.industry) cells.push({ column_id: colMap.industry, value: c.industry });
        if (colMap.company_size) cells.push({ column_id: colMap.company_size, value: c.employee_count });
        if (colMap.revenue) cells.push({ column_id: colMap.revenue, value: c.annual_revenue });

        return cells;
      });

      const inserted = await insertRowsAndCells(svc, tableId, rows, cellsData);
      totalInserted += inserted;
    }

    if (companies.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  // Second pass: companies with active-deal contacts that weren't caught by the 90-day filter
  if (activeDealDomains.size > 0) {
    const insertedCrmIds = new Set<string>();

    // Collect CRM record IDs already inserted
    const { data: existingCrmRows } = await svc
      .from('dynamic_table_rows')
      .select('source_id')
      .eq('table_id', tableId)
      .in('source_type', ['hubspot', 'attio']);

    existingCrmRows?.forEach((r: any) => insertedCrmIds.add(r.source_id));

    // Query companies by active-deal domains, batch by 50
    const domainBatches: string[][] = [];
    const allDomains = [...activeDealDomains];
    for (let i = 0; i < allDomains.length; i += 50) {
      domainBatches.push(allDomains.slice(i, i + 50));
    }

    for (const batch of domainBatches) {
      const { data: dealCompanies, error } = await svc
        .from('crm_company_index')
        .select(`
          crm_source,
          crm_record_id,
          name,
          domain,
          industry,
          employee_count,
          annual_revenue
        `)
        .eq('org_id', orgId)
        .in('domain', batch);

      if (error || !dealCompanies?.length) continue;

      const newCompanies = dealCompanies.filter((c: any) => {
        if (insertedCrmIds.has(c.crm_record_id)) return false;
        if (c.domain && appDomains.has(String(c.domain).toLowerCase())) return false;
        return true;
      });

      if (newCompanies.length === 0) continue;

      const rows = newCompanies.map((c: any) => ({
        source_type: c.crm_source,
        source_id: c.crm_record_id,
      }));

      const cellsData = newCompanies.map((c: any) => {
        const cells: Array<{ column_id: string; value: any }> = [];

        if (colMap.name) cells.push({ column_id: colMap.name, value: c.name });
        if (colMap.domain) cells.push({ column_id: colMap.domain, value: c.domain });
        if (colMap.industry) cells.push({ column_id: colMap.industry, value: c.industry });
        if (colMap.company_size) cells.push({ column_id: colMap.company_size, value: c.employee_count });
        if (colMap.revenue) cells.push({ column_id: colMap.revenue, value: c.annual_revenue });

        return cells;
      });

      const inserted = await insertRowsAndCells(svc, tableId, rows, cellsData);
      totalInserted += inserted;
      newCompanies.forEach((c: any) => insertedCrmIds.add(c.crm_record_id));
    }
  }

  return totalInserted;
}

// ============================================================================
// Backfill: Waitlist Signups
// Global table (not org-scoped) — pulls from meetings_waitlist
// ============================================================================
async function backfillWaitlist(
  svc: SupabaseClient,
  tableId: string,
  colMap: ColumnMap
): Promise<number> {
  let totalInserted = 0;
  let offset = 0;

  const { data: existingRows } = await svc
    .from('dynamic_table_rows')
    .select('source_id')
    .eq('table_id', tableId)
    .eq('source_type', 'app');

  const existingIds = new Set(existingRows?.map((r: any) => r.source_id) || []);

  while (true) {
    const { data: signups, error } = await svc
      .from('meetings_waitlist')
      .select(`
        id,
        full_name,
        email,
        company_name,
        status,
        signup_position,
        total_points,
        referral_code,
        referral_count,
        referred_by_code,
        crm_tool,
        meeting_recorder_tool,
        task_manager_tool,
        signup_source,
        utm_source,
        utm_campaign,
        registration_url,
        granted_access_at,
        converted_at,
        created_at
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) throw new Error(`Failed to query meetings_waitlist: ${error.message}`);
    if (!signups?.length) break;

    const newSignups = signups.filter((s: any) => !existingIds.has(s.id));
    if (newSignups.length === 0) {
      offset += BATCH_SIZE;
      continue;
    }

    const rows = newSignups.map((s: any) => ({
      source_type: 'app' as const,
      source_id: s.id
    }));

    const cellsData = newSignups.map((s: any) => {
      const cells: Array<{ column_id: string; value: any }> = [];

      if (colMap.full_name) cells.push({ column_id: colMap.full_name, value: s.full_name });
      if (colMap.email) cells.push({ column_id: colMap.email, value: s.email });
      if (colMap.company_name) cells.push({ column_id: colMap.company_name, value: s.company_name });
      if (colMap.status) cells.push({ column_id: colMap.status, value: s.status });
      if (colMap.signup_position) cells.push({ column_id: colMap.signup_position, value: s.signup_position });
      if (colMap.total_points) cells.push({ column_id: colMap.total_points, value: s.total_points });
      if (colMap.referral_code) cells.push({ column_id: colMap.referral_code, value: s.referral_code });
      if (colMap.referral_count) cells.push({ column_id: colMap.referral_count, value: s.referral_count });
      if (colMap.referred_by) cells.push({ column_id: colMap.referred_by, value: s.referred_by_code });
      if (colMap.crm_tool) cells.push({ column_id: colMap.crm_tool, value: s.crm_tool });
      if (colMap.meeting_recorder_tool) cells.push({ column_id: colMap.meeting_recorder_tool, value: s.meeting_recorder_tool });
      if (colMap.task_manager_tool) cells.push({ column_id: colMap.task_manager_tool, value: s.task_manager_tool });
      if (colMap.signup_source) cells.push({ column_id: colMap.signup_source, value: s.signup_source });
      if (colMap.utm_source) cells.push({ column_id: colMap.utm_source, value: s.utm_source });
      if (colMap.utm_campaign) cells.push({ column_id: colMap.utm_campaign, value: s.utm_campaign });
      if (colMap.registration_url) cells.push({ column_id: colMap.registration_url, value: s.registration_url });
      if (colMap.granted_access_at) cells.push({ column_id: colMap.granted_access_at, value: s.granted_access_at });
      if (colMap.converted_at) cells.push({ column_id: colMap.converted_at, value: s.converted_at });
      if (colMap.created_at) cells.push({ column_id: colMap.created_at, value: s.created_at });

      return cells;
    });

    const inserted = await insertRowsAndCells(svc, tableId, rows, cellsData);
    totalInserted += inserted;
    newSignups.forEach((s: any) => existingIds.add(s.id));

    if (signups.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  return totalInserted;
}

// ============================================================================
// Main handler
// ============================================================================
Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const serviceRoleKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();

    // Service role client (bypasses RLS) — used for all queries
    const svc = createClient(
      Deno.env.get('SUPABASE_URL')!,
      serviceRoleKey
    );

    // Determine if this is a service role call (internal/cron)
    let isServiceRole = !!serviceRoleKey && token === serviceRoleKey;

    // Fallback: probe admin endpoint to verify service role (handles format differences)
    if (!isServiceRole && token) {
      try {
        const probe = createClient(
          Deno.env.get('SUPABASE_URL')!,
          token,
          { auth: { persistSession: false, autoRefreshToken: false } }
        );
        const { error: probeError } = await probe.auth.admin.listUsers({ page: 1, perPage: 1 });
        if (!probeError) isServiceRole = true;
      } catch {
        // not service role
      }
    }

    let orgId: string;

    if (isServiceRole) {
      // Service role call — org_id must be provided in body
      const body = await req.json();
      if (!body.org_id) {
        return new Response(
          JSON.stringify({ error: 'Service role calls must provide org_id' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      orgId = body.org_id;
    } else {
      // User JWT call — resolve org from user
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      if (userError || !user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: membership, error: membershipError } = await svc
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (membershipError) throw new Error(`Failed to fetch org membership: ${membershipError.message}`);
      if (!membership?.org_id) {
        return new Response(
          JSON.stringify({ error: 'No organization found for user' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      orgId = membership.org_id;
    }

    // Get all member user IDs for this org (used to scope contacts/companies/leads)
    const { data: orgMembers } = await svc
      .from('organization_memberships')
      .select('user_id')
      .eq('org_id', orgId);

    const memberUserIds = (orgMembers || []).map((m: any) => m.user_id);

    if (memberUserIds.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No members found in organization' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Backfill starting for org ${orgId} with ${memberUserIds.length} members`);

    // Get standard tables
    const { data: tables, error: tablesError } = await svc
      .from('dynamic_tables')
      .select('id, name')
      .eq('organization_id', orgId)
      .eq('is_standard', true);

    if (tablesError) throw new Error(`Failed to query standard tables: ${tablesError.message}`);
    if (!tables?.length) {
      return new Response(
        JSON.stringify({ error: 'No standard tables found. Run provisioning first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: Record<string, number> = {};
    const errors: Record<string, string> = {};

    // Clear existing rows for fresh backfill
    for (const table of tables) {
      const { error: deleteError } = await svc
        .from('dynamic_table_rows')
        .delete()
        .eq('table_id', table.id)
        .eq('source_type', 'app');

      if (deleteError) {
        console.error(`Warning: Failed to clear rows for ${table.name}:`, deleteError.message);
      }
    }

    // Backfill each table
    for (const table of tables) {
      try {
        const { data: columns, error: colError } = await svc
          .from('dynamic_table_columns')
          .select('id, key')
          .eq('table_id', table.id);

        if (colError) throw new Error(`Failed to query columns: ${colError.message}`);
        if (!columns?.length) {
          results[table.name] = 0;
          continue;
        }

        const colMap: ColumnMap = Object.fromEntries(
          columns.map((c: any) => [c.key, c.id])
        );

        let rowsInserted = 0;
        if (table.name === 'Leads') {
          rowsInserted = await backfillLeads(svc, memberUserIds, table.id, colMap);
        } else if (table.name === 'All Contacts') {
          rowsInserted = await backfillContacts(svc, memberUserIds, table.id, colMap);
          // Also backfill active CRM contacts (deduped by email)
          const crmContactRows = await backfillCrmContacts(svc, orgId, table.id, colMap);
          rowsInserted += crmContactRows;
          console.log(`  → CRM contacts: ${crmContactRows} active rows`);
        } else if (table.name === 'Meetings') {
          rowsInserted = await backfillMeetings(svc, orgId, memberUserIds, table.id, colMap);
        } else if (table.name === 'All Companies') {
          rowsInserted = await backfillCompanies(svc, memberUserIds, table.id, colMap);
          // Also backfill active CRM companies (deduped by domain)
          const crmCompanyRows = await backfillCrmCompanies(svc, orgId, table.id, colMap);
          rowsInserted += crmCompanyRows;
          console.log(`  → CRM companies: ${crmCompanyRows} active rows`);
        } else if (table.name === 'Clients') {
          rowsInserted = await backfillClients(svc, memberUserIds, table.id, colMap);
        } else if (table.name === 'Deals') {
          // Deals use a dedicated sync RPC that handles health scores + relationship intelligence
          const { data: syncResult, error: syncError } = await svc.rpc('sync_deals_to_ops_table', {
            p_org_id: orgId,
          });
          if (syncError) throw new Error(`sync_deals_to_ops_table failed: ${syncError.message}`);
          rowsInserted = syncResult?.synced_count || 0;
        } else if (table.name === 'Waitlist Signups') {
          rowsInserted = await backfillWaitlist(svc, table.id, colMap);
        }

        results[table.name] = rowsInserted;
        console.log(`${table.name}: ${rowsInserted} rows`);
      } catch (tableError) {
        console.error(`Backfill error for ${table.name}:`, tableError);
        errors[table.name] = (tableError as Error).message;
        results[table.name] = 0;
      }
    }

    const hasErrors = Object.keys(errors).length > 0;
    const totalRows = Object.values(results).reduce((sum, v) => sum + v, 0);

    console.log(`Backfill complete: ${totalRows} total rows, ${Object.keys(errors).length} errors`);

    return new Response(
      JSON.stringify({
        success: !hasErrors,
        results,
        ...(hasErrors ? { errors } : {}),
        totalRows,
      }),
      {
        status: hasErrors && totalRows === 0 ? 500 : 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Backfill error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
