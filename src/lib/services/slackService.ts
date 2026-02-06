import logger from '@/lib/utils/logger';

interface SlackMessage {
  text?: string;
  blocks?: any[];
  attachments?: any[];
  channel?: string;
  username?: string;
  icon_emoji?: string;
  icon_url?: string;
}

interface SlackNotificationConfig {
  webhook_url?: string;
  channel?: string;
  username?: string;
  icon_emoji?: string;
  message_template?: string;
  include_deal_link?: boolean;
  include_owner?: boolean;
  mention_users?: string[];
  color?: string;
}

class SlackService {
  /**
   * Send a message to Slack via webhook
   */
  async sendWebhookMessage(webhookUrl: string, message: SlackMessage): Promise<boolean> {
    try {
      logger.log('📤 Sending Slack message via webhook');
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('❌ Slack webhook error:', errorText);
        throw new Error(`Slack webhook failed: ${response.status}`);
      }

      logger.log('✅ Slack message sent successfully');
      return true;
    } catch (error) {
      logger.error('❌ Failed to send Slack message:', error);
      throw error;
    }
  }

  /**
   * Format a deal notification for Slack
   */
  formatDealNotification(deal: any, config: SlackNotificationConfig, eventType: string): SlackMessage {
    const baseUrl = window.location.origin;
    const dealUrl = `${baseUrl}/crm/pipeline?deal=${deal.id}`;
    
    // Build the message based on event type
    let title = '';
    let color = config.color || '#36a64f'; // Default green
    
    switch (eventType) {
      case 'deal_created':
        title = '🎉 New Deal Created';
        color = '#36a64f'; // Green
        break;
      case 'deal_won':
        title = '🏆 Deal Won!';
        color = '#FFD700'; // Gold
        break;
      case 'deal_lost':
        title = '❌ Deal Lost';
        color = '#ff0000'; // Red
        break;
      case 'stage_changed':
        title = '📊 Deal Stage Changed';
        color = '#439FE0'; // Blue
        break;
      case 'high_value':
        title = '💰 High-Value Deal Alert';
        color = '#9333ea'; // Purple
        break;
      case 'stale_deal':
        title = '⏰ Stale Deal Alert';
        color = '#ff9800'; // Orange
        break;
      default:
        title = '📢 Deal Notification';
    }

    // Build mentions string
    const mentions = config.mention_users?.map(user => `<@${user}>`).join(' ') || '';
    
    // Build the Slack message with rich formatting
    const message: SlackMessage = {
      username: config.username || 'Sixty Sales Bot',
      icon_emoji: config.icon_emoji || ':chart_with_upwards_trend:',
      text: `${title} ${mentions}`.trim(),
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
        footer: 'Sixty Sales',
        footer_icon: 'https://sixty.app/favicon.ico',
        ts: Math.floor(Date.now() / 1000),
      }],
    };

    // Add owner information if configured
    if (config.include_owner && deal.owner) {
      message.attachments![0].fields!.push({
        title: 'Owner',
        value: deal.owner.name || deal.owner.email || 'Unknown',
        short: true,
      });
    }

    // Add deal link if configured
    if (config.include_deal_link) {
      message.attachments![0].actions = [{
        type: 'button',
        text: 'View Deal',
        url: dealUrl,
        style: 'primary',
      }];
    }

    // Override channel if specified
    if (config.channel) {
      message.channel = config.channel;
    }

    // Use custom message template if provided
    if (config.message_template) {
      const customText = config.message_template
        .replace('{{deal_name}}', deal.name || 'Unnamed Deal')
        .replace('{{company}}', deal.company || 'N/A')
        .replace('{{value}}', deal.value ? `£${deal.value.toLocaleString()}` : 'N/A')
        .replace('{{stage}}', deal.stage?.name || deal.stage_name || 'Unknown')
        .replace('{{owner}}', deal.owner?.name || deal.owner?.email || 'Unknown');
      
      message.text = `${customText} ${mentions}`.trim();
    }

    return message;
  }

  /**
   * Format a task notification for Slack
   */
  formatTaskNotification(task: any, config: SlackNotificationConfig): SlackMessage {
    const mentions = config.mention_users?.map(user => `<@${user}>`).join(' ') || '';
    
    return {
      username: config.username || 'Sixty Sales Bot',
      icon_emoji: config.icon_emoji || ':clipboard:',
      text: `📋 New Task Created ${mentions}`.trim(),
      attachments: [{
        color: config.color || '#439FE0',
        fields: [
          {
            title: 'Task',
            value: task.title || 'Unnamed Task',
            short: false,
          },
          {
            title: 'Description',
            value: task.description || 'No description',
            short: false,
          },
          {
            title: 'Priority',
            value: task.priority || 'Medium',
            short: true,
          },
          {
            title: 'Due Date',
            value: task.due_date ? new Date(task.due_date).toLocaleDateString() : 'No due date',
            short: true,
          },
        ],
        footer: 'Sixty Sales',
        footer_icon: 'https://sixty.app/favicon.ico',
        ts: Math.floor(Date.now() / 1000),
      }],
      channel: config.channel,
    };
  }

  /**
   * Format an organization notification for Slack
   * Story: ORG-NOTIF-012
   */
  formatOrgNotification(
    notification: {
      title: string;
      message: string;
      type: 'info' | 'success' | 'warning' | 'error';
      category: string;
      action_url?: string;
      metadata?: Record<string, any>;
    },
    orgName: string,
    config: SlackNotificationConfig
  ): SlackMessage {
    const mentions = config.mention_users?.map(user => `<@${user}>`).join(' ') || '';

    // Map notification type to Slack color
    const colorMap = {
      info: '#439FE0',
      success: '#36a64f',
      warning: '#ff9900',
      error: '#d9534f',
    };

    // Map category to emoji
    const emojiMap: Record<string, string> = {
      team: ':busts_in_silhouette:',
      deal: ':moneybag:',
      system: ':gear:',
      digest: ':newspaper:',
    };

    const message: SlackMessage = {
      username: config.username || 'Sixty Sales Bot',
      icon_emoji: config.icon_emoji || emojiMap[notification.category] || ':bell:',
      text: `${notification.title} ${mentions}`.trim(),
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: notification.title,
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: notification.message,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `📊 *${orgName}* • ${new Date().toLocaleString()}`,
            },
          ],
        },
      ],
    };

    // Add action button if URL provided
    if (notification.action_url) {
      message.blocks!.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View Details',
              emoji: true,
            },
            url: `https://app.use60.com${notification.action_url}`,
            style: notification.type === 'error' ? 'danger' : 'primary',
          },
        ],
      });
    }

    // Add metadata as context if present
    if (notification.metadata && Object.keys(notification.metadata).length > 0) {
      const metadataFields = Object.entries(notification.metadata)
        .slice(0, 5) // Limit to 5 fields
        .map(([key, value]) => `*${key}:* ${JSON.stringify(value)}`)
        .join(' • ');

      message.blocks!.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: metadataFields,
          },
        ],
      });
    }

    // Override channel if specified
    if (config.channel) {
      message.channel = config.channel;
    }

    return message;
  }

  /**
   * Format a general notification for Slack
   */
  formatGeneralNotification(title: string, message: string, config: SlackNotificationConfig): SlackMessage {
    const mentions = config.mention_users?.map(user => `<@${user}>`).join(' ') || '';

    return {
      username: config.username || 'Sixty Sales Bot',
      icon_emoji: config.icon_emoji || ':bell:',
      text: `${title} ${mentions}`.trim(),
      attachments: [{
        color: config.color || '#439FE0',
        text: message,
        footer: 'Sixty Sales',
        footer_icon: 'https://sixty.app/favicon.ico',
        ts: Math.floor(Date.now() / 1000),
      }],
      channel: config.channel,
    };
  }

  /**
   * Test Slack webhook connection
   */
  async testWebhook(webhookUrl: string): Promise<boolean> {
    try {
      const testMessage: SlackMessage = {
        text: '✅ Sixty Sales Slack integration test successful!',
        attachments: [{
          color: '#36a64f',
          text: 'Your Slack webhook is properly configured and ready to receive notifications.',
          footer: 'Sixty Sales',
          footer_icon: 'https://sixty.app/favicon.ico',
          ts: Math.floor(Date.now() / 1000),
        }],
      };

      return await this.sendWebhookMessage(webhookUrl, testMessage);
    } catch (error) {
      logger.error('❌ Slack webhook test failed:', error);
      return false;
    }
  }
}

export const slackService = new SlackService();
export type { SlackMessage, SlackNotificationConfig };