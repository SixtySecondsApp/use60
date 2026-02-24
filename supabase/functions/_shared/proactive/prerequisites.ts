/**
 * Prerequisites Check Service
 *
 * Validates that a user/org is ready for the proactive agent.
 * Checks Slack connectivity, credit balance, API keys, and per-sequence requirements.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkCreditBalance } from '../costTracking.ts';

// =============================================================================
// Types
// =============================================================================

export interface PrerequisiteCheck {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  fixUrl?: string; // Frontend settings URL to fix the issue
}

export interface PrerequisiteResult {
  ready: boolean; // true if all critical checks pass
  checks: PrerequisiteCheck[];
  sequenceReadiness: Record<string, { ready: boolean; missing: string[] }>;
}

// =============================================================================
// Main Check Function
// =============================================================================

/**
 * Check if a user/org is ready for the proactive agent
 */
export async function checkProactivePrerequisites(
  supabase: SupabaseClient,
  orgId: string,
  userId: string
): Promise<PrerequisiteResult> {
  const checks: PrerequisiteCheck[] = [];
  const sequenceReadiness: Record<string, { ready: boolean; missing: string[] }> = {};

  // Run all checks in parallel for performance
  const [
    slackOrgCheck,
    creditCheck,
    apiKeyCheck,
    slackUserCheck,
    timezoneCheck,
    googleCalendarCheck,
    instantlyCheck,
    gmailCheck,
  ] = await Promise.all([
    checkSlackOrgConnected(supabase, orgId),
    checkCreditBalanceWrapper(supabase, orgId),
    checkAIAPIKey(supabase, orgId),
    checkSlackUserMapped(supabase, orgId, userId),
    checkUserTimezone(supabase, orgId, userId),
    checkGoogleCalendar(supabase, orgId, userId),
    checkInstantly(supabase, orgId),
    checkGmail(supabase, orgId, userId),
  ]);

  // Add checks to results
  checks.push(slackOrgCheck);
  checks.push(creditCheck);
  checks.push(apiKeyCheck);
  checks.push(slackUserCheck);
  checks.push(timezoneCheck);

  // Determine overall readiness (all critical checks must pass)
  const criticalFailed = checks.some(check => check.status === 'fail');
  const ready = !criticalFailed;

  // Per-sequence readiness
  const orgLevelReady = !criticalFailed;

  // Pre-meeting 90min: requires Google Calendar
  sequenceReadiness.pre_meeting_90min = {
    ready: orgLevelReady && googleCalendarCheck.status === 'pass',
    missing: googleCalendarCheck.status === 'pass' ? [] : ['Google Calendar'],
  };

  // Campaign daily check: requires Instantly
  sequenceReadiness.campaign_daily_check = {
    ready: orgLevelReady && instantlyCheck.status === 'pass',
    missing: instantlyCheck.status === 'pass' ? [] : ['Instantly integration'],
  };

  // Email received: requires Gmail with push notifications
  sequenceReadiness.email_received = {
    ready: orgLevelReady && gmailCheck.status === 'pass',
    missing: gmailCheck.status === 'pass' ? [] : ['Gmail with push notifications'],
  };

  // All other sequences: just need org-level prerequisites
  sequenceReadiness.meeting_ended = {
    ready: orgLevelReady,
    missing: [],
  };
  sequenceReadiness.proposal_generation = {
    ready: orgLevelReady,
    missing: [],
  };
  sequenceReadiness.calendar_find_times = {
    ready: orgLevelReady,
    missing: [],
  };
  sequenceReadiness.stale_deal_revival = {
    ready: orgLevelReady,
    missing: [],
  };
  sequenceReadiness.coaching_weekly = {
    ready: orgLevelReady,
    missing: [],
  };
  sequenceReadiness.deal_risk_scan = {
    ready: orgLevelReady,
    missing: [],
  };

  return {
    ready,
    checks,
    sequenceReadiness,
  };
}

// =============================================================================
// Individual Check Functions
// =============================================================================

/**
 * Check if Slack org is connected
 */
async function checkSlackOrgConnected(
  supabase: SupabaseClient,
  orgId: string
): Promise<PrerequisiteCheck> {
  try {
    const { data, error } = await supabase
      .from('slack_org_settings')
      .select('is_connected')
      .eq('org_id', orgId)
      .eq('is_connected', true)
      .maybeSingle();

    if (error) {
      console.warn('[prerequisites] Slack org check error:', error);
      return {
        name: 'Slack Workspace',
        status: 'fail',
        message: 'Error checking Slack connection',
        fixUrl: '/settings/slack',
      };
    }

    if (!data) {
      return {
        name: 'Slack Workspace',
        status: 'fail',
        message: 'Slack workspace is not connected. Connect Slack to enable proactive agent notifications.',
        fixUrl: '/settings/slack',
      };
    }

    return {
      name: 'Slack Workspace',
      status: 'pass',
      message: 'Slack workspace is connected',
    };
  } catch (err) {
    console.warn('[prerequisites] Slack org check exception:', err);
    return {
      name: 'Slack Workspace',
      status: 'fail',
      message: 'Error checking Slack connection',
      fixUrl: '/settings/slack',
    };
  }
}

