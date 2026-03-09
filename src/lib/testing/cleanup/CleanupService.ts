/**
 * CleanupService - Handles automatic cleanup after test_data mode execution
 *
 * Deletes all resources created during test execution in reverse order
 * to handle dependencies (e.g., delete deals before contacts).
 */

import { supabase } from '@/lib/supabase/clientV2';
import {
  TrackedResource,
  CleanupResult,
  TestableIntegration,
  TestDataModeConfig,
  DEFAULT_TEST_DATA_MODE_CONFIG,
} from '@/lib/types/processMapTesting';
import { ResourceTracker } from '../tracking/ResourceTracker';
import {
  getIntegrationCapability,
  supportsCleanup,
  getReadOnlyIntegrations,
} from '../integrations/IntegrationCapabilities';

/**
 * Cleanup progress callback
 */
export interface CleanupProgressCallback {
  onStart: (totalResources: number) => void;
  onResourceStart: (resource: TrackedResource, index: number, total: number) => void;
  onResourceComplete: (resource: TrackedResource, success: boolean, error?: string) => void;
  onComplete: (result: CleanupResult) => void;
}

/**
 * CleanupService class
 *
 * Handles the cleanup of resources created during test_data mode:
 * - Deletes resources in reverse creation order
 * - Handles per-integration cleanup logic
 * - Tracks success/failure for each resource
 * - Generates manual cleanup instructions for failures
 */
export class CleanupService {
  private resourceTracker: ResourceTracker;
  private config: TestDataModeConfig;
  private progressCallback?: CleanupProgressCallback;
  private orgId?: string;

  constructor(
    resourceTracker: ResourceTracker,
    config: Partial<TestDataModeConfig> = {}
  ) {
    this.resourceTracker = resourceTracker;
    this.config = { ...DEFAULT_TEST_DATA_MODE_CONFIG, ...config };
  }

  /**
   * Set organization ID for cleanup operations
   */
  setOrgId(orgId: string): void {
    this.orgId = orgId;
  }

  /**
   * Set progress callback for UI updates
   */
  setProgressCallback(callback: CleanupProgressCallback): void {
    this.progressCallback = callback;
  }

