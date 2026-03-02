/**
 * In-App Notification Delivery
 * 
 * Creates mirrored in-app notifications for proactive Slack notifications.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import type { ProactiveNotificationPayload } from './types.ts';

/**
 * Create in-app notification mirroring Slack notification
 */
export async function deliverToInApp(
  supabase: SupabaseClient,
  payload: ProactiveNotificationPayload
): Promise<{ created: boolean; notificationId?: string; interactionId?: string; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        user_id: payload.recipientUserId,
        title: payload.title,
        message: payload.message,
        type: payload.inAppType || 'info',
        category: payload.inAppCategory || 'team',
        entity_type: payload.entityType,
        entity_id: payload.entityId,
        action_url: payload.actionUrl,
        metadata: {
          ...payload.metadata,
          proactive_type: payload.type,
          priority: payload.priority,
          slack_sent: true,
        },
      })
      .select('id')
      .single();

    if (error) {
      console.error('[proactive/deliveryInApp] Error creating notification:', error);
      return {
        created: false,
        error: error.message,
      };
    }

    // Record notification interaction for Smart Engagement Algorithm
    let interactionId: string | undefined;
    try {
      const { data: interactionData, error: interactionError } = await supabase.rpc('record_notification_interaction', {
        p_user_id: payload.recipientUserId,
        p_org_id: payload.orgId,
        p_notification_type: payload.type,
        p_delivered_via: 'in_app',
        p_notification_id: data.id,
      });

      if (interactionError) {
        console.error('[proactive/deliveryInApp] Error recording interaction:', interactionError);
      } else {
        interactionId = interactionData as string;
      }
    } catch (err) {
      console.error('[proactive/deliveryInApp] Error recording interaction:', err);
    }

    return {
      created: true,
      notificationId: data.id,
      interactionId,
    };
  } catch (error) {
    return {
      created: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