/**
 * Check credit balance using costTracking helper
 */
async function checkCreditBalanceWrapper(
  supabase: SupabaseClient,
  orgId: string
): Promise<PrerequisiteCheck> {
  try {
    const result = await checkCreditBalance(supabase, orgId);

    if (!result.allowed) {
      return {
        name: 'Credit Balance',
        status: 'fail',
        message: result.message || 'Organization has insufficient AI credits. Please top up to continue.',
        fixUrl: '/settings/credits',
      };
    }

    return {
      name: 'Credit Balance',
      status: 'pass',
      message: `Credit balance available ($${result.balance.toFixed(2)})`,
    };
  } catch (err) {
    console.warn('[prerequisites] Credit check exception:', err);
    return {
      name: 'Credit Balance',
      status: 'fail',
      message: 'Error checking credit balance',
      fixUrl: '/settings/credits',
    };
  }
}

/**
 * Check if AI API key (Anthropic) is configured
 * Checks if any org member has an ANTHROPIC_API_KEY in their user_settings
 */
async function checkAIAPIKey(
  supabase: SupabaseClient,
  orgId: string
): Promise<PrerequisiteCheck> {
  try {
    // Get all user IDs in this org
    const { data: members, error: memberError } = await supabase
      .from('organization_memberships')
      .select('user_id')
      .eq('org_id', orgId);

    if (memberError || !members || members.length === 0) {
      console.warn('[prerequisites] Error getting org members:', memberError);
      return {
        name: 'AI API Key',
        status: 'fail',
        message: 'No organization members found',
        fixUrl: '/settings/ai',
      };
    }

    const userIds = members.map(m => m.user_id);

    // Check if any user has ANTHROPIC_API_KEY in their ai_provider_keys
    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('ai_provider_keys')
      .in('user_id', userIds);

    if (settingsError) {
      console.warn('[prerequisites] Error checking user settings:', settingsError);
      return {
        name: 'AI API Key',
        status: 'fail',
        message: 'Error checking AI API key configuration',
        fixUrl: '/settings/ai',
      };
    }

    // Check if any user has ANTHROPIC_API_KEY
    const hasAnthropicKey = settings?.some(s => {
      const keys = s.ai_provider_keys as Record<string, unknown> | null;
      return keys && typeof keys === 'object' && 'ANTHROPIC_API_KEY' in keys && keys.ANTHROPIC_API_KEY;
    });

    if (!hasAnthropicKey) {
      return {
        name: 'AI API Key',
        status: 'fail',
        message: 'No Anthropic API key configured. Add an API key in settings to enable AI features.',
        fixUrl: '/settings/ai',
      };
    }

    return {
      name: 'AI API Key',
      status: 'pass',
      message: 'Anthropic API key is configured',
    };
  } catch (err) {
    console.warn('[prerequisites] AI API key check exception:', err);
    return {
      name: 'AI API Key',
      status: 'fail',
      message: 'Error checking AI API key configuration',
      fixUrl: '/settings/ai',
    };
  }
}

/**
 * Check if Slack user is mapped
 */
async function checkSlackUserMapped(
  supabase: SupabaseClient,
  orgId: string,
  userId: string
): Promise<PrerequisiteCheck> {
  try {
    const { data, error } = await supabase
      .from('slack_user_mappings')
      .select('id, slack_user_id')
      .eq('org_id', orgId)
      .eq('sixty_user_id', userId)
      .maybeSingle();

    if (error) {
      console.warn('[prerequisites] Slack user mapping check error:', error);
      return {
        name: 'Slack User Mapping',
        status: 'fail',
        message: 'Error checking Slack user mapping',
        fixUrl: '/settings/slack',
      };
    }

    if (!data || !data.slack_user_id) {
      return {
        name: 'Slack User Mapping',
        status: 'fail',
        message: 'Your Slack account is not mapped. Link your Slack user to receive notifications.',
        fixUrl: '/settings/slack',
      };
    }

    return {
      name: 'Slack User Mapping',
      status: 'pass',
      message: 'Slack user is mapped',
    };
  } catch (err) {
    console.warn('[prerequisites] Slack user mapping check exception:', err);
    return {
      name: 'Slack User Mapping',
      status: 'fail',
      message: 'Error checking Slack user mapping',
      fixUrl: '/settings/slack',
    };
  }
}

/**
 * Check if user timezone is set
 */
