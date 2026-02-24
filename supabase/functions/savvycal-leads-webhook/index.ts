import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Type alias for Supabase client
type SupabaseClient = ReturnType<typeof createClient>;
import { corsHeaders } from "../_shared/cors.ts";
import { extractBusinessDomain, matchOrCreateCompany } from "../_shared/companyMatching.ts";
import { materializeContact } from "../_shared/materializationService.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// Legacy global webhook secret (fallback for existing installs without org token)
const LEGACY_WEBHOOK_SECRET = Deno.env.get("SAVVYCAL_WEBHOOK_SECRET") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
}

// Context for org-scoped webhooks
interface OrgWebhookContext {
  orgId: string | null;
  webhookSecret: string | null;
  integrationId: string | null;
}

type Nullable<T> = T | null | undefined;

interface SavvyCalCustomField {
  id: string;
  label: string;
  type: string;
  value: Nullable<string>;
  options: Array<{ label: string; value: string }>;
}

interface SavvyCalAttendee {
  id: string;
  email: string;
  display_name: string;
  first_name: Nullable<string>;
  last_name: Nullable<string>;
  is_organizer: boolean;
  phone_number: Nullable<string>;
  time_zone: Nullable<string>;
  marketing_opt_in: Nullable<boolean>;
  fields?: SavvyCalCustomField[];
}

interface SavvyCalEventPayload {
  id: string;
  state: string;
  summary: string;
  description: Nullable<string>;
  start_at: Nullable<string>;
  end_at: Nullable<string>;
  created_at: Nullable<string>;
  updated_at?: Nullable<string>;
  canceled_at?: Nullable<string>;
  rescheduled_at?: Nullable<string>;
  buffer_before?: number;
  buffer_after?: number;
  duration: number;
  attendees: SavvyCalAttendee[];
  organizer: SavvyCalAttendee;
  scheduler?: SavvyCalAttendee;
  conferencing?: {
    type: Nullable<string>;
    join_url: Nullable<string>;
    meeting_id?: Nullable<string>;
    instructions?: Nullable<string>;
  };
  link?: {
    id: string;
    slug: string;
    name: Nullable<string>;
    private_name: Nullable<string>;
    description: Nullable<string>;
  };
  scope?: {
    id: string;
    name: string;
    slug: string;
  };
  metadata?: Record<string, unknown>;
  location?: Nullable<string>;
  location_settings?: Array<Record<string, unknown>>;
}

interface SavvyCalWebhookEvent {
  id: string;
  occurred_at: string;
  payload: SavvyCalEventPayload;
  type: string;
  version: string;
}

interface LeadSourceDetails {
  sourceKey: string;
  name: string;
  channel?: string;
  medium?: string;
  campaign?: string;
  defaultOwnerId?: string | null;
}

