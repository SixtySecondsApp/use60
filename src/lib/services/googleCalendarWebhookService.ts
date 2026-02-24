import { supabase } from '@/lib/supabase/clientV2';
import logger from '@/lib/utils/logger';

/**
 * Google Calendar Webhook Service
 *
 * Manages Google Calendar push notification (webhook) subscriptions.
 * Allows real-time calendar sync instead of polling.
 *
 * @see https://developers.google.com/calendar/api/guides/push
 */

interface WebhookChannel {
  id: string;
  channel_id: string;
  resource_id: string;
  expiration_time: string;
  is_active: boolean;
}

class GoogleCalendarWebhookService {
  /**
   * Subscribe to push notifications for a calendar
   *
   * This creates a webhook channel with Google Calendar API.
   * Google will send notifications to our endpoint when events change.
   *
   * @param calendarId - Google Calendar ID (default: 'primary')
   * @returns Channel details if successful
   */
  async subscribe(calendarId: string = 'primary'): Promise<WebhookChannel | null> {
    try {
      // Get current user
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        throw new Error('User not authenticated');
      }

      // Get user's organization
      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', userData.user.id)
        .maybeSingle();

      if (!membership?.org_id) {
        logger.warn('No organization found for user, skipping webhook subscription');
        return null;
      }

      // Generate unique channel ID
      const channelId = `calendar-${userData.user.id}-${Date.now()}`;

      // Get webhook URL
      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL);
      const webhookUrl = `${supabaseUrl}/functions/v1/google-calendar-webhook`;

      // Call edge function to create the channel with Google
      const { data, error } = await supabase.functions.invoke('google-calendar', {
        body: {
          action: 'watch',
          calendarId,
          channelId,
          webhookUrl,
        },
      });

      if (error) {
        logger.error('Failed to create webhook channel:', error);
        throw error;
      }

      if (!data?.success || !data?.resourceId) {
        throw new Error('Failed to create webhook channel with Google');
      }

      // Store channel in database
      // Google returns expiration as string of milliseconds since epoch
      const expirationTime = new Date(parseInt(data.expiration)).toISOString();

      const { data: channel, error: dbError } = await supabase
        .from('google_calendar_channels')
        .insert({
          user_id: userData.user.id,
          org_id: membership.org_id,
          channel_id: channelId,
          resource_id: data.resourceId,
          calendar_id: calendarId,
          webhook_url: webhookUrl,
          expiration_time: expirationTime,
          is_active: true,
          channel_token: data.channelToken || null,
        })
        .select()
        .single();

      if (dbError) {
        logger.error('Failed to save channel to database:', dbError);
        // Try to stop the channel with Google
        await this.unsubscribe(channelId, data.resourceId);
        throw dbError;
      }

      logger.log('Successfully subscribed to calendar push notifications:', {
        channelId,
        expiresAt: expirationTime,
      });

      return channel;
    } catch (error) {
      logger.error('Error subscribing to calendar webhooks:', error);
      return null;
    }
  }

  /**
   * Unsubscribe from push notifications
   *
   * Stops a webhook channel with Google and marks it inactive in database.
   *
   * @param channelId - Our channel identifier
   * @param resourceId - Google's resource identifier
   */
  async unsubscribe(channelId: string, resourceId: string): Promise<boolean> {
    try {
      // Call edge function to stop the channel with Google
      const { error } = await supabase.functions.invoke('google-calendar', {
        body: {
          action: 'stop',
          channelId,
          resourceId,
        },
      });

      if (error) {
        logger.error('Failed to stop webhook channel with Google:', error);
      }

      // Mark channel as inactive in database
      const { error: dbError } = await supabase
        .from('google_calendar_channels')
        .update({ is_active: false })
        .eq('channel_id', channelId);

      if (dbError) {
        logger.error('Failed to update channel status:', dbError);
        return false;
      }

      logger.log('Successfully unsubscribed from calendar notifications:', channelId);
      return true;
    } catch (error) {
      logger.error('Error unsubscribing from calendar webhooks:', error);
      return false;
    }
  }

  /**
   * Get active webhook channels for current user
   */
  async getActiveChannels(): Promise<WebhookChannel[]> {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        return [];
      }

      const { data, error } = await supabase
        .from('google_calendar_channels')
        .select('*')
        .eq('user_id', userData.user.id)
        .eq('is_active', true)
        .gt('expiration_time', new Date().toISOString());

      if (error) {
        logger.error('Failed to fetch active channels:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      logger.error('Error fetching active channels:', error);
      return [];
    }
  }

  /**
   * Renew an expiring webhook channel
   *
   * Google Calendar webhooks expire after 7 days.
   * This creates a new channel and deactivates the old one.
   *
   * @param channelId - Channel to renew
   */
  async renewChannel(channelId: string): Promise<WebhookChannel | null> {
    try {
      // Get existing channel
      const { data: existingChannel } = await supabase
        .from('google_calendar_channels')
        .select('*')
        .eq('channel_id', channelId)
        .single();

      if (!existingChannel) {
        logger.error('Channel not found:', channelId);
        return null;
      }

      // Unsubscribe from old channel
      await this.unsubscribe(existingChannel.channel_id, existingChannel.resource_id);

      // Create new subscription
      return await this.subscribe(existingChannel.calendar_id);
    } catch (error) {
      logger.error('Error renewing channel:', error);
      return null;
    }
  }

  /**
   * Check if user has active webhook subscription
   */
  async hasActiveSubscription(): Promise<boolean> {
    const channels = await this.getActiveChannels();
    return channels.length > 0;
  }
}

// Export singleton instance
export const googleCalendarWebhookService = new GoogleCalendarWebhookService();
