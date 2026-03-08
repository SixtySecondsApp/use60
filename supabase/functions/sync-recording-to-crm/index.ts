/**
 * Sync Recording to CRM Edge Function
 *
 * Syncs a processed recording to the CRM system:
 * 1. Matches attendee emails to contacts
 * 2. Associates with relevant deals
 * 3. Creates activity records
 * 4. Logs to HubSpot if configured
 *
 * Endpoint: POST /functions/v1/sync-recording-to-crm
 *
 * @see supabase/migrations/20260104100000_meetingbaas_core_tables.sql
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { corsHeaders, handleCorsPreflightWithResponse } from '../_shared/corsHelper.ts';
import { HubSpotClient } from '../_shared/hubspot.ts';

// =============================================================================
// Types
// =============================================================================

interface SyncRequest {
  recording_id: string;
  force_sync?: boolean; // Re-sync even if already synced
}

interface SyncResult {
  success: boolean;
  recording_id: string;
  contacts_matched: ContactMatch[];
  deals_associated: DealAssociation[];
  activity_id?: string;
  hubspot_engagement_id?: string;
  requires_hitl?: boolean;
  hitl_reason?: string;
  error?: string;
}

interface ContactMatch {
  email: string;
  contact_id: string | null;
  matched: boolean;
  created?: boolean;
  name?: string;
}

interface DealAssociation {
  deal_id: string;
  deal_name: string;
  confidence: number;
  association_type: 'primary_contact' | 'deal_contact' | 'company';
}

interface RecordingData {
  id: string;
  org_id: string;
  user_id: string;
  meeting_title: string | null;
  meeting_platform: string;
  meeting_url: string;
  meeting_start_time: string | null;
  meeting_end_time: string | null;
  meeting_duration_seconds: number | null;
  status: string;
  crm_synced: boolean;
  summary: string | null;
  highlights: any[] | null;
  speakers: SpeakerInfo[];
}

interface SpeakerInfo {
  id: string;
  email?: string;
  name: string;
  is_internal: boolean;
  speaking_time_seconds?: number;
}

interface CRMSettings {
  hubspot_enabled?: boolean;
  auto_create_contacts?: boolean;
  auto_associate_deals?: boolean;
  hitl_for_multiple_deals?: boolean;
}

// =============================================================================
// Contact Matching
// =============================================================================

/**
 * Match attendee emails to existing contacts
 */
async function matchContacts(
  supabase: SupabaseClient,
  orgId: string,
  speakers: SpeakerInfo[],
  settings: CRMSettings
): Promise<ContactMatch[]> {
  const matches: ContactMatch[] = [];
  const externalSpeakers = speakers.filter(s => !s.is_internal && s.email);

  for (const speaker of externalSpeakers) {
    if (!speaker.email) continue;

    const email = speaker.email.toLowerCase();

    // Try to find existing contact
    const { data: contact } = await supabase
      .from('contacts')
      .select('id, first_name, last_name')
      .ilike('email', email)
      .maybeSingle();

    if (contact) {
      matches.push({
        email,
        contact_id: contact.id,
        matched: true,
        name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || undefined,
      });
    } else if (settings.auto_create_contacts) {
      // Auto-create contact if enabled
      const nameParts = (speaker.name || email.split('@')[0]).split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      const domain = email.split('@')[1];

      // Try to find company by domain
      const { data: company } = await supabase
        .from('companies')
        .select('id')
        .or(`website.ilike.%${domain}%,email_domain.eq.${domain}`)
        .maybeSingle();

      const { data: newContact, error } = await supabase
        .from('contacts')
        .insert({
          email,
          first_name: firstName,
          last_name: lastName,
          company_id: company?.id || null,
        })
        .select('id')
        .single();

      if (!error && newContact) {
        matches.push({
          email,
          contact_id: newContact.id,
          matched: true,
          created: true,
          name: speaker.name,
        });
      } else {
        matches.push({
          email,
          contact_id: null,
          matched: false,
        });
      }
    } else {
      matches.push({
        email,
        contact_id: null,
        matched: false,
      });
    }
  }

  return matches;
}

// =============================================================================
// Deal Association
// =============================================================================

/**
 * Find deals to associate with the recording
 * Uses multiple strategies:
 * 1. Primary contact matches
 * 2. Deal contact matches
 * 3. Company matches
 */
