/**
 * Scheduled Encharge Emails Edge Function
 * 
 * Runs via Supabase cron (every hour) to send scheduled emails:
 * - Trial reminders (3 days, 1 day, expired)
 * - Re-engagement emails (7, 14, 30 days inactive)
 * - Weekly digests (Sunday)
 * 
 * Cron schedule: 0 * * * * (every hour)
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

const ENCHARGE_API_KEY = Deno.env.get('ENCHARGE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface ScheduledEmailJob {
  userId: string;
  userEmail: string;
  userName?: string;
  journeyId: string;
  emailType: string;
  delayMinutes: number;
  metadata?: Record<string, any>;
}

/**
 * Get users needing trial reminder emails
 */
async function getUsersNeedingTrialReminder(supabase: any): Promise<ScheduledEmailJob[]> {
  const jobs: ScheduledEmailJob[] = [];
  
  try {
    // Get users with trials ending in 3 days
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    threeDaysFromNow.setHours(0, 0, 0, 0);
    
    const oneDayFromNow = new Date();
    oneDayFromNow.setDate(oneDayFromNow.getDate() + 1);
    oneDayFromNow.setHours(0, 0, 0, 0);
    
    // Query subscriptions with trial ending soon
    const { data: subscriptions, error } = await supabase
      .from('subscriptions')
      .select(`
        id,
        user_id,
        trial_end,
        profiles!inner(email, full_name)
      `)
      .eq('status', 'trialing')
      .in('trial_end', [
        threeDaysFromNow.toISOString().split('T')[0],
        oneDayFromNow.toISOString().split('T')[0],
      ]);

    if (error) {
      console.error('[scheduled-encharge-emails] Error fetching trial reminders:', error);
      return jobs;
    }

    if (!subscriptions || subscriptions.length === 0) {
      return jobs;
    }

    // Get journey IDs for trial_ending emails
    const { data: journeys } = await supabase
      .from('email_journeys')
      .select('id, delay_minutes')
      .eq('journey_name', 'trial')
      .eq('email_type', 'trial_ending')
      .eq('is_active', true);

    for (const subscription of subscriptions) {
      const trialEnd = new Date(subscription.trial_end);
      const daysRemaining = Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      
      // Find matching journey based on days remaining
      const matchingJourney = journeys?.find((j: any) => {
        const journeyDays = Math.floor(j.delay_minutes / 1440);
        return journeyDays === daysRemaining;
      });

      if (matchingJourney) {
        // Check if email was already sent
        const { data: alreadySent } = await supabase
          .from('email_sends')
          .select('id')
          .eq('user_id', subscription.user_id)
          .eq('email_type', 'trial_ending')
          .eq('journey_id', matchingJourney.id)
          .gte('sent_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .limit(1);

        if (!alreadySent || alreadySent.length === 0) {
          jobs.push({
            userId: subscription.user_id,
            userEmail: subscription.profiles.email,
            userName: subscription.profiles.full_name,
            journeyId: matchingJourney.id,
            emailType: 'trial_ending',
            delayMinutes: matchingJourney.delay_minutes,
            metadata: {
              days_remaining: daysRemaining,
              trial_end: subscription.trial_end,
            },
          });
        }
      }
    }
  } catch (error) {
    console.error('[scheduled-encharge-emails] Exception getting trial reminders:', error);
  }

  return jobs;
}

/**
 * Get users needing trial expired emails
 */
async function getUsersNeedingTrialExpired(supabase: any): Promise<ScheduledEmailJob[]> {
  const jobs: ScheduledEmailJob[] = [];
  
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get subscriptions that expired today or yesterday (to catch any missed)
    const { data: subscriptions, error } = await supabase
      .from('subscriptions')
      .select(`
        id,
        user_id,
        trial_end,
        profiles!inner(email, full_name)
      `)
      .eq('status', 'trialing')
      .lte('trial_end', today.toISOString().split('T')[0]);

    if (error) {
      console.error('[scheduled-encharge-emails] Error fetching expired trials:', error);
      return jobs;
    }

    if (!subscriptions || subscriptions.length === 0) {
      return jobs;
    }

    // Get journey for trial_expired
    const { data: journeys } = await supabase
      .from('email_journeys')
      .select('id')
      .eq('journey_name', 'trial')
      .eq('email_type', 'trial_expired')
      .eq('is_active', true)
      .eq('delay_minutes', 0)
      .limit(1);

    if (!journeys || journeys.length === 0) {
      return jobs;
    }

    const journey = journeys[0];

    for (const subscription of subscriptions) {
      // Check if email was already sent
      const { data: alreadySent } = await supabase
        .from('email_sends')
        .select('id')
        .eq('user_id', subscription.user_id)
        .eq('email_type', 'trial_expired')
        .eq('journey_id', journey.id)
        .limit(1);

      if (!alreadySent || alreadySent.length === 0) {
        jobs.push({
          userId: subscription.user_id,
          userEmail: subscription.profiles.email,
          userName: subscription.profiles.full_name,
          journeyId: journey.id,
          emailType: 'trial_expired',
          delayMinutes: 0,
          metadata: {
            trial_end: subscription.trial_end,
          },
        });
      }
    }
  } catch (error) {
    console.error('[scheduled-encharge-emails] Exception getting expired trials:', error);
  }

  return jobs;
}

/**
 * Get users needing re-engagement emails (inactive users)
 */