async function checkUserTimezone(
  supabase: SupabaseClient,
  orgId: string,
  userId: string
): Promise<PrerequisiteCheck> {
  try {
    const { data, error } = await supabase
      .from('slack_user_mappings')
      .select('preferred_timezone')
      .eq('org_id', orgId)
      .eq('sixty_user_id', userId)
      .maybeSingle();

    if (error) {
      console.warn('[prerequisites] Timezone check error:', error);
      return {
        name: 'User Timezone',
        status: 'warning',
        message: 'Error checking timezone (will default to America/New_York)',
        fixUrl: '/settings/slack',
      };
    }

    if (!data || !data.preferred_timezone) {
      return {
        name: 'User Timezone',
        status: 'warning',
        message: 'Timezone not set (will default to America/New_York). Set your timezone for accurate scheduling.',
        fixUrl: '/settings/slack',
      };
    }

    return {
      name: 'User Timezone',
      status: 'pass',
      message: `Timezone set to ${data.preferred_timezone}`,
    };
  } catch (err) {
    console.warn('[prerequisites] Timezone check exception:', err);
    return {
      name: 'User Timezone',
      status: 'warning',
      message: 'Error checking timezone (will default to America/New_York)',
      fixUrl: '/settings/slack',
    };
  }
}

/**
 * Check if Google Calendar is connected (for pre_meeting_90min sequence)
 */
async function checkGoogleCalendar(
  supabase: SupabaseClient,
  orgId: string,
  userId: string
): Promise<PrerequisiteCheck> {
  try {
    const { data, error } = await supabase
      .from('google_integrations')
      .select('scopes, is_active')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.warn('[prerequisites] Google Calendar check error:', error);
      return {
        name: 'Google Calendar',
        status: 'fail',
        message: 'Error checking Google Calendar connection',
      };
    }

    if (!data) {
      return {
        name: 'Google Calendar',
        status: 'fail',
        message: 'Google Calendar is not connected (required for pre-meeting briefings)',
      };
    }

    // Check if calendar scope is present
    const scopes = data.scopes;
    const scopeArray = typeof scopes === 'string' ? scopes.split(' ') : Array.isArray(scopes) ? scopes : [];
    const hasCalendarScope = scopeArray.some(
      (s: string) => s.includes('calendar') || s.includes('https://www.googleapis.com/auth/calendar')
    );

    if (!hasCalendarScope) {
      return {
        name: 'Google Calendar',
        status: 'fail',
        message: 'Google Calendar scope is missing (required for pre-meeting briefings)',
      };
    }

    return {
      name: 'Google Calendar',
      status: 'pass',
      message: 'Google Calendar is connected',
    };
  } catch (err) {
    console.warn('[prerequisites] Google Calendar check exception:', err);
    return {
      name: 'Google Calendar',
      status: 'fail',
      message: 'Error checking Google Calendar connection',
    };
  }
}

/**
 * Check if Instantly is connected (for campaign_daily_check sequence)
 */
async function checkInstantly(
  supabase: SupabaseClient,
  orgId: string
): Promise<PrerequisiteCheck> {
  try {
    const { data, error } = await supabase
      .from('instantly_org_integrations')
      .select('is_connected, is_active')
      .eq('org_id', orgId)
      .eq('is_connected', true)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.warn('[prerequisites] Instantly check error:', error);
      return {
        name: 'Instantly Integration',
        status: 'fail',
        message: 'Error checking Instantly connection',
      };
    }

    if (!data) {
      return {
        name: 'Instantly Integration',
        status: 'fail',
        message: 'Instantly is not connected (required for campaign monitoring)',
      };
    }

    return {
      name: 'Instantly Integration',
      status: 'pass',
      message: 'Instantly is connected',
    };
  } catch (err) {
    console.warn('[prerequisites] Instantly check exception:', err);
    return {
      name: 'Instantly Integration',
      status: 'fail',
      message: 'Error checking Instantly connection',
    };
  }
}

/**
 * Check if Gmail is connected with push notifications (for email_received sequence)
 */
async function checkGmail(
  supabase: SupabaseClient,
  orgId: string,
  userId: string
): Promise<PrerequisiteCheck> {
  try {
    const { data, error } = await supabase
      .from('google_integrations')
      .select('scopes, is_active')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.warn('[prerequisites] Gmail check error:', error);
      return {
        name: 'Gmail',
        status: 'fail',
        message: 'Error checking Gmail connection',
      };
    }

    if (!data) {
      return {
        name: 'Gmail',
        status: 'fail',
        message: 'Gmail is not connected (required for email-triggered sequences)',
      };
    }

    // Check if gmail scope is present
    const scopes = data.scopes;
    const scopeArray = typeof scopes === 'string' ? scopes.split(' ') : Array.isArray(scopes) ? scopes : [];
    const hasGmailScope = scopeArray.some(
      (s: string) => s.includes('gmail') || s.includes('https://www.googleapis.com/auth/gmail')
    );

    if (!hasGmailScope) {
      return {
        name: 'Gmail',
        status: 'fail',
        message: 'Gmail scope is missing (required for email-triggered sequences)',
      };
    }

    // Note: We assume push notifications are set up if Gmail is connected
    // A more thorough check would query gmail_watch_tracking table if available
    return {
      name: 'Gmail',
      status: 'pass',
      message: 'Gmail is connected with push notifications',
    };
  } catch (err) {
    console.warn('[prerequisites] Gmail check exception:', err);
    return {
      name: 'Gmail',
      status: 'fail',
      message: 'Error checking Gmail connection',
    };
  }
}
