/**
 * Pre-Meeting Briefing Orchestrator Adapters
 *
 * 5-adapter pipeline for pre-meeting intelligence:
 * 1. enrichAttendeesAdapter — resolve attendees → contacts → company, classify relationship
 * 2. pullCrmHistoryAdapter — meeting history, emails, open action items, prior objections
 * 3. researchCompanyNewsAdapter — deep company enrichment via deep-enrich-organization
 * 4. generateBriefingAdapter — AI synthesis using Claude Haiku
 * 5. deliverSlackBriefingAdapter — Slack Block Kit delivery
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { getServiceClient, enrichContactContext } from './contextEnrichment.ts';
import { logAICostEvent, extractAnthropicUsage, extractGeminiUsage } from '../../costTracking.ts';
import { createDealMemoryReader } from '../../memory/reader.ts';
import { createRAGClient } from '../../memory/ragClient.ts';
import { detectMeetingHistory } from '../../meeting-prep/historyDetector.ts';
import { getHistoricalContext, createRAGClient as createPrepRAGClient } from '../../meeting-prep/ragQueries.ts';
import {
  buildReturnMeetingPrompt,
  buildReturnMeetingSlackBlocks,
  buildFirstMeetingSlackBlocks,
  buildReturnMeetingMarkdown,
  RETURN_MEETING_SYSTEM_PROMPT,
} from '../../meeting-prep/briefingComposer.ts';
import type { HistoricalContext } from '../../meeting-prep/types.ts';

// =============================================================================
// Adapter 1: Enrich Attendees
// =============================================================================

export const enrichAttendeesAdapter: SkillAdapter = {
  name: 'enrich-attendees',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      console.log('[enrich-attendees] Starting attendee enrichment...');
      const supabase = getServiceClient();

      // Get attendees from payload or fall back to tier2 contact
      // Normalize Google Calendar format (displayName) to our internal format (name)
      // Exclude the meeting owner and internal org members so enrichment focuses on external attendees
      const rawAttendees: any[] = state.event.payload.attendees as any || [];
      const ownerEmail = state.context.tier1?.user?.email?.toLowerCase();
      const ownerDomain = ownerEmail?.split('@')[1]?.toLowerCase();
      const attendees: Array<{ email: string; name: string; is_internal: boolean }> = rawAttendees
        .filter((a: any) => a?.email && !a.self && a.email.toLowerCase() !== ownerEmail)
        .map((a: any) => {
          const attendeeDomain = a.email?.split('@')[1]?.toLowerCase();
          return {
            email: a.email,
            name: a.name || a.displayName || a.email,
            is_internal: !!(ownerDomain && attendeeDomain === ownerDomain),
          };
        });

      if (attendees.length === 0 && state.context.tier2?.contact?.email) {
        const fallbackDomain = state.context.tier2.contact.email.split('@')[1]?.toLowerCase();
        attendees.push({
          email: state.context.tier2.contact.email,
          name: state.context.tier2.contact.name || state.context.tier2.contact.email,
          is_internal: !!(ownerDomain && fallbackDomain === ownerDomain),
        });
      }

      const enrichedAttendees: Array<{
        name: string;
        email: string;
        title?: string;
        company?: string;
        is_known_contact: boolean;
        is_internal: boolean;
      }> = [];

      let primaryContact: any = null;
      let primaryCompany: any = null;
      let primaryDeal: any = null;

      console.log(`[enrich-attendees] Owner domain: ${ownerDomain}, attendees: ${attendees.map(a => `${a.email} (internal=${a.is_internal})`).join(', ')}`);

      // Enrich each attendee
      for (const att of attendees) {
        console.log(`[enrich-attendees] Processing attendee: ${att.email} (internal=${att.is_internal})`);

        // Query contact by email
        const { data: contact } = await supabase
          .from('contacts')
          .select('id, first_name, last_name, full_name, email, company, title, company_id')
          .eq('email', att.email.toLowerCase())
          .maybeSingle();

        if (!contact) {
          // Try to resolve company from email domain for unknown contacts
          let unknownCompany: string | undefined;
          const emailDomain = att.email?.split('@')[1]?.toLowerCase();
          if (emailDomain && !['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'live.com', 'me.com', 'protonmail.com', 'proton.me'].includes(emailDomain)) {
            const { data: domainCompany } = await supabase
              .from('companies')
              .select('id, name, domain, industry, size, website')
              .eq('domain', emailDomain)
              .limit(1)
              .maybeSingle();

            if (domainCompany) {
              unknownCompany = domainCompany.name;
              if (!primaryCompany || (primaryCompany._is_internal && !att.is_internal)) {
                primaryCompany = { ...domainCompany, _is_internal: att.is_internal };
              }
            } else {
              unknownCompany = emailDomain.split('.')[0].charAt(0).toUpperCase() + emailDomain.split('.')[0].slice(1);
              if (!primaryCompany || (primaryCompany._is_internal && !att.is_internal)) {
                primaryCompany = { name: unknownCompany, domain: emailDomain, _is_internal: att.is_internal };
              }
            }
          }

          enrichedAttendees.push({
            name: att.name,
            email: att.email,
            company: unknownCompany,
            is_known_contact: false,
            is_internal: att.is_internal,
          });
          continue;
        }

        const contactName = contact.full_name ||
          [contact.first_name, contact.last_name].filter(Boolean).join(' ') ||
          contact.email;

        // Store first external known contact as primary (skip internal org members)
        if (!primaryContact || (primaryContact._is_internal && !att.is_internal)) {
          primaryContact = { ...contact, _is_internal: att.is_internal };
        }

        // Get company details
        let company: any = null;
        if (contact.company_id) {
          const { data: companyData } = await supabase
            .from('companies')
            .select('id, name, domain, industry, size, website')
            .eq('id', contact.company_id)
            .maybeSingle();

          if (companyData) {
            company = companyData;
          }
        } else if (contact.company && typeof contact.company === 'string') {
          // Try to find company by name
          const { data: companyData } = await supabase
            .from('companies')
            .select('id, name, domain, industry, size, website')
            .ilike('name', contact.company)
            .limit(1)
            .maybeSingle();

          if (companyData) {
            company = companyData;
          }
        }

        // Validate company name isn't just the person's name (bad data)
        if (company && company.name) {
          const companyLower = company.name.toLowerCase().trim();
          const personLower = contactName.toLowerCase().trim();
          if (companyLower === personLower || companyLower === att.name.toLowerCase().trim()) {
            console.log(`[enrich-attendees] Company name "${company.name}" matches person name`);
            // If the company record has a domain, use domain-derived name
            if (company.domain) {
              const domainName = company.domain.split('.')[0];
              company = { ...company, name: domainName.charAt(0).toUpperCase() + domainName.slice(1) };
              console.log(`[enrich-attendees] Using domain-derived name: ${company.name} (${company.domain})`);
            } else {
              company = null;
            }
          }
        }

        // Fallback: extract domain from email when no company at all
        if (!company && contact.email) {
          const emailDomain = contact.email.split('@')[1]?.toLowerCase();
          if (emailDomain && !['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'live.com', 'me.com', 'protonmail.com', 'proton.me'].includes(emailDomain)) {
            console.log(`[enrich-attendees] No company found, trying domain: ${emailDomain}`);
            const { data: domainCompany } = await supabase
              .from('companies')
              .select('id, name, domain, industry, size, website')
              .eq('domain', emailDomain)
              .limit(1)
              .maybeSingle();

            if (domainCompany) {
              // Also validate this result isn't the person's name
              const dcLower = domainCompany.name?.toLowerCase().trim();
              if (dcLower === contactName.toLowerCase().trim() || dcLower === att.name.toLowerCase().trim()) {
                const dn = emailDomain.split('.')[0];
                company = { ...domainCompany, name: dn.charAt(0).toUpperCase() + dn.slice(1) };
              } else {
                company = domainCompany;
              }
              console.log(`[enrich-attendees] Found company by domain: ${company.name}`);
            } else {
              // No company in DB — create a lightweight object from the domain
              const dn = emailDomain.split('.')[0];
              company = { name: dn.charAt(0).toUpperCase() + dn.slice(1), domain: emailDomain };
              console.log(`[enrich-attendees] Using domain-derived company: ${company.name} (${emailDomain})`);
            }
          }
        }

        // Prefer external attendee's company over internal
        if (company && (!primaryCompany || (primaryCompany._is_internal && !att.is_internal))) {
          primaryCompany = { ...company, _is_internal: att.is_internal };
        }

        enrichedAttendees.push({
          name: contactName,
          email: contact.email,
          title: contact.title,
          company: company?.name || contact.company,
          is_known_contact: true,
          is_internal: att.is_internal,
        });

        // Look up deals for external contacts (or any contact if no external found yet)
        if (!att.is_internal && !primaryDeal) {
          const { data: deals } = await supabase
            .from('deals')
            .select('id, name, stage_id, value, close_date, status')
            .eq('primary_contact_id', contact.id)
            .order('updated_at', { ascending: false })
            .limit(1);

          if (deals && deals.length > 0) {
            const deal = deals[0];
            // Resolve stage name from deal_stages table
            let stageName: string | null = null;
            if (deal.stage_id) {
              const { data: stageRow } = await supabase
                .from('deal_stages')
                .select('name, is_final')
                .eq('id', deal.stage_id)
                .maybeSingle();
              stageName = stageRow?.name || null;
            }
            primaryDeal = { ...deal, stage: stageName };
          }
        }
      }

      // Classify relationship based on deal stage name
      // Stages: SQL, Opportunity, Verbal, Signed (is_final), Lost
      let relationship = 'prospect';
      if (primaryDeal) {
        const stage = primaryDeal.stage?.toLowerCase();
        const status = primaryDeal.status?.toLowerCase();
        if (stage === 'signed' || status === 'won') {
          relationship = 'existing_client';
        } else if (stage === 'lost' || status === 'lost') {
          relationship = 're-engagement';
        } else if (stage) {
          // Active deal stages (SQL, Opportunity, Verbal)
          relationship = 'client';
        }
      } else if (enrichedAttendees.length > 0 && enrichedAttendees.every(a => !a.is_known_contact)) {
        // No deal AND no known contacts — not a tracked business relationship
        relationship = 'unknown';
      }

      // Determine meeting type from deal stage name
      let meetingType = 'general';
      if (primaryDeal) {
        const stage = primaryDeal.stage?.toLowerCase();
        if (stage === 'sql') {
          meetingType = 'discovery';
        } else if (stage === 'opportunity') {
          meetingType = 'demo';
        } else if (stage === 'verbal') {
          meetingType = 'negotiation';
        } else if (stage === 'signed') {
          meetingType = 'account_review';
        }
      }

      // Fallback to title keywords for meeting type classification
      if (meetingType === 'general' && state.event.payload.title) {
        const title = (state.event.payload.title as string).toLowerCase();
        // Sales-related titles
        if (title.includes('discovery')) {
          meetingType = 'discovery';
        } else if (title.includes('demo')) {
          meetingType = 'demo';
        } else if (title.includes('intro')) {
          meetingType = 'discovery';
        }
        // Service/professional titles (no deal, non-sales context)
        else if (/\b(visit|home visit|onboarding|kickoff|kick-off|consultation|assessment|intake|orientation)\b/.test(title)) {
          meetingType = 'service';
        }
        // Internal titles
        else if (/\b(standup|stand-up|sync|1:1|retro|sprint|planning|team|huddle|all-hands)\b/.test(title)) {
          meetingType = 'internal';
        }
      }

      const output = {
        attendees: enrichedAttendees,
        company: primaryCompany,
        classification: {
          relationship,
          meeting_type: meetingType,
        },
        deal: primaryDeal,
      };

      console.log(
        `[enrich-attendees] Complete: ${enrichedAttendees.length} attendees, ` +
        `company=${primaryCompany?.name || 'none'} (domain=${primaryCompany?.domain || 'none'}), ` +
        `relationship=${relationship}, type=${meetingType}`
      );

      return { success: true, output, duration_ms: Date.now() - start };
    } catch (err) {
      console.error('[enrich-attendees] Error:', err);
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};

// =============================================================================
// Adapter 2: Pull CRM History
// =============================================================================

export const pullCrmHistoryAdapter: SkillAdapter = {
  name: 'pull-crm-history',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      console.log('[pull-crm-history] Starting CRM history pull...');
      const supabase = getServiceClient();
      const meetingId = state.event.payload.meeting_id as string;

      let enrichment: any = {
        contact: null,
        recent_meetings: [],
        recent_emails: [],
        open_action_items: [],
        previous_objections: [],
        deal: null,
        meeting_count: 0,
      };

      // Use contact from enrich-attendees output first, then fall back to tier2
      const enrichAttendeesOutput = state.outputs['enrich-attendees'] as any;
      let contactData = state.context.tier2?.contact;

      // If enrich-attendees resolved a real contact, look it up by email
      if (!contactData && enrichAttendeesOutput?.attendees?.length > 0) {
        const knownAttendee = enrichAttendeesOutput.attendees.find((a: any) => a.is_known_contact);
        if (knownAttendee?.email) {
          console.log(`[pull-crm-history] Using contact from enrich-attendees: ${knownAttendee.email}`);
          const { data: contact } = await supabase
            .from('contacts')
            .select('id, first_name, last_name, full_name, email, company, title, company_id')
            .eq('email', knownAttendee.email.toLowerCase())
            .maybeSingle();

          if (contact) {
            contactData = contact;
          }
        }
      }

      if (!contactData) {
        console.log('[pull-crm-history] No contact resolved, returning empty history');
        return { success: true, output: enrichment, duration_ms: Date.now() - start };
      }

      const contactId = contactData.id;
      const isRealContact = contactId &&
        !contactId.startsWith('attendee:') &&
        !contactId.startsWith('cal:') &&
        !contactId.startsWith('cal-json:');

      if (!isRealContact) {
        console.log('[pull-crm-history] Not a real contact ID, returning empty history');
        return { success: true, output: enrichment, duration_ms: Date.now() - start };
      }

      // Use enrichContactContext for deep history
      console.log('[pull-crm-history] Enriching contact context...');
      const contactEnrichment = await enrichContactContext(
        supabase,
        contactData,
        meetingId,
        180 // 180 days lookback — pull full history for briefings
      );

      // Get total meeting count
      const { count } = await supabase
        .from('meeting_contacts')
        .select('meeting_id', { count: 'exact', head: true })
        .eq('contact_id', contactId);

      // Get open action items for this user
      const { data: actionItems } = await supabase
        .from('meeting_action_items')
        .select('id, title, due_date, status, meeting_id')
        .eq('assigned_to', state.event.user_id)
        .in('status', ['pending', 'in_progress'])
        .order('due_date')
        .limit(10);

      // Format action items with meeting context
      const formattedActionItems = [];
      for (const item of (actionItems || [])) {
        let fromMeeting: string | undefined;
        if (item.meeting_id) {
          const { data: mtg } = await supabase
            .from('meetings')
            .select('title')
            .eq('id', item.meeting_id)
            .maybeSingle();
          fromMeeting = mtg?.title;
        }

        formattedActionItems.push({
          title: item.title,
          due_date: item.due_date,
          status: item.status,
          from_meeting: fromMeeting,
        });
      }

      // Get previous objections from meeting summaries
      const previousObjections: Array<{
        objection: string;
        resolution?: string;
        resolved: boolean;
      }> = [];

      try {
        // Get meeting IDs linked to this contact
        const { data: meetingLinks } = await supabase
          .from('meeting_contacts')
          .select('meeting_id')
          .eq('contact_id', contactId)
          .limit(20);

        if (meetingLinks && meetingLinks.length > 0) {
          const meetingIds = meetingLinks.map((mc: any) => mc.meeting_id);

          const { data: summaries } = await supabase
            .from('meeting_structured_summaries')
            .select('objections_raised')
            .in('meeting_id', meetingIds)
            .not('objections_raised', 'is', null);

          // Deduplicate objections
          const seenObjections = new Set<string>();
          for (const summary of (summaries || [])) {
            if (Array.isArray(summary.objections_raised)) {
              for (const obj of summary.objections_raised) {
                if (typeof obj === 'object' && obj.objection) {
                  const key = obj.objection.toLowerCase().trim();
                  if (!seenObjections.has(key)) {
                    seenObjections.add(key);
                    previousObjections.push({
                      objection: obj.objection,
                      resolution: obj.resolution,
                      resolved: !!obj.resolution,
                    });
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn('[pull-crm-history] Failed to fetch objections:', err);
      }

      // Load engagement pattern for this contact (graceful fallback if not available)
      let engagementPattern: {
        avg_response_time_hours: number | null;
        best_email_day: string | null;
        best_email_hour: number | null;
        response_trend: string | null;
      } | null = null;

      const orgId = state.event.org_id;
      if (orgId) {
        try {
          const { data: pattern } = await supabase
            .from('contact_engagement_patterns')
            .select('avg_response_time_hours, best_email_day, best_email_hour, response_trend')
            .eq('contact_id', contactId)
            .eq('org_id', orgId)
            .maybeSingle();

          if (pattern) {
            engagementPattern = {
              avg_response_time_hours: pattern.avg_response_time_hours ?? null,
              best_email_day: pattern.best_email_day ?? null,
              best_email_hour: pattern.best_email_hour ?? null,
              response_trend: pattern.response_trend ?? null,
            };
            console.log(`[pull-crm-history] Engagement pattern loaded for contact=${contactId}`);
          }
        } catch (patternErr) {
          console.warn('[pull-crm-history] Could not load engagement pattern:', patternErr);
        }
      }

      enrichment = {
        contact: contactEnrichment.contact,
        recent_meetings: contactEnrichment.recentMeetings,
        recent_emails: contactEnrichment.recentEmails,
        open_action_items: formattedActionItems,
        previous_objections: previousObjections,
        deal: contactEnrichment.dealContext,
        meeting_count: count || 0,
        engagement_pattern: engagementPattern,
      };

      console.log(
        `[pull-crm-history] Complete: ${enrichment.recent_meetings.length} meetings, ` +
        `${enrichment.recent_emails.length} emails, ${formattedActionItems.length} action items, ` +
        `${previousObjections.length} objections, total meetings=${count}, ` +
        `pattern=${engagementPattern ? 'loaded' : 'none'}`
      );

      return { success: true, output: enrichment, duration_ms: Date.now() - start };
    } catch (err) {
      console.error('[pull-crm-history] Error:', err);
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};

// =============================================================================
// Adapter 3: Research Company News — 5 Parallel Gemini Queries + AI Synthesis
// =============================================================================

/**
 * Helper: Call Gemini 3 Flash with Google Search grounding directly.
 * Runs inside the orchestrator edge function — no inter-function HTTP overhead.
 */
