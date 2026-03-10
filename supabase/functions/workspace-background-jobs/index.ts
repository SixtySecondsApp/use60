// supabase/functions/workspace-background-jobs/index.ts
// WS-013/014/015/016: Background Job Dispatcher
//
// Central entry point for all workspace background jobs.
// Called by pg_cron via pg_net on schedule.
//
// Job types: token_refresh, email_sync, email_classify, reply_gap,
//            calendar_watch, ratio_calc, doc_link, attendee_enrich

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';
import { getUserTier, canAccess, getSyncConfig, type GatedFeature, type UserTier } from '../_shared/tierGating.ts';
import { getValidToken } from '../_shared/tokenManager.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const BATCH_SIZE = 50;

type JobType =
  | 'token_refresh'
  | 'email_sync'
  | 'email_classify'
  | 'reply_gap'
  | 'calendar_watch'
  | 'ratio_calc'
  | 'doc_link'
  | 'attendee_enrich';

/** Map job types to their required feature gate */
const JOB_FEATURE_GATE: Record<JobType, GatedFeature | null> = {
  token_refresh: null,          // Always runs
  email_sync: 'email_sync',
  email_classify: 'email_classification',
  reply_gap: 'reply_gap',
  calendar_watch: null,         // Always runs
  ratio_calc: 'ratio_tracking',
  doc_link: 'doc_linking',
  attendee_enrich: 'attendee_enrich',
};

/** Jobs that run regardless of working hours */
const ALWAYS_RUN_JOBS: JobType[] = ['token_refresh', 'calendar_watch'];

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const { job_type, user_id } = await req.json();

    if (!job_type) {
      return errorResponse('job_type is required', 400, corsHeaders);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // If targeting a specific user
    if (user_id) {
      const result = await processUser(supabase, job_type, user_id);
      return jsonResponse(result, corsHeaders);
    }

    // Batch process all eligible users
    const results = await processBatch(supabase, job_type);
    return jsonResponse(results, corsHeaders);
  } catch (error) {
    console.error('[workspace-background-jobs] Error:', error);
    return errorResponse((error as Error).message, 500, corsHeaders);
  }
});

async function processBatch(
  supabase: ReturnType<typeof createClient>,
  jobType: JobType
): Promise<{ processed: number; skipped: number; errors: number }> {
  // Get users with active integrations
  const providers = ['google', 'microsoft'];
  const userIds = new Set<string>();

  for (const provider of providers) {
    const table = provider === 'google' ? 'google_integrations' : 'microsoft_integrations';
    const { data } = await supabase
      .from(table)
      .select('user_id')
      .eq('is_active', true)
      .eq('token_status', 'valid')
      .limit(BATCH_SIZE);

    if (data) {
      data.forEach((row: { user_id: string }) => userIds.add(row.user_id));
    }
  }

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const userId of userIds) {
    try {
      const result = await processUser(supabase, jobType, userId);
      if (result.status === 'skipped') {
        skipped++;
      } else {
        processed++;
      }
    } catch (err) {
      errors++;
      await logJob(supabase, jobType, userId, 'error', (err as Error).message);
    }
  }

  return { processed, skipped, errors };
}

async function processUser(
  supabase: ReturnType<typeof createClient>,
  jobType: JobType,
  userId: string
): Promise<{ status: string; message: string }> {
  // Check working hours (unless always-run job)
  if (!ALWAYS_RUN_JOBS.includes(jobType)) {
    const inWorkingHours = await isInWorkingHours(supabase, userId);
    if (!inWorkingHours) {
      return { status: 'skipped', message: 'Outside working hours' };
    }
  }

  // Check feature gate
  const requiredFeature = JOB_FEATURE_GATE[jobType];
  if (requiredFeature) {
    const hasAccess = await canAccess(userId, requiredFeature, supabase);
    if (!hasAccess) {
      return { status: 'skipped', message: `Feature ${requiredFeature} not available on user tier` };
    }
  }

  // Log job start
  const logId = await logJob(supabase, jobType, userId, 'running');

  try {
    // Dispatch to job handler
    const result = await dispatchJob(supabase, jobType, userId);

    // Log success
    await updateJobLog(supabase, logId, 'success', result);

    return { status: 'success', message: `${jobType} completed for user ${userId}` };
  } catch (err) {
    await updateJobLog(supabase, logId, 'error', undefined, (err as Error).message);
    throw err;
  }
}

async function dispatchJob(
  supabase: ReturnType<typeof createClient>,
  jobType: JobType,
  userId: string
): Promise<Record<string, unknown> | undefined> {
  switch (jobType) {
    case 'token_refresh':
      return handleTokenRefresh(supabase, userId);
    case 'email_sync':
      return handleEmailSync(supabase, userId);
    case 'email_classify':
      return handleEmailClassify(supabase, userId);
    case 'reply_gap':
      return handleReplyGap(supabase, userId);
    case 'calendar_watch':
      return handleCalendarWatch(supabase, userId);
    case 'ratio_calc':
      return handleRatioCalc(supabase, userId);
    case 'doc_link':
      return handleDocLink(supabase, userId);
    case 'attendee_enrich':
      return handleAttendeeEnrich(supabase, userId);
    default:
      throw new Error(`Unknown job type: ${jobType}`);
  }
}

