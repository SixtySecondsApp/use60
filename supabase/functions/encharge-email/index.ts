/**
 * Encharge Email Edge Function
 * 
 * Sends transactional emails via Encharge.io API
 * Replaces Resend for better deliverability and automation integration
 * 
 * Email Types:
 * - waitlist_invite: Invite user from waitlist to create account
 * - welcome: Welcome email after account creation
 * - fathom_connected: Confirm Fathom integration connected
 * - first_meeting_synced: Celebrate first meeting milestone
 * - meeting_limit_warning: Warn when approaching free tier limit
 * - upgrade_prompt: Prompt to upgrade from free tier
 * - trial_ending: Trial ending reminder
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ENCHARGE_API_KEY = Deno.env.get('ENCHARGE_API_KEY');
const ENCHARGE_WRITE_KEY = Deno.env.get('ENCHARGE_WRITE_KEY');
const ENCHARGE_SITE_ID = Deno.env.get('ENCHARGE_SITE_ID');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Email template types
type EmailType = 
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

interface EmailRequest {
  email_type: EmailType;
  to_email: string;
  to_name?: string;
  user_id?: string;
  
  // Note: send_transactional is deprecated - use event-based flows instead
  // Events trigger automation flows in Encharge which send emails
  send_transactional?: boolean; // Deprecated - kept for backwards compatibility
  
  // Type-specific data
  data?: {
    // waitlist_invite
    sender_name?: string;
    referral_url?: string;
    magic_link?: string;
    
    // Meeting related
    meeting_count?: number;
    meetings_used?: number;
    meetings_limit?: number;
    meetings_remaining?: number;
    usage_percent?: number;
    
    // Trial related
    trial_days_left?: number;
    trial_end_date?: string;
    
    // Subscription
    plan_name?: string;
    
    // Custom
    custom_subject?: string;
    custom_html?: string;
    
    // Tags for Encharge automation
    tags?: string[];
    
    // Liquid template variables for Encharge templates
    template_variables?: Record<string, any>;
  };
}

interface EnchargeEvent {
  name: string;
  user: {
    email: string;
    userId?: string;
    firstName?: string;
    lastName?: string;
  };
  properties?: Record<string, any>;
}

/**
 * Send event to Encharge via Ingest API - triggers automation flows
 * This works on all Encharge plans (Growth, Premium, etc.)
 * The automation flows in Encharge will send the actual emails
 */