async function findDealsToAssociate(
  supabase: SupabaseClient,
  orgId: string,
  contactIds: string[]
): Promise<DealAssociation[]> {
  const associations: DealAssociation[] = [];
  const dealsFound = new Set<string>();

  if (contactIds.length === 0) {
    return associations;
  }

  // Strategy 1: Find deals where contact is primary
  const { data: primaryDeals } = await supabase
    .from('deals')
    .select('id, name')
    .in('primary_contact_id', contactIds)
    .eq('status', 'active');

  for (const deal of primaryDeals || []) {
    if (!dealsFound.has(deal.id)) {
      dealsFound.add(deal.id);
      associations.push({
        deal_id: deal.id,
        deal_name: deal.name,
        confidence: 0.95,
        association_type: 'primary_contact',
      });
    }
  }

  // Strategy 2: Find deals via deal_contacts junction
  const { data: dealContacts } = await supabase
    .from('deal_contacts')
    .select(`
      deal_id,
      deals!inner (
        id,
        name,
        status
      )
    `)
    .in('contact_id', contactIds);

  for (const dc of dealContacts || []) {
    const deal = dc.deals as any;
    if (deal && deal.status === 'active' && !dealsFound.has(deal.id)) {
      dealsFound.add(deal.id);
      associations.push({
        deal_id: deal.id,
        deal_name: deal.name,
        confidence: 0.85,
        association_type: 'deal_contact',
      });
    }
  }

  // Strategy 3: Find deals via company
  // Get companies for matched contacts
  const { data: contacts } = await supabase
    .from('contacts')
    .select('company_id')
    .in('id', contactIds)
    .not('company_id', 'is', null);

  const companyIds = [...new Set((contacts || []).map(c => c.company_id).filter(Boolean))];

  if (companyIds.length > 0) {
    const { data: companyDeals } = await supabase
      .from('deals')
      .select('id, name')
      .in('company_id', companyIds)
      .eq('status', 'active');

    for (const deal of companyDeals || []) {
      if (!dealsFound.has(deal.id)) {
        dealsFound.add(deal.id);
        associations.push({
          deal_id: deal.id,
          deal_name: deal.name,
          confidence: 0.7,
          association_type: 'company',
        });
      }
    }
  }

  // Sort by confidence descending
  return associations.sort((a, b) => b.confidence - a.confidence);
}

// =============================================================================
// Activity Creation
// =============================================================================

/**
 * Create an activity record for the recording
 */
async function createRecordingActivity(
  supabase: SupabaseClient,
  recording: RecordingData,
  contactIds: string[],
  dealId: string | null
): Promise<string | null> {
  const primaryContactId = contactIds[0] || null;

  // Get company from contact if available
  let companyId = null;
  if (primaryContactId) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('company_id')
      .eq('id', primaryContactId)
      .single();
    companyId = contact?.company_id || null;
  }

  const { data: activity, error } = await supabase
    .from('activities')
    .insert({
      user_id: recording.user_id,
      type: 'meeting',
      status: 'completed',
      priority: 'medium',
      notes: formatActivityNotes(recording),
      contact_id: primaryContactId,
      company_id: companyId,
      deal_id: dealId,
      auto_matched: true,
      contact_identifier: primaryContactId ? null : recording.speakers.find(s => !s.is_internal)?.email,
      client_name: recording.speakers.find(s => !s.is_internal)?.name,
      meeting_id: null, // Will be linked if we have meeting record
      recording_id: recording.id, // Custom field to link to recording
    })
    .select('id')
    .single();

  if (error) {
    console.error('[CRMSync] Failed to create activity:', error);
    return null;
  }

  return activity?.id || null;
}

/**
 * Format activity notes from recording data
 */
function formatActivityNotes(recording: RecordingData): string {
  const parts: string[] = [];

  parts.push(`## ${recording.meeting_title || 'Meeting Recording'}`);
  parts.push('');

  if (recording.summary) {
    parts.push('### Summary');
    parts.push(recording.summary);
    parts.push('');
  }

  if (recording.highlights && recording.highlights.length > 0) {
    parts.push('### Key Highlights');
    for (const highlight of recording.highlights.slice(0, 5)) {
      parts.push(`- ${highlight.text || highlight}`);
    }
    parts.push('');
  }

  parts.push('---');
  parts.push(`📍 ${recording.meeting_platform || 'Video call'}`);
  if (recording.meeting_duration_seconds) {
    const mins = Math.round(recording.meeting_duration_seconds / 60);
    parts.push(`⏱️ ${mins} minutes`);
  }
  parts.push('');
  parts.push('*Recorded and summarized by use60*');

  return parts.join('\n');
}

// =============================================================================
// HubSpot Sync
// =============================================================================

/**
 * Sync recording to HubSpot as a meeting engagement
 */