// ---------------------------------------------------------------------------
// Job Handlers (WS-015, WS-016, WS-017+)
// ---------------------------------------------------------------------------

/** WS-015: Proactive Token Refresh */
async function handleTokenRefresh(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<Record<string, unknown>> {
  const results: Record<string, string> = {};

  // Refresh Google token if connected
  try {
    const { data: google } = await supabase
      .from('google_integrations')
      .select('id, expires_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (google) {
      const expiresAt = new Date(google.expires_at);
      if (expiresAt.getTime() - Date.now() < 30 * 60 * 1000) {
        await getValidToken('google', userId, supabase);
        results.google = 'refreshed';
      } else {
        results.google = 'valid';
      }
    }
  } catch (err) {
    results.google = `error: ${(err as Error).message}`;
    // Mark as needs_reconnect if revoked
    if ((err as Error).message.includes('revoked') || (err as Error).message.includes('invalid_grant')) {
      await supabase
        .from('google_integrations')
        .update({ token_status: 'needs_reconnect' })
        .eq('user_id', userId);
    }
  }

  // Refresh Microsoft token if connected
  try {
    const { data: microsoft } = await supabase
      .from('microsoft_integrations')
      .select('id, expires_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (microsoft) {
      const expiresAt = new Date(microsoft.expires_at);
      if (expiresAt.getTime() - Date.now() < 30 * 60 * 1000) {
        await getValidToken('microsoft', userId, supabase);
        results.microsoft = 'refreshed';
      } else {
        results.microsoft = 'valid';
      }
    }
  } catch (err) {
    results.microsoft = `error: ${(err as Error).message}`;
  }

  return results;
}

/** WS-016: Calendar Watch Auto-Renewal */
async function handleCalendarWatch(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<Record<string, unknown>> {
  // Find watches expiring within 48 hours
  const cutoff = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  const { data: watches } = await supabase
    .from('calendar_watches')
    .select('id, provider, resource_id, channel_id')
    .eq('user_id', userId)
    .lt('expiration', cutoff);

  if (!watches || watches.length === 0) {
    return { renewed: 0 };
  }

  let renewed = 0;
  for (const watch of watches) {
    try {
      if (watch.provider === 'google') {
        const { accessToken } = await getValidToken('google', userId, supabase);
        // Renew Google Calendar watch
        const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/watch', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: crypto.randomUUID(),
            type: 'web_hook',
            address: `${SUPABASE_URL}/functions/v1/google-calendar-webhook`,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          await supabase
            .from('calendar_watches')
            .update({
              channel_id: data.id,
              resource_id: data.resourceId,
              expiration: new Date(Number(data.expiration)).toISOString(),
            })
            .eq('id', watch.id);
          renewed++;
        }
      } else if (watch.provider === 'microsoft') {
        const { accessToken } = await getValidToken('microsoft', userId, supabase);
        // Renew Microsoft Calendar subscription
        const res = await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${watch.channel_id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expirationDateTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          }),
        });
        if (res.ok) {
          const data = await res.json();
          await supabase
            .from('calendar_watches')
            .update({ expiration: data.expirationDateTime })
            .eq('id', watch.id);
          renewed++;
        }
      }
    } catch (err) {
      console.error(`[calendar-watch] Failed to renew watch ${watch.id}:`, err);
    }
  }

  return { renewed, total: watches.length };
}

