import { supabase } from '@/lib/supabase/clientV2';
import logger from '@/lib/utils/logger';

interface SlackMessage {
  text?: string;
  blocks?: any[];
  attachments?: any[];
  channel?: string;
}

interface SlackIntegration {
  id: string;
  team_id: string;
  team_name: string;
  access_token: string;
  bot_user_id: string;
  is_active: boolean;
}

interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  is_member: boolean;
}

class SlackOAuthService {
  /**
   * Initialize Slack OAuth flow
   */
  initiateOAuth(userId: string, orgId?: string): string {
    const clientId = import.meta.env.VITE_SLACK_CLIENT_ID;
    if (!clientId) {
      throw new Error('Slack OAuth is not configured (missing VITE_SLACK_CLIENT_ID)');
    }
    const redirectUri = `${(import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL)}/functions/v1/slack-oauth-callback`;

    // Encode state with user and org information
    const state = btoa(JSON.stringify({
      user_id: userId,
      org_id: orgId,
      timestamp: Date.now()
    }));

    // Required scopes for the bot
    const scopes = [
      'chat:write',
      'chat:write.public', // Post to public channels without joining
      'channels:read',
      'channels:join', // Join public channels
      'channels:manage', // Create/archive deal room channels
      'groups:read',
      'groups:write', // Create private deal room channels
      'im:write', // Send direct messages
      'users:read', // Read user info for mappings
      'users:read.email', // Read user emails for auto-matching
      'reactions:read', // Read reactions (future: task completion)
    ].join(',');

    const oauthUrl = `https://slack.com/oauth/v2/authorize?` +
      `client_id=${clientId}` +
      `&scope=${scopes}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${state}`;

    return oauthUrl;
  }

  /**
   * Check if user has an active Slack integration
   */
  async hasActiveIntegration(userId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('slack_integrations')
        .select('id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single();
      
      // If table doesn't exist (404) or no rows found, return false
      if (error?.code === 'PGRST116' || error?.code === '42P01') {
        return false;
      }
      
      return !error && !!data;
    } catch (err) {
      return false;
    }
  }