async function geminiSearchQuery(
  apiKey: string,
  query: string,
  responseSchema?: Record<string, any>,
  timeoutMs = 30_000
): Promise<{ result: any; sources: Array<{ title?: string; uri?: string }>; duration_ms: number; rawResponse: any }> {
  const startTime = performance.now();

  let prompt = query;
  if (responseSchema) {
    prompt += `\n\nReturn JSON matching this schema:\n${JSON.stringify(responseSchema, null, 2)}\n\nReturn ONLY valid JSON, no markdown formatting.`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4096,
            responseMimeType: responseSchema ? 'application/json' : undefined,
          },
          tools: [{ googleSearch: {} }],
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const groundingMetadata = data.candidates?.[0]?.groundingMetadata;
    const sources: Array<{ title?: string; uri?: string }> = [];

    if (groundingMetadata?.groundingChunks) {
      for (const chunk of groundingMetadata.groundingChunks) {
        if (chunk.web) {
          sources.push({ title: chunk.web.title, uri: chunk.web.uri });
        }
      }
    }

    let result: any;
    if (responseSchema) {
      try {
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;
        result = JSON.parse(jsonStr);
      } catch {
        result = { raw_text: text };
      }
    } else {
      result = text;
    }

    return { result, sources, duration_ms: Math.round(performance.now() - startTime), rawResponse: data };
  } finally {
    clearTimeout(timeout);
  }
}

