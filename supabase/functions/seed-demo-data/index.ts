// supabase/functions/seed-demo-data/index.ts
// Populates a new org's account with realistic demo data so first-time users
// see a meaningful, lived-in experience immediately after onboarding.
//
// SEED-002 scope: companies, contacts, and pipeline stages.
// SEED-003 scope: meetings, meeting_attendees, meeting_contacts.
// SEED-004 scope: meeting_classifications, meeting_scorecards,
//                 meeting_structured_summaries, meeting_action_items.
//
// Idempotency guard: if the calling org already has >3 companies owned by the
// supplied user_id, the function returns early without creating duplicates.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
} from "../_shared/corsHelper.ts";
import { COMPANIES, CONTACTS, DEALS, STAGES, MEETING_TEMPLATES } from "./seedData.ts";
import { TRANSCRIPT_TEMPLATES, renderTranscript } from "./transcriptTemplates.ts";
import {
  CLASSIFICATION_TEMPLATES,
  SCORECARD_TEMPLATES,
  STRUCTURED_SUMMARY_TEMPLATES,
  ACTION_ITEM_TEMPLATES,
} from "./intelligenceTemplates.ts";

declare const Deno: { env: { get(key: string): string | undefined } };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/** Well-known org_id shared by all demo transcripts in Railway. */
const SHARED_DEMO_ORG_ID = "00000000-0000-0000-0000-000000000060";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SeedRequest {
  org_id: string;
  user_id: string;
  action?: 'seed' | 'resync_railway';  // default: 'seed'
}

interface SeedResponse {
  success: boolean;
  message?: string;
  seeded?: {
    companies: number;
    contacts: number;
    deal_stages: number;
    meetings: number;
    meeting_attendees: number;
    meeting_contacts: number;
    classifications: number;
    scorecards: number;
    summaries: number;
    action_items: number;
    deals: number;
    activities: number;
    org_enrichment: number;
    org_context: number;
    railway_synced: number;
  };
  ids?: {
    companyIds: string[];
    contactIds: string[];
    stageIds: string[];
    meetingIds: string[];
    primaryContactByCompany: Record<string, string>;
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  // CORS preflight
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(req);

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    // Parse and validate request body
    let body: SeedRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { org_id, user_id, action } = body;
    if (!org_id || !user_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: org_id, user_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Service-role client — bypasses RLS so we can write on behalf of any user
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });

    // ------------------------------------------------------------------
    // Action: resync_railway — sync existing meetings to Railway without re-seeding
    // ------------------------------------------------------------------
    if (action === "resync_railway") {
      console.log("[seed-demo-data] resync_railway for org:", org_id);

      const { data: meetings } = await supabase
        .from("meetings")
        .select("id, title, transcript_text, meeting_start, duration_minutes, owner_user_id")
        .eq("org_id", org_id);

      const recordsToSync = (meetings || []).filter((m: any) => m.transcript_text);
      let synced = 0;

      const batchSize = 3;
      for (let i = 0; i < recordsToSync.length; i += batchSize) {
        const batch = recordsToSync.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map(async (m: any) => {
            const syncRes = await fetch(
              `${SUPABASE_URL}/functions/v1/meeting-analytics/api/sync/meeting`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                },
                body: JSON.stringify({
                  type: "INSERT",
                  table: "meetings",
                  record: {
                    id: m.id,
                    title: m.title,
                    transcript_text: m.transcript_text,
                    meeting_start: m.meeting_start,
                    duration_minutes: m.duration_minutes,
                    owner_user_id: m.owner_user_id,
                    org_id: SHARED_DEMO_ORG_ID,
                  },
                }),
              },
            );
            if (!syncRes.ok) {
              const errText = await syncRes.text().catch(() => "unknown");
              throw new Error(`${syncRes.status} ${errText}`);
            }
            return m.id;
          }),
        );

        for (const result of results) {
          if (result.status === "fulfilled") synced++;
          else console.error("[seed-demo-data] Railway sync failed:", result.reason);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `Synced ${synced}/${recordsToSync.length} meetings to Railway`,
          railway_synced: synced,
          total_meetings: recordsToSync.length,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Look up user email for meeting ownership
    let userEmail: string | null = null;
    try {
      const { data: userProfile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", user_id)
        .maybeSingle();
      userEmail = userProfile?.email ?? null;
    } catch (e) {
      console.error("[seed-demo-data] Failed to look up user email:", e);
    }

    // ------------------------------------------------------------------
    // Idempotency guard
    // ------------------------------------------------------------------
    const { count: existingCount, error: countError } = await supabase
      .from("companies")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user_id)
      .eq("clerk_org_id", org_id);

    if (countError) {
      console.error("[seed-demo-data] Failed to check existing companies:", countError);
      return new Response(
        JSON.stringify({ error: "Failed to check existing data" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if ((existingCount ?? 0) > 3) {
      const response: SeedResponse = {
        success: true,
        message: "Already seeded",
      };
      return new Response(
        JSON.stringify(response),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ------------------------------------------------------------------
    // Check if org already has seeded data from another user.
    // If so, reuse the existing companies/contacts and only create
    // user-scoped data (meetings, deals, activities) for the new user.
    // ------------------------------------------------------------------
    let isJoiningExistingOrg = false;
    const { count: orgCompanyCount } = await supabase
      .from("companies")
      .select("id", { count: "exact", head: true })
      .eq("clerk_org_id", org_id);

    if ((orgCompanyCount ?? 0) > 3) {
      isJoiningExistingOrg = true;
      console.log("[seed-demo-data] Org already has data — seeding user-scoped data only for:", user_id);
    }

    // ------------------------------------------------------------------
    // Step 1: Look up existing deal stages
    // deals.stage_id references deal_stages (not the stages table).
    // The seed data maps stageIndex: 0=Lead→SQL, 1=Qualified→Opportunity,
    // 2=Proposal→Verbal, 3=Negotiation→Verbal, 4=Closed Won→Signed.
    // ------------------------------------------------------------------
    const stageIds: string[] = [];

    try {
      const stageNameMap = ['SQL', 'Opportunity', 'Verbal', 'Verbal', 'Signed'];
      const uniqueNames = [...new Set(stageNameMap)];

      const { data: dealStages, error: stagesError } = await supabase
        .from("deal_stages")
        .select("id, name")
        .in("name", uniqueNames);

      if (stagesError || !dealStages || dealStages.length === 0) {
        console.error("[seed-demo-data] Failed to look up deal_stages:", stagesError);
      } else {
        const stageByName: Record<string, string> = {};
        dealStages.forEach((s: { id: string; name: string }) => {
          stageByName[s.name] = s.id;
        });
        // Build stageIds array indexed by STAGES position (0-4)
        for (const name of stageNameMap) {
          stageIds.push(stageByName[name] ?? "");
        }
        console.log("[seed-demo-data] Resolved deal_stages:", stageIds.filter(Boolean).length);
      }
    } catch (stageErr) {
      console.error("[seed-demo-data] Unexpected error looking up deal stages:", stageErr);
    }

    // ------------------------------------------------------------------
    // Step 2 & 3: Companies & Contacts
    // If joining an existing org, look up existing records.
    // Otherwise, create new companies and contacts.
    // ------------------------------------------------------------------
    const companyIds: string[] = new Array(COMPANIES.length).fill(null);
    const contactIds: string[] = [];
    const primaryContactByCompany: Record<string, string> = {};

    if (isJoiningExistingOrg) {
      // --- Reuse existing org companies & contacts ---
      try {
        const { data: existingCompanies } = await supabase
          .from("companies")
          .select("id, name")
          .eq("clerk_org_id", org_id);

        if (existingCompanies) {
          existingCompanies.forEach((c) => {
            const idx = COMPANIES.findIndex((seed) => seed.name === c.name);
            if (idx !== -1) companyIds[idx] = c.id;
          });
          console.log("[seed-demo-data] Reusing", existingCompanies.length, "existing companies");
        }

        const { data: existingContacts } = await supabase
          .from("contacts")
          .select("id, company_id, is_primary, email")
          .eq("clerk_org_id", org_id);

        if (existingContacts) {
          existingContacts.forEach((c) => {
            contactIds.push(c.id);
            if (c.is_primary && c.company_id) {
              primaryContactByCompany[c.company_id] = c.id;
            }
          });
          console.log("[seed-demo-data] Reusing", existingContacts.length, "existing contacts");
        }
      } catch (reuseErr) {
        console.error("[seed-demo-data] Error loading existing org data:", reuseErr);
      }
    } else {
      // --- Create new companies ---
      try {
        const companyRows = COMPANIES.map((c) => ({
          name: c.name,
          domain: c.domain,
          industry: c.industry,
          size: c.size,
          website: c.website,
          description: c.description,
          linkedin_url: c.linkedin_url,
          owner_id: user_id,
          clerk_org_id: org_id,
          source: "manual",
          first_seen_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));

        const { data: insertedCompanies, error: companiesError } = await supabase
          .from("companies")
          .insert(companyRows)
          .select("id, name");

        if (companiesError) {
          console.error("[seed-demo-data] Companies insert error:", companiesError);
        } else if (insertedCompanies) {
          insertedCompanies.forEach((inserted) => {
            const idx = COMPANIES.findIndex((c) => c.name === inserted.name);
            if (idx !== -1) companyIds[idx] = inserted.id;
          });
          console.log("[seed-demo-data] Seeded companies:", insertedCompanies.length);
        }
      } catch (companyErr) {
        console.error("[seed-demo-data] Unexpected error seeding companies:", companyErr);
      }

      // --- Create new contacts ---
      try {
        const contactRows = CONTACTS
          .filter((c) => companyIds[c.companyIndex] != null)
          .map((c) => {
            const companyId = companyIds[c.companyIndex];
            return {
              email: c.email,
              first_name: c.first_name,
              last_name: c.last_name,
              full_name: c.full_name,
              title: c.title,
              company: c.company,
              company_id: companyId,
              phone: c.phone,
              linkedin_url: c.linkedin_url,
              engagement_level: c.engagement_level,
              source: c.source,
              is_primary: c.is_primary,
              owner_id: user_id,
              clerk_org_id: org_id,
              first_seen_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
          });

        const { data: insertedContacts, error: contactsError } = await supabase
          .from("contacts")
          .insert(contactRows)
          .select("id, company_id, is_primary, email");

        if (contactsError) {
          console.error("[seed-demo-data] Contacts insert error:", contactsError);
        } else if (insertedContacts) {
          insertedContacts.forEach((inserted) => {
            contactIds.push(inserted.id);
            if (inserted.is_primary && inserted.company_id) {
              primaryContactByCompany[inserted.company_id] = inserted.id;
            }
          });
          console.log("[seed-demo-data] Seeded contacts:", insertedContacts.length);
        }
      } catch (contactErr) {
        console.error("[seed-demo-data] Unexpected error seeding contacts:", contactErr);
      }
    }

    // ------------------------------------------------------------------
    // Step 4: Seed meetings
    // One meeting row per MEETING_TEMPLATES entry, linked to the
    // companies and contacts seeded above.
    // ------------------------------------------------------------------
    const meetingIds: string[] = [];
    // meetingData tracks per-meeting context needed for intelligence seeding
    const meetingData: Array<{ id: string; meetingType: string; contactName: string }> = [];

    // Helper: generate a short one-liner summary based on meeting type and company name
    const buildOneliner = (meetingType: string, companyName: string): string => {
      switch (meetingType) {
        case "discovery":
          return `Discovery call with ${companyName} to explore sales automation needs`;
        case "demo":
          return `Product walkthrough with ${companyName} covering follow-up and meeting prep`;
        case "negotiation":
          return `Pricing and contract discussion with ${companyName}`;
        case "follow_up":
          return `Follow-up check-in with ${companyName} to advance the deal`;
        case "closing":
          return `Closing call with ${companyName} — aligning on contract terms`;
        case "general":
        default:
          return `Relationship check-in with ${companyName}`;
      }
    };

    try {
      for (const template of MEETING_TEMPLATES) {
        const companyId = companyIds[template.companyIndex];
        if (!companyId) {
          console.warn(
            `[seed-demo-data] Skipping meeting — company at index ${template.companyIndex} not found`,
          );
          continue;
        }

        // Resolve the primary contact for this meeting (first in contactIndices)
        const primaryContactSeed = CONTACTS[template.contactIndices[0]];
        if (!primaryContactSeed) {
          console.warn(
            `[seed-demo-data] Skipping meeting — contact at index ${template.contactIndices[0]} not found`,
          );
          continue;
        }

        const companyName = COMPANIES[template.companyIndex].name;

        // Render transcript with real names
        const rendered = renderTranscript(
          TRANSCRIPT_TEMPLATES[template.transcriptIndex],
          {
            repName: "Demo Rep",
            contactName: primaryContactSeed.full_name,
            contactTitle: primaryContactSeed.title,
            companyName,
          },
        );

        // Compute timestamps
        const meetingStartMs = Date.now() - template.daysAgo * 86400000;
        const meetingStart = new Date(meetingStartMs).toISOString();
        const meetingEnd = new Date(
          meetingStartMs + template.durationMinutes * 60000,
        ).toISOString();

        // Random sentiment and talk time
        const sentimentScore = Math.round((0.3 + Math.random() * 0.6) * 100) / 100;
        const talkTimeRepPct = Math.floor(35 + Math.random() * 20);
        const talkTimeCustomerPct = 100 - talkTimeRepPct;

        // Look up the inserted contact_id for the primary contact
        // We match by email since contactIds is a flat list without index metadata
        const primaryContactEmail = primaryContactSeed.email;

        // Generate a nice thumbnail for this meeting type
        const meetingTypeColors: Record<string, string> = {
          discovery: "4f46e5",   // indigo
          demo: "0891b2",       // cyan
          follow_up: "059669",  // emerald
          negotiation: "d97706", // amber
          closing: "dc2626",    // red
          general: "7c3aed",    // violet
        };
        const thumbBg = meetingTypeColors[template.meetingType] || "6b7280";
        const thumbInitials = companyName.split(" ").map((w: string) => w[0]).join("").slice(0, 2);
        const thumbnailUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(thumbInitials)}&background=${thumbBg}&color=fff&size=640&font-size=0.4&bold=true&format=png`;

        const { data: insertedMeeting, error: meetingError } = await supabase
          .from("meetings")
          .insert({
            title: rendered.title,
            owner_user_id: user_id,
            owner_email: userEmail,
            org_id,
            meeting_start: meetingStart,
            meeting_end: meetingEnd,
            duration_minutes: template.durationMinutes,
            transcript_text: rendered.transcript,
            transcript_status: "complete",
            summary_status: "complete",
            thumbnail_status: "complete",
            thumbnail_url: thumbnailUrl,
            sync_status: "synced",
            source_type: "fathom",
            company_id: companyId,
            sentiment_score: sentimentScore,
            talk_time_rep_pct: talkTimeRepPct,
            talk_time_customer_pct: talkTimeCustomerPct,
            summary_oneliner: buildOneliner(template.meetingType, companyName),
            calendar_invitees_type: "one_or_more_external",
            is_historical_import: false,
          })
          .select("id")
          .single();

        if (meetingError || !insertedMeeting) {
          console.error(
            `[seed-demo-data] Meeting insert error for ${companyName}:`,
            meetingError,
          );
          continue;
        }

        const meetingId = insertedMeeting.id as string;

        // After meeting is inserted, look up the real contact_id for primary contact
        // so we can set primary_contact_id
        const { data: primaryContactRow } = await supabase
          .from("contacts")
          .select("id")
          .eq("email", primaryContactEmail)
          .eq("clerk_org_id", org_id)
          .maybeSingle();

        if (primaryContactRow?.id) {
          await supabase
            .from("meetings")
            .update({ primary_contact_id: primaryContactRow.id })
            .eq("id", meetingId);
        }

        meetingIds.push(meetingId);
        meetingData.push({
          id: meetingId,
          meetingType: template.meetingType,
          contactName: primaryContactSeed.full_name,
        });

        // --------------------------------------------------------------
        // Step 5: Seed meeting_attendees
        // One row for the rep + one row per contact in contactIndices
        // --------------------------------------------------------------
        try {
          const attendeeRows: Array<{
            meeting_id: string;
            name: string;
            email: string;
            is_external: boolean;
            role: string;
          }> = [
            {
              meeting_id: meetingId,
              name: "Demo Rep",
              email: "rep@demo.sixty.com",
              is_external: false,
              role: "organizer",
            },
          ];

          for (const contactIdx of template.contactIndices) {
            const contactSeed = CONTACTS[contactIdx];
            if (!contactSeed) continue;
            attendeeRows.push({
              meeting_id: meetingId,
              name: contactSeed.full_name,
              email: contactSeed.email,
              is_external: true,
              role: "attendee",
            });
          }

          const { error: attendeesError } = await supabase
            .from("meeting_attendees")
            .insert(attendeeRows);

          if (attendeesError) {
            console.error(
              `[seed-demo-data] Attendees insert error for meeting ${meetingId}:`,
              attendeesError,
            );
          }
        } catch (attendeeErr) {
          console.error(
            `[seed-demo-data] Unexpected error seeding attendees for meeting ${meetingId}:`,
            attendeeErr,
          );
        }

        // --------------------------------------------------------------
        // Step 6: Seed meeting_contacts
        // Link each contact in contactIndices to the meeting
        // --------------------------------------------------------------
        try {
          const meetingContactRows: Array<{
            meeting_id: string;
            contact_id: string;
            is_primary: boolean;
            role: string;
          }> = [];

          for (let i = 0; i < template.contactIndices.length; i++) {
            const contactIdx = template.contactIndices[i];
            const contactSeed = CONTACTS[contactIdx];
            if (!contactSeed) continue;

            // Look up the inserted contact_id by email + org
            const { data: contactRow } = await supabase
              .from("contacts")
              .select("id")
              .eq("email", contactSeed.email)
              .eq("clerk_org_id", org_id)
              .maybeSingle();

            if (!contactRow?.id) continue;

            meetingContactRows.push({
              meeting_id: meetingId,
              contact_id: contactRow.id,
              is_primary: i === 0,
              role: "attendee",
            });
          }

          if (meetingContactRows.length > 0) {
            const { error: mcError } = await supabase
              .from("meeting_contacts")
              .insert(meetingContactRows);

            if (mcError) {
              console.error(
                `[seed-demo-data] meeting_contacts insert error for meeting ${meetingId}:`,
                mcError,
              );
            }
          }
        } catch (mcErr) {
          console.error(
            `[seed-demo-data] Unexpected error seeding meeting_contacts for meeting ${meetingId}:`,
            mcErr,
          );
        }
      }

      console.log("[seed-demo-data] Seeded meetings:", meetingIds.length);
    } catch (meetingErr) {
      console.error("[seed-demo-data] Unexpected error seeding meetings:", meetingErr);
    }

    // ------------------------------------------------------------------
    // Step 7: Seed meeting_classifications
    // ------------------------------------------------------------------
    let classificationsCount = 0;

    if (meetingData.length > 0) {
      try {
        const classificationRows = meetingData.flatMap(({ id: meetingId, meetingType }) => {
          const tmpl = CLASSIFICATION_TEMPLATES.find((t) => t.meetingType === meetingType);
          if (!tmpl) return [];
          return [{
            meeting_id: meetingId,
            org_id,
            has_forward_movement: tmpl.has_forward_movement,
            has_proposal_request: tmpl.has_proposal_request,
            has_pricing_discussion: tmpl.has_pricing_discussion,
            has_competitor_mention: tmpl.has_competitor_mention,
            has_objection: tmpl.has_objection,
            has_demo_request: tmpl.has_demo_request,
            has_timeline_discussion: tmpl.has_timeline_discussion,
            has_budget_discussion: tmpl.has_budget_discussion,
            has_decision_maker: tmpl.has_decision_maker,
            has_next_steps: tmpl.has_next_steps,
            outcome: tmpl.outcome,
            detected_stage: tmpl.detected_stage,
            topics: tmpl.topics,
            objections: tmpl.objections,
            competitors: tmpl.competitors,
            keywords: tmpl.keywords,
            objection_count: tmpl.objection_count,
            competitor_mention_count: tmpl.competitor_mention_count,
            positive_signal_count: tmpl.positive_signal_count,
            negative_signal_count: tmpl.negative_signal_count,
          }];
        });

        if (classificationRows.length > 0) {
          const { error: classError } = await supabase
            .from("meeting_classifications")
            .insert(classificationRows);

          if (classError) {
            console.error("[seed-demo-data] meeting_classifications insert error:", classError);
          } else {
            classificationsCount = classificationRows.length;
            console.log("[seed-demo-data] Seeded meeting_classifications:", classificationsCount);
          }
        }
      } catch (classErr) {
        console.error("[seed-demo-data] Unexpected error seeding meeting_classifications:", classErr);
      }
    }

    // ------------------------------------------------------------------
    // Step 8: Seed meeting_scorecards
    // ------------------------------------------------------------------
    let scorecardsCount = 0;

    if (meetingData.length > 0) {
      try {
        const scorecardRows = meetingData.flatMap(({ id: meetingId, meetingType }) => {
          const tmpl = SCORECARD_TEMPLATES.find((t) => t.meetingType === meetingType);
          if (!tmpl) return [];
          return [{
            meeting_id: meetingId,
            org_id,
            rep_user_id: user_id,
            overall_score: tmpl.overall_score,
            grade: tmpl.grade,
            metric_scores: tmpl.metric_scores,
            talk_time_rep_pct: tmpl.talk_time_rep_pct,
            talk_time_customer_pct: tmpl.talk_time_customer_pct,
            discovery_questions_count: tmpl.discovery_questions_count,
            discovery_questions_examples: tmpl.discovery_questions_examples,
            next_steps_established: tmpl.next_steps_established,
            next_steps_details: tmpl.next_steps_details,
            strengths: tmpl.strengths,
            areas_for_improvement: tmpl.areas_for_improvement,
            specific_feedback: tmpl.specific_feedback,
            coaching_tips: tmpl.coaching_tips,
            key_moments: tmpl.key_moments,
            detected_meeting_type: tmpl.detected_meeting_type,
            ai_model_used: 'gemini-1.5-flash',
          }];
        });

        if (scorecardRows.length > 0) {
          const { error: scoreError } = await supabase
            .from("meeting_scorecards")
            .insert(scorecardRows);

          if (scoreError) {
            console.error("[seed-demo-data] meeting_scorecards insert error:", scoreError);
          } else {
            scorecardsCount = scorecardRows.length;
            console.log("[seed-demo-data] Seeded meeting_scorecards:", scorecardsCount);
          }
        }
      } catch (scoreErr) {
        console.error("[seed-demo-data] Unexpected error seeding meeting_scorecards:", scoreErr);
      }
    }

    // ------------------------------------------------------------------
    // Step 9: Seed meeting_structured_summaries
    // ------------------------------------------------------------------
    let summariesCount = 0;

    if (meetingData.length > 0) {
      try {
        const summaryRows = meetingData.flatMap(({ id: meetingId, meetingType }) => {
          const tmpl = STRUCTURED_SUMMARY_TEMPLATES.find((t) => t.meetingType === meetingType);
          if (!tmpl) return [];
          return [{
            meeting_id: meetingId,
            org_id,
            key_decisions: tmpl.key_decisions,
            rep_commitments: tmpl.rep_commitments,
            prospect_commitments: tmpl.prospect_commitments,
            stakeholders_mentioned: tmpl.stakeholders_mentioned,
            pricing_discussed: tmpl.pricing_discussed,
            technical_requirements: tmpl.technical_requirements,
            outcome_signals: tmpl.outcome_signals,
            stage_indicators: tmpl.stage_indicators,
            competitor_mentions: tmpl.competitor_mentions,
            objections: tmpl.objections,
            ai_model_used: 'gemini-1.5-flash',
          }];
        });

        if (summaryRows.length > 0) {
          const { error: summaryError } = await supabase
            .from("meeting_structured_summaries")
            .insert(summaryRows);

          if (summaryError) {
            console.error("[seed-demo-data] meeting_structured_summaries insert error:", summaryError);
          } else {
            summariesCount = summaryRows.length;
            console.log("[seed-demo-data] Seeded meeting_structured_summaries:", summariesCount);
          }
        }
      } catch (summaryErr) {
        console.error("[seed-demo-data] Unexpected error seeding meeting_structured_summaries:", summaryErr);
      }
    }

    // ------------------------------------------------------------------
    // Step 10: Seed meeting_action_items
    // ------------------------------------------------------------------
    let actionItemsCount = 0;

    if (meetingData.length > 0) {
      try {
        const actionRows = meetingData.flatMap(({ id: meetingId, meetingType, contactName }) => {
          const templates = ACTION_ITEM_TEMPLATES[meetingType] ?? [];
          // Look up the meeting_start for deadline calculation
          // We stored daysAgo on the template — re-derive from meetingData isn't possible here,
          // so we query below. Instead, use current time as the baseline for deadline offsets.
          return templates.map((tmpl) => {
            const title = tmpl.title
              .replace(/\{\{REP_NAME\}\}/g, "Demo Rep")
              .replace(/\{\{CONTACT_NAME\}\}/g, contactName);
            const assigneeName = tmpl.assignee_name
              .replace(/\{\{REP_NAME\}\}/g, "Demo Rep")
              .replace(/\{\{CONTACT_NAME\}\}/g, contactName);
            const deadlineDate = new Date(Date.now() + tmpl.deadlineOffsetDays * 86400000);
            const deadlineIso = deadlineDate.toISOString();
            const aiDeadlineDate = deadlineDate.toISOString().split("T")[0]; // date only
            return {
              meeting_id: meetingId,
              title,
              assignee_name: assigneeName,
              priority: tmpl.priority,
              category: tmpl.category,
              deadline_at: deadlineIso,
              ai_deadline: aiDeadlineDate,
              completed: false,
              ai_generated: true,
              is_sales_rep_task: tmpl.is_sales_rep_task,
              importance: tmpl.importance,
              ai_confidence: 0.85,
              needs_review: false,
            };
          });
        });

        if (actionRows.length > 0) {
          const { error: actionError } = await supabase
            .from("meeting_action_items")
            .insert(actionRows);

          if (actionError) {
            console.error("[seed-demo-data] meeting_action_items insert error:", actionError);
          } else {
            actionItemsCount = actionRows.length;
            console.log("[seed-demo-data] Seeded meeting_action_items:", actionItemsCount);
          }
        }
      } catch (actionErr) {
        console.error("[seed-demo-data] Unexpected error seeding meeting_action_items:", actionErr);
      }
    }

    // ------------------------------------------------------------------
    // Step 11: Seed deals
    // ------------------------------------------------------------------
    let dealsCount = 0;

    try {
      for (const deal of DEALS) {
        const companyId = companyIds[deal.companyIndex];
        if (!companyId) {
          console.warn(
            `[seed-demo-data] Skipping deal "${deal.name}" — company at index ${deal.companyIndex} not seeded`,
          );
          continue;
        }

        const stageId = stageIds[deal.stageIndex];
        if (!stageId) {
          console.warn(
            `[seed-demo-data] Skipping deal "${deal.name}" — stage at index ${deal.stageIndex} not available`,
          );
          continue;
        }

        // Resolve the close date
        const closeDateMs = Date.now() + deal.closeDateOffsetDays * 86400000;
        const closeDate = new Date(closeDateMs).toISOString().split("T")[0]; // YYYY-MM-DD

        // Resolve primary contact for this company
        const primaryContactId = primaryContactByCompany[companyId] ?? null;
        const primaryContactSeed = CONTACTS.find(
          (c) => c.companyIndex === deal.companyIndex && c.is_primary,
        );

        try {
          const { error: dealError } = await supabase
            .from("deals")
            .insert({
              name: deal.name,
              company: COMPANIES[deal.companyIndex].name,
              company_id: companyId,
              value: deal.value,
              one_off_revenue: deal.one_off_revenue,
              monthly_mrr: deal.monthly_mrr,
              annual_value: deal.one_off_revenue + deal.monthly_mrr * 12,
              stage_id: stageId,
              owner_id: user_id,
              status: deal.status,
              probability: deal.probability,
              health_score: deal.health_score,
              risk_level: deal.risk_level,
              close_date: closeDate,
              description: deal.description,
              next_steps: deal.next_steps,
              primary_contact_id: primaryContactId,
              contact_name: primaryContactSeed?.full_name ?? null,
              contact_email: primaryContactSeed?.email ?? null,
              clerk_org_id: org_id,
            });

          if (dealError) {
            console.error(`[seed-demo-data] Deal insert error for "${deal.name}":`, dealError);
          } else {
            dealsCount++;
          }
        } catch (singleDealErr) {
          console.error(`[seed-demo-data] Unexpected error inserting deal "${deal.name}":`, singleDealErr);
        }
      }

      console.log("[seed-demo-data] Seeded deals:", dealsCount);
    } catch (dealsErr) {
      console.error("[seed-demo-data] Unexpected error in deals seeding block:", dealsErr);
    }

    // ------------------------------------------------------------------
    // Step 12: Seed activities
    // Generate 20-25 activity records spread over 90 days, derived
    // programmatically from the seeded meetings and deals.
    // ------------------------------------------------------------------
    let activitiesCount = 0;

    try {
      const activityRows: Array<{
        user_id: string;
        type: string;
        status: string;
        priority: string;
        client_name: string;
        sales_rep: string;
        details: string;
        date: string;
        clerk_org_id: string;
        outbound_type?: string;
        meeting_id?: string;
      }> = [];

      const nowMs = Date.now();

      // 1. One 'meeting' activity per seeded meeting
      // meetingData is built in the same order as successful MEETING_TEMPLATES inserts.
      // We track a separate cursor into MEETING_TEMPLATES to find daysAgo + companyIndex.
      let meetingTemplateIdx = 0;
      for (let mdIdx = 0; mdIdx < meetingData.length; mdIdx++) {
        const md = meetingData[mdIdx];

        // Advance the template cursor to the next template that actually produced a meeting
        // (templates for companies that failed to seed are skipped in the loop above).
        // Since meetingData and MEETING_TEMPLATES share the same ordering logic we can
        // rely on a parallel walk — both skip the same entries (missing companyId / contact).
        while (
          meetingTemplateIdx < MEETING_TEMPLATES.length &&
          !companyIds[MEETING_TEMPLATES[meetingTemplateIdx].companyIndex]
        ) {
          meetingTemplateIdx++;
        }
        const tmpl = MEETING_TEMPLATES[meetingTemplateIdx] ?? null;
        meetingTemplateIdx++;

        const daysAgo = tmpl?.daysAgo ?? 0;
        const companyName = tmpl
          ? COMPANIES[tmpl.companyIndex]?.name ?? "Unknown"
          : "Unknown";

        const meetingDateMs = nowMs - daysAgo * 86400000;
        const meetingDateStr = new Date(meetingDateMs).toISOString();

        activityRows.push({
          user_id,
          type: "meeting",
          status: "completed",
          priority: "medium",
          client_name: companyName,
          sales_rep: "Demo Rep",
          details: `${md.meetingType.charAt(0).toUpperCase() + md.meetingType.slice(1).replace("_", " ")} call with ${md.contactName}`,
          date: meetingDateStr,
          clerk_org_id: org_id,
          meeting_id: md.id,
        });
      }

      // 2. Outbound email activities — one per active deal (spread over 90 days)
      const outboundDetails: Array<{ template: string; type: "email" | "linkedin" }> = [
        { template: "Sent follow-up email with case study and pricing overview", type: "email" },
        { template: "Sent LinkedIn message referencing mutual connection and value prop", type: "linkedin" },
        { template: "Emailed proposal summary and invited questions before deadline", type: "email" },
        { template: "Sent check-in email after 2-week silence — re-engaged thread", type: "email" },
        { template: "LinkedIn InMail to champion with relevant industry insight", type: "linkedin" },
        { template: "Follow-up email with updated ROI calculator attached", type: "email" },
        { template: "Sent introductory deck after initial referral connection", type: "email" },
      ];

      DEALS.forEach((deal, idx) => {
        if (deal.status === "lost") return; // skip lost deals
        const companyId = companyIds[deal.companyIndex];
        if (!companyId) return;

        const companyName = COMPANIES[deal.companyIndex].name;
        const outbound = outboundDetails[idx % outboundDetails.length];
        // Spread across 90 days: earliest activities at day 85, recent at day 5
        const daysOffset = Math.max(5, 85 - idx * 7);
        const activityDateMs = nowMs - daysOffset * 86400000;

        activityRows.push({
          user_id,
          type: "outbound",
          status: "completed",
          priority: idx < 3 ? "high" : "medium",
          client_name: companyName,
          sales_rep: "Demo Rep",
          details: outbound.template,
          date: new Date(activityDateMs).toISOString(),
          clerk_org_id: org_id,
          outbound_type: outbound.type,
        });
      });

      // 3. Sale activities for won deals
      for (const deal of DEALS) {
        if (deal.status !== "won") continue;
        const companyId = companyIds[deal.companyIndex];
        if (!companyId) continue;

        const companyName = COMPANIES[deal.companyIndex].name;
        const closedDateMs = nowMs + deal.closeDateOffsetDays * 86400000;

        activityRows.push({
          user_id,
          type: "sale",
          status: "completed",
          priority: "high",
          client_name: companyName,
          sales_rep: "Demo Rep",
          details: `Deal closed — ${deal.name}. Contract signed and onboarding initiated.`,
          date: new Date(closedDateMs).toISOString(),
          clerk_org_id: org_id,
        });
      }

      // 4. Proposal activities for deals in Proposal or Negotiation stage
      for (const deal of DEALS) {
        if (deal.stageIndex !== 2 && deal.stageIndex !== 3) continue;
        if (deal.status !== "active") continue;
        const companyId = companyIds[deal.companyIndex];
        if (!companyId) continue;

        const companyName = COMPANIES[deal.companyIndex].name;
        const proposalDaysAgo = deal.stageIndex === 3 ? 21 : 10;
        const proposalDateMs = nowMs - proposalDaysAgo * 86400000;

        activityRows.push({
          user_id,
          type: "proposal",
          status: "completed",
          priority: "high",
          client_name: companyName,
          sales_rep: "Demo Rep",
          details: `Proposal sent for ${deal.name} — value $${deal.value.toLocaleString()}. Awaiting response.`,
          date: new Date(proposalDateMs).toISOString(),
          clerk_org_id: org_id,
        });
      }

      // 5. Extra current-month activities to ensure dashboard KPIs are populated
      // Add 15 recent outbound activities across the current month
      const currentMonthOutbound = [
        { client: "Meridian Analytics", detail: "Cold outreach with personalized case study", daysAgo: 1 },
        { client: "ClearPath Finance", detail: "Follow-up email with ROI analysis deck", daysAgo: 1 },
        { client: "Vantage Health Systems", detail: "LinkedIn connection request with shared article", daysAgo: 2 },
        { client: "Forge Manufacturing", detail: "Email sequence touch 3 — pricing overview", daysAgo: 2 },
        { client: "ShipStream Logistics", detail: "Re-engagement email after conference meeting", daysAgo: 3 },
        { client: "Amplify Marketing", detail: "Sent product comparison document", daysAgo: 4 },
        { client: "Nexus Cloud Solutions", detail: "Cold email with industry benchmark report", daysAgo: 5 },
        { client: "Verdant PropTech", detail: "LinkedIn InMail with relevant success story", daysAgo: 6 },
        { client: "Orion Enterprise Software", detail: "Introduction email via warm referral", daysAgo: 7 },
        { client: "BrightPath Learning", detail: "Follow-up on webinar attendance", daysAgo: 8 },
        { client: "Meridian Analytics", detail: "Sent updated proposal with volume discount", daysAgo: 10 },
        { client: "ClearPath Finance", detail: "Check-in email after product demo", daysAgo: 12 },
        { client: "Vantage Health Systems", detail: "Shared customer testimonial and case study", daysAgo: 14 },
        { client: "Forge Manufacturing", detail: "LinkedIn message about upcoming feature", daysAgo: 16 },
        { client: "ShipStream Logistics", detail: "Email with implementation timeline estimate", daysAgo: 18 },
      ];

      for (const ob of currentMonthOutbound) {
        activityRows.push({
          user_id,
          type: "outbound",
          status: "completed",
          priority: ob.daysAgo <= 3 ? "high" : "medium",
          client_name: ob.client,
          sales_rep: "Demo Rep",
          details: ob.detail,
          date: new Date(nowMs - ob.daysAgo * 86400000).toISOString(),
          clerk_org_id: org_id,
          outbound_type: ob.daysAgo % 3 === 0 ? "linkedin" : "email",
        });
      }

      // 6. Extra current-month proposal activities
      const currentMonthProposals = [
        { client: "Meridian Analytics", detail: "Sent enterprise proposal — $45,000 annual", daysAgo: 3, amount: 45000 },
        { client: "Vantage Health Systems", detail: "Sent custom pilot proposal — $28,000 Q1", daysAgo: 7, amount: 28000 },
        { client: "Nexus Cloud Solutions", detail: "Sent starter package proposal — $12,000/yr", daysAgo: 12, amount: 12000 },
      ];

      for (const p of currentMonthProposals) {
        activityRows.push({
          user_id,
          type: "proposal",
          status: "completed",
          priority: "high",
          client_name: p.client,
          sales_rep: "Demo Rep",
          details: p.detail,
          date: new Date(nowMs - p.daysAgo * 86400000).toISOString(),
          clerk_org_id: org_id,
        });
      }

      // 7. Extra current-month sale activities (closed deals this month)
      const currentMonthSales = [
        { client: "BrightPath Learning", detail: "Deal closed — Annual Platform License. Contract signed.", daysAgo: 5, amount: 18500 },
        { client: "Amplify Marketing", detail: "Deal closed — Growth Package + onboarding. Revenue booked.", daysAgo: 11, amount: 32000 },
      ];

      for (const s of currentMonthSales) {
        activityRows.push({
          user_id,
          type: "sale",
          status: "completed",
          priority: "high",
          client_name: s.client,
          sales_rep: "Demo Rep",
          details: s.detail,
          amount: s.amount,
          date: new Date(nowMs - s.daysAgo * 86400000).toISOString(),
          clerk_org_id: org_id,
        });
      }

      if (activityRows.length > 0) {
        // Insert in batches to avoid hitting payload limits; 25 per batch
        const batchSize = 25;
        for (let i = 0; i < activityRows.length; i += batchSize) {
          const batch = activityRows.slice(i, i + batchSize);
          const { error: activityError } = await supabase
            .from("activities")
            .insert(batch);

          if (activityError) {
            console.error(`[seed-demo-data] activities insert error (batch ${i / batchSize}):`, activityError);
          } else {
            activitiesCount += batch.length;
          }
        }
      }

      console.log("[seed-demo-data] Seeded activities:", activitiesCount);
    } catch (activitiesErr) {
      console.error("[seed-demo-data] Unexpected error seeding activities:", activitiesErr);
    }

    // ------------------------------------------------------------------
    // Step 12a: Seed sales targets for the current month
    // ------------------------------------------------------------------
    let targetsCount = 0;
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

      const { error: targetError } = await supabase
        .from("targets")
        .upsert(
          {
            user_id: user_id,
            revenue_target: 75000,
            outbound_target: 50,
            meetings_target: 20,
            proposal_target: 8,
            start_date: startOfMonth,
            end_date: endOfMonth,
            created_by: user_id,
          },
          { onConflict: "user_id,start_date,end_date" },
        );

      if (targetError) {
        // If upsert fails due to no unique constraint, try plain insert
        console.warn("[seed-demo-data] targets upsert failed, trying insert:", targetError.message);
        const { error: insertError } = await supabase
          .from("targets")
          .insert({
            user_id: user_id,
            revenue_target: 75000,
            outbound_target: 50,
            meetings_target: 20,
            proposal_target: 8,
            start_date: startOfMonth,
            end_date: endOfMonth,
            created_by: user_id,
          });
        if (insertError) {
          console.error("[seed-demo-data] targets insert error:", insertError);
        } else {
          targetsCount = 1;
        }
      } else {
        targetsCount = 1;
      }

      console.log("[seed-demo-data] Seeded targets:", targetsCount);
    } catch (targetErr) {
      console.error("[seed-demo-data] Unexpected error seeding targets:", targetErr);
    }

    // ------------------------------------------------------------------
    // Step 12b: Sync seeded meetings to Railway (meeting-analytics)
    // This pushes transcript data to the Railway PostgreSQL database so that
    // the AI "Ask Anything" feature can query them via vector search.
    // Fire-and-forget per meeting — failures are non-fatal.
    // ------------------------------------------------------------------
    let railwaySyncCount = 0;

    if (meetingIds.length > 0) {
      console.log("[seed-demo-data] Syncing", meetingIds.length, "meetings to Railway...");

      // Fetch all meeting records in one query
      const { data: meetingRecords } = await supabase
        .from("meetings")
        .select("id, title, transcript_text, meeting_start, duration_minutes, owner_user_id")
        .in("id", meetingIds);

      const recordsToSync = (meetingRecords || []).filter((m: any) => m.transcript_text);

      // Sync in parallel batches of 3 to avoid overloading the sync endpoint
      // (each sync call generates OpenAI embeddings which takes a few seconds)
      const batchSize = 3;
      for (let i = 0; i < recordsToSync.length; i += batchSize) {
        const batch = recordsToSync.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map(async (meetingRecord: any) => {
            const syncRes = await fetch(
              `${SUPABASE_URL}/functions/v1/meeting-analytics/api/sync/meeting`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                },
                body: JSON.stringify({
                  type: "INSERT",
                  table: "meetings",
                  record: {
                    id: meetingRecord.id,
                    title: meetingRecord.title,
                    transcript_text: meetingRecord.transcript_text,
                    meeting_start: meetingRecord.meeting_start,
                    duration_minutes: meetingRecord.duration_minutes,
                    owner_user_id: meetingRecord.owner_user_id,
                    org_id: SHARED_DEMO_ORG_ID,
                  },
                }),
              },
            );
            if (!syncRes.ok) {
              const errText = await syncRes.text().catch(() => "unknown");
              throw new Error(`${syncRes.status} ${errText}`);
            }
            return meetingRecord.id;
          }),
        );

        for (const result of results) {
          if (result.status === "fulfilled") {
            railwaySyncCount++;
          } else {
            console.error(`[seed-demo-data] Railway sync failed:`, result.reason);
          }
        }
      }

      console.log("[seed-demo-data] Railway sync complete:", railwaySyncCount, "/", recordsToSync.length);
    }

    // ------------------------------------------------------------------
    // Step 13: Seed organization_enrichment
    // ------------------------------------------------------------------
    let orgEnrichmentCount = 0;

    try {
      const { error: enrichmentError } = await supabase
        .from("organization_enrichment")
        .upsert(
          {
            organization_id: org_id,
            domain: "demo.use60.com",
            company_name: "Demo Organization",
            description: "Demo organization with pre-seeded sales data for exploring 60 features.",
            industry: "Technology",
            employee_count: "50-100",
            founded_year: 2020,
            headquarters: "London, UK",
            tech_stack: ["HubSpot", "Slack", "Google Workspace", "Stripe"],
            products: ["Sales Automation Platform", "Meeting Intelligence", "AI Follow-up Engine"],
            competitors: ["Gong", "Salesloft", "Outreach"],
            target_market: "Mid-market B2B SaaS companies",
            status: "completed",
            confidence_score: 0.95,
            model: "demo-seed",
          },
          { onConflict: "organization_id" },
        );

      if (enrichmentError) {
        console.error("[seed-demo-data] organization_enrichment upsert error:", enrichmentError);
      } else {
        orgEnrichmentCount = 1;
        console.log("[seed-demo-data] Seeded organization_enrichment");
      }
    } catch (enrichmentErr) {
      console.error("[seed-demo-data] Unexpected error seeding organization_enrichment:", enrichmentErr);
    }

    // ------------------------------------------------------------------
    // Step 14: Seed organization_context (key-value table)
    // Each row is { organization_id, context_key, value (jsonb), value_type, source, confidence }
    // ------------------------------------------------------------------
    let orgContextCount = 0;

    try {
      const contextRows = [
        {
          organization_id: org_id,
          context_key: "sales_motion_type",
          value: JSON.stringify("outbound"),
          value_type: "string",
          source: "enrichment",
          confidence: 0.9,
        },
        {
          organization_id: org_id,
          context_key: "target_market",
          value: JSON.stringify("B2B SaaS companies, 50-500 employees"),
          value_type: "string",
          source: "enrichment",
          confidence: 0.85,
        },
        {
          organization_id: org_id,
          context_key: "key_competitors",
          value: JSON.stringify(["Gong", "Salesloft", "Outreach"]),
          value_type: "array",
          source: "enrichment",
          confidence: 0.8,
        },
        {
          organization_id: org_id,
          context_key: "icp_description",
          value: JSON.stringify("Mid-market B2B companies with 5+ person sales teams looking to automate follow-ups and meeting prep"),
          value_type: "string",
          source: "enrichment",
          confidence: 0.85,
        },
        {
          organization_id: org_id,
          context_key: "industry",
          value: JSON.stringify("Technology / SaaS"),
          value_type: "string",
          source: "enrichment",
          confidence: 0.95,
        },
        {
          organization_id: org_id,
          context_key: "products",
          value: JSON.stringify(["Sales Automation Platform", "Meeting Intelligence", "AI Follow-up Engine"]),
          value_type: "array",
          source: "enrichment",
          confidence: 0.9,
        },
      ];

      const { error: contextError } = await supabase
        .from("organization_context")
        .upsert(contextRows, { onConflict: "organization_id,context_key" });

      if (contextError) {
        console.error("[seed-demo-data] organization_context upsert error:", contextError);
      } else {
        orgContextCount = contextRows.length;
        console.log("[seed-demo-data] Seeded organization_context:", orgContextCount, "keys");
      }
    } catch (contextErr) {
      console.error("[seed-demo-data] Unexpected error seeding organization_context:", contextErr);
    }

    // ------------------------------------------------------------------
    // Response
    // ------------------------------------------------------------------
    const filteredCompanyIds = companyIds.filter(Boolean) as string[];

    // Count total attendees and meeting_contacts that were created by querying
    // the tables scoped to our meeting IDs (best-effort, non-blocking)
    let totalAttendees = 0;
    let totalMeetingContacts = 0;

    if (meetingIds.length > 0) {
      const { count: attendeeCount } = await supabase
        .from("meeting_attendees")
        .select("meeting_id", { count: "exact", head: true })
        .in("meeting_id", meetingIds);

      const { count: mcCount } = await supabase
        .from("meeting_contacts")
        .select("meeting_id", { count: "exact", head: true })
        .in("meeting_id", meetingIds);

      totalAttendees = attendeeCount ?? 0;
      totalMeetingContacts = mcCount ?? 0;
    }

    const response: SeedResponse = {
      success: true,
      seeded: {
        companies: filteredCompanyIds.length,
        contacts: contactIds.length,
        deal_stages: stageIds.filter(Boolean).length,
        meetings: meetingIds.length,
        meeting_attendees: totalAttendees,
        meeting_contacts: totalMeetingContacts,
        classifications: classificationsCount,
        scorecards: scorecardsCount,
        summaries: summariesCount,
        action_items: actionItemsCount,
        deals: dealsCount,
        activities: activitiesCount,
        org_enrichment: orgEnrichmentCount,
        org_context: orgContextCount,
        railway_synced: railwaySyncCount,
      },
      ids: {
        companyIds: filteredCompanyIds,
        contactIds,
        stageIds,
        meetingIds,
        primaryContactByCompany,
      },
    };

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[seed-demo-data] Unhandled error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