type LeadProcessingResult = {
  success: boolean;
  external_event_id: string;
  lead_id?: string;
  reason?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Extract org token from query params (external-ready)
  const url = new URL(req.url);
  const orgToken = url.searchParams.get("token");

  // Resolve org context from token
  let orgContext: OrgWebhookContext = {
    orgId: null,
    webhookSecret: null,
    integrationId: null,
  };

  if (orgToken) {
    // Look up org by webhook token
    const { data: integration, error: intError } = await supabase
      .from("savvycal_integrations")
      .select("id, org_id, is_active")
      .eq("webhook_token", orgToken)
      .eq("is_active", true)
      .maybeSingle();

    if (intError || !integration) {
      console.error("[savvycal-webhook] Invalid or inactive webhook token:", orgToken, intError);
      return new Response(
        JSON.stringify({ error: "Invalid webhook token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    orgContext.orgId = integration.org_id;
    orgContext.integrationId = integration.id;

    // Get org's webhook secret for signature verification
    const { data: secrets } = await supabase
      .from("savvycal_integration_secrets")
      .select("webhook_secret")
      .eq("integration_id", integration.id)
      .maybeSingle();

    orgContext.webhookSecret = secrets?.webhook_secret ?? null;
  }

  const rawBody = await req.text();

  // Verify signature - use org-specific secret or legacy global secret
  const webhookSecret = orgContext.webhookSecret || LEGACY_WEBHOOK_SECRET;
  try {
    await verifySignature(req.headers, rawBody, webhookSecret);
  } catch (error) {
    console.error("[savvycal-webhook] Signature verification failed:", error);
    return new Response(
      JSON.stringify({ error: "Invalid webhook signature" }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  let events: SavvyCalWebhookEvent[] = [];

  try {
    const parsed = JSON.parse(rawBody);
    events = Array.isArray(parsed) ? parsed : [parsed];
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Invalid JSON payload" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const results: LeadProcessingResult[] = [];
  for (const event of events) {
    try {
      const result = await processSavvyCalEvent(supabase, event, orgContext.orgId);
      results.push(result);
    } catch (error) {
      results.push({
        success: false,
        external_event_id: event?.id ?? "unknown",
        reason: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  // Update webhook_last_received_at for the org integration
  if (orgContext.integrationId && results.some(r => r.success)) {
    const lastEventId = events.length > 0 ? events[events.length - 1]?.id : null;
    await supabase
      .from("savvycal_integrations")
      .update({
        webhook_last_received_at: new Date().toISOString(),
        webhook_last_event_id: lastEventId,
      })
      .eq("id", orgContext.integrationId);
  }

  return new Response(
    JSON.stringify({
      success: results.every((result) => result.success),
      results,
      org_id: orgContext.orgId,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});

async function verifySignature(headers: Headers, rawBody: string, webhookSecret: string): Promise<void> {
  // If no secret configured, skip signature verification
  if (!webhookSecret) {
    return;
  }

  const signatureHeader =
    headers.get("savvycal-signature") ||
    headers.get("x-savvycal-signature") ||
    headers.get("SavvyCal-Signature");

  if (!signatureHeader) {
    throw new Error("Missing SavvyCal signature header");
  }

  const parsedSignature = parseSignature(signatureHeader);
  const expected = await generateSignatureWithSecret(rawBody, webhookSecret);

  if (!timingSafeEqual(parsedSignature, expected)) {
    throw new Error("Signature mismatch");
  }
}

function parseSignature(signatureHeader: string): string {
  const trimmed = signatureHeader.trim();

  // SavvyCal sends headers like "sha256=ABCDEF" (uppercase hex)
  // Normalize casing and support comma-delimited formats just in case.
  const parts = trimmed.split(",").map((part) => part.trim());

  for (const part of parts) {
    if (part.includes("=")) {
      const [key, value] = part.split("=", 2);
      if (key.toLowerCase() === "sha256") {
        return value.toLowerCase();
      }
      if (!key && value) {
        return value.toLowerCase();
      }
    } else if (part) {
      return part.toLowerCase();
    }
  }

  return trimmed.toLowerCase();
}

async function generateSignatureWithSecret(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );

  return bufferToHex(signatureBuffer);
}

function bufferToHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);

  if (aBytes.length !== bBytes.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < aBytes.length; i++) {
    mismatch |= aBytes[i] ^ bBytes[i];
  }
  return mismatch === 0;
}

async function processSavvyCalEvent(
  supabase: SupabaseClient,
  event: SavvyCalWebhookEvent,
  explicitOrgId: string | null = null,
): Promise<LeadProcessingResult> {
  if (!event?.payload?.id) {
    throw new Error("Event payload missing meeting id");
  }

  const externalEventId = event.id;
  const meetingId = event.payload.id;

  // Check event type for cancellation or rescheduling
  const isCancellation = isCancelledEvent(event);
  const isRescheduled = isRescheduledEvent(event);

  // Skip duplicate webhook deliveries (same webhook event ID)
  const { data: existingEvent, error: selectEventError } = await supabase
    .from("lead_events")
    .select("id, lead_id")
    .eq("external_source", "savvycal")
    .eq("external_id", externalEventId)
    .maybeSingle();

  if (selectEventError) {
    throw selectEventError;
  }

  if (existingEvent) {
    // If this is a cancellation event and we have a lead_id, update the lead status
    if (isCancellation && existingEvent.lead_id) {
      await updateLeadCancellationStatus(supabase, existingEvent.lead_id, event);
    }
    // If this is a rescheduled event and we have a lead_id, update the lead with new meeting details
    if (isRescheduled && existingEvent.lead_id) {
      await updateLeadRescheduledStatus(supabase, existingEvent.lead_id, event);
    }
    return {
      success: true,
      external_event_id: externalEventId,
      lead_id: existingEvent.lead_id ?? null,
      reason: "duplicate",
    };
  }

  // Check for existing lead by meeting ID (not webhook event ID)
  // This handles rescheduled and cancelled events for existing meetings
  const { data: existingLead } = await supabase
    .from("leads")
    .select("id")
    .eq("external_source", "savvycal")
    .eq("external_id", meetingId)
    .maybeSingle();

  // Handle cancellation events for existing leads
  if (isCancellation && existingLead) {
    await updateLeadCancellationStatus(supabase, existingLead.id, event);
    
    // Still log the event
    await supabase.from("lead_events").insert({
      lead_id: existingLead.id,
      external_source: "savvycal",
      external_id: externalEventId,
      event_type: event.type,
      payload: event.payload,
      payload_hash: await hashPayload(event.payload),
      external_occured_at: event.occurred_at ?? null,
      received_at: new Date().toISOString(),
    });

    return {
      success: true,
      external_event_id: externalEventId,
      lead_id: existingLead.id,
      reason: "cancellation_processed",
    };
  }

  // Handle rescheduled events for existing leads
  if (isRescheduled && existingLead) {
    await updateLeadRescheduledStatus(supabase, existingLead.id, event);
    
    // Still log the event
    await supabase.from("lead_events").insert({
      lead_id: existingLead.id,
      external_source: "savvycal",
      external_id: externalEventId,
      event_type: event.type,
      payload: event.payload,
      payload_hash: await hashPayload(event.payload),
      external_occured_at: event.occurred_at ?? null,
      received_at: new Date().toISOString(),
    });

    return {
      success: true,
      external_event_id: externalEventId,
      lead_id: existingLead.id,
      reason: "rescheduled_processed",
    };
  }

  const organizer = getOrganizer(event.payload);
  const leadCandidate = getLeadCandidate(event.payload);

  const scheduler = event.payload.scheduler;
  const schedulerEmail = scheduler?.email ?? leadCandidate?.email ?? null;
  const schedulerName = scheduler?.display_name ?? leadCandidate?.display_name ?? null;

  const attendeeEmails = (event.payload.attendees || [])
    .filter((attendee) => !attendee.is_organizer && attendee.email)
    .map((attendee) => attendee.email.toLowerCase());

  const contactEmail = leadCandidate?.email?.toLowerCase() ?? schedulerEmail?.toLowerCase() ?? null;
  if (!contactEmail) {
    throw new Error("Unable to determine lead contact email");
  }

  const leadName = leadCandidate?.display_name ?? schedulerName ?? "";
  const [contactFirstName, contactLastName] = splitName(
    leadCandidate?.first_name,
    leadCandidate?.last_name,
    leadName,
  );

  const ownerProfileId = await resolveLeadOwnerId(supabase, organizer?.email);

  const sourceDetails = await resolveLeadSource(supabase, event.payload);
  const leadSource = await ensureLeadSource(
    supabase,
    sourceDetails,
    ownerProfileId,
  );

  let companyId: string | null = null;
  let contactId: string | null = null;
  let isNewCompany = false;

  const businessDomain = contactEmail ? extractBusinessDomain(contactEmail) : null;

  if (ownerProfileId && businessDomain) {
    const { company, isNew } = await matchOrCreateCompany(
      supabase,
      contactEmail,
      ownerProfileId,
      leadName,
    );
    companyId = company?.id ?? null;
    isNewCompany = isNew;
  }

  contactId = await upsertContact(
    supabase,
    {
      email: contactEmail,
      first_name: contactFirstName,
      last_name: contactLastName,
      phone: leadCandidate?.phone_number ?? null,
      owner_id: ownerProfileId ?? leadSource?.default_owner_id ?? null,
      company_id: companyId,
    },
  );

  const leadMetadata = buildLeadMetadata(event.payload, leadCandidate, scheduler);
  const payloadHash = await hashPayload(event.payload);

  const status = determineLeadStatus(event);

  // Build tags array based on status
  const tags: string[] = status === "cancelled" ? ["Meeting Cancelled"] : ["Meeting Booked"];
  
  // Add source name if available
  if (leadSource?.name) {
    tags.push(leadSource.name);
  } else if (sourceDetails.name) {
    tags.push(sourceDetails.name);
  }
  
  // Add owner name if available
  if (ownerProfileId) {
    const { data: ownerProfile } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", ownerProfileId)
      .maybeSingle();
    
    if (ownerProfile) {
      const ownerName = [ownerProfile.first_name, ownerProfile.last_name]
        .filter(Boolean)
        .join(" ");
      if (ownerName) {
        tags.push(ownerName);
      }
    }
  }

  // Build lead record with org_id if provided via webhook token
  const leadRecord: Record<string, unknown> = {
    external_source: "savvycal",
    external_id: meetingId,
    external_occured_at: event.occurred_at,
    source_id: leadSource?.id ?? null,
    source_channel: sourceDetails.channel ?? null,
    source_campaign: sourceDetails.campaign ?? null,
    source_medium: sourceDetails.medium ?? null,
    booking_link_id: event.payload.link?.id ?? null,
    booking_link_slug: event.payload.link?.slug ?? null,
    booking_link_name: event.payload.link?.private_name ?? event.payload.link?.name ?? null,
    booking_scope_slug: event.payload.scope?.slug ?? null,
    status,
    priority: "normal" as const,
    enrichment_status: "pending" as const,
    enrichment_provider: null,
    prep_status: "pending" as const,
    prep_summary: null,
    owner_id: ownerProfileId ?? leadSource?.default_owner_id ?? null,
    created_by: ownerProfileId ?? null,
    converted_deal_id: null,
    company_id: companyId,
    contact_id: contactId,
    contact_name: leadName || null,
    contact_first_name: contactFirstName || null,
    contact_last_name: contactLastName || null,
    contact_email: contactEmail,
    contact_phone: leadCandidate?.phone_number ?? null,
    contact_timezone: leadCandidate?.time_zone ?? scheduler?.time_zone ?? null,
    contact_marketing_opt_in: leadCandidate?.marketing_opt_in ?? null,
    scheduler_email: schedulerEmail ?? null,
    scheduler_name: schedulerName ?? null,
    domain: businessDomain ?? null,
    meeting_title: event.payload.summary ?? null,
    meeting_description: event.payload.description ?? null,
    meeting_start: event.payload.start_at ?? null,
    meeting_end: event.payload.end_at ?? null,
    meeting_duration_minutes: event.payload.duration ?? null,
    meeting_timezone: scheduler?.time_zone ?? null,
    meeting_url: event.payload.conferencing?.join_url ?? event.payload.location ?? null,
    conferencing_type: event.payload.conferencing?.type ?? null,
    conferencing_url: event.payload.conferencing?.join_url ?? null,
    attendee_count: attendeeEmails.length,
    external_attendee_emails: attendeeEmails,
    utm_source: event.payload.metadata?.utm_source as string ?? sourceDetails.sourceKey,
    utm_medium: event.payload.metadata?.utm_medium as string ?? sourceDetails.medium ?? null,
    utm_campaign: event.payload.metadata?.utm_campaign as string ?? sourceDetails.campaign ?? null,
    utm_term: event.payload.metadata?.utm_term as string ?? null,
    utm_content: event.payload.metadata?.utm_content as string ?? null,
    metadata: leadMetadata,
    tags,
    first_seen_at: event.occurred_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Add org_id if provided via webhook token (external-ready)
  if (explicitOrgId) {
    leadRecord.org_id = explicitOrgId;
  }

  // Use composite unique (external_id, org_id) if org_id is set, otherwise just external_id
  const upsertConflict = explicitOrgId ? "idx_leads_external_org_unique" : "external_id";

  const { data: leadData, error: upsertLeadError } = await supabase
    .from("leads")
    .upsert(leadRecord, { onConflict: upsertConflict })
    .select("id")
    .single();

  if (upsertLeadError) {
    throw upsertLeadError;
  }

  const { error: insertEventError } = await supabase
    .from("lead_events")
    .insert({
      lead_id: leadData.id,
      external_source: "savvycal",
      external_id: externalEventId,
      event_type: event.type,
      payload: event.payload,
      payload_hash: payloadHash,
      external_occured_at: event.occurred_at ?? null,
      received_at: new Date().toISOString(),
    });

  if (insertEventError) {
  }

  // Auto-materialize CRM contact if exists in index (non-blocking)
  if (status !== "cancelled" && contactEmail && explicitOrgId) {
    try {
      // Search CRM index by email
      const { data: crmIndexRecords } = await supabase
        .from('crm_contact_index')
        .select('id, org_id, crm_source, crm_record_id, first_name, last_name, email, company_name, job_title, materialized_contact_id, is_materialized')
        .eq('org_id', explicitOrgId)
        .ilike('email', contactEmail)
        .limit(1);

      const crmIndexRecord = crmIndexRecords?.[0];

      if (crmIndexRecord) {
        let materializedContactId = crmIndexRecord.materialized_contact_id;

        if (!crmIndexRecord.is_materialized) {
          // Contact exists in CRM index but not materialized yet - materialize it
          console.log(`[savvycal-webhook] Auto-materializing CRM contact for lead ${leadData.id}: ${contactEmail}`);
          const materializationResult = await materializeContact(supabase, explicitOrgId, crmIndexRecord);

          if (materializationResult.success && materializationResult.contact_id) {
            materializedContactId = materializationResult.contact_id;
            console.log(`[savvycal-webhook] Materialized contact ${materializedContactId} for lead ${leadData.id}`);
          } else {
            console.error(`[savvycal-webhook] Materialization failed for lead ${leadData.id}: ${materializationResult.error}`);
          }
        } else {
          console.log(`[savvycal-webhook] CRM contact already materialized for lead ${leadData.id}: ${materializedContactId}`);
        }

        // Link lead to materialized contact (whether newly materialized or already existed)
        if (materializedContactId) {
          await supabase
            .from('leads')
            .update({
              contact_id: materializedContactId,
              updated_at: new Date().toISOString(),
            })
            .eq('id', leadData.id);

          console.log(`[savvycal-webhook] Linked lead ${leadData.id} to materialized contact ${materializedContactId}`);
        }
      }
    } catch (materializationError) {
      // Non-blocking - don't fail lead creation if materialization fails
      console.error(`[savvycal-webhook] Auto-materialization error (non-fatal):`, materializationError);
    }
  }

  // Ensure a company fact profile exists for this lead's domain (non-blocking)
  if (status !== "cancelled" && businessDomain && explicitOrgId && ownerProfileId) {
    ensureCompanyFactProfile(
      supabase,
      explicitOrgId,
      ownerProfileId,
      businessDomain,
      leadName ? leadName.split(" ").pop() + "'s company" : businessDomain,
    ).catch((err) => {
      console.error(`[savvycal-webhook] ensureCompanyFactProfile error (non-fatal):`, err);
    });
  }

  // Skip enrichment and prep for cancelled leads
  if (status !== "cancelled") {
    // Trigger company enrichment if this is a new company
    if (isNewCompany && companyId) {
      const enrichUrl = `${SUPABASE_URL}/functions/v1/enrich-company`;

      // Fire and forget - don't wait for enrichment to complete
      fetch(enrichUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "apikey": SUPABASE_SERVICE_ROLE_KEY,
          ...(Deno.env.get("CRON_SECRET")
            ? { "x-cron-secret": Deno.env.get("CRON_SECRET") as string }
            : {}),
        },
        body: JSON.stringify({ company_id: companyId }),
      }).then(async (res) => {
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          console.error(`[enrich-company] Failed: ${res.status} - ${text}`);
        } else {
          console.log(`[enrich-company] Triggered for company ${companyId}`);
        }
      }).catch((error) => {
        console.error(`[enrich-company] Error:`, error);
      });
    }

    // Auto-enrich new lead - trigger lead prep generation for this specific lead
    const prepUrl = `${SUPABASE_URL}/functions/v1/process-lead-prep`;

    // Fire and forget - don't wait for prep generation to complete
    fetch(prepUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        ...(Deno.env.get("CRON_SECRET")
          ? { "x-cron-secret": Deno.env.get("CRON_SECRET") as string }
          : {}),
      },
      body: JSON.stringify({ lead_id: leadData.id }),
    }).then(async (res) => {
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error(`[process-lead-prep] Failed: ${res.status} - ${text}`);
      } else {
        console.log(`[process-lead-prep] Triggered for lead ${leadData.id}`);
      }
    }).catch((error) => {
      console.error(`[process-lead-prep] Error:`, error);
    });
  } else {
    console.log(`[savvycal-webhook] Skipping enrichment for cancelled lead`);
  }

  return {
    success: true,
    external_event_id: externalEventId,
    lead_id: leadData.id,
  };
}

function getOrganizer(payload: SavvyCalEventPayload): SavvyCalAttendee | null {
  if (!payload.attendees?.length) return null;
  return payload.attendees.find((attendee) => attendee.is_organizer) ?? payload.organizer ?? null;
}

function getLeadCandidate(payload: SavvyCalEventPayload): SavvyCalAttendee | null {
  if (!payload.attendees?.length) return payload.scheduler ?? null;
  const externalAttendees = payload.attendees.filter((attendee) => !attendee.is_organizer);
  if (externalAttendees.length > 0) {
    return externalAttendees[0];
  }
  return payload.scheduler ?? null;
}

function splitName(
  firstName: Nullable<string>,
  lastName: Nullable<string>,
  fallback: string,
): [string | null, string | null] {
  if (firstName || lastName) {
    return [firstName || null, lastName || null];
  }
  if (!fallback) return [null, null];
  const parts = fallback.split(" ");
  if (parts.length === 1) {
    return [parts[0], null];
  }
  return [parts[0], parts.slice(1).join(" ") || null];
}

async function resolveLeadOwnerId(
  supabase: SupabaseClient,
  organizerEmail: Nullable<string>,
): Promise<string | null> {
  if (!organizerEmail) return null;

  const normalizedEmail = organizerEmail.toLowerCase();

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data?.id ?? null;
}

async function resolveLeadSource(
  supabase: SupabaseClient,
  payload: SavvyCalEventPayload
): Promise<LeadSourceDetails> {
  const privateName = payload.link?.private_name ?? "";
  const publicName = payload.link?.name ?? "";
  const scopeName = payload.scope?.name ?? "";
  const linkId = payload.link?.id ?? "";

  const normalized = `${privateName} ${publicName} ${scopeName}`.toLowerCase();
  const utmSource = (payload.metadata?.utm_source as string)?.toLowerCase() ?? "";
  const utmMedium = (payload.metadata?.utm_medium as string)?.toLowerCase() ?? "";

  // First, check UTM parameters for specific ad platforms
  if (utmSource === "fb" || utmSource === "facebook" ||
      utmSource === "ig" || utmSource === "instagram") {
    return {
      sourceKey: utmSource === "ig" || utmSource === "instagram" ? "instagram_ads" : "facebook_ads",
      name: utmSource === "ig" || utmSource === "instagram" ? "Instagram Ads" : "Facebook Ads",
      channel: "paid_social",
      medium: "meta",
      campaign: payload.metadata?.utm_campaign as string ?? undefined,
    };
  }

  if (utmSource === "linkedin") {
    return {
      sourceKey: "linkedin_ads",
      name: "LinkedIn Ads",
      channel: "paid_social",
      medium: "linkedin",
      campaign: payload.metadata?.utm_campaign as string ?? undefined,
    };
  }

  if (utmSource === "google") {
    const isPaid = utmMedium === "cpc" || utmMedium === "ppc" || utmMedium === "paid";
    return {
      sourceKey: isPaid ? "google_ads" : "google_organic",
      name: isPaid ? "Google Ads" : "Google Organic",
      channel: isPaid ? "paid_search" : "organic",
      medium: "google",
      campaign: payload.metadata?.utm_campaign as string ?? undefined,
    };
  }

  // Check for Facebook Ads (via link name)
  if (normalized.includes("facebook") || normalized.includes("facebook ads") ||
      utmMedium.includes("facebook")) {
    return {
      sourceKey: "facebook_ads",
      name: "Facebook Ads",
      channel: "paid_social",
      medium: "meta",
      campaign: payload.metadata?.utm_campaign as string ?? undefined,
    };
  }

  if (normalized.includes("linkedin") || normalized.includes("linkedin ads")) {
    return {
      sourceKey: "linkedin_ads",
      name: "LinkedIn Ads",
      channel: "paid_social",
      medium: "linkedin",
      campaign: payload.metadata?.utm_campaign as string ?? undefined,
    };
  }

  // Check for email outreach - check multiple variations
  if (normalized.includes("email") ||
      normalized.includes("outreach") ||
      normalized.includes("mail") ||
      normalized.includes("email outreach") ||
      utmMedium.includes("email") ||
      utmSource.includes("email") ||
      utmSource.includes("outreach")) {
    return {
      sourceKey: "email_outreach",
      name: "Email Outreach",
      channel: "email",
      medium: "email",
      campaign: payload.metadata?.utm_campaign as string ?? undefined,
    };
  }

  if (normalized.includes("website") || normalized.includes("homepage")) {
    return {
      sourceKey: "website",
      name: "Marketing Website",
      channel: "website",
      medium: "organic",
      campaign: payload.metadata?.utm_campaign as string ?? undefined,
    };
  }

  // Check link_id against savvycal_link_mappings table
  if (linkId) {
    const { data: linkMapping } = await supabase
      .from("savvycal_link_mappings")
      .select("source_name, channel, medium")
      .eq("link_id", linkId)
      .eq("is_active", true)
      .maybeSingle();

    if (linkMapping) {
      return {
        sourceKey: linkMapping.source_name.toLowerCase().replace(/\s+/g, "_"),
        name: linkMapping.source_name,
        channel: linkMapping.channel,
        medium: linkMapping.medium ?? undefined,
        campaign: payload.metadata?.utm_campaign as string ?? undefined,
      };
    }
  }

  if (normalized.includes("personal") || normalized.includes("direct")) {
    return {
      sourceKey: "personal_savvycal",
      name: "Personal SavvyCal",
      channel: "direct",
      medium: "calendaring",
      campaign: payload.metadata?.utm_campaign as string ?? undefined,
    };
  }

  return {
    sourceKey: "unknown",
    name: "Unknown Source",
    channel: payload.metadata?.utm_channel as string ?? undefined,
    medium: payload.metadata?.utm_medium as string ?? undefined,
    campaign: payload.metadata?.utm_campaign as string ?? undefined,
  };
}

async function ensureLeadSource(
  supabase: SupabaseClient,
  details: LeadSourceDetails,
  preferredOwnerId: string | null,
): Promise<{ id: string; default_owner_id: string | null; name?: string } | null> {
  const payload = {
    source_key: details.sourceKey,
    name: details.name,
    channel: details.channel ?? null,
    utm_medium: details.medium ?? null,
    utm_campaign: details.campaign ?? null,
    default_owner_id: preferredOwnerId ?? details.defaultOwnerId ?? undefined,
  };

  const { data, error } = await supabase
    .from("lead_sources")
    .upsert(payload, { onConflict: "source_key" })
    .select("id, default_owner_id, name")
    .single();

  if (error) {
    return null;
  }

  return data;
}

async function upsertContact(
  supabase: SupabaseClient,
  params: {
    email: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    owner_id: string | null;
    company_id: string | null;
  },
): Promise<string | null> {
  const normalizedEmail = params.email.toLowerCase();

  const { data: existing, error: fetchError } = await supabase
    .from("contacts")
    .select("id, company_id, owner_id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (fetchError) {
    return null;
  }

  if (existing) {
    if (!existing.company_id && params.company_id) {
      await supabase
        .from("contacts")
        .update({
          company_id: params.company_id,
          owner_id: params.owner_id ?? existing.owner_id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    }
    return existing.id;
}

  const [insertFirstName, insertLastName] = [
    params.first_name,
    params.last_name,
  ];

  const { data, error } = await supabase
    .from("contacts")
    .insert({
      email: normalizedEmail,
      first_name: insertFirstName,
      last_name: insertLastName,
      phone: params.phone,
      company_id: params.company_id,
      owner_id: params.owner_id,
      is_primary: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    return null;
  }

  return data?.id ?? null;
}

function buildLeadMetadata(
  payload: SavvyCalEventPayload,
  leadCandidate: SavvyCalAttendee | null,
  scheduler: SavvyCalAttendee | undefined,
): Record<string, unknown> {
  return {
    savvycal: {
      link: {
        id: payload.link?.id,
        slug: payload.link?.slug,
        name: payload.link?.name,
        private_name: payload.link?.private_name,
      },
      scope: payload.scope,
      fields: {
        scheduler: scheduler?.fields ?? [],
        attendee: leadCandidate?.fields ?? [],
      },
      buffer_before: payload.buffer_before ?? 0,
      buffer_after: payload.buffer_after ?? 0,
    },
    attendees: (payload.attendees || []).map((attendee) => ({
      email: attendee.email,
      name: attendee.display_name,
      is_organizer: attendee.is_organizer,
      time_zone: attendee.time_zone,
      marketing_opt_in: attendee.marketing_opt_in,
      custom_fields: attendee.fields ?? [],
    })),
    conferencing: payload.conferencing,
    location_settings: payload.location_settings,
  };
}

async function hashPayload(payload: unknown): Promise<string> {
  const serialized = JSON.stringify(payload ?? {});
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(serialized),
  );
  return bufferToHex(digest);
}

function determineLeadStatus(event: SavvyCalWebhookEvent): "new" | "prepping" | "ready" | "converted" | "archived" | "cancelled" {
  const state = event.payload.state?.toLowerCase();
  if (state === "cancelled" || state === "canceled") {
    return "cancelled";
  }
  return "new";
}

/**
 * Check if an event represents a cancellation
 */
function isCancelledEvent(event: SavvyCalWebhookEvent): boolean {
  // Check event type - SavvyCal sends "cancelled" as the event type
  const eventType = event.type?.toLowerCase() || "";
  if (eventType === "cancelled" || eventType.includes("cancel") || eventType.includes("cancelled")) {
    return true;
  }

  // Check payload state
  const state = event.payload.state?.toLowerCase();
  if (state === "cancelled" || state === "canceled") {
    return true;
  }

  // Check for canceled_at timestamp
  if (event.payload.canceled_at) {
    return true;
  }

  return false;
}

/**
 * Check if an event represents a rescheduled meeting
 */
function isRescheduledEvent(event: SavvyCalWebhookEvent): boolean {
  // Check event type - SavvyCal sends "event.changed" for rescheduled events
  const eventType = event.type?.toLowerCase() || "";
  if (eventType === "event.changed" || eventType.includes("rescheduled") || eventType.includes("changed")) {
    return true;
  }

  // Check for rescheduled_at timestamp
  if (event.payload.rescheduled_at) {
    return true;
  }

  return false;
}

/**
 * Update lead status to cancelled and add cancellation metadata
 */
async function updateLeadCancellationStatus(
  supabase: SupabaseClient,
  leadId: string,
  event: SavvyCalWebhookEvent,
): Promise<void> {
  const cancellationTimestamp = event.payload.canceled_at || event.occurred_at || new Date().toISOString();
  
  // Get current tags and update them
  const { data: currentLead } = await supabase
    .from("leads")
    .select("tags, metadata")
    .eq("id", leadId)
    .single();

  const currentTags = (currentLead?.tags as string[]) || [];
  const updatedTags = currentTags.filter(tag => tag !== "Meeting Booked");
  if (!updatedTags.includes("Meeting Cancelled")) {
    updatedTags.push("Meeting Cancelled");
  }

  const currentMetadata = (currentLead?.metadata as Record<string, unknown>) || {};
  const updatedMetadata = {
    ...currentMetadata,
    cancelled_at: cancellationTimestamp,
    cancellation_event_id: event.id,
    cancellation_event_type: event.type,
  };

  const { error } = await supabase
    .from("leads")
    .update({
      status: "cancelled",
      meeting_outcome: "cancelled",
      tags: updatedTags,
      metadata: updatedMetadata,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);

  if (error) {
    throw error;
  }
}

/**
 * Update lead with rescheduled meeting details
 */
async function updateLeadRescheduledStatus(
  supabase: SupabaseClient,
  leadId: string,
  event: SavvyCalWebhookEvent,
): Promise<void> {
  const rescheduledTimestamp = event.payload.rescheduled_at || event.occurred_at || new Date().toISOString();
  
  // Get current lead data
  const { data: currentLead } = await supabase
    .from("leads")
    .select("tags, metadata, status, meeting_start, meeting_end")
    .eq("id", leadId)
    .single();

  const currentTags = (currentLead?.tags as string[]) || [];
  const updatedTags = [...currentTags];
  
  // Remove "Meeting Cancelled" tag if present (meeting was rescheduled, not cancelled)
  const filteredTags = updatedTags.filter(tag => tag !== "Meeting Cancelled");
  
  // Add "Meeting Rescheduled" tag if not already present
  if (!filteredTags.includes("Meeting Rescheduled")) {
    filteredTags.push("Meeting Rescheduled");
  }
  
  // Ensure "Meeting Booked" tag is present
  if (!filteredTags.includes("Meeting Booked")) {
    filteredTags.push("Meeting Booked");
  }

  const currentMetadata = (currentLead?.metadata as Record<string, unknown>) || {};
  const updatedMetadata = {
    ...currentMetadata,
    rescheduled_at: rescheduledTimestamp,
    rescheduled_event_id: event.id,
    rescheduled_event_type: event.type,
    // Track previous meeting time if available
    previous_meeting_start: currentLead?.meeting_start ?? null,
    previous_meeting_end: currentLead?.meeting_end ?? null,
  };

  // Update lead with new meeting details
  const updateData: Record<string, unknown> = {
    meeting_start: event.payload.start_at ?? null,
    meeting_end: event.payload.end_at ?? null,
    meeting_duration_minutes: event.payload.duration ?? null,
    meeting_title: event.payload.summary ?? null,
    meeting_description: event.payload.description ?? null,
    meeting_url: event.payload.conferencing?.join_url ?? event.payload.location ?? null,
    conferencing_type: event.payload.conferencing?.type ?? null,
    conferencing_url: event.payload.conferencing?.join_url ?? null,
    meeting_outcome: "rescheduled",
    tags: filteredTags,
    metadata: updatedMetadata,
    updated_at: new Date().toISOString(),
  };

  // If lead was previously cancelled, change status back to "new"
  if (currentLead?.status === "cancelled") {
    updateData.status = "new";
    updateData.meeting_outcome = "scheduled";
  }

  const { error } = await supabase
    .from("leads")
    .update(updateData)
    .eq("id", leadId);

  if (error) {
    throw error;
  }
}

/**
 * Ensure a client_fact_profiles record exists for the lead's company domain.
 * Uses select-then-insert with race-condition handling via unique constraint.
 * If a profile already exists, this is a no-op.
 * Triggers research-fact-profile if the profile is newly created.
 */
async function ensureCompanyFactProfile(
  supabase: SupabaseClient,
  orgId: string,
  createdBy: string,
  domain: string,
  _fallbackName: string,
): Promise<void> {
  // Check if a fact profile already exists for this domain + org
  const { data: existing } = await supabase
    .from("client_fact_profiles")
    .select("id, research_status")
    .eq("organization_id", orgId)
    .eq("company_domain", domain)
    .eq("is_org_profile", false)
    .maybeSingle();

  if (existing) {
    console.log(`[savvycal-webhook] Fact profile already exists for ${domain}: ${existing.id}`);
    return;
  }

  // Derive company name from domain (capitalize first segment)
  const companyName = domain.split(".")[0]
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const { data: profile, error } = await supabase
    .from("client_fact_profiles")
    .insert({
      organization_id: orgId,
      created_by: createdBy,
      company_name: companyName,
      company_domain: domain,
      profile_type: "target_company",
      is_org_profile: false,
      linked_company_domain: domain,
      research_status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    // 23505 = unique violation — profile was created between our check and insert (race)
    if ((error as any).code === "23505") {
      console.log(`[savvycal-webhook] Fact profile race: ${domain} already exists`);
      return;
    }
    throw error;
  }

  console.log(`[savvycal-webhook] Created fact profile ${profile.id} for ${domain}`);

  // Fire-and-forget: trigger research for the new profile
  const researchUrl = `${SUPABASE_URL}/functions/v1/research-fact-profile`;
  fetch(researchUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      action: "research",
      fact_profile_id: profile.id,
      domain,
    }),
  }).then(async (res) => {
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[research-fact-profile] Failed: ${res.status} - ${text}`);
    } else {
      console.log(`[research-fact-profile] Triggered for profile ${profile.id}`);
    }
  }).catch((err) => {
    console.error(`[research-fact-profile] Error:`, err);
  });
}

