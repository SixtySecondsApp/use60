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
      const attendees: Array<{ email: string; name: string }> =
        state.event.payload.attendees as any || [];

      if (attendees.length === 0 && state.context.tier2?.contact?.email) {
        attendees.push({
          email: state.context.tier2.contact.email,
          name: state.context.tier2.contact.name || state.context.tier2.contact.email,
        });
      }

      const enrichedAttendees: Array<{
        name: string;
        email: string;
        title?: string;
        company?: string;
        is_known_contact: boolean;
      }> = [];

      let primaryContact: any = null;
      let primaryCompany: any = null;
      let primaryDeal: any = null;

      // Enrich each attendee
      for (const att of attendees) {
        console.log(`[enrich-attendees] Processing attendee: ${att.email}`);

        // Query contact by email
        const { data: contact } = await supabase
          .from('contacts')
          .select('id, first_name, last_name, full_name, email, company, title, company_id')
          .eq('email', att.email.toLowerCase())
          .maybeSingle();

        if (!contact) {
          enrichedAttendees.push({
            name: att.name,
            email: att.email,
            is_known_contact: false,
          });
          continue;
        }

        const contactName = contact.full_name ||
          [contact.first_name, contact.last_name].filter(Boolean).join(' ') ||
          contact.email;

        // Store first known contact as primary
        if (!primaryContact) {
          primaryContact = contact;
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

        if (company && !primaryCompany) {
          primaryCompany = company;
        }

        enrichedAttendees.push({
          name: contactName,
          email: contact.email,
          title: contact.title,
          company: company?.name || contact.company,
          is_known_contact: true,
        });

        // Look up deals for the primary contact
        if (primaryContact && !primaryDeal && contact.id === primaryContact.id) {
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

      // Fallback to title keywords
      if (meetingType === 'general' && state.event.payload.title) {
        const title = (state.event.payload.title as string).toLowerCase();
        if (title.includes('discovery')) {
          meetingType = 'discovery';
        } else if (title.includes('demo')) {
          meetingType = 'demo';
        } else if (title.includes('intro')) {
          meetingType = 'discovery';
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
        `company=${!!primaryCompany}, relationship=${relationship}, type=${meetingType}`
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
      const contactData = state.context.tier2?.contact;
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

      if (!contactData) {
        console.log('[pull-crm-history] No contact in tier2, returning empty history');
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
        30 // 30 days lookback
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

      enrichment = {
        contact: contactEnrichment.contact,
        recent_meetings: contactEnrichment.recentMeetings,
        recent_emails: contactEnrichment.recentEmails,
        open_action_items: formattedActionItems,
        previous_objections: previousObjections,
        deal: contactEnrichment.dealContext,
        meeting_count: count || 0,
      };

      console.log(
        `[pull-crm-history] Complete: ${enrichment.recent_meetings.length} meetings, ` +
        `${enrichment.recent_emails.length} emails, ${formattedActionItems.length} action items, ` +
        `${previousObjections.length} objections, total meetings=${count}`
      );

      return { success: true, output: enrichment, duration_ms: Date.now() - start };
    } catch (err) {
      console.error('[pull-crm-history] Error:', err);
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};

// =============================================================================
// Adapter 3: Research Company News
// =============================================================================

export const researchCompanyNewsAdapter: SkillAdapter = {
  name: 'research-company-news',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      console.log('[research-company-news] Starting company research...');
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

      if (!domain) {
        console.log('[research-company-news] No domain available, skipping enrichment');
        return {
          success: true,
          output: {
            enrichment: null,
            company_profile: {
              description: null,
              industry: company?.industry,
              funding_status: null,
              tech_stack: [],
              competitors: [],
              recent_news: [],
            },
          },
          duration_ms: Date.now() - start,
        };
      }

      console.log(`[research-company-news] Enriching domain: ${domain}`);

      // Call deep-enrich-organization (non-fatal if it fails)
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/deep-enrich-organization`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'start',
            website: domain,
            org_id: state.event.org_id,
          }),
        });

        if (!response.ok) {
          console.warn(
            `[research-company-news] deep-enrich-organization returned ${response.status}, ` +
            `continuing with partial data`
          );
          return {
            success: true,
            output: {
              enrichment: null,
              company_profile: {
                description: null,
                industry: company?.industry,
                funding_status: null,
                tech_stack: [],
                competitors: [],
                recent_news: [],
              },
            },
            duration_ms: Date.now() - start,
          };
        }

        const enrichmentData = await response.json();

        const companyProfile = {
          description: enrichmentData.description || null,
          industry: enrichmentData.industry || company?.industry || null,
          funding_status: enrichmentData.funding_status || null,
          tech_stack: enrichmentData.tech_stack || [],
          competitors: enrichmentData.competitors || [],
          recent_news: enrichmentData.recent_news || [],
        };

        console.log('[research-company-news] Enrichment complete');

        return {
          success: true,
          output: {
            enrichment: enrichmentData,
            company_profile: companyProfile,
          },
          duration_ms: Date.now() - start,
        };
      } catch (err) {
        console.warn('[research-company-news] Enrichment failed (non-fatal):', err);
        return {
          success: true,
          output: {
            enrichment: null,
            company_profile: {
              description: null,
              industry: company?.industry,
              funding_status: null,
              tech_stack: [],
              competitors: [],
              recent_news: [],
            },
          },
          duration_ms: Date.now() - start,
        };
      }
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
      promptSections.push('');
      promptSections.push('Return ONLY valid JSON. No markdown, no explanations.');

      const promptText = promptSections.join('\n');

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
              system: 'You are a sales meeting preparation assistant. Generate a comprehensive but concise pre-meeting briefing. Return ONLY valid JSON.',
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

  return {
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
}

// =============================================================================
// Adapter 5: Deliver Slack Briefing
// =============================================================================

export const deliverSlackBriefingAdapter: SkillAdapter = {
  name: 'deliver-slack-briefing',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      console.log('[deliver-slack-briefing] Starting delivery...');
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

      const briefingOutput = state.outputs['generate-briefing'] as any;
      const enrichAttendeesOutput = state.outputs['enrich-attendees'] as any;

      if (!briefingOutput?.briefing) {
        throw new Error('No briefing data available');
      }

      const briefing = briefingOutput.briefing;

      // Call send-slack-message edge function
      const response = await fetch(`${supabaseUrl}/functions/v1/send-slack-message`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          org_id: state.event.org_id,
          user_id: state.event.user_id,
          message_type: 'meeting_briefing',
          data: {
            briefing,
            meeting_title: state.event.payload.title,
            meeting_start: state.event.payload.start_time,
            attendees: enrichAttendeesOutput?.attendees,
            company: enrichAttendeesOutput?.company,
            deal: enrichAttendeesOutput?.deal,
            classification: enrichAttendeesOutput?.classification,
          },
        }),
      });

      if (!response.ok) {
        console.warn(
          `[deliver-slack-briefing] Slack delivery failed (${response.status}), ` +
          `will attempt in-app fallback`
        );
      }

      const result = await response.json();
      const slackDelivered = response.ok && result.success;

      console.log(
        `[deliver-slack-briefing] Delivery complete: ` +
        `slack=${slackDelivered}, method=${result.delivery_method || 'unknown'}`
      );

      return {
        success: true,
        output: {
          delivered: slackDelivered,
          delivery_method: result.delivery_method || (slackDelivered ? 'slack' : 'in_app_only'),
          slack_ts: result.slack_ts,
        },
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      console.error('[deliver-slack-briefing] Error:', err);
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};