/** Person-focused research queries (lead-research skill methodology) */
const LEAD_RESEARCH_QUERIES = [
  {
    name: 'person_profile',
    buildQuery: (personName: string, companyName?: string, email?: string) => {
      const domain = email?.split('@')[1];
      return (
        `Research "${personName}"${companyName ? ` at "${companyName}"` : ''}${domain ? ` (${domain})` : ''}. ` +
        `Find their LinkedIn profile, current job title, role seniority (C-level/VP/Director/Manager/IC), ` +
        `approximate tenure in current role, career background (2-3 previous roles), ` +
        `and any decision-making authority signals. Focus on professional background, not personal.`
      );
    },
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        linkedin_url: { type: 'string' },
        role_seniority: { type: 'string' },
        tenure_current_role: { type: 'string' },
        background: { type: 'string' },
        previous_roles: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, company: { type: 'string' }, dates: { type: 'string' } } } },
        decision_authority: { type: 'string' },
      },
    },
  },
  {
    name: 'person_activity',
    buildQuery: (personName: string, companyName?: string) =>
      `Find recent professional activity for "${personName}"${companyName ? ` at "${companyName}"` : ''}. ` +
      `Look for LinkedIn posts, conference talks, podcast appearances, blog posts, published articles, ` +
      `or industry commentary. What topics do they talk about or care about? ` +
      `Also note any mutual connections, shared interests, or conversation starters.`,
    schema: {
      type: 'object',
      properties: {
        recent_activity: { type: 'array', items: { type: 'object', properties: { type: { type: 'string' }, title: { type: 'string' }, date: { type: 'string' }, url: { type: 'string' } } } },
        content_topics: { type: 'array', items: { type: 'string' } },
        connection_points: { type: 'array', items: { type: 'object', properties: { point: { type: 'string' }, tier: { type: 'string' }, suggested_use: { type: 'string' } } } },
      },
    },
  },
];

/** Research query definitions for parallel execution */
const RESEARCH_QUERIES = [
  {
    name: 'company_overview',
    buildQuery: (domain: string, companyName?: string) =>
      `Research the company at ${domain}${companyName ? ` (${companyName})` : ''}. ` +
      `Provide a comprehensive company overview including what they do, their industry, approximate employee count, headquarters location, founding year, and website.`,
    schema: {
      type: 'object',
      properties: {
        description: { type: 'string' },
        industry: { type: 'string' },
        employee_count: { type: 'string' },
        headquarters: { type: 'string' },
        founded_year: { type: 'string' },
        website: { type: 'string' },
      },
    },
  },
  {
    name: 'products_market',
    buildQuery: (domain: string, companyName?: string) =>
      `What products or services does the company at ${domain}${companyName ? ` (${companyName})` : ''} offer? ` +
      `Who is their target market? What is their pricing model? How are they positioned in their market?`,
    schema: {
      type: 'object',
      properties: {
        products: { type: 'array', items: { type: 'string' } },
        target_market: { type: 'string' },
        pricing_model: { type: 'string' },
        market_position: { type: 'string' },
      },
    },
  },
  {
    name: 'funding_growth',
    buildQuery: (domain: string, companyName?: string) =>
      `What is the funding history and growth trajectory of the company at ${domain}${companyName ? ` (${companyName})` : ''}? ` +
      `Include funding rounds, total funding raised, key investors, any revenue signals, and growth indicators like hiring or expansion.`,
    schema: {
      type: 'object',
      properties: {
        funding_rounds: { type: 'array', items: { type: 'object', properties: { round: { type: 'string' }, amount: { type: 'string' }, date: { type: 'string' } } } },
        total_funding: { type: 'string' },
        investors: { type: 'array', items: { type: 'string' } },
        revenue_signals: { type: 'string' },
        growth_indicators: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    name: 'leadership_team',
    buildQuery: (domain: string, companyName?: string) =>
      `Who are the key leaders and executives at the company at ${domain}${companyName ? ` (${companyName})` : ''}? ` +
      `Include their names, titles, and relevant background. Also note any recent hiring signals or organizational changes.`,
    schema: {
      type: 'object',
      properties: {
        key_people: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, title: { type: 'string' }, background: { type: 'string' } } } },
        org_structure_notes: { type: 'string' },
        hiring_signals: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    name: 'competition_news',
    buildQuery: (domain: string, companyName?: string) =>
      `Who are the main competitors of the company at ${domain}${companyName ? ` (${companyName})` : ''}? ` +
      `What recent news, partnerships, or press mentions are there about them? Include any awards or notable achievements.`,
    schema: {
      type: 'object',
      properties: {
        competitors: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } } } },
        recent_news: { type: 'array', items: { type: 'object', properties: { headline: { type: 'string' }, date: { type: 'string' }, summary: { type: 'string' } } } },
        partnerships: { type: 'array', items: { type: 'string' } },
        awards: { type: 'array', items: { type: 'string' } },
      },
    },
  },
];

