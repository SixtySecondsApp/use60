import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders } from '../_shared/corsHelper.ts';

// Reply classification categories
type ReplyCategory = 'interested' | 'not_interested' | 'out_of_office' | 'unsubscribe' | 'forwarded' | 'question';

interface CampaignMetrics {
  campaign_id: string;
  campaign_name: string;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  open_rate: number;
  click_rate: number;
  reply_rate: number;
  bounce_rate: number;
}

interface ClassifiedReply {
  contact_name: string;
  contact_email: string;
  subject: string;
  category: ReplyCategory;
  confidence: number;
  summary: string;
  suggested_action: string;
}

interface MonitorCampaignsRequest {
  org_id: string;
  user_id: string;
  campaign_id?: string;
  time_range?: string; // e.g. '24h', '7d', '30d'
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  try {
    const { org_id, user_id, campaign_id, time_range = '24h' } = await req.json() as MonitorCampaignsRequest;

    // 1. Pull Instantly API key — check instantly_org_credentials first, then integration_credentials (legacy)
    const { data: instantlyCreds } = await supabase
      .from('instantly_org_credentials')
      .select('api_key')
      .eq('org_id', org_id)
      .maybeSingle();

    let instantlyApiKey = instantlyCreds?.api_key || null;

    if (!instantlyApiKey) {
      const { data: legacyCreds } = await supabase
        .from('integration_credentials')
        .select('credentials')
        .eq('organization_id', org_id)
        .eq('provider', 'instantly')
        .maybeSingle();

      instantlyApiKey = (legacyCreds?.credentials as Record<string, string>)?.api_key || null;
    }

    if (!instantlyApiKey) {
      return new Response(JSON.stringify({ error: 'Instantly API not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Fetch campaign analytics from Instantly
    const metricsUrl = campaign_id
      ? `https://api.instantly.ai/api/v1/campaign/analytics?api_key=${instantlyApiKey}&campaign_id=${campaign_id}`
      : `https://api.instantly.ai/api/v1/campaigns?api_key=${instantlyApiKey}`;

    const metricsResponse = await fetch(metricsUrl);
    const metrics = await metricsResponse.json();

    // 3. Fetch recent replies
    const repliesUrl = campaign_id
      ? `https://api.instantly.ai/api/v1/campaign/replies?api_key=${instantlyApiKey}&campaign_id=${campaign_id}&limit=50`
      : `https://api.instantly.ai/api/v1/replies?api_key=${instantlyApiKey}&limit=50`;

    const repliesResponse = await fetch(repliesUrl);
    const replies = await repliesResponse.json();

    // 4. Classify replies using AI
    const classifiedReplies = await classifyReplies(replies, org_id);

    // 5. Generate recommendations
    const recommendations = generateRecommendations(metrics, classifiedReplies);

    return new Response(JSON.stringify({
      metrics,
      classified_replies: classifiedReplies,
      recommendations,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[monitor-campaigns] Error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

/**
 * Classify email replies using Claude Haiku
 */
async function classifyReplies(replies: any[], orgId: string): Promise<ClassifiedReply[]> {
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey || !replies.length) {
    return [];
  }

  const prompt = `Classify these email replies into categories: interested, not_interested, out_of_office, unsubscribe, forwarded, question.
For each reply, return: { "category": "...", "confidence": 0.0-1.0, "summary": "brief summary", "suggested_action": "what the rep should do" }

Replies:
${replies.map((r: any, i: number) => `${i + 1}. From: ${r.from_email || r.email || 'Unknown'}
Subject: ${r.subject || 'No subject'}
Body: ${r.body?.substring(0, 500) || r.message?.substring(0, 500) || 'No content'}`).join('\n\n')}

Return a JSON array of classifications.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const aiResult = await response.json();
    const text = aiResult.content?.[0]?.text || '[]';

    // Extract JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const classifications = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    // Merge classifications with original reply data
    return replies.map((reply, i) => ({
      contact_name: reply.name || reply.from_name || 'Unknown',
      contact_email: reply.email || reply.from_email || 'Unknown',
      subject: reply.subject || 'No subject',
      category: classifications[i]?.category || 'question',
      confidence: classifications[i]?.confidence || 0.5,
      summary: classifications[i]?.summary || 'Reply received',
      suggested_action: classifications[i]?.suggested_action || 'Review and respond',
    }));
  } catch (err) {
    console.error('[monitor-campaigns] AI classification failed:', err);
    // Return default classifications
    return replies.map(reply => ({
      contact_name: reply.name || reply.from_name || 'Unknown',
      contact_email: reply.email || reply.from_email || 'Unknown',
      subject: reply.subject || 'No subject',
      category: 'question' as ReplyCategory,
      confidence: 0.5,
      summary: 'Classification failed',
      suggested_action: 'Review manually',
    }));
  }
}

/**
 * Generate optimization recommendations based on metrics and replies
 */
function generateRecommendations(metrics: any, replies: ClassifiedReply[]): string[] {
  const recommendations: string[] = [];

  // Extract metrics (handle both single campaign and multi-campaign response)
  const campaignMetrics = Array.isArray(metrics) ? metrics[0] : metrics;
  const openRate = campaignMetrics?.open_rate || campaignMetrics?.opens_rate || 0;
  const replyRate = campaignMetrics?.reply_rate || campaignMetrics?.replies_rate || 0;
  const bounceRate = campaignMetrics?.bounce_rate || campaignMetrics?.bounces_rate || 0;

  // Open rate recommendations
  if (openRate < 20) {
    recommendations.push('Open rate is below 20%. Consider testing new subject lines.');
  } else if (openRate > 40) {
    recommendations.push('Strong open rate! Subject lines are working well.');
  }

  // Reply rate recommendations
  if (replyRate < 2) {
    recommendations.push('Reply rate is below 2%. Consider personalizing the email body.');
  }

  // Bounce rate warnings
  if (bounceRate > 5) {
    recommendations.push('CRITICAL: Bounce rate is above 5%. Pause campaign and clean email list to protect domain reputation.');
  } else if (bounceRate > 2) {
    recommendations.push('WARNING: Bounce rate is above 2%. Review email list quality.');
  }

  // Reply analysis
  const interested = replies.filter(r => r.category === 'interested').length;
  const notInterested = replies.filter(r => r.category === 'not_interested').length;
  const questions = replies.filter(r => r.category === 'question').length;

  if (interested > 0) {
    recommendations.push(`${interested} interested replies need immediate follow-up.`);
  }

  if (questions > 0) {
    recommendations.push(`${questions} questions to answer - respond within 4 hours for best conversion.`);
  }

  if (notInterested > interested && replies.length > 10) {
    recommendations.push('Negative replies outnumber positive ones. Consider refining targeting or messaging.');
  }

  // Positive signals
  if (replies.length > 0) {
    const positiveReplyRate = (interested / replies.length) * 100;
    if (positiveReplyRate > 25) {
      recommendations.push(`Excellent reply quality: ${positiveReplyRate.toFixed(0)}% of replies are positive. This audience is well-targeted.`);
    }
  }

  return recommendations.length > 0 ? recommendations : ['No specific recommendations at this time. Continue monitoring.'];
}
