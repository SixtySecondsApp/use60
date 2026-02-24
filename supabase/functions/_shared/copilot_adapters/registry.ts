import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { CRMAdapter, EmailAdapter, EnrichmentAdapter, MeetingAdapter, NotificationAdapter } from './types.ts';
import {
  createDbCrmAdapter,
  createDbEmailAdapter,
  createDbMeetingAdapter,
  createDbNotificationAdapter,
  createEnrichmentAdapter,
} from './dbAdapters.ts';
import {
  hasHubSpotIntegration,
  getHubSpotClientForOrg,
  createHubSpotCrmAdapter,
} from './hubspotAdapters.ts';

type SupabaseClient = ReturnType<typeof createClient>;

export interface AdapterBundle {
  crm: CRMAdapter;
  meetings: MeetingAdapter;
  email: EmailAdapter;
  notifications: NotificationAdapter;
  enrichment: EnrichmentAdapter;
}

export interface CapabilityInfo {
  capability: 'crm' | 'calendar' | 'email' | 'meetings' | 'messaging' | 'tasks';
  available: boolean;
  provider?: string; // 'db' | 'sixty' | 'hubspot' | 'salesforce' | 'pipedrive' | 'google' | 'microsoft' | 'slack' | 'fathom' | 'meetingbaas' | etc.
  features: string[];
}

export interface AdapterBundleWithCapabilities extends AdapterBundle {
  capabilities: CapabilityInfo[];
}

/**
 * Composite CRM Adapter
 * Searches both local DB and HubSpot, merging results
 */
function createCompositeCrmAdapter(dbAdapter: CRMAdapter, hubspotAdapter: CRMAdapter | null): CRMAdapter {
  if (!hubspotAdapter) return dbAdapter;

  return {
    source: 'composite_crm',
    async getContact(params) {
      // Query both sources in parallel
      const [dbResult, hsResult] = await Promise.all([
        dbAdapter.getContact(params),
        hubspotAdapter.getContact(params).catch(() => ({ success: false, data: { contacts: [] }, source: 'hubspot_crm' })),
      ]);

      const dbContacts = dbResult.success && dbResult.data?.contacts ? dbResult.data.contacts : [];
      const hsContacts = hsResult.success && hsResult.data?.contacts ? hsResult.data.contacts : [];

      // Merge and dedupe by email
      const seenEmails = new Set<string>();
      const merged: any[] = [];

      // Prefer DB records first (they're local)
      for (const c of dbContacts) {
        const email = c.email?.toLowerCase();
        if (email && !seenEmails.has(email)) {
          seenEmails.add(email);
          merged.push({ ...c, source: 'local_crm' });
        } else if (!email) {
          merged.push({ ...c, source: 'local_crm' });
        }
      }

      // Add HubSpot records not in local DB
      for (const c of hsContacts) {
        const email = c.email?.toLowerCase();
        if (email && !seenEmails.has(email)) {
          seenEmails.add(email);
          merged.push({ ...c, source: 'hubspot' });
        } else if (!email) {
          merged.push({ ...c, source: 'hubspot' });
        }
      }

      return {
        success: true,
        data: { contacts: merged, sources: ['local_crm', 'hubspot'] },
        source: 'composite_crm',
      };
    },

    async getDeal(params) {
      // Query both sources in parallel
      const [dbResult, hsResult] = await Promise.all([
        dbAdapter.getDeal(params),
        hubspotAdapter.getDeal(params).catch(() => ({ success: false, data: { deals: [] }, source: 'hubspot_crm' })),
      ]);

      const dbDeals = dbResult.success && dbResult.data?.deals ? dbResult.data.deals : [];
      const hsDeals = hsResult.success && hsResult.data?.deals ? hsResult.data.deals : [];

      // Merge and dedupe by name (rough dedupe)
      const seenNames = new Set<string>();
      const merged: any[] = [];

      for (const d of dbDeals) {
        const name = d.name?.toLowerCase();
        if (name && !seenNames.has(name)) {
          seenNames.add(name);
          merged.push({ ...d, source: 'local_crm' });
        } else if (!name) {
          merged.push({ ...d, source: 'local_crm' });
        }
      }

      for (const d of hsDeals) {
        const name = d.name?.toLowerCase();
        if (name && !seenNames.has(name)) {
          seenNames.add(name);
          merged.push({ ...d, source: 'hubspot' });
        } else if (!name) {
          merged.push({ ...d, source: 'hubspot' });
        }
      }

      return {
        success: true,
        data: { deals: merged, sources: ['local_crm', 'hubspot'] },
        source: 'composite_crm',
      };
    },

    async updateCRM(params, ctx) {
      // Updates go to local DB only for now
      return dbAdapter.updateCRM(params, ctx);
    },

    // Pipeline methods - delegate to DB adapter (pipeline data is local only)
    async getPipelineSummary(params) {
      return dbAdapter.getPipelineSummary(params);
    },

    async getPipelineDeals(params) {
      return dbAdapter.getPipelineDeals(params);
    },

    async getPipelineForecast(params) {
      return dbAdapter.getPipelineForecast(params);
    },

    async getContactsNeedingAttention(params) {
      return dbAdapter.getContactsNeedingAttention(params);
    },

    async getCompanyStatus(params) {
      return dbAdapter.getCompanyStatus(params);
    },
  };
}

