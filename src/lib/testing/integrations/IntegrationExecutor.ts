/**
 * IntegrationExecutor - Executes real API calls for test_data mode
 *
 * This class handles the actual execution of integration operations,
 * calling edge functions and tracking the resources created.
 */

import { supabase } from '@/lib/supabase/clientV2';
import {
  TestableIntegration,
  ResourceType,
  TrackedResource,
} from '@/lib/types/processMapTesting';
import {
  INTEGRATION_CAPABILITIES,
  getIntegrationCapability,
  buildViewUrl,
} from './IntegrationCapabilities';
import { ResourceTracker, AddResourceOptions } from '../tracking/ResourceTracker';

/**
 * Operation type for integration calls
 */
export type IntegrationOperation = 'create' | 'read' | 'update' | 'delete';

/**
 * Raw operation that might come from workflow steps
 * Some workflows use 'write' instead of 'create'
 */
export type RawIntegrationOperation = IntegrationOperation | 'write';

/**
 * Context for step execution
 */
export interface StepExecutionContext {
  stepId: string;
  stepName: string;
  runId: string;
  orgId: string;
}

/**
 * Result of an integration execution
 */
export interface IntegrationExecutionResult {
  success: boolean;
  data?: Record<string, unknown>;
  resource?: TrackedResource;
  error?: string;
  errorDetails?: Record<string, unknown>;
}

/**
 * Options for creating a resource
 */
export interface CreateResourceOptions {
  integration: TestableIntegration;
  resourceType: ResourceType;
  data: Record<string, unknown>;
  stepContext: StepExecutionContext;
}

/**
 * Integration-specific context for URL building
 */
export interface IntegrationContext {
  // Organization
  orgId?: string;
  // HubSpot
  hubspotPortalId?: string;
  hubspotRegion?: 'eu1' | 'na1' | string; // eu1 for EU, na1 for US (defaults to eu1)
  // Slack
  slackWorkspace?: string;
  slackChannel?: string;
  // Google
  googleCalendarId?: string;
}

/**
 * IntegrationExecutor class
 *
 * Executes integration operations and tracks created resources:
 * - Makes real API calls via edge functions
 * - Extracts external IDs from responses
 * - Builds view URLs for 3rd party apps
 * - Returns TrackedResource objects for tracking
 */
export class IntegrationExecutor {
  private resourceTracker: ResourceTracker;
  private integrationContext: IntegrationContext = {};

  constructor(resourceTracker: ResourceTracker) {
    this.resourceTracker = resourceTracker;
  }

  /**
   * Set integration context (portal IDs, workspace names, etc.)
   */
  setIntegrationContext(context: IntegrationContext): void {
    this.integrationContext = { ...this.integrationContext, ...context };
  }

  /**
   * Normalize operation names (e.g., 'write' -> 'create')
   */
  private normalizeOperation(operation: RawIntegrationOperation): IntegrationOperation {
    // 'write' is an alias for 'create'
    if (operation === 'write') {
      return 'create';
    }
    return operation;
  }