export const researchCompanyNewsAdapter: SkillAdapter = {
  name: 'research-company-news',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      console.log('[research-company-news] Starting parallel company research...');

      const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

      // Get company from enrich-attendees output
      const enrichAttendeesOutput = state.outputs['enrich-attendees'] as any;
      const company = enrichAttendeesOutput?.company;

      // Get domain from company or extract from contact email
      let domain: string | undefined = company?.domain;
      if (!domain && state.context.tier2?.contact?.email) {
        const emailParts = state.context.tier2.contact.email.split('@');
        if (emailParts.length === 2) {
          domain = emailParts[1];
        }
      }

      const emptyProfile = {
        description: null,
        industry: company?.industry || null,
        funding_status: null,
        tech_stack: [],
        competitors: [],
        recent_news: [],
        key_people: [],
        products: [],
        growth_indicators: [],
        partnerships: [],
      };

      if (!domain) {
        console.log('[research-company-news] No domain available, skipping enrichment');
        return {
          success: true,
          output: { enrichment: null, company_profile: emptyProfile },
          duration_ms: Date.now() - start,
        };
      }

      if (!GEMINI_API_KEY) {
        console.warn('[research-company-news] No GEMINI_API_KEY, skipping enrichment');
        return {
          success: true,
          output: { enrichment: null, company_profile: emptyProfile },
          duration_ms: Date.now() - start,
        };
      }

      // Get primary attendee name for person research
      // Prioritize external attendees (is_internal=false) so we research the prospect, not our own team
      const allAttendees = enrichAttendeesOutput?.attendees || [];
      const externalAttendees = allAttendees.filter((a: any) => !a.is_internal);
      // Prefer external known contacts, then any external, then fall back to first attendee
      const primaryAttendee = externalAttendees.find((a: any) => a.is_known_contact) ||
        externalAttendees[0] ||
        allAttendees[0];
      const personName = primaryAttendee?.name;
      const personEmail = primaryAttendee?.email;
      console.log(`[research-company-news] Selected person: ${personName} (${personEmail}), external candidates: ${externalAttendees.length}/${allAttendees.length}`);

      const totalQueries = 5 + (personName ? LEAD_RESEARCH_QUERIES.length : 0);
      console.log(`[research-company-news] Running ${totalQueries} parallel Gemini queries for: ${domain}${personName ? ` + ${personName}` : ''}`);

      // Run company queries + person queries in parallel
      const companyQueryPromises = RESEARCH_QUERIES.map(async (q) => {
        const queryStart = Date.now();
        console.log(`[research-company-news] Starting query: ${q.name}`);
        const res = await geminiSearchQuery(GEMINI_API_KEY, q.buildQuery(domain!, company?.name), q.schema);
        console.log(`[research-company-news] Query ${q.name} complete in ${Date.now() - queryStart}ms (${res.sources.length} sources)`);
        return { name: q.name, ...res };
      });

      const personQueryPromises = personName
        ? LEAD_RESEARCH_QUERIES.map(async (q) => {
            const queryStart = Date.now();
            console.log(`[research-company-news] Starting lead query: ${q.name}`);
            const res = await geminiSearchQuery(
              GEMINI_API_KEY,
              q.buildQuery(personName, company?.name, personEmail),
              q.schema
            );
            console.log(`[research-company-news] Lead query ${q.name} complete in ${Date.now() - queryStart}ms (${res.sources.length} sources)`);
            return { name: q.name, ...res };
          })
        : [];

      const queryResults = await Promise.allSettled([...companyQueryPromises, ...personQueryPromises]);

      // Collect results (fault-tolerant — use partial data from successful queries)
      const researchData: Record<string, any> = {};
      const leadResearchData: Record<string, any> = {};
      const allSources: Array<{ title?: string; uri?: string }> = [];
      let successCount = 0;

      const leadQueryNames = new Set(LEAD_RESEARCH_QUERIES.map(q => q.name));
      const supabase = getServiceClient();
      const userId = state.event.user_id;
      const orgId = state.event.org_id;

      for (const result of queryResults) {
        if (result.status === 'fulfilled') {
          const isLeadQuery = leadQueryNames.has(result.value.name);
          if (isLeadQuery) {
            leadResearchData[result.value.name] = result.value.result;
          } else {
            researchData[result.value.name] = result.value.result;
          }
          allSources.push(...result.value.sources);
          successCount++;

          // Track cost for this Gemini query
          const usage = extractGeminiUsage(result.value.rawResponse);
          await logAICostEvent(
            supabase,
            userId,
            orgId,
            'gemini',
            'gemini-3-flash-preview',
            usage.inputTokens,
            usage.outputTokens,
            isLeadQuery ? 'pre-meeting-person-research' : 'pre-meeting-company-research',
            { query_name: result.value.name }
          );
        } else {
          console.warn(`[research-company-news] Query failed:`, result.reason);
        }
      }

      console.log(`[research-company-news] ${successCount}/${totalQueries} queries succeeded, ${allSources.length} total sources`);

      // Synthesize with Claude Haiku if we have results
      let companyProfile: any = emptyProfile;
      const apiKey = Deno.env.get('ANTHROPIC_API_KEY');

      if (successCount > 0 && apiKey) {
        try {
          console.log('[research-company-news] Synthesizing with Claude Haiku...');
          const synthesisPrompt = [
            '# COMPANY RESEARCH SYNTHESIS',
            '',
            `Domain: ${domain}`,
            company?.name ? `Known as: ${company.name}` : '',
            '',
            '## Raw Research Data',
            '',
            ...Object.entries(researchData).map(([name, data]) =>
              `### ${name}\n${JSON.stringify(data, null, 2)}`
            ),
            '',
            '---',
            '',
            'Synthesize the above research into a unified company profile JSON with these fields:',
            '- description: 2-3 sentence company overview',
            '- industry: primary industry',
            '- employee_count: approximate headcount as string',
            '- headquarters: location',
            '- founded_year: year as string',
            '- funding_status: summary of funding (e.g. "Series B, $50M raised")',
            '- products: array of product/service names',
            '- target_market: who they sell to',
            '- key_people: array of {name, title, background} for top 5 leaders',
            '- competitors: array of {name, description} for top 5 competitors',
            '- recent_news: array of {headline, date, summary} for top 5 news items',
            '- growth_indicators: array of growth signals',
            '- tech_stack: array of known technologies',
            '- partnerships: array of partner names',
            '- hiring_signals: array of hiring-related signals',
            '',
            'Deduplicate and cross-reference data. Prefer specific facts over vague claims.',
            'Return ONLY valid JSON.',
          ].join('\n');

          const synthesisResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 2048,
              temperature: 0.2,
              system: 'You are a company research analyst. Synthesize multiple research sources into a single structured company profile. Return ONLY valid JSON.',
              messages: [{ role: 'user', content: synthesisPrompt }],
            }),
          });

          if (synthesisResponse.ok) {
            const synthesisResult = await synthesisResponse.json();
            const textContent = synthesisResult.content?.[0]?.text;
            if (textContent) {
              const jsonMatch = textContent.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                companyProfile = JSON.parse(jsonMatch[0]);
                console.log('[research-company-news] Synthesis complete');
              }
            }

            // Track cost for company synthesis
            const usage = extractAnthropicUsage(synthesisResult);
            await logAICostEvent(
              supabase,
              userId,
              orgId,
              'anthropic',
              'claude-haiku-4-5-20251001',
              usage.inputTokens,
              usage.outputTokens,
              'pre-meeting-company-synthesis',
              { domain }
            );
          } else {
            console.warn(`[research-company-news] Synthesis API returned ${synthesisResponse.status}`);
          }
        } catch (err) {
          console.warn('[research-company-news] Synthesis failed, using raw data:', err);
        }
      }

      // Fallback: if synthesis failed, build profile from raw query results
      if (companyProfile === emptyProfile && successCount > 0) {
        const overview = researchData.company_overview || {};
        const products = researchData.products_market || {};
        const funding = researchData.funding_growth || {};
        const leadership = researchData.leadership_team || {};
        const competition = researchData.competition_news || {};

        companyProfile = {
          description: overview.description || null,
          industry: overview.industry || company?.industry || null,
          employee_count: overview.employee_count || null,
          headquarters: overview.headquarters || null,
          founded_year: overview.founded_year || null,
          funding_status: funding.total_funding || null,
          products: products.products || [],
          target_market: products.target_market || null,
          key_people: leadership.key_people || [],
          competitors: competition.competitors || [],
          recent_news: competition.recent_news || [],
          growth_indicators: funding.growth_indicators || [],
          tech_stack: [],
          partnerships: competition.partnerships || [],
          hiring_signals: leadership.hiring_signals || [],
        };
      }

      // Synthesize lead profile from person research
      let leadProfile: any = null;
      if (Object.keys(leadResearchData).length > 0 && apiKey) {
        try {
          console.log('[research-company-news] Synthesizing lead profile with Claude Haiku...');
          const leadSynthesisPrompt = [
            '# LEAD RESEARCH SYNTHESIS',
            '',
            `Person: ${personName}`,
            personEmail ? `Email: ${personEmail}` : '',
            company?.name ? `Company: ${company.name}` : '',
            '',
            '## Raw Person Research',
            '',
            ...Object.entries(leadResearchData).map(([name, data]) =>
              `### ${name}\n${JSON.stringify(data, null, 2)}`
            ),
            '',
            '---',
            '',
            'Synthesize the above into a lead profile JSON with these fields:',
            '- name: full name',
            '- title: current job title',
            '- linkedin_url: LinkedIn profile URL if found',
            '- role_seniority: C-level/VP/Director/Manager/IC',
            '- tenure_current_role: how long in current role',
            '- background: 2-3 sentence career arc',
            '- previous_roles: array of {title, company, dates} for last 2-3 roles',
            '- decision_authority: inferred from title + company size (e.g. "Final decision maker", "Key influencer", "Champion/evaluator")',
            '- recent_activity: array of {type, title, date} for recent posts/talks/articles',
            '- content_topics: array of topics they care about',
            '- connection_points: array of {point, tier, suggested_use} ranked by effectiveness:',
            '  - tier 1: Direct relevance (shared experience, referenced their content)',
            '  - tier 2: Contextual (industry trend, company event)',
            '  - tier 3: Light personalization (alma mater, geography)',
            '',
            'If data is missing for a field, omit it or set to null. Return ONLY valid JSON.',
          ].join('\n');

          const leadResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 1024,
              temperature: 0.2,
              system: 'You are a sales intelligence analyst. Synthesize person research into a structured lead profile for pre-meeting preparation. Return ONLY valid JSON.',
              messages: [{ role: 'user', content: leadSynthesisPrompt }],
            }),
          });

          if (leadResponse.ok) {
            const leadResult = await leadResponse.json();
            const textContent = leadResult.content?.[0]?.text;
            if (textContent) {
              const jsonMatch = textContent.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                leadProfile = JSON.parse(jsonMatch[0]);
                console.log('[research-company-news] Lead profile synthesis complete');
              }
            }

            // Track cost for lead profile synthesis
            const usage = extractAnthropicUsage(leadResult);
            await logAICostEvent(
              supabase,
              userId,
              orgId,
              'anthropic',
              'claude-haiku-4-5-20251001',
              usage.inputTokens,
              usage.outputTokens,
              'pre-meeting-lead-synthesis',
              { person_name: personName, person_email: personEmail }
            );
          }
        } catch (err) {
          console.warn('[research-company-news] Lead profile synthesis failed:', err);
        }
      }

      // Build full enrichment payload (raw data + synthesized profile + sources)
      const enrichment = {
        raw_queries: { ...researchData, ...leadResearchData },
        sources: allSources,
        queries_succeeded: successCount,
        queries_total: totalQueries,
        researched_at: new Date().toISOString(),
      };

      // Save enrichment data to companies table if we have a company ID
      if (company?.id && successCount > 0) {
        try {
          console.log(`[research-company-news] Saving enrichment to companies.${company.id}`);
          const supabase = getServiceClient();

          const updateFields: Record<string, any> = {
            enrichment_data: { ...companyProfile, _meta: { sources: allSources.length, queries: successCount, researched_at: new Date().toISOString() } },
            enriched_at: new Date().toISOString(),
          };

          // Backfill empty flat fields from enrichment
          if (!company.description && companyProfile.description) {
            updateFields.description = companyProfile.description.slice(0, 1000);
          }
          if (!company.industry && companyProfile.industry) {
            updateFields.industry = companyProfile.industry;
          }

          const { error: updateError } = await supabase
            .from('companies')
            .update(updateFields)
            .eq('id', company.id);

          if (updateError) {
            console.warn('[research-company-news] Failed to save enrichment to companies:', updateError.message);
          } else {
            console.log('[research-company-news] Enrichment saved to companies table');
          }
        } catch (saveErr) {
          console.warn('[research-company-news] Non-fatal: failed to save enrichment:', saveErr);
        }
      }

      console.log(
        `[research-company-news] Complete: ${successCount}/${totalQueries} queries, ` +
        `${allSources.length} sources, profile keys=${Object.keys(companyProfile).length}` +
        (leadProfile ? `, lead_profile=yes` : '')
      );

      return {
        success: true,
        output: {
          enrichment,
          company_profile: companyProfile,
          lead_profile: leadProfile,
          company_id: company?.id,
        },
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      console.error('[research-company-news] Error:', err);
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};