/**
 * AdapterRegistry
 *
 * Returns adapters based on organization's connected integrations.
 * Capability-driven: checks for CRM, Calendar, Email, Transcript, and Messaging providers.
 * Automatically selects the best available provider for each capability.
 */
export class AdapterRegistry {
  constructor(private client: SupabaseClient, private userId: string) {}

  /**
   * Get adapters for an organization with capability metadata
   */
  async forOrg(orgId: string | null): Promise<AdapterBundleWithCapabilities> {
    const capabilities: CapabilityInfo[] = [];

    // 1. CRM Capability
    const dbCrmAdapter = createDbCrmAdapter(this.client, this.userId);
    let crmProvider = 'db';
    let crmFeatures = ['contacts', 'deals'];
    let hubspotCrmAdapter: CRMAdapter | null = null;

    if (orgId) {
      const hasHubSpot = await hasHubSpotIntegration(this.client, orgId);
      if (hasHubSpot) {
        const hubspotClient = await getHubSpotClientForOrg(this.client, orgId);
        if (hubspotClient) {
          hubspotCrmAdapter = createHubSpotCrmAdapter(this.client, orgId, hubspotClient);
          crmProvider = 'hubspot';
          crmFeatures = ['contacts', 'deals', 'companies', 'pipelines', 'webhooks'];
        }
      }
      // TODO: Add Salesforce, Pipedrive checks here when implemented
      // const hasSalesforce = await hasSalesforceIntegration(this.client, orgId);
      // const hasPipedrive = await hasPipedriveIntegration(this.client, orgId);
    }

    capabilities.push({
      capability: 'crm',
      available: true, // DB adapter always available
      provider: crmProvider,
      features: crmFeatures,
    });

    // 2. Calendar Capability - check Google Calendar first, fall back to MeetingBaaS
    let calendarProvider: string | undefined;
    let calendarFeatures: string[] = [];
    let calendarAvailable = false;

    // Check MeetingBaaS calendars (provides calendar read access for bot deployment)
    let meetingBaaSCalendarData: { id: string; platform: string } | null = null;
    if (orgId) {
      const { data } = await this.client
        .from('meetingbaas_calendars')
        .select('id, platform')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      meetingBaaSCalendarData = data;
    }
    const hasMeetingBaaSCalendar = !!meetingBaaSCalendarData;

    if (orgId) {
      // Check Google Calendar direct integration
      const { data: googleData } = await this.client
        .from('google_integrations')
        .select('scopes')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .maybeSingle();

      const hasGoogleCalendar = !!(
        googleData?.scopes &&
        Array.isArray(googleData.scopes) &&
        googleData.scopes.some(
          (s: unknown) =>
            typeof s === 'string' &&
            (s.includes('calendar') || s.includes('https://www.googleapis.com/auth/calendar'))
        )
      );

      if (hasGoogleCalendar) {
        calendarProvider = 'google';
        calendarAvailable = true;
        calendarFeatures = ['events', 'attendees', 'availability', 'free_busy'];
      } else if (hasMeetingBaaSCalendar) {
        calendarProvider = meetingBaaSCalendarData?.platform === 'microsoft' ? 'microsoft' : 'google';
        calendarAvailable = true;
        calendarFeatures = ['events']; // Limited features via MeetingBaaS
      }
    }

    capabilities.push({
      capability: 'calendar',
      available: calendarAvailable,
      provider: calendarProvider,
      features: calendarFeatures,
    });

    // 3. Email Capability
    let emailProvider = 'db';
    let emailFeatures = ['search']; // DB may have stored emails

    if (orgId) {
      const { data: googleData } = await this.client
        .from('google_integrations')
        .select('scopes')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .maybeSingle();

      const hasGmail =
        googleData?.scopes &&
        Array.isArray(googleData.scopes) &&
        googleData.scopes.some(
          (s: unknown) =>
            typeof s === 'string' &&
            (s.includes('gmail') || s.includes('https://www.googleapis.com/auth/gmail'))
        );

      if (hasGmail) {
        emailProvider = 'google';
        emailFeatures = ['search', 'draft', 'send', 'threads'];
      }
      // TODO: Add Outlook/Microsoft 365 check when implemented
    }

    capabilities.push({
      capability: 'email',
      available: true, // DB adapter may have stored emails
      provider: emailProvider,
      features: emailFeatures,
    });

    // 4. Meetings Capability (records: transcripts, recordings, summaries)
    let meetingsProvider: string | undefined;
    let meetingsFeatures: string[] = [];
    let meetingsAvailable = false;

    if (orgId) {
      // Check Fathom
      const { data: fathomData } = await this.client
        .from('fathom_integrations')
        .select('is_connected')
        .eq('org_id', orgId)
        .eq('is_connected', true)
        .maybeSingle();
      const hasFathom = !!fathomData;

      // Check MeetingBaaS (60 Notetaker)
      const { data: meetingBaaSData } = await this.client
        .from('meetingbaas_calendars')
        .select('id')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      const hasMeetingBaaS = !!meetingBaaSData;

      if (hasFathom) {
        meetingsProvider = 'fathom';
        meetingsAvailable = true;
        meetingsFeatures = ['transcripts', 'recordings', 'summaries', 'search'];
      } else if (hasMeetingBaaS) {
        meetingsProvider = 'meetingbaas';
        meetingsAvailable = true;
        meetingsFeatures = ['transcripts', 'recordings', 'summaries'];
      }
    }

    capabilities.push({
      capability: 'meetings',
      available: meetingsAvailable,
      provider: meetingsProvider,
      features: meetingsFeatures,
    });

    // 5. Messaging Capability (Slack)
    let messagingProvider: string | undefined;
    let messagingFeatures: string[] = [];
    let messagingAvailable = false;

    if (orgId) {
      const { data: slackData } = await this.client
        .from('slack_org_settings')
        .select('is_connected')
        .eq('org_id', orgId)
        .eq('is_connected', true)
        .maybeSingle();

      const hasSlack = !!slackData;
      if (hasSlack) {
        messagingProvider = 'slack';
        messagingAvailable = true;
        messagingFeatures = ['channels', 'messages', 'notifications', 'threads'];
      }
      // TODO: Add Microsoft Teams, Discord, etc. when implemented
    }

    capabilities.push({
      capability: 'messaging',
      available: messagingAvailable,
      provider: messagingProvider,
      features: messagingFeatures,
    });

    // 6. Tasks Capability - always available via platform
    capabilities.push({
      capability: 'tasks',
      available: true,
      provider: 'sixty',
      features: ['create', 'update', 'list', 'complete'],
    });

    return {
      crm: createCompositeCrmAdapter(dbCrmAdapter, hubspotCrmAdapter),
      meetings: createDbMeetingAdapter(this.client, this.userId),
      email: createDbEmailAdapter(this.client, this.userId),
      notifications: createDbNotificationAdapter(this.client),
      enrichment: createEnrichmentAdapter(),
      capabilities,
    };
  }

  /**
   * Get just the capability info (lighter weight, no adapter creation)
   */
  async getCapabilities(orgId: string | null): Promise<CapabilityInfo[]> {
    const bundle = await this.forOrg(orgId);
    return bundle.capabilities;
  }
}

