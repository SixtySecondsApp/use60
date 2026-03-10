// supabase/functions/trial-expiry-cron/index.ts
// Daily cron job to expire trials → grace period, and grace period → deactivated.
// Auth: CRON_SECRET bearer token — fails CLOSED if env var not set.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

interface ExpiryResult {
  trials_to_grace: number;
  grace_to_deactivated: number;
  warnings_sent: number;
  emails_sent: number;
  errors: string[];
}

/**
 * Check if an email of a specific type was already sent to this address today
 * (within the last 20 hours — handles cron timing variance)
 */
async function wasEmailAlreadySent(
  supabase: ReturnType<typeof createClient>,
  toEmail: string,
  templateType: string
): Promise<boolean> {
  const twentyHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('email_logs')
    .select('id')
    .eq('to_email', toEmail)
    .eq('email_type', templateType)
    .eq('status', 'sent')
    .gte('created_at', twentyHoursAgo)
    .limit(1)
    .maybeSingle();
  return !!data;
}

/**
 * Send a trial email via encharge-send-email edge function.
 * Returns true on success.
 */
async function sendTrialEmail(
  toEmail: string,
  toName: string,
  templateType: string,
  variables: Record<string, string | number>
): Promise<boolean> {
  try {
    const response = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/encharge-send-email`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          template_type: templateType,
          to_email: toEmail,
          to_name: toName,
          variables: {
            recipient_name: toName,
            subscribe_url: `${Deno.env.get('FRONTEND_URL') ?? 'https://app.use60.com'}/settings/billing`,
            support_email: 'support@use60.com',
            ...variables,
          },
        }),
      }
    );
    if (!response.ok) {
      const errText = await response.text();
      console.error(`[trial-expiry-cron] encharge-send-email failed for ${toEmail} (${templateType}):`, errText);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[trial-expiry-cron] sendTrialEmail threw for ${toEmail} (${templateType}):`, err);
    return false;
  }
}

/**
 * Fetch the org owner email + name for a given org_id.
 */
async function getOrgOwner(
  supabase: ReturnType<typeof createClient>,
  orgId: string
): Promise<{ email: string; name: string } | null> {
  const { data: ownerData } = await supabase
    .from('organization_memberships')
    .select('user_id, profiles!inner(email, full_name)')
    .eq('org_id', orgId)
    .eq('role', 'owner')
    .limit(1)
    .maybeSingle();

  if (!ownerData) return null;
  const profile = ownerData.profiles as { email?: string; full_name?: string } | null;
  const email = profile?.email;
  if (!email) return null;
  const name = profile?.full_name || email.split('@')[0];
  return { email, name };
}

/**
 * Check if the org owner has completed activation (first summary viewed).
 * This drives the day-7 email segment split.
 */
async function isOrgOwnerActivated(
  supabase: ReturnType<typeof createClient>,
  orgId: string
): Promise<boolean> {
  // Get owner user_id
  const { data: memberData } = await supabase
    .from('organization_memberships')
    .select('user_id')
    .eq('org_id', orgId)
    .eq('role', 'owner')
    .limit(1)
    .maybeSingle();

  if (!memberData?.user_id) return false;

  const { data: progress } = await supabase
    .from('user_onboarding_progress')
    .select('first_summary_viewed')
    .eq('user_id', memberData.user_id)
    .maybeSingle();

  return progress?.first_summary_viewed === true;
}