async function sendEnchargeEvent(event: EnchargeEvent): Promise<{ success: boolean; error?: string }> {
  // Use WRITE_KEY for Ingest API (more reliable than API_KEY)
  const token = ENCHARGE_WRITE_KEY || ENCHARGE_API_KEY;
  
  if (!token) {
    console.error('[encharge-email] Missing ENCHARGE_WRITE_KEY or ENCHARGE_API_KEY');
    return { success: false, error: 'Missing Encharge API configuration' };
  }

  try {
    // Use Ingest API endpoint (works on all plans)
    const response = await fetch('https://ingest.encharge.io/v1/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Encharge-Token': token,
      },
      body: JSON.stringify({
        name: event.name,
        user: event.user,
        properties: event.properties,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('[encharge-email] Encharge API error:', response.status, errorData);
      return { success: false, error: `Encharge API error: ${response.status}` };
    }

    const result = await response.json();
    console.log('[encharge-email] Event sent successfully:', event.name);
    return { success: true };
  } catch (error) {
    console.error('[encharge-email] Failed to send event:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Update or create user in Encharge with tags
 */
async function upsertEnchargeUser(
  email: string,
  data: {
    userId?: string;
    firstName?: string;
    lastName?: string;
    tags?: string[];
    customFields?: Record<string, any>;
  }
): Promise<{ success: boolean; error?: string }> {
  if (!ENCHARGE_API_KEY) {
    return { success: false, error: 'Missing Encharge API configuration' };
  }

  try {
    const userData: Record<string, any> = {
      email,
      ...(data.userId && { userId: data.userId }),
      ...(data.firstName && { firstName: data.firstName }),
      ...(data.lastName && { lastName: data.lastName }),
      ...data.customFields,
    };

    // Add tags if provided
    if (data.tags && data.tags.length > 0) {
      userData.tags = data.tags;
    }

    const response = await fetch('https://api.encharge.io/v1/people', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Encharge-Token': ENCHARGE_API_KEY,
      },
      body: JSON.stringify(userData),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('[encharge-email] Failed to upsert user:', errorData);
      return { success: false, error: `Failed to upsert user: ${response.status}` };
    }

    return { success: true };
  } catch (error) {
    console.error('[encharge-email] Exception upserting user:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Get event name for email type (triggers Encharge automation)
 */
function getEventNameForEmailType(emailType: EmailType): string {
  const eventMap: Record<EmailType, string> = {
    waitlist_invite: 'Waitlist Invite Sent',
    welcome: 'Account Created',
    fathom_connected: 'Fathom Connected',
    first_meeting_synced: 'First Meeting Synced',
    meeting_limit_warning: 'Meeting Limit Warning',
    upgrade_prompt: 'Upgrade Prompt Shown',
    trial_ending: 'Trial Ending Soon',
    trial_expired: 'Trial Expired',
    subscription_confirmed: 'Subscription Confirmed',
    custom: 'Custom Email Sent',
  };
  return eventMap[emailType] || 'Email Sent';
}

/**
 * Get tags for email type (for segmentation in Encharge)
 */
function getTagsForEmailType(emailType: EmailType): string[] {
  const tagMap: Record<EmailType, string[]> = {
    waitlist_invite: ['waitlist', 'invited'],
    welcome: ['active_user', 'onboarding'],
    fathom_connected: ['fathom_connected', 'onboarding'],
    first_meeting_synced: ['first_meeting', 'engaged'],
    meeting_limit_warning: ['approaching_limit', 'free_tier'],
    upgrade_prompt: ['upgrade_candidate', 'free_tier'],
    trial_ending: ['trial', 'trial_ending'],
    trial_expired: ['trial', 'trial_expired'],
    subscription_confirmed: ['paying_customer', 'pro'],
    custom: [],
  };
  return tagMap[emailType] || [];
}

/**
 * NOTE: Transactional Email API requires Encharge Premium plan ($649/month)
 * This implementation uses event-based automation flows instead.
 * 
 * To send emails:
 * 1. Send events via Ingest API (this function)
 * 2. Configure automation flows in Encharge dashboard
 * 3. Flows trigger emails based on events
 * 
 * This works on all Encharge plans (Growth, Premium, etc.)
 */

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const request: EmailRequest = await req.json();
    
    // Validate required fields
    if (!request.email_type || !request.to_email) {
      throw new Error('Missing required fields: email_type and to_email');
    }

    console.log(`[encharge-email] Processing ${request.email_type} email to ${request.to_email}`);

    // Initialize Supabase for logging
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse name if provided
    let firstName: string | undefined;
    let lastName: string | undefined;
    if (request.to_name) {
      const nameParts = request.to_name.split(' ');
      firstName = nameParts[0];
      lastName = nameParts.slice(1).join(' ') || undefined;
    }

    // Determine tags to apply
    const baseTags = getTagsForEmailType(request.email_type);
    const additionalTags = request.data?.tags || [];
    const allTags = [...new Set([...baseTags, ...additionalTags])];

    // 1. Upsert user in Encharge with tags
    const upsertResult = await upsertEnchargeUser(request.to_email, {
      userId: request.user_id,
      firstName,
      lastName,
      tags: allTags,
      customFields: {
        // Add relevant custom fields based on email type
        ...(request.data?.meetings_used !== undefined && { meetingsUsed: request.data.meetings_used }),
        ...(request.data?.meetings_limit !== undefined && { meetingsLimit: request.data.meetings_limit }),
        ...(request.data?.meetings_remaining !== undefined && { meetingsRemaining: request.data.meetings_remaining }),
        ...(request.data?.usage_percent !== undefined && { usagePercent: request.data.usage_percent }),
        ...(request.data?.trial_days_left !== undefined && { trialDaysLeft: request.data.trial_days_left }),
        ...(request.data?.plan_name && { planName: request.data.plan_name }),
      },
    });

    if (!upsertResult.success) {
      console.warn('[encharge-email] Failed to upsert user, continuing with event:', upsertResult.error);
    }

    // 2. Send event to trigger automation in Encharge
    // This works on all plans - automation flows in Encharge will send the emails
    const eventName = getEventNameForEmailType(request.email_type);
    const eventResult = await sendEnchargeEvent({
      name: eventName,
      user: {
        email: request.to_email,
        userId: request.user_id,
        firstName,
        lastName,
      },
      properties: {
        emailType: request.email_type,
        ...request.data,
        sentAt: new Date().toISOString(),
        // Include template ID if provided (for flow routing)
        ...(request.template_id && { templateId: request.template_id }),
      },
    });

    // 4. Log to database for tracking
    try {
      await supabase.from('email_logs').insert({
        email_type: request.email_type,
        to_email: request.to_email,
        user_id: request.user_id,
        status: eventResult.success ? 'sent' : 'failed',
        error: eventResult.error,
        metadata: {
          ...request.data,
          sent_via: 'encharge_event', // Events trigger automation flows
        },
        sent_via: 'encharge_event',
      });
    } catch (logError) {
      console.warn('[encharge-email] Failed to log email:', logError);
      // Non-fatal, continue
    }

    return new Response(
      JSON.stringify({
        success: eventResult.success,
        email_type: request.email_type,
        event_name: eventName,
        tags_applied: allTags,
        event_sent: eventResult.success,
        note: 'Email will be sent via Encharge automation flow triggered by this event',
        error: eventResult.error,
      }),
      {
        status: eventResult.success ? 200 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('[encharge-email] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
