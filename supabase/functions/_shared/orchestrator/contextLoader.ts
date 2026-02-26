/**
 * Context Tier Loader
 *
 * Loads context data for orchestrator sequences in three tiers:
 * - Tier 1: Baseline (org, user, settings) - always loaded
 * - Tier 2: Per-contact context (contact, company, deal, history) - when event involves specific entities
 * - Tier 3: On-demand enrichment (Apollo, LinkedIn, news) - loaded at runtime
 *
 * Context is loaded ONCE at sequence start and stored in sequence_jobs.context.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import type {
  OrchestratorEvent,
  SequenceContext,
  ContextTier1,
  ContextTier2,
  ContextTier3,
  ContextTierSpec,
} from './types.ts';
import { checkCreditBalance } from '../costTracking.ts';

/**
 * Load all required context tiers for a sequence.
 * Context is loaded ONCE at sequence start and stored in sequence_jobs.context.
 */
export async function loadContext(
  supabase: SupabaseClient,
  event: OrchestratorEvent,
  requiredTiers: Set<ContextTierSpec>,
): Promise<SequenceContext> {
  // Tier 1 is always loaded
  const tier1 = await loadTier1(supabase, event);

  const context: SequenceContext = { tier1 };

  // Tier 2: per-contact context (when event involves a specific contact/deal)
  if (tierRequired(requiredTiers, 'tier2')) {
    context.tier2 = await loadTier2(supabase, event);
  }

  // Tier 3: on-demand enrichment
  const tier3Specs = getTier3Specs(requiredTiers);
  if (tier3Specs.length > 0) {
    context.tier3 = await loadTier3(supabase, event, tier3Specs);
  }

  return context;
}

/**
 * Load Tier 1: Baseline context (org, user, settings)
 */
async function loadTier1(
  supabase: SupabaseClient,
  event: OrchestratorEvent,
): Promise<ContextTier1> {
  // Load org profile
  // Use columns that exist across all environments (no slug/industry — use company_industry, company_size)
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, name, company_industry, company_size, company_domain, created_at, updated_at')
    .eq('id', event.org_id)
    .maybeSingle();

  if (orgError) {
    throw new Error(`Organization lookup failed: ${orgError.message}`);
  }
  if (!org) {
    throw new Error(`Organization not found: ${event.org_id}`);
  }

  // Load user profile (use first_name/last_name — full_name doesn't exist on all environments)
  const { data: user, error: userError } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name, avatar_url, timezone, created_at, updated_at')
    .eq('id', event.user_id)
    .maybeSingle();

  if (userError) {
    throw new Error(`User lookup failed: ${userError.message}`);
  }
  if (!user) {
    throw new Error(`User not found: ${event.user_id}`);
  }

  // Load Slack user mapping
  const { data: slackMapping } = await supabase
    .from('slack_user_mappings')
    .select('slack_user_id, preferred_timezone')
    .eq('org_id', event.org_id)
    .eq('sixty_user_id', event.user_id)
    .maybeSingle();

  // Load Slack user preferences for quiet hours and rate limiting (non-fatal if table missing)
  const features: Record<string, boolean> = {};
  let quietHoursStart: string | undefined;
  let quietHoursEnd: string | undefined;
  let maxNotificationsPerHour: number | undefined;
  let briefingTime: string | undefined;

  try {
    const { data: slackPreferences } = await supabase
      .from('slack_user_preferences')
      .select('feature, is_enabled, quiet_hours_start, quiet_hours_end, max_notifications_per_hour, briefing_time')
      .eq('org_id', event.org_id)
      .eq('user_id', event.user_id);

    if (slackPreferences && slackPreferences.length > 0) {
      slackPreferences.forEach((pref: any) => {
        features[pref.feature] = pref.is_enabled || false;
        if (pref.quiet_hours_start && !quietHoursStart) quietHoursStart = pref.quiet_hours_start;
        if (pref.quiet_hours_end && !quietHoursEnd) quietHoursEnd = pref.quiet_hours_end;
        if (pref.max_notifications_per_hour && !maxNotificationsPerHour) maxNotificationsPerHour = pref.max_notifications_per_hour;
        if (pref.briefing_time && !briefingTime) briefingTime = pref.briefing_time;
      });
    }
  } catch {
    console.warn('[contextLoader] slack_user_preferences not available, skipping');
  }

  // Load ICP profile
  const { data: icp } = await supabase
    .from('icp_profiles')
    .select('*')
    .eq('org_id', event.org_id)
    .maybeSingle();

  // Load product profiles
  const { data: products } = await supabase
    .from('product_profiles')
    .select('*')
    .eq('org_id', event.org_id);

  // Check cost budget
  const costBudget = await checkCreditBalance(supabase, event.org_id);

  return {
    org: {
      id: org.id,
      name: org.name,
      industry: org.company_industry,
      company_size: org.company_size,
    },
    user: {
      id: user.id,
      email: user.email,
      name: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      slack_user_id: slackMapping?.slack_user_id,
      timezone: slackMapping?.preferred_timezone || user.timezone,
      quiet_hours_start: quietHoursStart,
      quiet_hours_end: quietHoursEnd,
      max_notifications_per_hour: maxNotificationsPerHour,
      briefing_time: briefingTime,
    },
    features,
    icp: icp || undefined,
    products: products ? { profiles: products } : undefined,
    costBudget: {
      allowed: costBudget.allowed,
      remaining_usd: costBudget.balance,
      reason: costBudget.message,
    },
  };
}

