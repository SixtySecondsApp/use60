/**
 * Copilot API Service
 * Handles all interactions with the AI Copilot backend
 */

import { getSupabaseHeaders } from '@/lib/utils/apiUtils';
import { API_BASE_URL } from '@/lib/config';
import logger from '@/lib/utils/logger';
import { getClientIp } from '@/lib/utils/clientIp';
import type {
  CopilotContextPayload,
  CopilotResponsePayload
} from '@/components/copilot/types';

export class CopilotService {
  private static readonly BASE_URL = `${API_BASE_URL}/api-copilot`;

  /**
   * Send a message to the Copilot and get AI response
   */
  static async sendMessage(
    message: string,
    context: CopilotContextPayload['context'],
    conversationId?: string
  ): Promise<CopilotResponsePayload> {
    try {
      const headers = await getSupabaseHeaders();
      const clientIp = await getClientIp();

      const requestBody: CopilotContextPayload & { client_ip?: string } = {
        message,
        conversationId,
        context,
        ...(clientIp ? { client_ip: clientIp } : {}),
      };

      logger.log('🤖 Sending message to Copilot:', { message, context });

      const response = await fetch(`${this.BASE_URL}/chat`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Copilot API error: ${response.status} ${response.statusText}`
        );
      }

      const data: CopilotResponsePayload = await response.json();
      logger.log('✅ Copilot response received:', data);

      return data;
    } catch (error) {
      logger.error('❌ Error sending message to Copilot:', error);
      throw error;
    }
  }

  /**
   * Draft an email using AI based on contact context
   */
  static async draftEmail(
    contactId: string,
    context: string,
    tone: 'professional' | 'friendly' | 'concise' = 'professional'
  ): Promise<{
    subject: string;
    body: string;
    suggestedSendTime?: string;
  }> {
    try {
      const headers = await getSupabaseHeaders();

      const response = await fetch(`${this.BASE_URL}/actions/draft-email`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          contactId,
          context,
          tone
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Email draft API error: ${response.status}`
        );
      }

      const data = await response.json();
      logger.log('✅ Email draft generated:', data);

      return data;
    } catch (error) {
      logger.error('❌ Error drafting email:', error);
      throw error;
    }
  }

  /**
   * Get conversation history
   */
  static async getConversation(conversationId: string): Promise<{
    conversation: any;
    messages: any[];
  }> {
    try {
      const headers = await getSupabaseHeaders();

      const response = await fetch(`${this.BASE_URL}/conversations/${conversationId}`, {
        method: 'GET',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Failed to fetch conversation: ${response.status}`
        );
      }

      const data = await response.json();
      return data.data || data;
    } catch (error) {
      logger.error('❌ Error fetching conversation:', error);
      throw error;
    }
  }

  /**
   * Calculate priority recommendations based on pipeline data
   * This is a helper function that can be used client-side or server-side
   */
  static calculatePriorities(
    deals: Array<{
      id: string;
      value: number;
      healthScore?: number;
      stage_id: string;
      expected_close_date?: string;
      updated_at: string;
    }>,
    activities: Array<{
      deal_id?: string;
      created_at: string;
      type: string;
    }>
  ): Recommendation[] {
    const scored = deals.map(deal => {
      const dealActivities = activities.filter(a => a.deal_id === deal.id);
      const daysSinceUpdate = Math.floor(
        (Date.now() - new Date(deal.updated_at).getTime()) / (1000 * 60 * 60 * 24)
      );
      const urgencyScore = Math.max(0, 100 - daysSinceUpdate * 5);
      const engagementScore = Math.min(100, dealActivities.length * 10);

      const score =
        deal.value * 0.3 +
        (deal.healthScore || 50) * 0.25 +
        engagementScore * 0.25 +
        urgencyScore * 0.2;

      return {
        deal,
        score,
        urgencyScore,
        engagementScore
      };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((item, index) => ({
        id: `priority-${item.deal.id}`,
        priority: index + 1,
        title: `Follow up with ${item.deal.id}`,
        description: `Deal value: £${item.deal.value.toLocaleString()} • Score: ${Math.round(item.score)}`,
        actions: [
          {
            id: `action-view-${item.deal.id}`,
            label: 'View Deal',
            type: 'view_deal' as const,
            variant: 'primary' as const,
            href: `/crm/deals/${item.deal.id}`
          },
          {
            id: `action-email-${item.deal.id}`,
            label: 'Draft Email',
            type: 'draft_email' as const,
            variant: 'secondary' as const
          }
        ],
        tags: [],
        dealId: item.deal.id
      }));
  }
}