  /**
   * Execute an integration operation
   */
  async execute(
    integration: TestableIntegration,
    operation: RawIntegrationOperation,
    resourceType: ResourceType,
    data: Record<string, unknown>,
    stepContext: StepExecutionContext
  ): Promise<IntegrationExecutionResult> {
    // Normalize operation (e.g., 'write' -> 'create')
    const normalizedOperation = this.normalizeOperation(operation);
    const capability = getIntegrationCapability(integration);

    // Validate operation is supported
    if (!this.isOperationSupported(integration, normalizedOperation)) {
      return {
        success: false,
        error: `Operation "${operation}" not supported for ${capability.displayName}`,
      };
    }

    try {
      // Route to appropriate handler based on integration
      switch (integration) {
        case 'hubspot':
          return await this.executeHubSpot(normalizedOperation, resourceType, data, stepContext);
        case 'slack':
          return await this.executeSlack(normalizedOperation, resourceType, data, stepContext);
        case 'google_calendar':
          return await this.executeGoogleCalendar(normalizedOperation, resourceType, data, stepContext);
        case 'google_email':
          return await this.executeGoogleEmail(normalizedOperation, resourceType, data, stepContext);
        case 'savvycal':
          return await this.executeSavvyCal(normalizedOperation, resourceType, data, stepContext);
        case 'supabase':
          return await this.executeSupabase(normalizedOperation, resourceType, data, stepContext);
        case 'fathom':
        case 'justcall':
          // Read-only integrations
          if (normalizedOperation === 'read') {
            return await this.executeReadOnly(integration, resourceType, data, stepContext);
          }
          return {
            success: false,
            error: `${capability.displayName} is read-only`,
          };
        default:
          return {
            success: false,
            error: `Unknown integration: ${integration}`,
          };
      }
    } catch (error) {
      console.error(`[IntegrationExecutor] Error executing ${integration} ${normalizedOperation}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorDetails: { originalError: error },
      };
    }
  }

  /**
   * Check if an operation is supported for an integration
   */
  private isOperationSupported(
    integration: TestableIntegration,
    operation: IntegrationOperation
  ): boolean {
    const capability = INTEGRATION_CAPABILITIES[integration];
    switch (operation) {
      case 'create':
        return capability.supportsCreate;
      case 'read':
        return capability.supportsRead;
      case 'update':
        return capability.supportsUpdate;
      case 'delete':
        return capability.supportsDelete;
      default:
        return false;
    }
  }

  /**
   * Execute HubSpot operations via hubspot-admin edge function
   */
  private async executeHubSpot(
    operation: IntegrationOperation,
    resourceType: ResourceType,
    data: Record<string, unknown>,
    stepContext: StepExecutionContext
  ): Promise<IntegrationExecutionResult> {
    // Map operation + resourceType to hubspot-admin action
    const action = this.getHubSpotAction(operation, resourceType);

    // Get org_id from integration context or data
    const orgId = this.integrationContext.orgId || data.org_id;
    if (!orgId) {
      return { success: false, error: 'org_id is required for HubSpot operations' };
    }

    // Build request body based on operation
    const body: Record<string, unknown> = {
      action: 'hubspot_admin',
      sub_action: action,
      org_id: orgId,
    };

    if (operation === 'create') {
      // For create operations, pass properties
      body.properties = data.properties || this.buildHubSpotProperties(resourceType, data);

      // For tasks and activities, pass contact_id and/or deal_id for association
      // These come from dependencies (previously created contact/deal in the workflow)
      if (resourceType === 'task' || resourceType === 'activity') {
        // Look for contact external ID from dependencies or direct data
        const contactId = data.contact_id || data.contactId ||
          data.contact_external_id || data.contactExternalId ||
          (data.contact as Record<string, unknown>)?.externalId ||
          (data.contact as Record<string, unknown>)?.id;
        if (contactId) {
          body.contact_id = contactId;
          console.log('[IntegrationExecutor] Task will be associated with contact:', contactId);
        }

        // Look for deal external ID from dependencies or direct data
        const dealId = data.deal_id || data.dealId ||
          data.deal_external_id || data.dealExternalId ||
          (data.deal as Record<string, unknown>)?.externalId ||
          (data.deal as Record<string, unknown>)?.id;
        if (dealId) {
          body.deal_id = dealId;
          console.log('[IntegrationExecutor] Task will be associated with deal:', dealId);
        }
      }
    } else if (operation === 'update') {
      // For update operations, pass record_id and properties
      body.record_id = data.record_id || data.externalId || data.id;
      body.properties = data.properties || this.buildHubSpotProperties(resourceType, data);
    } else if (operation === 'delete') {
      // For delete operations, pass record_id
      body.record_id = data.record_id || data.externalId || data.id;
    } else if (operation === 'read') {
      // For read operations, pass record_id if specified
      if (data.record_id || data.id) {
        body.record_id = data.record_id || data.id;
      }
    }

    console.log('[IntegrationExecutor] Calling crm-admin-router (hubspot_admin) with:', { action, org_id: orgId });

    // Get session token for authorization
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      return { success: false, error: 'No active session' };
    }

    const { data: response, error } = await supabase.functions.invoke('crm-admin-router', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (error) {
      console.error('[IntegrationExecutor] HubSpot error:', error);
      return { success: false, error: error.message };
    }

    if (!response?.success) {
      console.error('[IntegrationExecutor] HubSpot returned error:', response?.error);
      return { success: false, error: response?.error || 'HubSpot operation failed' };
    }

    // Track created resources
    if (operation === 'create' && response?.id) {
      let viewUrl: string | null;

      // For tasks and activities associated with a contact, link to the contact record
      // where they will appear on the timeline (better UX than direct object URLs)
      if ((resourceType === 'task' || resourceType === 'activity') && response.associations?.contact) {
        viewUrl = buildViewUrl('hubspot', 'contact', response.associations.contact, {
          portalId: this.integrationContext.hubspotPortalId,
          hubspotRegion: this.integrationContext.hubspotRegion,
        });
        console.log(`[IntegrationExecutor] ${resourceType} linked to contact record:`, viewUrl);
      } else {
        viewUrl = buildViewUrl('hubspot', resourceType, response.id, {
          portalId: this.integrationContext.hubspotPortalId,
          hubspotRegion: this.integrationContext.hubspotRegion,
        });
      }

      const resource = this.resourceTracker.addResource({
        integration: 'hubspot',
        resourceType,
        displayName: this.extractDisplayName(response, resourceType),
        externalId: response.id,
        viewUrl,
        createdByStepId: stepContext.stepId,
        createdByStepName: stepContext.stepName,
        rawData: response,
      });

      return { success: true, data: response, resource };
    }

    return { success: true, data: response };
  }

  /**
   * Get HubSpot admin action for operation + resource type
   */
  private getHubSpotAction(operation: IntegrationOperation, resourceType: ResourceType): string {
    const actionMap: Record<string, string> = {
      'create-contact': 'create_contact',
      'create-deal': 'create_deal',
      'create-task': 'create_task',
      'create-activity': 'create_activity',
      'update-contact': 'update_contact',
      'update-deal': 'update_deal',
      'update-task': 'update_task',
      'delete-contact': 'delete_contact',
      'delete-deal': 'delete_deal',
      'delete-task': 'delete_task',
      'read-status': 'status',
      'read-properties': 'get_properties',
      'read-pipelines': 'get_pipelines',
    };

    const key = `${operation}-${resourceType}`;
    if (actionMap[key]) {
      return actionMap[key];
    }

    // For read operations on unknown types (like OAuth steps), use 'status' to verify connection
    if (operation === 'read') {
      return 'status';
    }

    // Fallback for other operations
    return `${operation}_${resourceType}`;
  }

  /**
   * Build HubSpot properties object from data
   */
  private buildHubSpotProperties(
    resourceType: ResourceType,
    data: Record<string, unknown>
  ): Record<string, unknown> {
    if (resourceType === 'contact') {
      return {
        email: data.email || `test-${Date.now()}@60test.com`,
        firstname: data.firstname || data.firstName || 'Test',
        lastname: data.lastname || data.lastName || 'Contact',
        phone: data.phone,
        company: data.company,
        ...(data.properties as Record<string, unknown> || {}),
      };
    }
    if (resourceType === 'deal') {
      return {
        dealname: data.dealname || data.name || `Test Deal ${Date.now()}`,
        amount: data.amount,
        pipeline: data.pipeline || 'default',
        dealstage: data.dealstage || data.stage,
        closedate: data.closedate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        ...(data.properties as Record<string, unknown> || {}),
      };
    }
    if (resourceType === 'task') {
      return {
        hs_task_subject: data.hs_task_subject || data.subject || data.title || data.name || `Test Task ${Date.now()}`,
        hs_task_body: data.hs_task_body || data.body || data.description || '',
        hs_task_status: data.hs_task_status || data.status || 'NOT_STARTED',
        hs_task_priority: data.hs_task_priority || data.priority || 'NONE',
        hs_timestamp: data.hs_timestamp || data.dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        ...(data.properties as Record<string, unknown> || {}),
      };
    }
    if (resourceType === 'activity') {
      return {
        hs_note_body: data.hs_note_body || data.body || data.content || data.message || data.note || `Activity logged at ${new Date().toISOString()}`,
        hs_timestamp: data.hs_timestamp || new Date().toISOString(),
        ...(data.properties as Record<string, unknown> || {}),
      };
    }
    return data.properties as Record<string, unknown> || {};
  }

  /**
   * Execute Slack operations
   */
  private async executeSlack(
    operation: IntegrationOperation,
    resourceType: ResourceType,
    data: Record<string, unknown>,
    stepContext: StepExecutionContext
  ): Promise<IntegrationExecutionResult> {
    const { data: response, error } = await supabase.functions.invoke('slack-send-message', {
      body: { ...data, operation },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (operation === 'create' && response?.ts) {
      const viewUrl = buildViewUrl('slack', resourceType, response.ts, {
        workspace: this.integrationContext.slackWorkspace,
        channel: response.channel || data.channel as string,
        timestamp: response.ts,
      });

      const resource = this.resourceTracker.addResource({
        integration: 'slack',
        resourceType: 'message',
        displayName: `Slack message in #${response.channel || 'unknown'}`,
        externalId: response.ts,
        viewUrl,
        createdByStepId: stepContext.stepId,
        createdByStepName: stepContext.stepName,
        rawData: response,
      });

      return { success: true, data: response, resource };
    }