  /**
   * Clean up all tracked resources
   */
  async cleanupAll(): Promise<CleanupResult> {
    const startTime = Date.now();
    const resources = this.resourceTracker.getResourcesInCleanupOrder();

    this.progressCallback?.onStart(resources.length);

    const result: CleanupResult = {
      success: true,
      totalResources: resources.length,
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      failedResources: [],
      manualCleanupInstructions: [],
      durationMs: 0,
      startedAt: new Date().toISOString(),
      completedAt: '',
    };

    // Mark read-only integrations as not supported
    getReadOnlyIntegrations().forEach(integration => {
      this.resourceTracker.markIntegrationAsNotSupported(integration);
    });

    // Process each resource
    for (let i = 0; i < resources.length; i++) {
      const resource = resources[i];

      this.progressCallback?.onResourceStart(resource, i, resources.length);

      // Skip if already marked as not supported
      if (resource.cleanupStatus === 'not_supported') {
        result.skippedCount++;
        this.progressCallback?.onResourceComplete(resource, true);
        continue;
      }

      // Check if integration supports cleanup
      if (!supportsCleanup(resource.integration)) {
        this.resourceTracker.updateCleanupStatus(resource.id, 'not_supported');
        result.skippedCount++;
        this.progressCallback?.onResourceComplete(resource, true);
        continue;
      }

      // Attempt cleanup
      try {
        const success = await this.cleanupResource(resource);

        if (success) {
          this.resourceTracker.updateCleanupStatus(resource.id, 'success');
          result.successCount++;
          this.progressCallback?.onResourceComplete(resource, true);
        } else {
          this.resourceTracker.updateCleanupStatus(resource.id, 'failed', 'Cleanup returned false');
          result.failedCount++;
          result.failedResources.push({ resource, error: 'Cleanup returned false' });
          result.success = false;
          this.progressCallback?.onResourceComplete(resource, false, 'Cleanup returned false');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.resourceTracker.updateCleanupStatus(resource.id, 'failed', errorMessage);
        result.failedCount++;
        result.failedResources.push({ resource, error: errorMessage });
        result.success = false;
        this.progressCallback?.onResourceComplete(resource, false, errorMessage);

        // Continue or stop based on config
        if (!this.config.continueCleanupOnFailure) {
          break;
        }
      }

      // Small delay between operations to avoid rate limiting
      await this.delay(100);
    }

    // Generate manual cleanup instructions
    result.manualCleanupInstructions = this.resourceTracker.getManualCleanupInstructions();

    result.completedAt = new Date().toISOString();
    result.durationMs = Date.now() - startTime;

    this.progressCallback?.onComplete(result);

    return result;
  }

  /**
   * Clean up a single resource
   */
  private async cleanupResource(resource: TrackedResource): Promise<boolean> {
    const capability = getIntegrationCapability(resource.integration);

    if (!capability.deleteEndpoint) {
      console.warn(`[CleanupService] No delete endpoint for ${resource.integration}`);
      return false;
    }

    // Route to appropriate cleanup method
    switch (resource.integration) {
      case 'hubspot':
        return await this.cleanupHubSpotResource(resource);
      case 'slack':
        return await this.cleanupSlackResource(resource);
      case 'google_calendar':
        return await this.cleanupGoogleCalendarResource(resource);
      case 'savvycal':
        return await this.cleanupSavvyCalResource(resource);
      case 'supabase':
        return await this.cleanupSupabaseResource(resource);
      case 'meetingbaas':
        return await this.cleanupMeetingBaaSResource(resource);
      default:
        console.warn(`[CleanupService] Unknown integration: ${resource.integration}`);
        return false;
    }
  }

  /**
   * Clean up HubSpot resource
   */
  private async cleanupHubSpotResource(resource: TrackedResource): Promise<boolean> {
    if (!resource.externalId) {
      console.warn(`[CleanupService] HubSpot resource missing external ID`);
      return false;
    }

    if (!this.orgId) {
      console.warn(`[CleanupService] HubSpot cleanup requires org_id`);
      return false;
    }

    // Map resource type to delete action
    const deleteActionMap: Record<string, string> = {
      contact: 'delete_contact',
      deal: 'delete_deal',
      task: 'delete_task',
    };

    const action = deleteActionMap[resource.resourceType];
    if (!action) {
      console.warn(`[CleanupService] Unknown HubSpot resource type: ${resource.resourceType}`);
      return false;
    }

    // Get session token for authorization
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      console.warn(`[CleanupService] No active session for HubSpot cleanup`);
      return false;
    }

    console.log(`[CleanupService] Deleting HubSpot ${resource.resourceType}:`, resource.externalId);

    const { data: response, error } = await supabase.functions.invoke('crm-admin-router', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'hubspot_admin',
        sub_action: action,
        org_id: this.orgId,
        record_id: resource.externalId,
      }),
    });

    if (error) {
      console.error(`[CleanupService] HubSpot delete failed:`, error);
      throw new Error(error.message);
    }

    if (!response?.success) {
      console.error(`[CleanupService] HubSpot delete returned error:`, response?.error);
      throw new Error(response?.error || 'Delete failed');
    }

    console.log(`[CleanupService] HubSpot ${resource.resourceType} deleted:`, resource.externalId);
    return true;
  }

  /**
   * Clean up Slack message
   */
  private async cleanupSlackResource(resource: TrackedResource): Promise<boolean> {
    if (!resource.externalId) {
      console.warn(`[CleanupService] Slack resource missing external ID (timestamp)`);
      return false;
    }

    const channel = resource.rawData?.channel as string;
    if (!channel) {
      console.warn(`[CleanupService] Slack resource missing channel`);
      return false;
    }

    const { error } = await supabase.functions.invoke('slack-delete-message', {
      body: {
        channel,
        ts: resource.externalId,
      },
    });

    if (error) {
      console.error(`[CleanupService] Slack delete failed:`, error);
      throw new Error(error.message);
    }

    return true;
  }

  /**
   * Clean up Google Calendar event
   */
  private async cleanupGoogleCalendarResource(resource: TrackedResource): Promise<boolean> {
    if (!resource.externalId) {
      console.warn(`[CleanupService] Google Calendar resource missing external ID`);
      return false;
    }

    const calendarId = (resource.rawData?.calendarId as string) || 'primary';

    const { error } = await supabase.functions.invoke('google-calendar-delete-event', {
      body: {
        calendarId,
        eventId: resource.externalId,
      },
    });

    if (error) {
      console.error(`[CleanupService] Google Calendar delete failed:`, error);
      throw new Error(error.message);
    }

    return true;
  }

  /**
   * Clean up SavvyCal booking
   */
  private async cleanupSavvyCalResource(resource: TrackedResource): Promise<boolean> {
    if (!resource.externalId) {
      console.warn(`[CleanupService] SavvyCal resource missing external ID`);
      return false;
    }

    const { error } = await supabase.functions.invoke('savvycal-cancel-booking', {
      body: {
        bookingId: resource.externalId,
      },
    });

    if (error) {
      console.error(`[CleanupService] SavvyCal cancel failed:`, error);
      throw new Error(error.message);
    }

    return true;
  }

  /**
   * Clean up Supabase database record
   */
  private async cleanupSupabaseResource(resource: TrackedResource): Promise<boolean> {
    if (!resource.externalId) {
      console.warn(`[CleanupService] Supabase resource missing external ID`);
      return false;
    }

    const tableMap: Record<string, string> = {
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

    const tableName = tableMap[resource.resourceType];
    if (!tableName) {
      console.warn(`[CleanupService] Unknown Supabase resource type: ${resource.resourceType}`);
      return false;
    }

    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq('id', resource.externalId);

    if (error) {
      console.error(`[CleanupService] Supabase delete failed:`, error);
      throw new Error(error.message);
    }

    return true;
  }

  /**
   * Clean up MeetingBaaS resource (bot deployment, calendar, recording)
   */
  private async cleanupMeetingBaaSResource(resource: TrackedResource): Promise<boolean> {
    if (!resource.externalId) {
      console.warn(`[CleanupService] MeetingBaaS resource missing external ID`);
      return false;
    }

    // Get session token for authorization
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      console.warn(`[CleanupService] No active session for MeetingBaaS cleanup`);
      return false;
    }

    // Route cleanup based on resource type
    switch (resource.resourceType) {
      case 'meeting': {
        // For bot deployments, call the remove-bot API to stop recording and leave
        console.log(`[CleanupService] Removing MeetingBaaS bot:`, resource.externalId);

        const { data: response, error } = await supabase.functions.invoke('meetingbaas-cleanup', {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'remove_bot',
            bot_id: resource.externalId,
            org_id: this.orgId,
          }),
        });

        if (error) {
          console.error(`[CleanupService] MeetingBaaS bot removal failed:`, error);
          throw new Error(error.message);
        }

        if (!response?.success) {
          console.error(`[CleanupService] MeetingBaaS bot removal returned error:`, response?.error);
          throw new Error(response?.error || 'Bot removal failed');
        }

        console.log(`[CleanupService] MeetingBaaS bot removed:`, resource.externalId);
        return true;
      }

      case 'record': {
        // For recordings, delete from our database (the actual recording may be on S3/external storage)
        console.log(`[CleanupService] Deleting MeetingBaaS recording:`, resource.externalId);

        const { data: response, error } = await supabase.functions.invoke('meetingbaas-cleanup', {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'delete_recording',
            recording_id: resource.externalId,
            org_id: this.orgId,
            // Also delete associated data
            delete_transcript: true,
            delete_from_storage: resource.rawData?.deleteFromStorage !== false,
          }),
        });

        if (error) {
          console.error(`[CleanupService] MeetingBaaS recording deletion failed:`, error);
          throw new Error(error.message);
        }

        if (!response?.success) {
          console.error(`[CleanupService] MeetingBaaS recording deletion returned error:`, response?.error);
          throw new Error(response?.error || 'Recording deletion failed');
        }

        console.log(`[CleanupService] MeetingBaaS recording deleted:`, resource.externalId);
        return true;
      }

      default:
        console.warn(`[CleanupService] Unknown MeetingBaaS resource type: ${resource.resourceType}`);
        return false;
    }
  }

  /**
   * Get cleanup summary
   */
  getSummary(): {
    pending: number;
    success: number;
    failed: number;
    skipped: number;
    notSupported: number;
  } {
    const summary = this.resourceTracker.getSummary();
    return {
      pending: summary.byStatus.pending,
      success: summary.byStatus.success,
      failed: summary.byStatus.failed,
      skipped: summary.byStatus.skipped,
      notSupported: summary.byStatus.not_supported,
    };
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