async function syncToHubSpot(
  supabase: SupabaseClient,
  orgId: string,
  recording: RecordingData,
  hubspotContactIds: string[],
  hubspotDealId: string | null
): Promise<string | null> {
  // Get HubSpot connection
  const { data: connection } = await supabase
    .from('integrations')
    .select('credentials')
    .eq('org_id', orgId)
    .eq('provider', 'hubspot')
    .eq('status', 'active')
    .maybeSingle();

  if (!connection?.credentials?.access_token) {
    console.log('[CRMSync] No active HubSpot connection');
    return null;
  }

  try {
    const hubspot = new HubSpotClient({
      accessToken: connection.credentials.access_token,
    });

    // Create meeting engagement
    const meetingBody = formatActivityNotes(recording);
    const startTime = recording.meeting_start_time || new Date().toISOString();
    const endTime = recording.meeting_end_time ||
      new Date(new Date(startTime).getTime() + (recording.meeting_duration_seconds || 0) * 1000).toISOString();

    const engagement = await hubspot.request<{ id: string }>({
      method: 'POST',
      path: '/crm/v3/objects/meetings',
      body: {
        properties: {
          hs_meeting_title: recording.meeting_title || 'Meeting Recording',
          hs_meeting_body: meetingBody,
          hs_meeting_start_time: startTime,
          hs_meeting_end_time: endTime,
          hs_meeting_outcome: 'COMPLETED',
        },
      },
    });

    // Associate with contacts
    for (const contactId of hubspotContactIds) {
      try {
        await hubspot.request({
          method: 'PUT',
          path: `/crm/v4/objects/meetings/${engagement.id}/associations/contacts/${contactId}`,
          body: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 200 }],
        });
      } catch (err) {
        console.error(`[CRMSync] Failed to associate HubSpot contact ${contactId}:`, err);
      }
    }

    // Associate with deal if provided
    if (hubspotDealId) {
      try {
        await hubspot.request({
          method: 'PUT',
          path: `/crm/v4/objects/meetings/${engagement.id}/associations/deals/${hubspotDealId}`,
          body: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 206 }],
        });
      } catch (err) {
        console.error(`[CRMSync] Failed to associate HubSpot deal ${hubspotDealId}:`, err);
      }
    }

    return engagement.id;
  } catch (err) {
    console.error('[CRMSync] HubSpot sync failed:', err);
    return null;
  }
}

// =============================================================================
// HITL Flow
// =============================================================================

/**
 * Create HITL request for deal selection
 */
async function createDealSelectionHITL(
  supabase: SupabaseClient,
  orgId: string,
  recordingId: string,
  userId: string,
  deals: DealAssociation[]
): Promise<void> {
  await supabase.from('hitl_requests').insert({
    org_id: orgId,
    recording_id: recordingId,
    user_id: userId,
    request_type: 'deal_selection',
    status: 'pending',
    options: {
      deals: deals.map(d => ({
        deal_id: d.deal_id,
        deal_name: d.deal_name,
        confidence: d.confidence,
        association_type: d.association_type,
      })),
    },
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
  });

  console.log('[CRMSync] Created HITL request for deal selection:', {
    recordingId,
    dealCount: deals.length,
  });
}

// =============================================================================
// Main Sync Function
// =============================================================================