serve(async (req) => {
  // Handle CORS preflight
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(req);

  // Auth: CRON_SECRET — fails CLOSED (if env var not set, reject all requests)
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret) {
    console.error('[trial-expiry-cron] CRON_SECRET env var not set — rejecting request (fail closed)');
    return new Response(
      JSON.stringify({ error: 'Service misconfigured' }),
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    console.warn('[trial-expiry-cron] Unauthorized request');
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const result: ExpiryResult = {
    trials_to_grace: 0,
    grace_to_deactivated: 0,
    warnings_sent: 0,
    emails_sent: 0,
    errors: [],
  };

  const now = new Date();
  console.log('[trial-expiry-cron] Starting job at', now.toISOString());

  // ============================================================
  // STEP 1: trialing → grace_period
  // Find subscriptions where status='trialing' AND trial_ends_at < now()
  // ============================================================

  console.log('[trial-expiry-cron] Step 1: Moving expired trials to grace_period');

  const { data: expiredTrials, error: trialFetchError } = await supabase
    .from('organization_subscriptions')
    .select('id, org_id, status, trial_ends_at')
    .eq('status', 'trialing')
    .lt('trial_ends_at', now.toISOString());

  if (trialFetchError) {
    const msg = `Failed to fetch expired trials: ${trialFetchError.message}`;
    console.error('[trial-expiry-cron]', msg);
    result.errors.push(msg);
  } else if (expiredTrials && expiredTrials.length > 0) {
    console.log(`[trial-expiry-cron] Found ${expiredTrials.length} expired trials`);

    const gracePeriodStarted = now.toISOString();
    const gracePeriodEnds = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

    for (const sub of expiredTrials) {
      const { error: updateError } = await supabase
        .from('organization_subscriptions')
        .update({
          status: 'grace_period',
          grace_period_started_at: gracePeriodStarted,
          grace_period_ends_at: gracePeriodEnds,
          updated_at: gracePeriodStarted,
        })
        .eq('id', sub.id);

      if (updateError) {
        const msg = `Failed to move sub ${sub.id} to grace_period: ${updateError.message}`;
        console.error('[trial-expiry-cron]', msg);
        result.errors.push(msg);
      } else {
        result.trials_to_grace++;
        console.log(`[trial-expiry-cron] Sub ${sub.id} (org ${sub.org_id}) moved to grace_period`);

        // Send trial-expired email (day 14)
        try {
          const owner = await getOrgOwner(supabase, sub.org_id);
          if (owner) {
            const alreadySent = await wasEmailAlreadySent(supabase, owner.email, 'trial_expired');
            if (!alreadySent) {
              const { data: orgData } = await supabase
                .from('organizations')
                .select('name')
                .eq('id', sub.org_id)
                .maybeSingle();
              const sent = await sendTrialEmail(owner.email, owner.name, 'trial_expired', {
                organization_name: orgData?.name ?? 'your organization',
                days_remaining: 0,
              });
              if (sent) {
                result.emails_sent++;
                console.log(`[trial-expiry-cron] trial_expired email sent to ${owner.email} (org ${sub.org_id})`);
              }
            } else {
              console.log(`[trial-expiry-cron] trial_expired already sent to ${owner.email}, skipping`);
            }
          }
        } catch (emailErr) {
          console.error(`[trial-expiry-cron] Error sending trial_expired for org ${sub.org_id}:`, emailErr);
        }
      }
    }
  } else {
    console.log('[trial-expiry-cron] No expired trials found');
  }

  // ============================================================
  // STEP 2: grace_period → deactivated
  // Find subscriptions where status='grace_period' AND grace_period_ends_at < now()
  // ============================================================

  console.log('[trial-expiry-cron] Step 2: Deactivating expired grace periods');

  const { data: expiredGrace, error: graceFetchError } = await supabase
    .from('organization_subscriptions')
    .select('id, org_id, status, grace_period_ends_at')
    .eq('status', 'grace_period')
    .lt('grace_period_ends_at', now.toISOString());

  if (graceFetchError) {
    const msg = `Failed to fetch expired grace periods: ${graceFetchError.message}`;
    console.error('[trial-expiry-cron]', msg);
    result.errors.push(msg);
  } else if (expiredGrace && expiredGrace.length > 0) {
    console.log(`[trial-expiry-cron] Found ${expiredGrace.length} expired grace periods`);

    for (const sub of expiredGrace) {
      // Update subscription to expired
      const { error: subUpdateError } = await supabase
        .from('organization_subscriptions')
        .update({
          status: 'expired',
          updated_at: now.toISOString(),
        })
        .eq('id', sub.id);

      if (subUpdateError) {
        const msg = `Failed to expire sub ${sub.id}: ${subUpdateError.message}`;
        console.error('[trial-expiry-cron]', msg);
        result.errors.push(msg);
        continue;
      }

      // Deactivate the organization
      const { error: orgUpdateError } = await supabase
        .from('organizations')
        .update({
          is_active: false,
          deactivation_reason: 'trial_expired_no_subscription',
          updated_at: now.toISOString(),
        })
        .eq('id', sub.org_id);

      if (orgUpdateError) {
        const msg = `Failed to deactivate org ${sub.org_id}: ${orgUpdateError.message}`;
        console.error('[trial-expiry-cron]', msg);
        result.errors.push(msg);
      } else {
        result.grace_to_deactivated++;
        console.log(`[trial-expiry-cron] Org ${sub.org_id} deactivated (trial_expired_no_subscription)`);
      }
    }
  } else {
    console.log('[trial-expiry-cron] No expired grace periods found');
  }

  // ============================================================
  // STEP 3: Grace period day-12 warning (≤ 2 days remaining)
  // Find orgs where status='grace_period' AND grace_period_ends_at - now() <= 2 days
  // ============================================================

  console.log('[trial-expiry-cron] Step 3: Sending grace period warning notifications');

  const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();

  const { data: warningOrgs, error: warningFetchError } = await supabase
    .from('organization_subscriptions')
    .select('id, org_id, grace_period_ends_at')
    .eq('status', 'grace_period')
    .gt('grace_period_ends_at', now.toISOString())
    .lte('grace_period_ends_at', twoDaysFromNow);

  if (warningFetchError) {
    const msg = `Failed to fetch grace period warning orgs: ${warningFetchError.message}`;
    console.error('[trial-expiry-cron]', msg);
    result.errors.push(msg);
  } else if (warningOrgs && warningOrgs.length > 0) {
    console.log(`[trial-expiry-cron] Found ${warningOrgs.length} orgs needing grace period warning`);

    for (const sub of warningOrgs) {
      try {
        // Get org owner email
        const { data: ownerData } = await supabase
          .from('organization_memberships')
          .select('user_id, profiles!inner(email)')
          .eq('org_id', sub.org_id)
          .eq('role', 'owner')
          .limit(1)
          .maybeSingle();

        const ownerEmail = (ownerData?.profiles as { email?: string } | null)?.email;
        if (!ownerEmail) {
          console.warn(`[trial-expiry-cron] No owner email for org ${sub.org_id}`);
          continue;
        }

        // Dedup: skip if already sent today
        const alreadySent = await wasEmailAlreadySent(supabase, ownerEmail, 'trial_grace_period_warning');
        if (alreadySent) {
          console.log(`[trial-expiry-cron] trial_grace_period_warning already sent to ${ownerEmail}, skipping`);
          continue;
        }

        // Get org name
        const { data: orgData } = await supabase
          .from('organizations')
          .select('name')
          .eq('id', sub.org_id)
          .maybeSingle();

        const graceEndsAt = new Date(sub.grace_period_ends_at);
        const daysRemaining = Math.ceil(
          (graceEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
        );

        const warningResponse = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/encharge-send-email`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({
              template_type: 'trial_grace_period_warning',
              to_email: ownerEmail,
              to_name: ownerEmail.split('@')[0],
              variables: {
                recipient_name: ownerEmail.split('@')[0],
                organization_name: orgData?.name ?? 'your organization',
                days_remaining: daysRemaining,
                expiry_date: graceEndsAt.toLocaleDateString(),
                subscribe_url: `${Deno.env.get('FRONTEND_URL')}/settings/billing`,
                support_email: 'support@use60.com',
              },
            }),
          }
        );

        if (warningResponse.ok) {
          result.warnings_sent++;
          console.log(`[trial-expiry-cron] Warning sent for org ${sub.org_id} (${daysRemaining} days remaining)`);
        } else {
          const errText = await warningResponse.text();
          console.error(`[trial-expiry-cron] Failed to send warning for org ${sub.org_id}:`, errText);
        }
      } catch (err) {
        const msg = `Error sending warning for org ${sub.org_id}: ${err instanceof Error ? err.message : String(err)}`;
        console.error('[trial-expiry-cron]', msg);
        result.errors.push(msg);
      }
    }
  } else {
    console.log('[trial-expiry-cron] No orgs needing grace period warning');
  }

  // ============================================================
  // STEP 4: Mid-trial sequence emails (days 7, 10, 12)
  // For each trial day milestone, find orgs currently on that exact day
  // and send the corresponding email if not already sent today.
  // ============================================================

  console.log('[trial-expiry-cron] Step 4: Sending mid-trial sequence emails');

  // For each milestone day, query orgs whose trial_ends_at falls in a window
  // that maps to "today is day X of their trial"
  const trialMilestoneDays = [7, 10, 12] as const;

  for (const milestoneDay of trialMilestoneDays) {
    // If today is day milestoneDay, then trial_ends_at is (trialLength - milestoneDay) days away.
    // Assuming 14-day trial: trial_ends_at = now + (14 - milestoneDay) days.
    // We query for orgs whose trial_ends_at is within a 24h window of that target.
    const trialLength = 14;
    const daysRemaining = trialLength - milestoneDay;
    const targetEndsAtMin = new Date(now.getTime() + daysRemaining * 24 * 60 * 60 * 1000).toISOString();
    const targetEndsAtMax = new Date(now.getTime() + (daysRemaining + 1) * 24 * 60 * 60 * 1000).toISOString();

    const { data: milestoneOrgs, error: milestoneFetchError } = await supabase
      .from('organization_subscriptions')
      .select('id, org_id, trial_ends_at')
      .eq('status', 'trialing')
      .gt('trial_ends_at', now.toISOString()) // still active
      .gte('trial_ends_at', targetEndsAtMin)
      .lt('trial_ends_at', targetEndsAtMax);

    if (milestoneFetchError) {
      const msg = `Failed to fetch day-${milestoneDay} milestone orgs: ${milestoneFetchError.message}`;
      console.error('[trial-expiry-cron]', msg);
      result.errors.push(msg);
      continue;
    }

    if (!milestoneOrgs || milestoneOrgs.length === 0) {
      console.log(`[trial-expiry-cron] No orgs at trial day ${milestoneDay}`);
      continue;
    }

    console.log(`[trial-expiry-cron] Found ${milestoneOrgs.length} orgs at trial day ${milestoneDay}`);

    for (const sub of milestoneOrgs) {
      try {
        const owner = await getOrgOwner(supabase, sub.org_id);
        if (!owner) {
          console.warn(`[trial-expiry-cron] No owner for org ${sub.org_id}, skipping day-${milestoneDay} email`);
          continue;
        }

        const { data: orgData } = await supabase
          .from('organizations')
          .select('name')
          .eq('id', sub.org_id)
          .maybeSingle();

        // Day 7 has segment split: activated vs not_activated
        if (milestoneDay === 7) {
          const isActivated = await isOrgOwnerActivated(supabase, sub.org_id);
          const templateType = isActivated ? 'trial_day_7_activated' : 'trial_day_7_not_activated';

          const alreadySent = await wasEmailAlreadySent(supabase, owner.email, templateType);
          if (alreadySent) {
            console.log(`[trial-expiry-cron] ${templateType} already sent to ${owner.email}, skipping`);
            continue;
          }

          const sent = await sendTrialEmail(owner.email, owner.name, templateType, {
            organization_name: orgData?.name ?? 'your organization',
            days_remaining: daysRemaining,
            trial_day: milestoneDay,
          });
          if (sent) {
            result.emails_sent++;
            console.log(`[trial-expiry-cron] ${templateType} sent to ${owner.email} (org ${sub.org_id})`);
          }
        } else {
          // Days 10 and 12: single template for all users
          const templateMap: Record<number, string> = { 10: 'trial_day_10', 12: 'trial_day_12' };
          const templateType = templateMap[milestoneDay];

          const alreadySent = await wasEmailAlreadySent(supabase, owner.email, templateType);
          if (alreadySent) {
            console.log(`[trial-expiry-cron] ${templateType} already sent to ${owner.email}, skipping`);
            continue;
          }

          const sent = await sendTrialEmail(owner.email, owner.name, templateType, {
            organization_name: orgData?.name ?? 'your organization',
            days_remaining: daysRemaining,
            trial_day: milestoneDay,
          });
          if (sent) {
            result.emails_sent++;
            console.log(`[trial-expiry-cron] ${templateType} sent to ${owner.email} (org ${sub.org_id})`);
          }
        }
      } catch (err) {
        const msg = `Error sending day-${milestoneDay} email for org ${sub.org_id}: ${err instanceof Error ? err.message : String(err)}`;
        console.error('[trial-expiry-cron]', msg);
        result.errors.push(msg);
      }
    }
  }

  // ============================================================
  // STEP 5: Grace period day-5 win-back email (day 19 overall)
  // Find orgs in grace_period where grace_period_started_at was 5 days ago
  // ============================================================

  console.log('[trial-expiry-cron] Step 5: Sending grace period day-5 win-back emails');

  // grace_period_started_at is approximately 5 days ago (within a 24h window)
  const graceDayFiveMin = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString();
  const graceDayFiveMax = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();

  const { data: graceDay5Orgs, error: graceDay5FetchError } = await supabase
    .from('organization_subscriptions')
    .select('id, org_id, grace_period_started_at, grace_period_ends_at')
    .eq('status', 'grace_period')
    .gte('grace_period_started_at', graceDayFiveMin)
    .lt('grace_period_started_at', graceDayFiveMax);

  if (graceDay5FetchError) {
    const msg = `Failed to fetch grace day-5 orgs: ${graceDay5FetchError.message}`;
    console.error('[trial-expiry-cron]', msg);
    result.errors.push(msg);
  } else if (graceDay5Orgs && graceDay5Orgs.length > 0) {
    console.log(`[trial-expiry-cron] Found ${graceDay5Orgs.length} orgs at grace day 5`);

    for (const sub of graceDay5Orgs) {
      try {
        const owner = await getOrgOwner(supabase, sub.org_id);
        if (!owner) {
          console.warn(`[trial-expiry-cron] No owner for org ${sub.org_id}, skipping grace-day-5 email`);
          continue;
        }

        const alreadySent = await wasEmailAlreadySent(supabase, owner.email, 'trial_grace_day_5');
        if (alreadySent) {
          console.log(`[trial-expiry-cron] trial_grace_day_5 already sent to ${owner.email}, skipping`);
          continue;
        }

        const { data: orgData } = await supabase
          .from('organizations')
          .select('name')
          .eq('id', sub.org_id)
          .maybeSingle();

        const graceEndsAt = new Date(sub.grace_period_ends_at);
        const daysUntilDeactivation = Math.ceil(
          (graceEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
        );

        const sent = await sendTrialEmail(owner.email, owner.name, 'trial_grace_day_5', {
          organization_name: orgData?.name ?? 'your organization',
          days_remaining: daysUntilDeactivation,
          expiry_date: graceEndsAt.toLocaleDateString(),
        });
        if (sent) {
          result.emails_sent++;
          console.log(`[trial-expiry-cron] trial_grace_day_5 sent to ${owner.email} (org ${sub.org_id})`);
        }
      } catch (err) {
        const msg = `Error sending grace-day-5 email for org ${sub.org_id}: ${err instanceof Error ? err.message : String(err)}`;
        console.error('[trial-expiry-cron]', msg);
        result.errors.push(msg);
      }
    }
  } else {
    console.log('[trial-expiry-cron] No orgs at grace day 5');
  }

  console.log('[trial-expiry-cron] Job complete:', result);

  return new Response(
    JSON.stringify({ success: true, ...result }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
