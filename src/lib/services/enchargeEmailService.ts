/**
 * Encharge Email Service
 * 
 * Client-side service to trigger transactional emails via the encharge-email Edge Function.
 * All emails are sent through Encharge.io for better deliverability and automation.
 */

import { supabase } from '@/lib/supabase/clientV2';

// Email types that can be sent
export type EmailType = 
  | 'waitlist_invite'
  | 'welcome'
  | 'fathom_connected'
  | 'first_meeting_synced'
  | 'meeting_limit_warning'
  | 'upgrade_prompt'
  | 'trial_ending'
  | 'trial_expired'
  | 'subscription_confirmed'
  | 'custom';

interface SendEmailParams {
  email_type: EmailType;
  to_email: string;
  to_name?: string;
  user_id?: string;
  send_transactional?: boolean; // Deprecated - events trigger flows (works on all plans)
  template_id?: string | number; // Passed as property for flow routing in Encharge
  subject?: string; // Not used (emails sent via flows)
  html?: string; // Not used (emails sent via flows)
  text?: string; // Not used (emails sent via flows)
  data?: Record<string, any>;
}

interface SendEmailResponse {
  success: boolean;
  email_type: string;
  event_name?: string;
  tags_applied?: string[];
  transactional_sent?: boolean;
  message_id?: string;
  error?: string;
}

/**
 * Send an email via Encharge
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResponse> {
  try {
    const edgeFunctionSecret = import.meta.env.VITE_EDGE_FUNCTION_SECRET || '';
    const { data, error } = await supabase.functions.invoke('encharge-email', {
      body: params,
      headers: edgeFunctionSecret
        ? { 'Authorization': `Bearer ${edgeFunctionSecret}` }
        : {},
    });

    if (error) {
      console.error('[enchargeEmailService] Error invoking function:', error);
      return {
        success: false,
        email_type: params.email_type,
        error: error.message,
      };
    }

    return data as SendEmailResponse;
  } catch (err) {
    console.error('[enchargeEmailService] Exception:', err);
    return {
      success: false,
      email_type: params.email_type,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ============================================================================
// Convenience functions for specific email types
// ============================================================================

/**
 * Send waitlist invite email
 */
export async function sendWaitlistInvite(params: {
  email: string;
  name?: string;
  senderName: string;
  referralUrl: string;
  magicLink?: string;
}): Promise<SendEmailResponse> {
  return sendEmail({
    email_type: 'waitlist_invite',
    to_email: params.email,
    to_name: params.name,
    data: {
      sender_name: params.senderName,
      referral_url: params.referralUrl,
      magic_link: params.magicLink,
    },
  });
}

/**
 * Send welcome email after account creation
 */
export async function sendWelcomeEmail(params: {
  email: string;
  name: string;
  userId: string;
}): Promise<SendEmailResponse> {
  return sendEmail({
    email_type: 'welcome',
    to_email: params.email,
    to_name: params.name,
    user_id: params.userId,
  });
}

/**
 * Send Fathom connected confirmation
 */
export async function sendFathomConnectedEmail(params: {
  email: string;
  name?: string;
  userId: string;
}): Promise<SendEmailResponse> {
  return sendEmail({
    email_type: 'fathom_connected',
    to_email: params.email,
    to_name: params.name,
    user_id: params.userId,
  });
}

/**
 * Send first meeting synced celebration
 */
export async function sendFirstMeetingSyncedEmail(params: {
  email: string;
  name?: string;
  userId: string;
  meetingCount: number;
}): Promise<SendEmailResponse> {
  return sendEmail({
    email_type: 'first_meeting_synced',
    to_email: params.email,
    to_name: params.name,
    user_id: params.userId,
    data: {
      meeting_count: params.meetingCount,
    },
  });
}

/**
 * Send meeting limit warning (approaching free tier limit)
 */
export async function sendMeetingLimitWarning(params: {
  email: string;
  name?: string;
  userId: string;
  meetingsUsed: number;
  meetingsLimit: number;
  meetingsRemaining?: number;
  usagePercent?: number;
}): Promise<SendEmailResponse> {
  return sendEmail({
    email_type: 'meeting_limit_warning',
    to_email: params.email,
    to_name: params.name,
    user_id: params.userId,
    data: {
      meetings_used: params.meetingsUsed,
      meetings_limit: params.meetingsLimit,
      meetings_remaining: params.meetingsRemaining ?? (params.meetingsLimit - params.meetingsUsed),
      usage_percent: params.usagePercent ?? Math.round((params.meetingsUsed / params.meetingsLimit) * 100),
    },
  });
}

/**
 * Send upgrade prompt email
 */
export async function sendUpgradePrompt(params: {
  email: string;
  name?: string;
  userId: string;
  reason?: string;
}): Promise<SendEmailResponse> {
  return sendEmail({
    email_type: 'upgrade_prompt',
    to_email: params.email,
    to_name: params.name,
    user_id: params.userId,
    data: {
      reason: params.reason,
    },
  });
}

/**
 * Send trial ending reminder
 */
export async function sendTrialEndingEmail(params: {
  email: string;
  name?: string;
  userId: string;
  daysLeft: number;
  trialEndDate: string;
}): Promise<SendEmailResponse> {
  return sendEmail({
    email_type: 'trial_ending',
    to_email: params.email,
    to_name: params.name,
    user_id: params.userId,
    data: {
      trial_days_left: params.daysLeft,
      trial_end_date: params.trialEndDate,
    },
  });
}

/**
 * Send trial expired notification
 */
export async function sendTrialExpiredEmail(params: {
  email: string;
  name?: string;
  userId: string;
}): Promise<SendEmailResponse> {
  return sendEmail({
    email_type: 'trial_expired',
    to_email: params.email,
    to_name: params.name,
    user_id: params.userId,
  });
}

/**
 * Send subscription confirmed email
 */
export async function sendSubscriptionConfirmedEmail(params: {
  email: string;
  name?: string;
  userId: string;
  planName: string;
}): Promise<SendEmailResponse> {
  return sendEmail({
    email_type: 'subscription_confirmed',
    to_email: params.email,
    to_name: params.name,
    user_id: params.userId,
    data: {
      plan_name: params.planName,
    },
  });
}

export default {
  sendEmail,
  sendWaitlistInvite,
  sendWelcomeEmail,
  sendFathomConnectedEmail,
  sendFirstMeetingSyncedEmail,
  sendMeetingLimitWarning,
  sendUpgradePrompt,
  sendTrialEndingEmail,
  sendTrialExpiredEmail,
  sendSubscriptionConfirmedEmail,
};