// =============================================================================
// Adapter 4: Generate Briefing
// =============================================================================

export const generateBriefingAdapter: SkillAdapter = {
  name: 'generate-briefing',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      console.log('[generate-briefing] Starting AI briefing generation...');
      const apiKey = Deno.env.get('ANTHROPIC_API_KEY');

      // Collect all upstream outputs
      const enrichAttendeesOutput = state.outputs['enrich-attendees'] as any;
      const crmHistoryOutput = state.outputs['pull-crm-history'] as any;
      const companyNewsOutput = state.outputs['research-company-news'] as any;

      const meetingTitle = state.event.payload.title as string || 'Upcoming Meeting';
      const meetingStart = state.event.payload.start_time as string;
      const supabase = getServiceClient();

      // Get deal risk signals if deal exists
      let riskSignals: any[] = [];
      if (enrichAttendeesOutput?.deal?.id) {
        const { data: signals } = await supabase
          .from('deal_risk_signals')
          .select('signal_type, severity, title, description')
          .eq('deal_id', enrichAttendeesOutput.deal.id)
          .eq('status', 'active')
          .order('severity', { ascending: false })
          .limit(5);

        riskSignals = signals || [];
      }

      // Load deal memory context for richer briefing
      let dealMemoryContext = '';
      if (enrichAttendeesOutput?.deal?.id) {
        try {
          const ragClient = createRAGClient(state.event.org_id);
          const reader = createDealMemoryReader(supabase, ragClient);

          const dealContext = await reader.getDealContext(
            enrichAttendeesOutput.deal.id,
            state.event.org_id,
            {
              tokenBudget: 3500,
              includeRAGDepth: true,
              ragQuestions: [
                `Previous conversations with attendees of this meeting`,
                `Open topics and unresolved concerns from recent meetings`,
              ],
            },
          );

          // Build context string for the AI prompt
          const memoryParts: string[] = [];

          if (dealContext.snapshot?.narrative) {
            memoryParts.push(`DEAL NARRATIVE:\n${dealContext.snapshot.narrative}`);
          }

          if (dealContext.openCommitments.length > 0) {
            memoryParts.push(
              `OPEN COMMITMENTS:\n${dealContext.openCommitments
                .map((c) => `- ${c.action} (${c.owner}, deadline: ${c.deadline || 'none'})`)
                .join('\n')}`,
            );
          }

          if (dealContext.stakeholderMap.length > 0) {
            memoryParts.push(
              `STAKEHOLDER MAP:\n${dealContext.stakeholderMap
                .map((s) => `- ${s.name}: ${s.role} (${s.engagement_level})`)
                .join('\n')}`,
            );
          }

          if (dealContext.riskFactors.length > 0) {
            memoryParts.push(
              `RISK FACTORS:\n${dealContext.riskFactors
                .map((r) => `- [${r.severity}] ${r.detail}`)
                .join('\n')}`,
            );
          }

          if (dealContext.ragContext?.length) {
            const ragInsights = dealContext.ragContext
              .filter((r) => r.answer.trim())
              .map((r) => r.answer)
              .join('\n');
            if (ragInsights) {
              memoryParts.push(`CONVERSATION INSIGHTS:\n${ragInsights}`);
            }
          }

          dealMemoryContext = memoryParts.join('\n\n');
        } catch (err) {
          console.error('[preMeeting] Deal memory context loading failed (non-blocking):', err);
        }
      }

      // ---- NEW: Detect return meeting and fire targeted RAG queries ----
      let meetingHistory: Awaited<ReturnType<typeof detectMeetingHistory>> | null = null;
      let ragHistoricalContext: HistoricalContext | null = null;

      try {
        // Extract attendee emails for history detection
        const attendeeEmails: string[] = (enrichAttendeesOutput?.attendees || [])
          .filter((a: any) => !a.is_internal && a.email)
          .map((a: any) => a.email.toLowerCase());

        if (attendeeEmails.length > 0) {
          const meetingId = state.event.payload.meeting_id as string;
          meetingHistory = await detectMeetingHistory(
            supabase,
            meetingId,
            attendeeEmails,
            state.event.user_id,
            state.event.org_id,
          );

          console.log(
            `[generate-briefing] Meeting history: isReturn=${meetingHistory.isReturnMeeting}, ` +
            `priorMeetings=${meetingHistory.priorMeetingCount}`
          );

          // If this is a return meeting, fire the 8 targeted RAG queries
          if (meetingHistory.isReturnMeeting && meetingHistory.priorMeetingCount > 0) {
            const ragClient = createPrepRAGClient(state.event.org_id);
            // Use the primary contact's ID for scoping
            const primaryContactId = enrichAttendeesOutput?.attendees?.find(
              (a: any) => a.is_known_contact && !a.is_internal
            )?.contact_id || null;

            ragHistoricalContext = await getHistoricalContext(
              primaryContactId,
              state.event.user_id,
              ragClient,
            );
            // Set the meeting count from the history detector
            ragHistoricalContext.meetingCount = meetingHistory.priorMeetingCount;

            console.log(
              `[generate-briefing] RAG context: hasHistory=${ragHistoricalContext.hasHistory}, ` +
              `sections=${Object.keys(ragHistoricalContext.sections).length}/${8}, ` +
              `failed=${ragHistoricalContext.failedQueries.length}`
            );
          }
        }
      } catch (err) {
        console.error('[generate-briefing] History detection/RAG failed (non-blocking):', err);
        // Continue with standard briefing — no regression
      }

      // Build prompt — use return-meeting template if RAG context is available
      let promptText: string;
      let systemPrompt: string;

      if (ragHistoricalContext?.hasHistory && meetingHistory?.isReturnMeeting) {
        // Return meeting: use the new structured prompt with RAG context
        systemPrompt = RETURN_MEETING_SYSTEM_PROMPT;

        // Format attendee profiles
        const attendeeProfilesStr = (enrichAttendeesOutput?.attendees || [])
          .map((a: any) => {
            const parts = [a.name];
            if (a.title) parts.push(`(${a.title})`);
            if (a.company) parts.push(`at ${a.company}`);
            parts.push(a.is_known_contact ? '[Known Contact]' : '[New Contact]');
            return `- ${parts.join(' ')}`;
          })
          .join('\n');

        // Format attendee comparison
        const attendeeComparisonStr = (meetingHistory.attendeeHistory || [])
          .map((ah: any) => {
            if (ah.classification === 'new') return `- ${ah.email}: NEW (first meeting)`;
            return `- ${ah.email}: RETURNING (${ah.meetingsAttended} prior meetings, last seen ${ah.lastSeen || 'unknown'})`;
          })
          .join('\n') || 'No attendee comparison data';

        // Format HubSpot context
        const hubspotStr = enrichAttendeesOutput?.deal
          ? `Deal: ${enrichAttendeesOutput.deal.name}, Stage: ${enrichAttendeesOutput.deal.stage}, Value: $${enrichAttendeesOutput.deal.value?.toLocaleString() || 'unknown'}`
          : '';

        // Format company news
        const newsStr = companyNewsOutput?.company_profile?.recent_news
          ?.slice(0, 3)
          .map((n: any) => `- ${n.title || n.headline || n}`)
          .join('\n') || '';

        promptText = buildReturnMeetingPrompt({
          meetingTitle,
          meetingTime: meetingStart,
          meetingNumber: meetingHistory.priorMeetingCount + 1,
          companyName: enrichAttendeesOutput?.company?.name || 'Unknown Company',
          dealStage: enrichAttendeesOutput?.deal?.stage || null,
          daysInStage: null, // TODO: calculate from deal data
          dealAmount: enrichAttendeesOutput?.deal?.value || null,
          attendeeProfiles: attendeeProfilesStr,
          attendeeComparison: attendeeComparisonStr,
          historicalContext: ragHistoricalContext,
          hubspotContext: hubspotStr,
          companyNews: newsStr,
        });

        // Also include deal memory context if available
        if (dealMemoryContext) {
          promptText += `\n\n## ADDITIONAL DEAL MEMORY\n${dealMemoryContext}`;
        }
      } else {
        // First meeting or no RAG: use the existing prompt logic
        systemPrompt = 'You are a meeting preparation assistant. Adapt your tone and language to the meeting context. For sales meetings (with active deals or sales-stage keywords), use sales language. For service, onboarding, or professional meetings, use neutral professional language — do NOT use sales jargon like prospect, pipeline, or close. For internal meetings, focus on progress and alignment. Generate a comprehensive but concise pre-meeting briefing. Return ONLY valid JSON.';

      // Build prompt
      const promptSections: string[] = [];

      promptSections.push('# PRE-MEETING BRIEFING GENERATION');
      promptSections.push('');
      promptSections.push(`Meeting: ${meetingTitle}`);
      promptSections.push(`Scheduled: ${meetingStart}`);
      promptSections.push('');

      // Attendees
      if (enrichAttendeesOutput?.attendees?.length > 0) {
        promptSections.push('## Attendees');
        for (const att of enrichAttendeesOutput.attendees) {
          const parts = [att.name];
          if (att.title) parts.push(`(${att.title})`);
          if (att.company) parts.push(`at ${att.company}`);
          parts.push(att.is_known_contact ? '[Known Contact]' : '[New Contact]');
          promptSections.push(`- ${parts.join(' ')}`);
        }
        promptSections.push('');
      }

      // Classification
      if (enrichAttendeesOutput?.classification) {
        const cls = enrichAttendeesOutput.classification;
        promptSections.push(`Relationship: ${cls.relationship}`);
        promptSections.push(`Meeting Type: ${cls.meeting_type}`);
        promptSections.push('');
      }

      // Company context
      if (enrichAttendeesOutput?.company) {
        promptSections.push('## Company Context');
        const comp = enrichAttendeesOutput.company;
        promptSections.push(`Company: ${comp.name}`);
        if (comp.industry) promptSections.push(`Industry: ${comp.industry}`);
        if (comp.size) promptSections.push(`Size: ${comp.size} employees`);
        if (comp.domain) promptSections.push(`Domain: ${comp.domain}`);

        if (companyNewsOutput?.company_profile) {
          const profile = companyNewsOutput.company_profile;
          if (profile.description) {
            promptSections.push(`Description: ${profile.description.slice(0, 300)}`);
          }
          if (profile.funding_status) {
            promptSections.push(`Funding: ${profile.funding_status}`);
          }
          if (profile.recent_news?.length > 0) {
            promptSections.push('Recent News:');
            for (const news of profile.recent_news.slice(0, 3)) {
              promptSections.push(`- ${news.title || news.headline || news}`);
            }
          }
        }
        promptSections.push('');
      }

      // Lead profile (person-level intel from research)
      const leadProfile = companyNewsOutput?.lead_profile;
      if (leadProfile) {
        promptSections.push('## Key Attendee Deep Profile');
        if (leadProfile.name) promptSections.push(`Name: ${leadProfile.name}`);
        if (leadProfile.title) promptSections.push(`Title: ${leadProfile.title}`);
        if (leadProfile.role_seniority) promptSections.push(`Seniority: ${leadProfile.role_seniority}`);
        if (leadProfile.tenure_current_role) promptSections.push(`Tenure: ${leadProfile.tenure_current_role}`);
        if (leadProfile.decision_authority) promptSections.push(`Decision Authority: ${leadProfile.decision_authority}`);
        if (leadProfile.background) promptSections.push(`Background: ${leadProfile.background}`);
        if (leadProfile.linkedin_url) promptSections.push(`LinkedIn: ${leadProfile.linkedin_url}`);
        if (leadProfile.previous_roles?.length > 0) {
          promptSections.push('Previous Roles:');
          for (const role of leadProfile.previous_roles.slice(0, 3)) {
            promptSections.push(`- ${role.title} at ${role.company}${role.dates ? ` (${role.dates})` : ''}`);
          }
        }
        if (leadProfile.content_topics?.length > 0) {
          promptSections.push(`Topics They Care About: ${leadProfile.content_topics.join(', ')}`);
        }
        if (leadProfile.recent_activity?.length > 0) {
          promptSections.push('Recent Professional Activity:');
          for (const activity of leadProfile.recent_activity.slice(0, 3)) {
            promptSections.push(`- [${activity.type}] ${activity.title}${activity.date ? ` (${activity.date})` : ''}`);
          }
        }
        if (leadProfile.connection_points?.length > 0) {
          promptSections.push('Connection Points (conversation starters):');
          for (const cp of leadProfile.connection_points.slice(0, 5)) {
            promptSections.push(`- [Tier ${cp.tier}] ${cp.point} → ${cp.suggested_use || 'Use as icebreaker'}`);
          }
        }
        promptSections.push('');
      }

      // Deal context
      if (enrichAttendeesOutput?.deal) {
        promptSections.push('## Active Deal');
        const deal = enrichAttendeesOutput.deal;
        promptSections.push(`Name: ${deal.name}`);
        promptSections.push(`Stage: ${deal.stage}`);
        if (deal.value) promptSections.push(`Value: $${deal.value.toLocaleString()}`);
        if (deal.close_date) promptSections.push(`Expected Close: ${deal.close_date}`);
        promptSections.push('');
      }

      // CRM history
      if (crmHistoryOutput) {
        if (crmHistoryOutput.meeting_count > 0) {
          promptSections.push(`Total prior meetings with this contact: ${crmHistoryOutput.meeting_count}`);
        }

        if (crmHistoryOutput.recent_meetings?.length > 0) {
          promptSections.push('## Recent Meetings');
          for (const mtg of crmHistoryOutput.recent_meetings.slice(0, 3)) {
            const date = new Date(mtg.date).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric'
            });
            promptSections.push(`- ${date}: ${mtg.title}`);
            if (mtg.summary) {
              promptSections.push(`  Summary: ${mtg.summary.slice(0, 200)}`);
            }
          }
          promptSections.push('');
        }

        if (crmHistoryOutput.open_action_items?.length > 0) {
          promptSections.push('## Open Action Items');
          for (const item of crmHistoryOutput.open_action_items.slice(0, 5)) {
            promptSections.push(`- ${item.title} (status: ${item.status})`);
            if (item.from_meeting) {
              promptSections.push(`  From: ${item.from_meeting}`);
            }
          }
          promptSections.push('');
        }

        if (crmHistoryOutput.previous_objections?.length > 0) {
          promptSections.push('## Previous Objections');
          for (const obj of crmHistoryOutput.previous_objections.slice(0, 5)) {
            promptSections.push(`- "${obj.objection}"`);
            if (obj.resolved && obj.resolution) {
              promptSections.push(`  Resolved: ${obj.resolution}`);
            } else {
              promptSections.push(`  Status: Unresolved`);
            }
          }
          promptSections.push('');
        }
      }

      // Contact engagement pattern
      const engagementPattern = crmHistoryOutput?.engagement_pattern;
      if (engagementPattern) {
        promptSections.push('## Contact Email Engagement Patterns');
        if (engagementPattern.avg_response_time_hours != null) {
          promptSections.push(
            `- Avg response time: ${engagementPattern.avg_response_time_hours.toFixed(1)} hours`
          );
        }
        if (engagementPattern.best_email_day && engagementPattern.best_email_hour != null) {
          const hour = engagementPattern.best_email_hour;
          const ampm = hour >= 12 ? 'pm' : 'am';
          const hour12 = hour % 12 === 0 ? 12 : hour % 12;
          promptSections.push(
            `- Best time to email: ${engagementPattern.best_email_day} at ${hour12}${ampm}`
          );
        } else if (engagementPattern.best_email_day) {
          promptSections.push(`- Best day to email: ${engagementPattern.best_email_day}`);
        }
        if (engagementPattern.response_trend) {
          promptSections.push(
            `- Response trend: ${engagementPattern.response_trend} (compared to prior 30 days)`
          );
        }
        promptSections.push('');
      }

      // Risk signals
      if (riskSignals.length > 0) {
        promptSections.push('## Deal Risk Signals');
        for (const signal of riskSignals) {
          promptSections.push(`- [${signal.severity.toUpperCase()}] ${signal.title}`);
          if (signal.description) {
            promptSections.push(`  ${signal.description}`);
          }
        }
        promptSections.push('');
      }

      // Deal memory (institutional knowledge from past meetings and events)
      if (dealMemoryContext) {
        promptSections.push(`\n## Deal Memory (Institutional Knowledge)\n${dealMemoryContext}`);
        promptSections.push('');
      }

      promptSections.push('---');
      promptSections.push('');
      promptSections.push('Generate a comprehensive pre-meeting briefing in JSON format with:');
      promptSections.push('- meeting_type_label: friendly label for meeting type');
      promptSections.push('- relationship_label: friendly label for relationship status');
      promptSections.push('- executive_summary: 2-3 sentence overview');
      promptSections.push('- talking_points: array of 3-5 key discussion topics');
      promptSections.push('- risk_signals: array of 0-3 most critical risks to address');
      promptSections.push('- questions_to_ask: array of 3-5 strategic questions');
      promptSections.push('- action_item_followups: array of action items to reference');
      promptSections.push('- company_snapshot: 2-3 sentence company overview');
      promptSections.push('- attendee_notes: key points about attendees');
      if (engagementPattern) {
        promptSections.push(
          '- optimal_followup_time: recommended day/time for post-meeting follow-up email based on engagement patterns (e.g. "Tuesday at 9am")'
        );
        promptSections.push(
          '- engagement_insight: 1 sentence note about this contact\'s email responsiveness (e.g. "Sarah typically responds within 3.2 hours, trending positively")'
        );
      }
      if (leadProfile) {
        promptSections.push('- attendee_deep_profile: object with {name, title, seniority, decision_authority, background, linkedin_url}');
        promptSections.push('- connection_points: array of {point, tier, suggested_opener} — the best conversation starters ranked by tier (1=direct relevance, 2=contextual, 3=light personalization)');
        promptSections.push('- personalization_hooks: array of 2-3 specific things to reference that show you did your homework (their content, recent activity, career moves)');
      }
      promptSections.push('');
      promptSections.push('Return ONLY valid JSON. No markdown, no explanations.');

      promptText = promptSections.join('\n');
      } // end else (first meeting / no RAG)

      // Try AI synthesis
      let briefing: any;
      if (!apiKey) {
        console.warn('[generate-briefing] No ANTHROPIC_API_KEY, using fallback briefing');
        briefing = generateFallbackBriefing(
          enrichAttendeesOutput,
          crmHistoryOutput,
          companyNewsOutput,
          riskSignals,
          meetingTitle
        );
      } else {
        try {
          console.log('[generate-briefing] Calling Claude Haiku...');
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 1024,
              temperature: 0.3,
              system: systemPrompt,
              messages: [{ role: 'user', content: promptText }],
            }),
          });

          if (!response.ok) {
            throw new Error(`Claude API returned ${response.status}`);
          }

          const result = await response.json();
          const textContent = result.content?.[0]?.text;

          if (!textContent) {
            throw new Error('No text content in Claude response');
          }

          // Parse JSON from response
          const jsonMatch = textContent.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            throw new Error('No JSON found in response');
          }

          briefing = JSON.parse(jsonMatch[0]);
          console.log('[generate-briefing] AI briefing generated successfully');

          // If this was a return meeting, also store the enhanced format data
          if (ragHistoricalContext?.hasHistory && meetingHistory?.isReturnMeeting) {
            briefing._isReturnMeeting = true;
            briefing._meetingNumber = meetingHistory.priorMeetingCount + 1;
            briefing._companyName = enrichAttendeesOutput?.company?.name || 'Unknown';
          }

          // Track cost for briefing generation
          const supabase = getServiceClient();
          const usage = extractAnthropicUsage(result);
          await logAICostEvent(
            supabase,
            state.event.user_id,
            state.event.org_id,
            'anthropic',
            'claude-haiku-4-5-20251001',
            usage.inputTokens,
            usage.outputTokens,
            'pre-meeting-briefing',
            { meeting_id: state.event.payload.meeting_id, meeting_title: meetingTitle }
          );
        } catch (err) {
          console.warn('[generate-briefing] AI generation failed, using fallback:', err);
          briefing = generateFallbackBriefing(
            enrichAttendeesOutput,
            crmHistoryOutput,
            companyNewsOutput,
            riskSignals,
            meetingTitle
          );
        }
      }

      return { success: true, output: { briefing }, duration_ms: Date.now() - start };
    } catch (err) {
      console.error('[generate-briefing] Error:', err);
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};