async function getUsersNeedingReEngagement(supabase: any): Promise<ScheduledEmailJob[]> {
  const jobs: ScheduledEmailJob[] = [];
  
  try {
    // Get users inactive for 7, 14, or 30 days
    const inactiveThresholds = [7, 14, 30];
    
    const { data: journeys } = await supabase
      .from('email_journeys')
      .select('id, delay_minutes')
      .eq('journey_name', 'retention')
      .eq('email_type', 're_engagement')
      .eq('is_active', true);

    for (const threshold of inactiveThresholds) {
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() - threshold);
      
      // Find matching journey
      const matchingJourney = journeys?.find((j: any) => {
        const journeyDays = Math.floor(j.delay_minutes / 1440);
        return journeyDays === threshold;
      });

      if (!matchingJourney) continue;

      // Get inactive users (simplified - would need last_active tracking)
      // For now, we'll use last login or last meeting activity
      const { data: inactiveUsers, error } = await supabase
        .from('profiles')
        .select(`
          id,
          email,
          full_name,
          last_sign_in_at
        `)
        .lt('last_sign_in_at', thresholdDate.toISOString())
        .not('email', 'is', null)
        .limit(50); // Limit to avoid overload

      if (error) {
        console.error(`[scheduled-encharge-emails] Error fetching ${threshold} day inactive users:`, error);
        continue;
      }

      if (!inactiveUsers || inactiveUsers.length === 0) {
        continue;
      }

      for (const user of inactiveUsers) {
        // Check if email was already sent
        const { data: alreadySent } = await supabase
          .from('email_sends')
          .select('id')
          .eq('user_id', user.id)
          .eq('email_type', 're_engagement')
          .eq('journey_id', matchingJourney.id)
          .gte('sent_at', new Date(Date.now() - threshold * 24 * 60 * 60 * 1000).toISOString())
          .limit(1);

        if (!alreadySent || alreadySent.length === 0) {
          jobs.push({
            userId: user.id,
            userEmail: user.email,
            userName: user.full_name,
            journeyId: matchingJourney.id,
            emailType: 're_engagement',
            delayMinutes: matchingJourney.delay_minutes,
            metadata: {
              days_inactive: threshold,
            },
          });
        }
      }
    }
  } catch (error) {
    console.error('[scheduled-encharge-emails] Exception getting re-engagement users:', error);
  }

  return jobs;
}

/**
 * Send email via Encharge Edge Function
 */
async function sendEmailViaFunction(
  job: ScheduledEmailJob
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/encharge-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        email_type: job.emailType,
        to_email: job.userEmail,
        to_name: job.userName,
        user_id: job.userId,
        send_transactional: true,
        data: job.metadata,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const result = await response.json();
    return {
      success: result.success,
      error: result.error,
      messageId: result.message_id,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

serve(async (req) => {
  // Verify cron secret (required for scheduled/automated calls)
  const cronSecret = Deno.env.get('CRON_SECRET');
  const providedSecret = req.headers.get('x-cron-secret');

  if (cronSecret && providedSecret !== cronSecret) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized: valid CRON_SECRET required' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!ENCHARGE_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'Missing ENCHARGE_API_KEY' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  const results = {
    trial_reminders: { sent: 0, failed: 0, errors: [] as string[] },
    trial_expired: { sent: 0, failed: 0, errors: [] as string[] },
    re_engagement: { sent: 0, failed: 0, errors: [] as string[] },
  };

  try {
    // 1. Process trial reminders
    console.log('[scheduled-encharge-emails] Processing trial reminders...');
    const trialReminderJobs = await getUsersNeedingTrialReminder(supabase);
    for (const job of trialReminderJobs) {
      const result = await sendEmailViaFunction(job);
      if (result.success) {
        results.trial_reminders.sent++;
      } else {
        results.trial_reminders.failed++;
        results.trial_reminders.errors.push(`${job.userEmail}: ${result.error}`);
      }
    }

    // 2. Process trial expired
    console.log('[scheduled-encharge-emails] Processing trial expired...');
    const trialExpiredJobs = await getUsersNeedingTrialExpired(supabase);
    for (const job of trialExpiredJobs) {
      const result = await sendEmailViaFunction(job);
      if (result.success) {
        results.trial_expired.sent++;
      } else {
        results.trial_expired.failed++;
        results.trial_expired.errors.push(`${job.userEmail}: ${result.error}`);
      }
    }

    // 3. Process re-engagement
    console.log('[scheduled-encharge-emails] Processing re-engagement...');
    const reEngagementJobs = await getUsersNeedingReEngagement(supabase);
    for (const job of reEngagementJobs) {
      const result = await sendEmailViaFunction(job);
      if (result.success) {
        results.re_engagement.sent++;
      } else {
        results.re_engagement.failed++;
        results.re_engagement.errors.push(`${job.userEmail}: ${result.error}`);
      }
    }

    const totalSent = 
      results.trial_reminders.sent + 
      results.trial_expired.sent + 
      results.re_engagement.sent;
    
    const totalFailed = 
      results.trial_reminders.failed + 
      results.trial_expired.failed + 
      results.re_engagement.failed;

    console.log(`[scheduled-encharge-emails] Complete: ${totalSent} sent, ${totalFailed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        results,
        summary: {
          total_sent: totalSent,
          total_failed: totalFailed,
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[scheduled-encharge-emails] Fatal error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        results,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});
