/**
 * API Usage Alerts Edge Function
 *
 * Checks usage against plan limits and sends Slack alerts
 * when thresholds are crossed (80%, 90%, 100%).
 *
 * Uses api_usage_alerts table to track sent alerts and
 * prevent duplicate notifications.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Alert thresholds
const THRESHOLDS = [80, 90, 100];

interface UsageSnapshot {
  provider: string;
  metric_name: string;
  metric_value: number;
  metric_unit: string;
  plan_limit: number | null;
  fetched_at: string;
}

interface AlertResult {
  provider: string;
  metric: string;
  threshold: number;
  sent: boolean;
  message?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Slack webhook - use platform alerts or fallback to existing
    const slackWebhook =
      Deno.env.get('PLATFORM_ALERTS_SLACK_WEBHOOK') ||
      Deno.env.get('SLACK_WEBHOOK_URL') ||
      Deno.env.get('SLACK_ALERTS_WEBHOOK');

    console.log('[api-usage-alerts] Checking usage thresholds...');

    // Get latest snapshot for each provider/metric combination
    const { data: snapshots, error: fetchError } = await supabase
      .from('api_usage_snapshots')
      .select('provider, metric_name, metric_value, metric_unit, plan_limit, fetched_at')
      .not('plan_limit', 'is', null)
      .order('fetched_at', { ascending: false });

    if (fetchError) {
      console.error('[api-usage-alerts] Error fetching snapshots:', fetchError);
      throw fetchError;
    }

    // Deduplicate to get latest per provider/metric
    const latestSnapshots = new Map<string, UsageSnapshot>();
    for (const snapshot of snapshots || []) {
      const key = `${snapshot.provider}:${snapshot.metric_name}`;
      if (!latestSnapshots.has(key)) {
        latestSnapshots.set(key, snapshot);
      }
    }

    console.log(`[api-usage-alerts] Found ${latestSnapshots.size} metrics with limits`);

    const alertResults: AlertResult[] = [];
    const today = new Date().toISOString().split('T')[0];

    // Check each metric against thresholds
    for (const [key, snapshot] of latestSnapshots) {
      if (!snapshot.plan_limit || snapshot.plan_limit <= 0) continue;

      const usagePercent = (snapshot.metric_value / snapshot.plan_limit) * 100;
      console.log(
        `[api-usage-alerts] ${snapshot.provider}/${snapshot.metric_name}: ${snapshot.metric_value}/${snapshot.plan_limit} (${usagePercent.toFixed(1)}%)`
      );

      // Check each threshold
      for (const threshold of THRESHOLDS) {
        if (usagePercent >= threshold) {
          // Check if we already sent this alert today
          const { data: existingAlert } = await supabase
            .from('api_usage_alerts')
            .select('id')
            .eq('provider', snapshot.provider)
            .eq('metric_name', snapshot.metric_name)
            .eq('threshold_percent', threshold)
            .eq('alert_date', today)
            .maybeSingle();

          if (existingAlert) {
            console.log(`[api-usage-alerts] Already sent ${threshold}% alert for ${key} today`);
            alertResults.push({
              provider: snapshot.provider,
              metric: snapshot.metric_name,
              threshold,
              sent: false,
              message: 'Already sent today',
            });
            continue;
          }

          // Send Slack alert
          const alertMessage = formatAlertMessage(snapshot, threshold, usagePercent);

          if (slackWebhook) {
            try {
              const slackResponse = await fetch(slackWebhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  text: alertMessage,
                  blocks: [
                    {
                      type: 'header',
                      text: {
                        type: 'plain_text',
                        text: `⚠️ API Usage Alert: ${threshold}% Threshold`,
                        emoji: true,
                      },
                    },
                    {
                      type: 'section',
                      fields: [
                        {
                          type: 'mrkdwn',
                          text: `*Provider:*\n${formatProviderName(snapshot.provider)}`,
                        },
                        {
                          type: 'mrkdwn',
                          text: `*Metric:*\n${formatMetricName(snapshot.metric_name)}`,
                        },
                        {
                          type: 'mrkdwn',
                          text: `*Usage:*\n${snapshot.metric_value} ${snapshot.metric_unit}`,
                        },
                        {
                          type: 'mrkdwn',
                          text: `*Limit:*\n${snapshot.plan_limit} ${snapshot.metric_unit}`,
                        },
                      ],
                    },
                    {
                      type: 'context',
                      elements: [
                        {
                          type: 'mrkdwn',
                          text: `📊 *${usagePercent.toFixed(1)}%* of limit used | Check usage dashboard for details`,
                        },
                      ],
                    },
                  ],
                }),
              });

              if (!slackResponse.ok) {
                console.error('[api-usage-alerts] Slack send failed:', await slackResponse.text());
              } else {
                console.log(`[api-usage-alerts] Sent Slack alert for ${key} at ${threshold}%`);
              }
            } catch (slackError) {
              console.error('[api-usage-alerts] Slack error:', slackError);
            }
          } else {
            console.log('[api-usage-alerts] No Slack webhook configured, skipping notification');
          }

          // Record that we sent this alert
          const { error: insertError } = await supabase.from('api_usage_alerts').insert({
            provider: snapshot.provider,
            metric_name: snapshot.metric_name,
            threshold_percent: threshold,
            alert_date: today,
            alert_message: alertMessage,
          });

          if (insertError) {
            console.error('[api-usage-alerts] Error recording alert:', insertError);
          }

          alertResults.push({
            provider: snapshot.provider,
            metric: snapshot.metric_name,
            threshold,
            sent: true,
            message: alertMessage,
          });
        }
      }
    }

    const alertsSent = alertResults.filter((r) => r.sent).length;
    console.log(`[api-usage-alerts] Completed: ${alertsSent} alerts sent`);

    return new Response(
      JSON.stringify({
        success: true,
        metrics_checked: latestSnapshots.size,
        alerts_sent: alertsSent,
        results: alertResults,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[api-usage-alerts] Error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function formatProviderName(provider: string): string {
  const names: Record<string, string> = {
    meetingbaas: 'MeetingBaaS',
    gladia: 'Gladia',
    deepgram: 'Deepgram',
  };
  return names[provider] || provider;
}

function formatMetricName(metric: string): string {
  return metric
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatAlertMessage(snapshot: UsageSnapshot, threshold: number, usagePercent: number): string {
  const providerName = formatProviderName(snapshot.provider);
  const metricName = formatMetricName(snapshot.metric_name);

  return `🚨 ${providerName} ${metricName} has reached ${threshold}% of limit (${usagePercent.toFixed(1)}% used: ${snapshot.metric_value}/${snapshot.plan_limit} ${snapshot.metric_unit})`;
}