  /**
   * Get user's Slack integrations
   */
  async getIntegrations(userId: string): Promise<SlackIntegration[]> {
    try {
      const { data, error } = await supabase
        .from('slack_integrations')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true);
      
      // If table doesn't exist, return empty array
      if (error?.code === 'PGRST116' || error?.code === '42P01') {
        return [];
      }
      
      if (error) {
        logger.error('Failed to get Slack integrations:', error);
        return [];
      }
      
      return data || [];
    } catch (err) {
      return [];
    }
  }

  /**
   * Get available channels for an integration
   */
  async getChannels(userId: string, teamId?: string): Promise<SlackChannel[]> {
    // First get the integration
    const query = supabase
      .from('slack_integrations')
      .select('id, team_id')
      .eq('user_id', userId)
      .eq('is_active', true);
    
    if (teamId) {
      query.eq('team_id', teamId);
    }
    
    const { data: integration, error: integrationError } = await query.single();
    
    if (integrationError || !integration) {
      logger.error('No active Slack integration found');
      return [];
    }
    
    // Get cached channels
    const { data: channels, error: channelsError } = await supabase
      .from('slack_channels')
      .select('channel_id, channel_name, is_private, is_member')
      .eq('integration_id', integration.id)
      .eq('is_archived', false)
      .order('channel_name');
    
    if (channelsError) {
      logger.error('Failed to get Slack channels:', channelsError);
      return [];
    }
    
    return channels.map(ch => ({
      id: ch.channel_id,
      name: ch.channel_name,
      is_private: ch.is_private,
      is_member: ch.is_member,
    }));
  }

  /**
   * Refresh channels from Slack API via edge function
   */
  async refreshChannels(userId: string, teamId?: string): Promise<SlackChannel[]> {
    // Get the user's session for authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No active session');
    }

    // Call edge function to refresh channels (handles Slack API call server-side)
    const response = await fetch(
      `${(import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL)}/functions/v1/slack-ops-router`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: 'refresh_user_channels', teamId }),
      }
    );

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Failed to refresh channels');
    }

    return result.channels || [];
  }

  /**
   * Send a message to Slack using OAuth token
   */
  async sendMessage(
    userId: string, 
    channel: string, 
    message: SlackMessage,
    teamId?: string
  ): Promise<boolean> {
    try {
      logger.log('📤 Sending Slack message via OAuth');
      
      // Get the user's session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      // Prepare the message payload
      let messagePayload: any = {
        channel,
        team_id: teamId,
      };

      // Handle different message types
      if (message.blocks) {
        // If blocks are provided, use them (can be string or object)
        if (typeof message.blocks === 'string') {
          try {
            messagePayload.blocks = JSON.parse(message.blocks);
          } catch (e) {
            throw new Error('Invalid JSON in blocks field');
          }
        } else {
          messagePayload.blocks = message.blocks;
        }
        // Include fallback text for blocks
        messagePayload.message = message.text || 'New notification from Sixty Sales';
      } else if (message.attachments) {
        // Legacy attachments format
        messagePayload.message = message.text || 'New notification from Sixty Sales';
        messagePayload.attachments = message.attachments;
      } else {
        // Simple text message
        messagePayload.message = message.text || 'New notification from Sixty Sales';
      }
      
      // Call our Edge Function to send the message
      const response = await fetch(
        `${(import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL)}/functions/v1/send-router`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action: 'slack_message', ...messagePayload }),
        }
      );
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to send message');
      }
      
      logger.log('✅ Slack message sent successfully');
      return true;
    } catch (error) {
      logger.error('❌ Failed to send Slack message:', error);
      throw error;
    }
  }

  /**
   * Disconnect Slack integration
   */
  async disconnect(userId: string, teamId: string): Promise<void> {
    const { error } = await supabase
      .from('slack_integrations')
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('team_id', teamId);
    
    if (error) {
      throw new Error('Failed to disconnect Slack integration');
    }
  }

  /**
   * Format a deal notification for Slack
   */
  formatDealNotification(deal: any, eventType: string): SlackMessage {
    const baseUrl = window.location.origin;
    const dealUrl = `${baseUrl}/crm/pipeline?deal=${deal.id}`;
    
    let title = '';
    let color = '#36a64f';
    
    switch (eventType) {
      case 'deal_created':
        title = '🎉 New Deal Created';
        color = '#36a64f';
        break;
      case 'deal_won':
        title = '🏆 Deal Won!';
        color = '#FFD700';
        break;
      case 'deal_lost':
        title = '❌ Deal Lost';
        color = '#ff0000';
        break;
      case 'stage_changed':
        title = '📊 Deal Stage Changed';
        color = '#439FE0';
        break;
      default:
        title = '📢 Deal Notification';
    }
    
    return {
      text: title,
      attachments: [{
        color,
        fields: [
          {
            title: 'Deal',
            value: deal.name || 'Unnamed Deal',
            short: true,
          },
          {
            title: 'Company',
            value: deal.company || 'N/A',
            short: true,
          },
          {
            title: 'Value',
            value: deal.value ? `£${deal.value.toLocaleString()}` : 'N/A',
            short: true,
          },
          {
            title: 'Stage',
            value: deal.stage?.name || deal.stage_name || 'Unknown',
            short: true,
          },
        ],
        actions: [{
          type: 'button',
          text: 'View Deal',
          url: dealUrl,
          style: 'primary',
        }],
        footer: 'Sixty Sales',
        footer_icon: 'https://sixty.app/favicon.ico',
        ts: Math.floor(Date.now() / 1000),
      }],
    };
  }

  /**
   * Test Slack connection
   */
  async testConnection(userId: string, teamId?: string): Promise<boolean> {
    try {
      const testMessage: SlackMessage = {
        text: '✅ Sixty Sales OAuth integration test successful!',
        attachments: [{
          color: '#36a64f',
          text: 'Your Slack OAuth integration is properly configured and ready to receive notifications.',
          footer: 'Sixty Sales',
          footer_icon: 'https://sixty.app/favicon.ico',
          ts: Math.floor(Date.now() / 1000),
        }],
      };
      
      // Try to send to #general by default
      return await this.sendMessage(userId, 'general', testMessage, teamId);
    } catch (error) {
      logger.error('❌ Slack connection test failed:', error);
      return false;
    }
  }
}

export const slackOAuthService = new SlackOAuthService();
export type { SlackMessage, SlackIntegration, SlackChannel };