/**
 * Load Tier 2: Per-contact context (contact, company, deal, history)
 */
async function loadTier2(
  supabase: SupabaseClient,
  event: OrchestratorEvent,
): Promise<ContextTier2 | undefined> {
  const payload = event.payload;

  // Only load if event involves specific entities
  if (!payload.contact_id && !payload.deal_id && !payload.meeting_id) {
    return undefined;
  }

  const tier2: ContextTier2 = {};

  // Resolve contact_id: explicit payload > meeting columns > meeting_contacts > meeting_attendees email lookup
  let contactId = payload.contact_id as string | undefined;

  if (!contactId && payload.meeting_id) {
    const meetingId = payload.meeting_id as string;
    console.log(`[contextLoader] Resolving contact for meeting ${meetingId}`);

    // Try meeting's primary_contact_id and contact_id columns
    const { data: meeting, error: meetingErr } = await supabase
      .from('meetings')
      .select('primary_contact_id, contact_id')
      .eq('id', meetingId)
      .maybeSingle();

    console.log(`[contextLoader] Meeting lookup: primary_contact_id=${meeting?.primary_contact_id}, contact_id=${meeting?.contact_id}, error=${meetingErr?.message || 'none'}`);
    contactId = meeting?.primary_contact_id || meeting?.contact_id || undefined;

    // Fallback 2: meeting_contacts junction table
    if (!contactId) {
      const { data: mc } = await supabase
        .from('meeting_contacts')
        .select('contact_id')
        .eq('meeting_id', meetingId)
        .order('is_primary', { ascending: false })
        .limit(1)
        .maybeSingle();

      console.log(`[contextLoader] meeting_contacts lookup: contact_id=${mc?.contact_id || 'none'}`);
      if (mc?.contact_id) {
        contactId = mc.contact_id;
      }
    }

    // Fallback 3: meeting_attendees (external) → look up contact by email
    if (!contactId) {
      const { data: attendees } = await supabase
        .from('meeting_attendees')
        .select('email, name, is_external')
        .eq('meeting_id', meetingId)
        .eq('is_external', true);

      console.log(`[contextLoader] meeting_attendees (external): found ${attendees?.length || 0}`, attendees?.map((a: any) => a.email));

      if (attendees && attendees.length > 0) {
        // Try each external attendee email to find a matching contact
        for (const att of attendees) {
          if (!att.email) continue;
          const { data: contactByEmail } = await supabase
            .from('contacts')
            .select('id')
            .eq('email', att.email)
            .limit(1)
            .maybeSingle();

          if (contactByEmail?.id) {
            contactId = contactByEmail.id;
            console.log(`[contextLoader] Found contact ${contactId} via attendee email ${att.email}`);
            break;
          }
        }
      }
    }

    // Fallback 4: meeting_attendees (any with email) → look up contact by email
    if (!contactId) {
      const { data: allAttendees } = await supabase
        .from('meeting_attendees')
        .select('email, name, is_external')
        .eq('meeting_id', meetingId)
        .not('email', 'is', null);

      console.log(`[contextLoader] meeting_attendees (all): found ${allAttendees?.length || 0}`, allAttendees?.map((a: any) => `${a.email} (ext=${a.is_external})`));

      if (allAttendees && allAttendees.length > 0) {
        for (const att of allAttendees) {
          if (!att.email) continue;
          const { data: contactByEmail } = await supabase
            .from('contacts')
            .select('id')
            .eq('email', att.email)
            .limit(1)
            .maybeSingle();

          if (contactByEmail?.id) {
            contactId = contactByEmail.id;
            console.log(`[contextLoader] Found contact ${contactId} via any-attendee email ${att.email}`);
            break;
          }
        }
      }
    }

    if (!contactId) {
      console.log(`[contextLoader] No contact record found for meeting ${meetingId} — trying direct attendee/calendar fallbacks`);

      // Fallback 5: meeting_attendees email directly (no contact record needed)
      const { data: anyAttendees } = await supabase
        .from('meeting_attendees')
        .select('email, name, is_external')
        .eq('meeting_id', meetingId)
        .not('email', 'is', null);

      console.log(`[contextLoader] meeting_attendees with email: ${anyAttendees?.length || 0}`, anyAttendees?.map((a: any) => `${a.email} (ext=${a.is_external})`));

      const extAttendee = anyAttendees?.find((a: any) => a.is_external) || anyAttendees?.[0];
      if (extAttendee?.email) {
        console.log(`[contextLoader] Using direct attendee fallback: ${extAttendee.email}`);
        tier2.contact = {
          id: `attendee:${extAttendee.email}`,
          name: extAttendee.name || extAttendee.email,
          email: extAttendee.email,
          company: undefined,
          title: undefined,
          linkedin_url: undefined,
        };
      }

      // Fallback 6: Match meeting to calendar_events by time, get external attendees
      if (!tier2.contact) {
        const { data: mtg } = await supabase
          .from('meetings')
          .select('meeting_start, meeting_end, org_id, owner_user_id')
          .eq('id', meetingId)
          .maybeSingle();

        if (mtg?.meeting_start) {
          // Find calendar events within 15 min of meeting start for same org/user
          const meetingStart = new Date(mtg.meeting_start);
          const windowStart = new Date(meetingStart.getTime() - 15 * 60 * 1000).toISOString();
          const windowEnd = new Date(meetingStart.getTime() + 15 * 60 * 1000).toISOString();

          const { data: calEvents } = await supabase
            .from('calendar_events')
            .select('id, attendees')
            .eq('user_id', mtg.owner_user_id)
            .gte('start_time', windowStart)
            .lte('start_time', windowEnd)
            .limit(3);

          console.log(`[contextLoader] calendar_events near meeting time: ${calEvents?.length || 0}`);

          if (calEvents && calEvents.length > 0) {
            // Get external attendees from calendar_attendees table
            const eventIds = calEvents.map((e: any) => e.id);
            const { data: calAttendees } = await supabase
              .from('calendar_attendees')
              .select('email, name, is_organizer')
              .in('event_id', eventIds)
              .eq('is_organizer', false);

            console.log(`[contextLoader] calendar_attendees (non-organizer): ${calAttendees?.length || 0}`, calAttendees?.map((a: any) => a.email));

            // Filter out the user's own email and internal org emails
            const userEmail = (await supabase.from('profiles').select('email').eq('id', mtg.owner_user_id).maybeSingle())?.data?.email;
            const externalCalAttendee = calAttendees?.find((a: any) =>
              a.email && a.email !== userEmail
            );

            if (externalCalAttendee?.email) {
              console.log(`[contextLoader] Using calendar attendee fallback: ${externalCalAttendee.email}`);

              // Try to find a matching contact
              const { data: matchedContact } = await supabase
                .from('contacts')
                .select('id')
                .eq('email', externalCalAttendee.email)
                .limit(1)
                .maybeSingle();

              if (matchedContact?.id) {
                contactId = matchedContact.id;
                console.log(`[contextLoader] Matched calendar attendee to contact ${contactId}`);
              } else {
                tier2.contact = {
                  id: `cal-attendee:${externalCalAttendee.email}`,
                  name: externalCalAttendee.name || externalCalAttendee.email,
                  email: externalCalAttendee.email,
                  company: undefined,
                  title: undefined,
                  linkedin_url: undefined,
                };
              }
            }

            // Also try parsing the JSONB attendees field from the calendar event directly
            if (!tier2.contact && !contactId) {
              for (const evt of calEvents) {
                if (!evt.attendees || !Array.isArray(evt.attendees)) continue;
                const extFromJson = (evt.attendees as any[]).find((a: any) =>
                  a.email && a.email !== userEmail && !a.organizer && !a.self
                );
                if (extFromJson?.email) {
                  console.log(`[contextLoader] Using calendar event JSONB attendee: ${extFromJson.email}`);
                  tier2.contact = {
                    id: `cal-json:${extFromJson.email}`,
                    name: extFromJson.displayName || extFromJson.email,
                    email: extFromJson.email,
                    company: undefined,
                    title: undefined,
                    linkedin_url: undefined,
                  };
                  break;
                }
              }
            }
          }
        }
      }
    }
  }

  // Load contact from resolved contactId
  if (contactId) {
    const { data: contact, error: contactErr } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, full_name, email, company, title, linkedin_url, phone, owner_id, created_at, updated_at')
      .eq('id', contactId)
      .maybeSingle();

    console.log(`[contextLoader] Contact lookup for ${contactId}: found=${!!contact}, email=${contact?.email || 'none'}, error=${contactErr?.message || 'none'}`);

    if (contact) {
      tier2.contact = {
        id: contact.id,
        name: contact.full_name || [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.email,
        email: contact.email,
        company: contact.company,
        title: contact.title,
        linkedin_url: contact.linkedin_url,
      };
    }
  } else if (!tier2.contact) {
    console.log('[contextLoader] No contactId or attendee email resolved — tier2.contact will be empty');
  }

  // Load company
  if (payload.company_id) {
    const { data: company } = await supabase
      .from('companies')
      .select('id, name, domain, industry, employee_count, linkedin_url, website, created_at, updated_at')
      .eq('id', payload.company_id as string)
      .maybeSingle();

    if (company) {
      tier2.company = {
        id: company.id,
        name: company.name,
        domain: company.domain,
        industry: company.industry,
        employee_count: company.employee_count,
      };
    }
  }

  // Load deal (v2: uses stage_id not stage)
  if (payload.deal_id) {
    console.log(`[contextLoader] Loading deal: ${payload.deal_id}`);
    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .select('id, name, stage_id, status, value, owner_id, close_date, probability, created_at, updated_at')
      .eq('id', payload.deal_id as string)
      .maybeSingle();

    if (dealError) {
      console.warn('[contextLoader] Deal fetch error:', dealError.message);
    }

    console.log(`[contextLoader] Deal result: ${deal ? deal.name : 'null'}, error: ${dealError?.message || 'none'}`);

    if (deal) {
      tier2.deal = {
        id: deal.id,
        name: deal.name,
        stage: deal.stage_id || deal.status,
        value: deal.value,
        owner_id: deal.owner_id,
      };
      console.log(`[contextLoader] tier2.deal set: ${deal.name}`);
    }
  }

  // Load recent meeting history (last 5 meetings for this contact via junction table)
  if (contactId) {
    const { data: meetingLinks } = await supabase
      .from('meeting_contacts')
      .select('meeting_id')
      .eq('contact_id', contactId)
      .limit(5);

    if (meetingLinks && meetingLinks.length > 0) {
      const meetingIds = meetingLinks.map((mc: any) => mc.meeting_id);
      const { data: meetings } = await supabase
        .from('meetings')
        .select('id, title, start_time, duration_minutes, summary, owner_user_id, created_at')
        .in('id', meetingIds)
        .order('start_time', { ascending: false });

      tier2.meetingHistory = meetings || [];
    } else {
      tier2.meetingHistory = [];
    }
  }

  // Load email history (last 10 emails for this contact)
  if (contactId && tier2.contact?.email) {
    const { data: emails } = await supabase
      .from('emails')
      .select('id, subject, body, sent_at, direction, thread_id, created_at')
      .or(`from_email.eq.${tier2.contact.email},to_emails.cs.{${tier2.contact.email}}`)
      .order('sent_at', { ascending: false })
      .limit(10);

    tier2.emailHistory = emails || [];
  }

  // Load recent activities (last 20 for this deal)
  if (payload.deal_id) {
    const { data: activities } = await supabase
      .from('activities')
      .select('id, activity_type, description, user_id, entity_type, entity_id, created_at')
      .eq('entity_type', 'deal')
      .eq('entity_id', payload.deal_id as string)
      .order('created_at', { ascending: false })
      .limit(20);

    tier2.activities = activities || [];
  }

  return tier2;
}

/**
 * Load Tier 3: On-demand enrichment (placeholders for runtime)
 */
async function loadTier3(
  supabase: SupabaseClient,
  event: OrchestratorEvent,
  specs: string[],
): Promise<ContextTier3> {
  const tier3: ContextTier3 = {};

  // These are placeholders for runtime enrichment calls
  // Actual data is fetched on-demand during sequence execution
  for (const spec of specs) {
    const key = spec.replace('tier3:', '') as keyof ContextTier3;

    switch (key) {
      case 'apollo':
        tier3.apollo = {};
        break;
      case 'linkedin':
        tier3.linkedin = {};
        break;
      case 'news':
        tier3.news = [];
        break;
      case 'template':
        tier3.template = {};
        break;
      case 'campaign':
        tier3.campaign = {};
        break;
    }
  }

  return tier3;
}

/**
 * Check if a tier is required
 */
function tierRequired(tiers: Set<ContextTierSpec>, name: string): boolean {
  return tiers.has(name as ContextTierSpec);
}

/**
 * Extract tier3:* specs from required tiers
 */
function getTier3Specs(tiers: Set<ContextTierSpec>): string[] {
  return Array.from(tiers).filter(tier => tier.startsWith('tier3:'));
}