/** WS-017: Email Sync (stub — calls into email sync logic) */
async function handleEmailSync(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<Record<string, unknown> | undefined> {
  // Invoke the dedicated email sync function
  const { data, error } = await supabase.functions.invoke('scheduled-email-sync', {
    body: { user_id: userId, source: 'workspace-background-jobs' },
  });
  if (error) throw error;
  return data as Record<string, unknown>;
}

/** WS-018: Email Classify (stub — calls email-classify) */
async function handleEmailClassify(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<Record<string, unknown> | undefined> {
  // Get unclassified emails
  const { data: emails } = await supabase
    .from('email_messages')
    .select('id, message_id, subject, snippet, from_email')
    .eq('user_id', userId)
    .is('classification', null)
    .order('received_at', { ascending: false })
    .limit(20);

  if (!emails || emails.length === 0) return { classified: 0 };

  let classified = 0;
  for (const email of emails) {
    try {
      const { data } = await supabase.functions.invoke('categorize-email', {
        body: {
          messageId: email.message_id,
          subject: email.subject || '',
          body: email.snippet || '',
          from: email.from_email || '',
          direction: 'inbound',
          userId,
        },
      });
      if (data?.category) {
        await supabase
          .from('email_messages')
          .update({ classification: data })
          .eq('id', email.id);
        classified++;
      }
    } catch (err) {
      console.error(`[email-classify] Failed for ${email.id}:`, err);
    }
  }

  return { classified, total: emails.length };
}

/** WS-019: Reply Gap Detection */
async function handleReplyGap(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<Record<string, unknown>> {
  // Get user's email
  const { data: googleInt } = await supabase
    .from('google_integrations')
    .select('email')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  const { data: msInt } = await supabase
    .from('microsoft_integrations')
    .select('email')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  const userEmails = [googleInt?.email, msInt?.email].filter(Boolean) as string[];
  if (userEmails.length === 0) return { gaps: 0 };

  // Find sent emails without replies in thread
  const { data: sentEmails } = await supabase
    .from('email_messages')
    .select('id, thread_id, provider, from_email, to_emails, received_at')
    .eq('user_id', userId)
    .in('from_email', userEmails)
    .gte('received_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order('received_at', { ascending: false })
    .limit(100);

  if (!sentEmails || sentEmails.length === 0) return { gaps: 0 };

  const syncConfig = await getSyncConfig(userId, supabase);
  let newGaps = 0;

  for (const sent of sentEmails) {
    // Check if reply exists in same thread from someone else
    const { data: replies } = await supabase
      .from('email_messages')
      .select('id')
      .eq('user_id', userId)
      .eq('thread_id', sent.thread_id)
      .not('from_email', 'in', `(${userEmails.join(',')})`)
      .gt('received_at', sent.received_at)
      .limit(1);

    if (!replies || replies.length === 0) {
      const gapHours = Math.floor((Date.now() - new Date(sent.received_at).getTime()) / (1000 * 60 * 60));
      const contactEmail = (sent.to_emails || [])[0] || '';

      // Determine urgency
      let urgency: 'low' | 'medium' | 'high' = 'low';
      if (gapHours >= 48 && gapHours < 72) urgency = 'medium';
      if (gapHours >= 72) urgency = 'high';

      // Upsert gap
      await supabase
        .from('reply_gaps')
        .upsert(
          {
            user_id: userId,
            provider: sent.provider,
            thread_id: sent.thread_id,
            contact_email: contactEmail,
            sent_at: sent.received_at,
            gap_hours: gapHours,
            urgency,
            resolved: false,
          },
          { onConflict: 'user_id,thread_id' }
        );
      newGaps++;
    } else {
      // Reply found — resolve any existing gap
      await supabase
        .from('reply_gaps')
        .update({ resolved: true })
        .eq('user_id', userId)
        .eq('thread_id', sent.thread_id);
    }
  }

  return { gaps: newGaps, checked: sentEmails.length };
}

/** WS-020: Ratio Calc */
async function handleRatioCalc(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<Record<string, unknown>> {
  const { data: googleInt } = await supabase
    .from('google_integrations')
    .select('email')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  const userEmail = googleInt?.email;
  if (!userEmail) return { contacts: 0 };

  // Get unique contact emails from email_messages
  const { data: contacts } = await supabase.rpc('get_email_contact_stats', {
    p_user_id: userId,
    p_user_email: userEmail,
  });

  // If RPC doesn't exist yet, do it inline
  if (!contacts) {
    // Fallback: count sent/received per contact
    const { data: sent } = await supabase
      .from('email_messages')
      .select('to_emails')
      .eq('user_id', userId)
      .eq('from_email', userEmail)
      .limit(500);

    // Simple rollup
    return { contacts: sent?.length || 0, note: 'RPC not yet created, skipped detailed calc' };
  }

  return { contacts: contacts.length };
}

/** WS-024: Doc Link (stub) */
async function handleDocLink(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<Record<string, unknown>> {
  // Scan recent Drive/OneDrive activity and link to deals
  // Full implementation in WS-024 story
  return { linked: 0, note: 'doc_link job placeholder' };
}

/** WS-021: Attendee Enrich (stub) */
async function handleAttendeeEnrich(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<Record<string, unknown>> {
  // Full implementation in WS-021/022 stories
  return { enriched: 0, note: 'attendee_enrich job placeholder' };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function isInWorkingHours(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<boolean> {
  const { data: settings } = await supabase
    .from('user_settings')
    .select('preferences')
    .eq('user_id', userId)
    .maybeSingle();

  const prefs = settings?.preferences as Record<string, unknown> | undefined;
  const workStart = (prefs?.work_hours_start as number) ?? 8;
  const workEnd = (prefs?.work_hours_end as number) ?? 18;
  const tz = (prefs?.timezone as string) || 'UTC';

  // Get current hour in user's timezone
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz });
  const currentHour = parseInt(formatter.format(now), 10);

  return currentHour >= workStart && currentHour < workEnd;
}

async function logJob(
  supabase: ReturnType<typeof createClient>,
  jobType: string,
  userId: string,
  status: string,
  error?: string
): Promise<string> {
  const { data } = await supabase
    .from('background_job_logs')
    .insert({
      job_type: jobType,
      user_id: userId,
      status,
      error,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  return data?.id || '';
}

async function updateJobLog(
  supabase: ReturnType<typeof createClient>,
  logId: string,
  status: string,
  metadata?: Record<string, unknown>,
  error?: string
): Promise<void> {
  if (!logId) return;
  await supabase
    .from('background_job_logs')
    .update({
      status,
      completed_at: new Date().toISOString(),
      metadata: metadata || undefined,
      error: error || undefined,
    })
    .eq('id', logId);
}