async function syncRecordingToCRM(
  supabase: SupabaseClient,
  recordingId: string,
  forceSync: boolean = false
): Promise<SyncResult> {
  // Get recording data
  const { data: recording, error: recordingError } = await supabase
    .from('recordings')
    .select(`
      id,
      org_id,
      user_id,
      meeting_title,
      meeting_platform,
      meeting_url,
      meeting_start_time,
      meeting_end_time,
      meeting_duration_seconds,
      status,
      crm_synced,
      summary,
      highlights,
      speakers
    `)
    .eq('id', recordingId)
    .single();

  if (recordingError || !recording) {
    return {
      success: false,
      recording_id: recordingId,
      contacts_matched: [],
      deals_associated: [],
      error: 'Recording not found',
    };
  }

  // Check if already synced
  if (recording.crm_synced && !forceSync) {
    return {
      success: true,
      recording_id: recordingId,
      contacts_matched: [],
      deals_associated: [],
      error: 'Already synced (use force_sync to re-sync)',
    };
  }

  // Get CRM settings
  const { data: org } = await supabase
    .from('organizations')
    .select('recording_settings')
    .eq('id', recording.org_id)
    .single();

  const settings: CRMSettings = {
    hubspot_enabled: true,
    auto_create_contacts: true,
    auto_associate_deals: true,
    hitl_for_multiple_deals: true,
    ...org?.recording_settings?.crm,
  };

  const speakers: SpeakerInfo[] = recording.speakers || [];

  // Step 1: Match contacts
  const contactMatches = await matchContacts(
    supabase,
    recording.org_id,
    speakers,
    settings
  );

  const matchedContactIds = contactMatches
    .filter(m => m.matched && m.contact_id)
    .map(m => m.contact_id!);

  // Step 2: Find deals to associate
  const dealAssociations = await findDealsToAssociate(
    supabase,
    recording.org_id,
    matchedContactIds
  );

  // Step 3: Handle deal selection
  let selectedDealId: string | null = null;
  let requiresHITL = false;
  let hitlReason: string | undefined;

  if (dealAssociations.length === 0) {
    // No deals found - that's okay
    selectedDealId = null;
  } else if (dealAssociations.length === 1 && dealAssociations[0].confidence >= 0.8) {
    // Single high-confidence match - auto-select
    selectedDealId = dealAssociations[0].deal_id;
  } else if (settings.hitl_for_multiple_deals && dealAssociations.length > 1) {
    // Multiple deals - request HITL
    requiresHITL = true;
    hitlReason = 'Multiple deals found - please select the correct one';
    await createDealSelectionHITL(
      supabase,
      recording.org_id,
      recordingId,
      recording.user_id,
      dealAssociations
    );

    // Send HITL notification
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (supabaseUrl && serviceRoleKey) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/send-router`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'recording_notification',
            recording_id: recordingId,
            notification_type: 'hitl_deal_selection',
            deals: dealAssociations.map(d => ({
              deal_id: d.deal_id,
              deal_name: d.deal_name,
              confidence: d.confidence,
            })),
          }),
        });
      } catch (err) {
        console.warn('[CRMSync] HITL notification error (non-blocking):', err);
      }
    }
  } else if (settings.auto_associate_deals && dealAssociations.length > 0) {
    // Auto-select highest confidence
    selectedDealId = dealAssociations[0].deal_id;
  }

  // Step 4: Create activity (even if HITL is required - it can be updated later)
  const activityId = await createRecordingActivity(
    supabase,
    recording as RecordingData,
    matchedContactIds,
    selectedDealId
  );

  // Step 5: Sync to HubSpot if enabled
  let hubspotEngagementId: string | null = null;
  if (settings.hubspot_enabled) {
    // Get HubSpot IDs for matched contacts
    const { data: contactsWithHubspot } = await supabase
      .from('contacts')
      .select('hubspot_id')
      .in('id', matchedContactIds)
      .not('hubspot_id', 'is', null);

    const hubspotContactIds = (contactsWithHubspot || [])
      .map(c => c.hubspot_id)
      .filter(Boolean) as string[];

    // Get HubSpot deal ID if we have a selected deal
    let hubspotDealId: string | null = null;
    if (selectedDealId) {
      const { data: deal } = await supabase
        .from('deals')
        .select('hubspot_id')
        .eq('id', selectedDealId)
        .single();
      hubspotDealId = deal?.hubspot_id || null;
    }

    if (hubspotContactIds.length > 0) {
      hubspotEngagementId = await syncToHubSpot(
        supabase,
        recording.org_id,
        recording as RecordingData,
        hubspotContactIds,
        hubspotDealId
      );
    }
  }

  // Step 6: Update recording sync status
  await supabase
    .from('recordings')
    .update({
      crm_synced: true,
      crm_activity_id: activityId,
      crm_deal_id: selectedDealId,
      hubspot_engagement_id: hubspotEngagementId,
    })
    .eq('id', recordingId);

  console.log('[CRMSync] Sync completed:', {
    recordingId,
    contactsMatched: contactMatches.filter(m => m.matched).length,
    dealsFound: dealAssociations.length,
    selectedDeal: selectedDealId,
    activityId,
    hubspotEngagementId,
    requiresHITL,
  });

  return {
    success: true,
    recording_id: recordingId,
    contacts_matched: contactMatches,
    deals_associated: dealAssociations,
    activity_id: activityId || undefined,
    hubspot_engagement_id: hubspotEngagementId || undefined,
    requires_hitl: requiresHITL,
    hitl_reason: hitlReason,
  };
}

// =============================================================================
// Main Handler
// =============================================================================

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightWithResponse();
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Parse request
    const body: SyncRequest = await req.json();

    if (!body.recording_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'recording_id is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Run sync
    const result = await syncRecordingToCRM(
      supabase,
      body.recording_id,
      body.force_sync
    );

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[CRMSync] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
