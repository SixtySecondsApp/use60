/**
 * Proactive Notification Types
 * 
 * Canonical types for proactive notifications across the system.
 */

export type ProactiveNotificationType =
  | 'morning_brief'
  | 'sales_assistant_digest'
  | 'pre_meeting_nudge'
  | 'post_call_summary'
  | 'stale_deal_alert'
  | 'deal_momentum_nudge'
  | 'deal_clarification_question'
  | 'email_reply_alert'
  | 'hitl_followup_email'
  | 'meeting_prep'
  | 'meeting_debrief'
  | 'meeting_ended'
  | 'daily_digest'
  | 'account_signal_alert'
  | 'account_intelligence_digest'
  | 'deal_risk_scan'
  | 'campaign_daily_check'
  | 'coaching_weekly';

export interface ProactiveNotificationPayload {
  type: ProactiveNotificationType;
  orgId: string;
  recipientUserId: string;
  recipientSlackUserId?: string;
  
  // Entity context
  entityType?: string;
  entityId?: string;
  
  // Content
  title: string;
  message: string;
  blocks?: any[]; // Slack Block Kit blocks
  
  // Metadata
  metadata?: Record<string, any>;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  
  // Actions
  actionUrl?: string;
  actions?: Array<{
    label: string;
    actionId: string;
    url?: string;
    style?: 'primary' | 'danger';
  }>;
  
  // In-app notification mapping
  inAppCategory?: 'workflow' | 'deal' | 'task' | 'meeting' | 'system' | 'team';
  inAppType?: 'info' | 'success' | 'warning' | 'error';
}

export interface DedupeKey {
  orgId: string;
  type: ProactiveNotificationType;
  recipientId: string;
  entityId?: string;
  windowStart: string; // ISO timestamp for cooldown window start
}

export interface NotificationDeliveryResult {
  slack?: {
    sent: boolean;
    channelId?: string;
    ts?: string;
    error?: string;
    interactionId?: string; // Smart Engagement Algorithm tracking
  };
  inApp?: {
    created: boolean;
    notificationId?: string;
    error?: string;
    interactionId?: string; // Smart Engagement Algorithm tracking
  };
}