// Helper: Format engagement pattern as a human-readable insight string
function formatEngagementInsight(pattern: {
  avg_response_time_hours: number | null;
  best_email_day: string | null;
  best_email_hour: number | null;
  response_trend: string | null;
} | null): string | null {
  if (!pattern) return null;

  const parts: string[] = [];

  if (pattern.avg_response_time_hours != null) {
    parts.push(`typically responds within ${pattern.avg_response_time_hours.toFixed(1)} hours`);
  }

  if (pattern.best_email_day && pattern.best_email_hour != null) {
    const hour = pattern.best_email_hour;
    const ampm = hour >= 12 ? 'pm' : 'am';
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    parts.push(`best reached on ${pattern.best_email_day} at ${hour12}${ampm}`);
  }

  if (pattern.response_trend && pattern.response_trend !== 'stable') {
    parts.push(`response speed trending ${pattern.response_trend}`);
  }

  return parts.length > 0 ? parts.join(', ') : null;
}

// Helper: Generate fallback briefing from raw data
function generateFallbackBriefing(
  attendeesOutput: any,
  crmOutput: any,
  newsOutput: any,
  riskSignals: any[],
  meetingTitle: string
): any {
  const classification = attendeesOutput?.classification || {};
  const company = attendeesOutput?.company;
  const deal = attendeesOutput?.deal;
  const leadProfile = newsOutput?.lead_profile;

  const talkingPoints: string[] = [];
  if (crmOutput?.open_action_items?.length > 0) {
    talkingPoints.push(`Follow up on ${crmOutput.open_action_items.length} open action items`);
  }
  if (deal) {
    talkingPoints.push(`Discuss ${deal.stage} stage progression`);
  }
  if (company) {
    talkingPoints.push(`Understand current challenges at ${company.name}`);
  }

  const questions: string[] = [];
  if (classification.meeting_type === 'discovery') {
    questions.push('What are your biggest challenges right now?');
    questions.push('How are you currently handling this process?');
    questions.push('What would success look like for you?');
  } else if (classification.meeting_type === 'demo') {
    questions.push('Which features are most important to your team?');
    questions.push('What does your current workflow look like?');
  } else {
    questions.push('What would you like to cover today?');
    questions.push('Are there any concerns we should address?');
  }

  const pattern = crmOutput?.engagement_pattern ?? null;
  const engagementInsight = formatEngagementInsight(pattern);

  const briefing: any = {
    meeting_type_label: classification.meeting_type || 'General Meeting',
    relationship_label: classification.relationship || 'Prospect',
    executive_summary: `${meetingTitle} with ${company?.name || 'prospect'}. ` +
      `${crmOutput?.meeting_count > 0 ? `This is meeting #${crmOutput.meeting_count + 1} with this contact.` : 'First meeting.'} ` +
      (deal ? `Active ${deal.stage} deal valued at $${deal.value?.toLocaleString() || 'unknown'}.` : ''),
    talking_points: talkingPoints,
    risk_signals: riskSignals.slice(0, 3).map(s => s.title),
    questions_to_ask: questions,
    action_item_followups: crmOutput?.open_action_items?.slice(0, 3).map((i: any) => i.title) || [],
    company_snapshot: company ?
      `${company.name} is a ${company.industry || 'company'} ${company.size ? `with ${company.size} employees` : ''}.` :
      'No company information available.',
    attendee_notes: attendeesOutput?.attendees
      ?.map((a: any) => `${a.name}${a.title ? ` (${a.title})` : ''}`)
      .join(', ') || 'No attendee information.',
  };

  // Add engagement insight and optimal follow-up time if pattern data is available
  if (engagementInsight) {
    briefing.engagement_insight = engagementInsight;
  }
  if (pattern?.best_email_day && pattern?.best_email_hour != null) {
    const hour = pattern.best_email_hour;
    const ampm = hour >= 12 ? 'pm' : 'am';
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    briefing.optimal_followup_time = `${pattern.best_email_day} at ${hour12}${ampm}`;
  }

  // Add lead profile data if available
  if (leadProfile) {
    briefing.attendee_deep_profile = {
      name: leadProfile.name,
      title: leadProfile.title,
      seniority: leadProfile.role_seniority,
      decision_authority: leadProfile.decision_authority,
      background: leadProfile.background,
      linkedin_url: leadProfile.linkedin_url,
    };
    briefing.connection_points = leadProfile.connection_points || [];
    briefing.personalization_hooks = leadProfile.content_topics?.slice(0, 3) || [];
  }

  return briefing;
}