    return { success: true, data: response };
  }

  /**
   * Execute Google Calendar operations
   */
  private async executeGoogleCalendar(
    operation: IntegrationOperation,
    resourceType: ResourceType,
    data: Record<string, unknown>,
    stepContext: StepExecutionContext
  ): Promise<IntegrationExecutionResult> {
    const { data: response, error } = await supabase.functions.invoke('google-calendar-create-event', {
      body: { ...data, operation },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (operation === 'create' && response?.id) {
      // Create encoded ID for Google Calendar URL
      const encodedId = response.htmlLink
        ? response.htmlLink.split('eid=')[1]
        : btoa(`${response.id} ${this.integrationContext.googleCalendarId || 'primary'}`);

      const viewUrl = buildViewUrl('google_calendar', resourceType, response.id, {
        encodedId,
      });

      const resource = this.resourceTracker.addResource({
        integration: 'google_calendar',
        resourceType: 'calendar_event',
        displayName: response.summary || 'Calendar Event',
        externalId: response.id,
        viewUrl: response.htmlLink || viewUrl,
        createdByStepId: stepContext.stepId,
        createdByStepName: stepContext.stepName,
        rawData: response,
      });

      return { success: true, data: response, resource };
    }

    return { success: true, data: response };
  }

  /**
   * Execute Google Email operations
   */
  private async executeGoogleEmail(
    operation: IntegrationOperation,
    resourceType: ResourceType,
    data: Record<string, unknown>,
    stepContext: StepExecutionContext
  ): Promise<IntegrationExecutionResult> {
    const { data: response, error } = await supabase.functions.invoke('google-send-email', {
      body: data,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (operation === 'create' && response?.id) {
      const viewUrl = buildViewUrl('google_email', resourceType, response.id, {
        messageId: response.id,
      });

      const resource = this.resourceTracker.addResource({
        integration: 'google_email',
        resourceType: 'email',
        displayName: `Email to ${data.to || 'recipient'}`,
        externalId: response.id,
        viewUrl,
        createdByStepId: stepContext.stepId,
        createdByStepName: stepContext.stepName,
        rawData: response,
      });

      return { success: true, data: response, resource };
    }

    return { success: true, data: response };
  }

  /**
   * Execute SavvyCal operations
   */
  private async executeSavvyCal(
    operation: IntegrationOperation,
    resourceType: ResourceType,
    data: Record<string, unknown>,
    stepContext: StepExecutionContext
  ): Promise<IntegrationExecutionResult> {
    const { data: response, error } = await supabase.functions.invoke('savvycal-create-booking', {
      body: { ...data, operation },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (operation === 'create' && response?.id) {
      const viewUrl = buildViewUrl('savvycal', resourceType, response.id);

      const resource = this.resourceTracker.addResource({
        integration: 'savvycal',
        resourceType: 'booking',
        displayName: response.title || 'SavvyCal Booking',
        externalId: response.id,
        viewUrl,
        createdByStepId: stepContext.stepId,
        createdByStepName: stepContext.stepName,
        rawData: response,
      });

      return { success: true, data: response, resource };
    }

    return { success: true, data: response };
  }

  /**
   * Execute Supabase (internal database) operations
   */
  private async executeSupabase(
    operation: IntegrationOperation,
    resourceType: ResourceType,
    data: Record<string, unknown>,
    stepContext: StepExecutionContext
  ): Promise<IntegrationExecutionResult> {
    const tableName = this.getSupabaseTable(resourceType);

    if (operation === 'create') {
      const { data: response, error } = await supabase
        .from(tableName)
        .insert(data)
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      const resource = this.resourceTracker.addResource({
        integration: 'supabase',
        resourceType,
        displayName: this.extractDisplayName(response, resourceType),
        externalId: response.id,
        viewUrl: null, // Internal database
        createdByStepId: stepContext.stepId,
        createdByStepName: stepContext.stepName,
        rawData: response,
      });

      return { success: true, data: response, resource };
    }

    if (operation === 'read') {
      const { data: response, error } = await supabase
        .from(tableName)
        .select('*')
        .match(data as Record<string, string>);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: { records: response } };
    }

    return { success: false, error: `Supabase ${operation} not implemented` };
  }

  /**
   * Execute read-only integration operations (Fathom, JustCall)
   */
  private async executeReadOnly(
    integration: TestableIntegration,
    resourceType: ResourceType,
    data: Record<string, unknown>,
    stepContext: StepExecutionContext
  ): Promise<IntegrationExecutionResult> {
    const endpoint = integration === 'fathom' ? 'fathom-get-calls' : 'justcall-get-calls';

    const { data: response, error } = await supabase.functions.invoke(endpoint, {
      body: data,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    // For read operations, we might still want to track what was accessed
    // but these won't need cleanup
    return { success: true, data: response };
  }

  /**
   * Get HubSpot edge function endpoint based on operation and resource type
   */
  private getHubSpotEndpoint(operation: IntegrationOperation, resourceType: ResourceType): string {
    const endpoints: Record<string, string> = {
      'create-contact': 'hubspot-create-contact',
      'create-deal': 'hubspot-create-deal',
      'create-task': 'hubspot-create-task',
      'read-contact': 'hubspot-get-contact',
      'read-deal': 'hubspot-get-deal',
      default: 'hubspot-api',
    };

    return endpoints[`${operation}-${resourceType}`] || endpoints.default;
  }

  /**
   * Get Supabase table name for a resource type
   */
  private getSupabaseTable(resourceType: ResourceType): string {
    const tables: Record<ResourceType, string> = {
      contact: 'contacts',
      deal: 'deals',
      task: 'tasks',
      activity: 'activities',
      meeting: 'meetings',
      calendar_event: 'calendar_events',
      email: 'emails',
      message: 'messages',
      call: 'calls',
      booking: 'bookings',
      record: 'records',
    };
    return tables[resourceType];
  }

  /**
   * Extract a display name from response data
   */
  private extractDisplayName(data: Record<string, unknown>, resourceType: ResourceType): string {
    // Try common name fields
    const nameFields = ['name', 'title', 'subject', 'summary', 'firstName', 'email'];

    for (const field of nameFields) {
      if (data[field] && typeof data[field] === 'string') {
        return data[field] as string;
      }
    }

    // Combine first and last name for contacts
    if (data.firstName || data.lastName) {
      return `${data.firstName || ''} ${data.lastName || ''}`.trim();
    }

    // Fallback
    return `${resourceType} ${data.id || 'unknown'}`;
  }

  /**
   * Get the resource tracker
   */
  getResourceTracker(): ResourceTracker {
    return this.resourceTracker;
  }
}
