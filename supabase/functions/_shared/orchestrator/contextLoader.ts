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

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
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
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, slug, industry, company_size, created_at, updated_at')
    .eq('id', event.org_id)
    .maybeSingle();

  if (!org) {
    throw new Error(`Organization not found: ${event.org_id}`);
  }

  // Load user profile
  const { data: user } = await supabase
    .from('profiles')
    .select('id, email, full_name, avatar_url, timezone, created_at, updated_at')
    .eq('id', event.user_id)
    .maybeSingle();

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

  // Load Slack user preferences for quiet hours and rate limiting
  const { data: slackPreferences } = await supabase
    .from('slack_user_preferences')
    .select('feature, is_enabled, quiet_hours_start, quiet_hours_end, max_notifications_per_hour, briefing_time')
    .eq('org_id', event.org_id)
    .eq('user_id', event.user_id);

  // Aggregate preferences into a features map
  const features: Record<string, boolean> = {};
  let quietHoursStart: string | undefined;
  let quietHoursEnd: string | undefined;
  let maxNotificationsPerHour: number | undefined;
  let briefingTime: string | undefined;

  if (slackPreferences && slackPreferences.length > 0) {
    slackPreferences.forEach((pref) => {
      features[pref.feature] = pref.is_enabled || false;
      // Use the first non-null quiet hours found
      if (pref.quiet_hours_start && !quietHoursStart) {
        quietHoursStart = pref.quiet_hours_start;
      }
      if (pref.quiet_hours_end && !quietHoursEnd) {
        quietHoursEnd = pref.quiet_hours_end;
      }
      if (pref.max_notifications_per_hour && !maxNotificationsPerHour) {
        maxNotificationsPerHour = pref.max_notifications_per_hour;
      }
      if (pref.briefing_time && !briefingTime) {
        briefingTime = pref.briefing_time;
      }
    });
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
      slug: org.slug,
      industry: org.industry,
      company_size: org.company_size,
    },
    user: {
      id: user.id,
      email: user.email,
      name: user.full_name || user.email,
      slack_user_id: slackMapping?.slack_user_id,
      timezone: slackMapping?.preferred_timezone || user.timezone,
      quiet_hours_start: quietHoursStart,
      quiet_hours_end: quietHoursEnd,
      max_notifications_per_hour: maxNotificationsPerHour,
      briefing_time,
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

  // Load contact
  if (payload.contact_id) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('id, name, email, company, title, linkedin_url, phone, owner_id, created_at, updated_at')
      .eq('id', payload.contact_id as string)
      .maybeSingle();

    if (contact) {
      tier2.contact = {
        id: contact.id,
        name: contact.name,
        email: contact.email,
        company: contact.company,
        title: contact.title,
        linkedin_url: contact.linkedin_url,
      };
    }
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

  // Load deal
  if (payload.deal_id) {
    const { data: deal } = await supabase
      .from('deals')
      .select('id, name, stage, value, owner_id, close_date, probability, created_at, updated_at')
      .eq('id', payload.deal_id as string)
      .maybeSingle();

    if (deal) {
      tier2.deal = {
        id: deal.id,
        name: deal.name,
        stage: deal.stage,
        value: deal.value,
        owner_id: deal.owner_id,
      };
    }
  }

  // Load recent meeting history (last 5 meetings for this contact)
  if (payload.contact_id) {
    const { data: meetings } = await supabase
      .from('meetings')
      .select('id, title, start_time, duration_minutes, summary, transcript, owner_user_id, created_at')
      .contains('attendees_emails', [tier2.contact?.email])
      .order('start_time', { ascending: false })
      .limit(5);

    tier2.meetingHistory = meetings || [];
  }

  // Load email history (last 10 emails for this contact)
  if (payload.contact_id) {
    const { data: emails } = await supabase
      .from('emails')
      .select('id, subject, body, sent_at, direction, thread_id, created_at')
      .or(`from_email.eq.${tier2.contact?.email},to_emails.cs.{${tier2.contact?.email}}`)
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