// =============================================================================
// Adapter 5: Deliver Slack Briefing
// =============================================================================

import { deliverToSlack } from '../../proactive/deliverySlack.ts';
import type { ProactiveNotificationPayload } from '../../proactive/types.ts';

export const deliverSlackBriefingAdapter: SkillAdapter = {
  name: 'deliver-slack-briefing',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      console.log('[deliver-slack-briefing] Starting delivery...');
      const supabase = getServiceClient();

      const briefingOutput = state.outputs['generate-briefing'] as any;
      const enrichAttendeesOutput = state.outputs['enrich-attendees'] as any;
      const companyNewsOutput = state.outputs['research-company-news'] as any;

      if (!briefingOutput?.briefing) {
        throw new Error('No briefing data available');
      }

      const briefing = briefingOutput.briefing;
      const meetingTitle = state.event.payload.title as string || 'Upcoming Meeting';
      const meetingId = state.event.payload.meeting_id as string;

      // Get bot token and Slack user ID for delivery
      const { data: slackIntegration } = await supabase
        .from('slack_integrations')
        .select('access_token')
        .eq('user_id', state.event.user_id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      const { data: slackMapping } = await supabase
        .from('slack_user_mappings')
        .select('slack_user_id')
        .eq('org_id', state.event.org_id)
        .eq('sixty_user_id', state.event.user_id)
        .maybeSingle();

      const botToken = slackIntegration?.access_token;
      const recipientSlackUserId = slackMapping?.slack_user_id;

      let slackDelivered = false;
      let deliveryError: string | undefined;

      if (!botToken) {
        console.warn('[deliver-slack-briefing] No Slack bot token found for user');
        deliveryError = 'No Slack integration';
      } else if (!recipientSlackUserId) {
        console.warn('[deliver-slack-briefing] No Slack user mapping found');
        deliveryError = 'No Slack user mapping';
      } else {
        // Build Slack blocks from briefing data — route based on meeting type
        let blocks: any[];

        if (briefing._isReturnMeeting) {
          // Return meeting — use the new structured block format
          const meetingTime = new Date(state.event.payload.start_time as string).toLocaleString('en-GB', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          });

          blocks = buildReturnMeetingSlackBlocks(
            briefing,
            meetingTitle,
            meetingTime,
            briefing._meetingNumber || 2,
            briefing._companyName || enrichAttendeesOutput?.company?.name || 'Company',
            meetingId,
          );

          // Add deep link action button for the deal, if available
          const dealId = enrichAttendeesOutput?.deal?.id;
          if (dealId) {
            blocks.push({ type: 'divider' });
            blocks.push({
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: 'View Deal' },
                  url: `https://app.use60.com/deals/${dealId}`,
                  action_id: 'prep_view_deal',
                },
              ],
            });
          }
        } else {
          // First meeting or legacy — use the existing inline block building
          blocks = [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: `Meeting Briefing: ${meetingTitle}`,
              },
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: briefing.executive_summary || 'Upcoming meeting briefing prepared.',
              },
            },
          ];

          if (briefing.talking_points?.length > 0) {
            blocks.push({ type: 'divider' });
            blocks.push({
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Key Topics:*\n${briefing.talking_points.map((p: string) => `• ${p}`).join('\n')}`,
              },
            });
          }

          if (briefing.questions_to_ask?.length > 0) {
            blocks.push({ type: 'divider' });
            blocks.push({
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Questions to Ask:*\n${briefing.questions_to_ask.map((q: string) => `• ${q}`).join('\n')}`,
              },
            });
          }
        }

        const payload: ProactiveNotificationPayload = {
          type: 'pre_meeting_90min',
          orgId: state.event.org_id,
          recipientUserId: state.event.user_id,
          recipientSlackUserId,
          entityType: 'meeting',
          entityId: meetingId,
          title: `Meeting Briefing: ${meetingTitle}`,
          message: briefing.executive_summary || 'Meeting briefing prepared.',
          blocks,
          metadata: {
            meeting_id: meetingId,
            meeting_title: meetingTitle,
            meeting_type: briefing.meeting_type_label,
            relationship: briefing.relationship_label,
            company_name: enrichAttendeesOutput?.company?.name,
            deal_id: enrichAttendeesOutput?.deal?.id,
          },
          priority: 'medium',
        };

        const deliveryResult = await deliverToSlack(supabase, payload, botToken);
        slackDelivered = deliveryResult.sent;
        deliveryError = deliveryResult.error;

        if (!slackDelivered) {
          console.warn(
            `[deliver-slack-briefing] Slack delivery blocked/failed: ${deliveryError}`
          );
        }
      }

      // Insert agent_activity record (in-app mirroring)
      try {
        const { error: activityError } = await supabase.rpc('insert_agent_activity', {
          p_user_id: state.event.user_id,
          p_org_id: state.event.org_id,
          p_sequence_type: 'pre_meeting_90min',
          p_title: `Meeting Briefing: ${meetingTitle}`,
          p_summary: briefing.executive_summary?.slice(0, 500) || 'Pre-meeting briefing prepared.',
          p_metadata: {
            meeting_id: meetingId,
            meeting_type: briefing.meeting_type_label,
            relationship: briefing.relationship_label,
            talking_points_count: briefing.talking_points?.length || 0,
            questions_count: briefing.questions_to_ask?.length || 0,
            delivery_method: slackDelivered ? 'slack' : 'in_app_only',
            delivery_error: deliveryError,
          },
          p_job_id: null,
        });

        if (activityError) {
          console.error('[deliver-slack-briefing] Failed to insert agent_activity:', activityError);
        } else {
          console.log('[deliver-slack-briefing] Agent activity recorded');
        }
      } catch (actErr) {
        console.error('[deliver-slack-briefing] Error inserting agent_activity:', actErr);
      }

      console.log(
        `[deliver-slack-briefing] Delivery complete: ` +
        `slack=${slackDelivered}, method=${slackDelivered ? 'slack' : 'in_app_only'}`
      );

      return {
        success: true,
        output: {
          delivered: slackDelivered,
          delivery_method: slackDelivered ? 'slack' : 'in_app_only',
          delivery_error: deliveryError,
        },
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      console.error('[deliver-slack-briefing] Error:', err);
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};
