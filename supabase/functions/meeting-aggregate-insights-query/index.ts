/**
 * Meeting Aggregate Insights Query Edge Function
 *
 * Answers aggregate questions about meetings across the organization:
 * - "How many calls this month want to move forward?"
 * - "Show me calls where competitors were mentioned"
 * - "What % of calls mentioned pricing?"
 *
 * Supports:
 * - Natural language queries (parsed by Claude)
 * - Structured filter queries
 * - Multiple response formats (JSON, Markdown, Slack)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { captureException } from '../_shared/sentryEdge.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');

interface AggregateInsightsFilter {
  has_forward_movement?: boolean;
  has_proposal_request?: boolean;
  has_pricing_discussion?: boolean;
  has_competitor_mention?: boolean;
  has_objection?: boolean;
  has_demo_request?: boolean;
  has_timeline_discussion?: boolean;
  has_budget_discussion?: boolean;
  has_decision_maker?: boolean;
  has_next_steps?: boolean;
  outcome?: 'positive' | 'negative' | 'neutral';
  detected_stage?: string;
  date_from?: string;
  date_to?: string;
  owner_user_id?: string;
}

interface RequestBody {
  query_type: 'count' | 'list' | 'stats' | 'natural_language';
  filter?: AggregateInsightsFilter;
  natural_query?: string;
  response_format?: 'json' | 'markdown' | 'slack';
  limit?: number;
  org_id?: string;
  user_id?: string;
}

interface ParsedQuery {
  filter: AggregateInsightsFilter;
  query_type: 'count' | 'list' | 'stats';
  description: string;
}

const QUERY_PARSE_PROMPT = `You are a query parser for a sales meeting intelligence system. Parse the user's natural language query into a structured filter.

Available filter fields:
- has_forward_movement: boolean - meetings where prospect indicated willingness to proceed
- has_proposal_request: boolean - meetings where a proposal was requested
- has_pricing_discussion: boolean - meetings where pricing was discussed
- has_competitor_mention: boolean - meetings where competitors were mentioned
- has_objection: boolean - meetings where objections were raised
- has_demo_request: boolean - meetings where a demo was requested
- has_timeline_discussion: boolean - meetings where timeline was discussed
- has_budget_discussion: boolean - meetings where budget was discussed
- has_decision_maker: boolean - meetings with a decision maker present
- has_next_steps: boolean - meetings where next steps were established
- outcome: 'positive' | 'negative' | 'neutral' - overall meeting outcome
- detected_stage: 'discovery' | 'demo' | 'negotiation' | 'closing' | 'follow_up' | 'general'
- date_from: ISO date string for start of date range
- date_to: ISO date string for end of date range

Query type:
- count: Just return counts/statistics
- list: Return a list of matching meetings
- stats: Return detailed statistics breakdown

USER QUERY: {query}

TODAY'S DATE: {today}

Return a JSON object with:
{
  "filter": { ... applicable filters ... },
  "query_type": "count" | "list" | "stats",
  "description": "Brief description of what was parsed"
}

Examples:
- "How many calls this month want to move forward?" → { "filter": { "has_forward_movement": true, "date_from": "2024-01-01", "date_to": "2024-01-31" }, "query_type": "count", "description": "Calls this month with forward movement" }
- "Show me calls where competitors were mentioned" → { "filter": { "has_competitor_mention": true }, "query_type": "list", "description": "Calls mentioning competitors" }
- "What percentage of discovery calls had objections?" → { "filter": { "detected_stage": "discovery", "has_objection": true }, "query_type": "stats", "description": "Discovery calls with objections" }

Return ONLY valid JSON, no additional text.`;

/**
 * Parse natural language query using Claude
 */
async function parseNaturalQuery(query: string): Promise<ParsedQuery> {
  if (!anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const today = new Date().toISOString().split('T')[0];
  const prompt = QUERY_PARSE_PROMPT
    .replace('{query}', query)
    .replace('{today}', today);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 500,
      temperature: 0,
      system: 'You are a query parser. Return only valid JSON.',
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const content = result.content[0]?.text;

  try {
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.slice(7);
    } else if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.slice(3);
    }
    if (jsonContent.endsWith('```')) {
      jsonContent = jsonContent.slice(0, -3);
    }
    return JSON.parse(jsonContent.trim());
  } catch (parseError) {
    console.error('Failed to parse Claude response:', content);
    // Return a default filter that gets all meetings
    return {
      filter: {},
      query_type: 'count',
      description: 'All meetings (query parsing failed)',
    };
  }
}

/**
 * Build Supabase query from filter
 */
function buildFilteredQuery(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  filter: AggregateInsightsFilter
) {
  let query = supabase
    .from('meeting_classifications')
    .select(`
      id,
      meeting_id,
      has_forward_movement,
      has_proposal_request,
      has_pricing_discussion,
      has_competitor_mention,
      has_objection,
      has_demo_request,
      has_timeline_discussion,
      has_budget_discussion,
      has_decision_maker,
      has_next_steps,
      outcome,
      detected_stage,
      topics,
      objections,
      competitors,
      keywords,
      objection_count,
      competitor_mention_count,
      positive_signal_count,
      negative_signal_count,
      created_at,
      updated_at
    `)
    .eq('org_id', orgId);

  // Apply boolean filters
  if (filter.has_forward_movement !== undefined) {
    query = query.eq('has_forward_movement', filter.has_forward_movement);
  }
  if (filter.has_proposal_request !== undefined) {
    query = query.eq('has_proposal_request', filter.has_proposal_request);
  }
  if (filter.has_pricing_discussion !== undefined) {
    query = query.eq('has_pricing_discussion', filter.has_pricing_discussion);
  }
  if (filter.has_competitor_mention !== undefined) {
    query = query.eq('has_competitor_mention', filter.has_competitor_mention);
  }
  if (filter.has_objection !== undefined) {
    query = query.eq('has_objection', filter.has_objection);
  }
  if (filter.has_demo_request !== undefined) {
    query = query.eq('has_demo_request', filter.has_demo_request);
  }
  if (filter.has_timeline_discussion !== undefined) {
    query = query.eq('has_timeline_discussion', filter.has_timeline_discussion);
  }
  if (filter.has_budget_discussion !== undefined) {
    query = query.eq('has_budget_discussion', filter.has_budget_discussion);
  }
  if (filter.has_decision_maker !== undefined) {
    query = query.eq('has_decision_maker', filter.has_decision_maker);
  }
  if (filter.has_next_steps !== undefined) {
    query = query.eq('has_next_steps', filter.has_next_steps);
  }

  // Apply string filters
  if (filter.outcome) {
    query = query.eq('outcome', filter.outcome);
  }
  if (filter.detected_stage) {
    query = query.eq('detected_stage', filter.detected_stage);
  }

  // Apply date filters
  if (filter.date_from) {
    query = query.gte('created_at', filter.date_from);
  }
  if (filter.date_to) {
    query = query.lte('created_at', filter.date_to + 'T23:59:59.999Z');
  }

  return query;
}

/**
 * Get meeting details for list response
 */
async function getMeetingDetails(
  supabase: ReturnType<typeof createClient>,
  meetingIds: string[]
): Promise<any[]> {
  if (meetingIds.length === 0) return [];

  const { data: meetings } = await supabase
    .from('meetings')
    .select(`
      id,
      title,
      start_time,
      owner_user_id,
      company_id,
      sentiment_score,
      companies(name)
    `)
    .in('id', meetingIds);

  // Get user names
  const userIds = [...new Set((meetings || []).map(m => m.owner_user_id).filter(Boolean))];
  const { data: users } = await supabase
    .from('users')
    .select('id, name, email')
    .in('id', userIds);

  const userMap = new Map((users || []).map(u => [u.id, u]));

  return (meetings || []).map(m => ({
    meeting_id: m.id,
    meeting_title: m.title || 'Untitled Meeting',
    meeting_date: m.start_time,
    owner_user_id: m.owner_user_id,
    owner_name: userMap.get(m.owner_user_id)?.name || userMap.get(m.owner_user_id)?.email || 'Unknown',
    company_name: (m.companies as any)?.name || 'Unknown Company',
    sentiment_score: m.sentiment_score,
  }));
}

/**
 * Calculate statistics from classifications
 */
function calculateStats(classifications: any[], totalMeetings: number) {
  const stats = {
    total_meetings: totalMeetings,
    filtered_count: classifications.length,
    forward_movement_count: classifications.filter(c => c.has_forward_movement).length,
    proposal_request_count: classifications.filter(c => c.has_proposal_request).length,
    pricing_discussion_count: classifications.filter(c => c.has_pricing_discussion).length,
    competitor_mention_count: classifications.filter(c => c.has_competitor_mention).length,
    objection_count: classifications.filter(c => c.has_objection).length,
    demo_request_count: classifications.filter(c => c.has_demo_request).length,
    positive_outcome_count: classifications.filter(c => c.outcome === 'positive').length,
    negative_outcome_count: classifications.filter(c => c.outcome === 'negative').length,
    next_steps_count: classifications.filter(c => c.has_next_steps).length,
    percentages: {
      forward_movement: totalMeetings > 0 ? (classifications.filter(c => c.has_forward_movement).length / totalMeetings * 100).toFixed(1) : '0',
      proposal_request: totalMeetings > 0 ? (classifications.filter(c => c.has_proposal_request).length / totalMeetings * 100).toFixed(1) : '0',
      pricing_discussion: totalMeetings > 0 ? (classifications.filter(c => c.has_pricing_discussion).length / totalMeetings * 100).toFixed(1) : '0',
      competitor_mention: totalMeetings > 0 ? (classifications.filter(c => c.has_competitor_mention).length / totalMeetings * 100).toFixed(1) : '0',
      objection: totalMeetings > 0 ? (classifications.filter(c => c.has_objection).length / totalMeetings * 100).toFixed(1) : '0',
      positive_outcome: totalMeetings > 0 ? (classifications.filter(c => c.outcome === 'positive').length / totalMeetings * 100).toFixed(1) : '0',
    },
    stage_breakdown: {} as Record<string, number>,
    top_objections: [] as Array<{ objection: string; count: number }>,
    top_competitors: [] as Array<{ name: string; count: number }>,
  };

  // Stage breakdown
  const stageCounts: Record<string, number> = {};
  for (const c of classifications) {
    if (c.detected_stage) {
      stageCounts[c.detected_stage] = (stageCounts[c.detected_stage] || 0) + 1;
    }
  }
  stats.stage_breakdown = stageCounts;

  // Top objections
  const objectionCounts: Record<string, number> = {};
  for (const c of classifications) {
    if (c.objections && Array.isArray(c.objections)) {
      for (const obj of c.objections) {
        const key = obj.objection || obj;
        objectionCounts[key] = (objectionCounts[key] || 0) + 1;
      }
    }
  }
  stats.top_objections = Object.entries(objectionCounts)
    .map(([objection, count]) => ({ objection, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Top competitors
  const competitorCounts: Record<string, number> = {};
  for (const c of classifications) {
    if (c.competitors && Array.isArray(c.competitors)) {
      for (const comp of c.competitors) {
        const name = comp.name || comp;
        competitorCounts[name] = (competitorCounts[name] || 0) + 1;
      }
    }
  }
  stats.top_competitors = Object.entries(competitorCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return stats;
}

/**
 * Format response as Markdown
 */
function formatAsMarkdown(
  queryType: string,
  description: string,
  data: any
): string {
  const parts: string[] = [];

  parts.push(`## Meeting Insights: ${description}\n`);

  if (queryType === 'count' || queryType === 'stats') {
    const stats = data.stats || data.counts;

    parts.push(`### Summary\n`);
    parts.push(`- **Total Meetings Analyzed:** ${stats.total_meetings || stats.filtered_count}`);
    parts.push(`- **Forward Movement:** ${stats.forward_movement_count} (${stats.percentages?.forward_movement || 0}%)`);
    parts.push(`- **Proposals Requested:** ${stats.proposal_request_count} (${stats.percentages?.proposal_request || 0}%)`);
    parts.push(`- **Pricing Discussed:** ${stats.pricing_discussion_count} (${stats.percentages?.pricing_discussion || 0}%)`);
    parts.push(`- **Competitors Mentioned:** ${stats.competitor_mention_count} (${stats.percentages?.competitor_mention || 0}%)`);
    parts.push(`- **Objections Raised:** ${stats.objection_count} (${stats.percentages?.objection || 0}%)`);
    parts.push(`- **Positive Outcomes:** ${stats.positive_outcome_count} (${stats.percentages?.positive_outcome || 0}%)\n`);

    if (stats.top_objections?.length > 0) {
      parts.push(`### Top Objections\n`);
      for (const obj of stats.top_objections) {
        parts.push(`- ${obj.objection}: ${obj.count} occurrence(s)`);
      }
      parts.push('');
    }

    if (stats.top_competitors?.length > 0) {
      parts.push(`### Top Competitors Mentioned\n`);
      for (const comp of stats.top_competitors) {
        parts.push(`- ${comp.name}: ${comp.count} mention(s)`);
      }
      parts.push('');
    }

    if (stats.stage_breakdown && Object.keys(stats.stage_breakdown).length > 0) {
      parts.push(`### Stage Breakdown\n`);
      for (const [stage, count] of Object.entries(stats.stage_breakdown)) {
        parts.push(`- ${stage}: ${count}`);
      }
    }
  }

  if (queryType === 'list' && data.meetings?.length > 0) {
    parts.push(`### Matching Meetings (${data.meetings.length})\n`);
    parts.push(`| Date | Title | Company | Owner |`);
    parts.push(`|------|-------|---------|-------|`);

    for (const meeting of data.meetings.slice(0, 20)) {
      const date = meeting.meeting_date ? new Date(meeting.meeting_date).toLocaleDateString() : 'N/A';
      parts.push(`| ${date} | ${meeting.meeting_title} | ${meeting.company_name} | ${meeting.owner_name} |`);
    }

    if (data.meetings.length > 20) {
      parts.push(`\n*... and ${data.meetings.length - 20} more meetings*`);
    }
  }

  return parts.join('\n');
}

/**
 * Format response for Slack
 */
function formatAsSlack(
  queryType: string,
  description: string,
  data: any
): any {
  const blocks: any[] = [];

  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: `📊 Meeting Insights: ${description}`,
      emoji: true,
    },
  });

  if (queryType === 'count' || queryType === 'stats') {
    const stats = data.stats || data.counts;

    blocks.push({
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*📈 Total Analyzed:*\n${stats.total_meetings || stats.filtered_count}`,
        },
        {
          type: 'mrkdwn',
          text: `*✅ Forward Movement:*\n${stats.forward_movement_count} (${stats.percentages?.forward_movement || 0}%)`,
        },
        {
          type: 'mrkdwn',
          text: `*📝 Proposals:*\n${stats.proposal_request_count}`,
        },
        {
          type: 'mrkdwn',
          text: `*💰 Pricing Discussed:*\n${stats.pricing_discussion_count}`,
        },
        {
          type: 'mrkdwn',
          text: `*⚔️ Competitors:*\n${stats.competitor_mention_count}`,
        },
        {
          type: 'mrkdwn',
          text: `*🎯 Positive Outcomes:*\n${stats.positive_outcome_count} (${stats.percentages?.positive_outcome || 0}%)`,
        },
      ],
    });

    if (stats.top_objections?.length > 0) {
      blocks.push({ type: 'divider' });
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Top Objections:*\n${stats.top_objections.map((o: any) => `• ${o.objection} (${o.count}x)`).join('\n')}`,
        },
      });
    }

    if (stats.top_competitors?.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Top Competitors:*\n${stats.top_competitors.map((c: any) => `• ${c.name} (${c.count}x)`).join('\n')}`,
        },
      });
    }
  }

  if (queryType === 'list' && data.meetings?.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Matching Meetings (${data.meetings.length}):*`,
      },
    });

    // Show first 5 meetings as preview
    const previewMeetings = data.meetings.slice(0, 5);
    for (const meeting of previewMeetings) {
      const date = meeting.meeting_date ? new Date(meeting.meeting_date).toLocaleDateString() : 'N/A';
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `📅 *${date}* - ${meeting.meeting_title}\n_${meeting.company_name}_ • ${meeting.owner_name}`,
        },
      });
    }

    if (data.meetings.length > 5) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `_+ ${data.meetings.length - 5} more meetings_`,
          },
        ],
      });
    }
  }

  return { blocks };
}

serve(async (req) => {
  // Handle CORS preflight
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const body: RequestBody = await req.json();
    const {
      query_type,
      filter,
      natural_query,
      response_format = 'json',
      limit = 50,
      org_id,
      user_id,
    } = body;

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get org_id from user if not provided
    let effectiveOrgId = org_id;
    if (!effectiveOrgId && user_id) {
      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', user_id)
        .limit(1)
        .single();

      effectiveOrgId = membership?.org_id;
    }

    if (!effectiveOrgId) {
      return new Response(
        JSON.stringify({ error: 'org_id or user_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse natural language query if provided
    let effectiveFilter = filter || {};
    let effectiveQueryType = query_type || 'count';
    let queryDescription = 'All meetings';

    if (natural_query && query_type === 'natural_language') {
      const parsed = await parseNaturalQuery(natural_query);
      effectiveFilter = { ...effectiveFilter, ...parsed.filter };
      effectiveQueryType = parsed.query_type;
      queryDescription = parsed.description;
    } else {
      // Generate description from filter
      const filterParts: string[] = [];
      if (effectiveFilter.has_forward_movement) filterParts.push('with forward movement');
      if (effectiveFilter.has_proposal_request) filterParts.push('with proposal requests');
      if (effectiveFilter.has_pricing_discussion) filterParts.push('discussing pricing');
      if (effectiveFilter.has_competitor_mention) filterParts.push('mentioning competitors');
      if (effectiveFilter.has_objection) filterParts.push('with objections');
      if (effectiveFilter.detected_stage) filterParts.push(`in ${effectiveFilter.detected_stage} stage`);
      if (effectiveFilter.date_from || effectiveFilter.date_to) {
        filterParts.push(`from ${effectiveFilter.date_from || 'start'} to ${effectiveFilter.date_to || 'now'}`);
      }
      queryDescription = filterParts.length > 0 ? `Meetings ${filterParts.join(', ')}` : 'All meetings';
    }

    // Build and execute query
    const query = buildFilteredQuery(supabase, effectiveOrgId, effectiveFilter);
    const { data: classifications, error: queryError } = await query.limit(limit);

    if (queryError) {
      throw new Error(`Query failed: ${queryError.message}`);
    }

    const classificationData = classifications || [];

    // Get total count for percentages
    const { count: totalCount } = await supabase
      .from('meeting_classifications')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', effectiveOrgId);

    // Build response based on query type
    let responseData: any = {
      success: true,
      query_type: effectiveQueryType,
      query_description: queryDescription,
    };

    if (effectiveQueryType === 'count') {
      responseData.counts = {
        total_meetings: totalCount || 0,
        filtered_count: classificationData.length,
        forward_movement_count: classificationData.filter(c => c.has_forward_movement).length,
        proposal_request_count: classificationData.filter(c => c.has_proposal_request).length,
        pricing_discussion_count: classificationData.filter(c => c.has_pricing_discussion).length,
        competitor_mention_count: classificationData.filter(c => c.has_competitor_mention).length,
        objection_count: classificationData.filter(c => c.has_objection).length,
        demo_request_count: classificationData.filter(c => c.has_demo_request).length,
        positive_outcome_count: classificationData.filter(c => c.outcome === 'positive').length,
        negative_outcome_count: classificationData.filter(c => c.outcome === 'negative').length,
        next_steps_count: classificationData.filter(c => c.has_next_steps).length,
      };
    } else if (effectiveQueryType === 'list') {
      const meetingIds = classificationData.map(c => c.meeting_id);
      const meetingDetails = await getMeetingDetails(supabase, meetingIds);

      // Merge classification data with meeting details
      responseData.meetings = meetingDetails.map(m => {
        const classification = classificationData.find(c => c.meeting_id === m.meeting_id);
        return {
          ...m,
          outcome: classification?.outcome,
          detected_stage: classification?.detected_stage,
          topics: classification?.topics,
          objections: classification?.objections,
          competitors: classification?.competitors,
        };
      });
      responseData.total_count = responseData.meetings.length;
    } else if (effectiveQueryType === 'stats') {
      responseData.stats = calculateStats(classificationData, totalCount || 0);
    }

    // Format response based on requested format
    if (response_format === 'markdown') {
      return new Response(
        formatAsMarkdown(effectiveQueryType, queryDescription, responseData),
        { headers: { ...corsHeaders, 'Content-Type': 'text/markdown' } }
      );
    } else if (response_format === 'slack') {
      const slackResponse = formatAsSlack(effectiveQueryType, queryDescription, responseData);
      return new Response(
        JSON.stringify(slackResponse),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Default JSON response
    return new Response(
      JSON.stringify(responseData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in meeting-aggregate-insights-query:', error);
    await captureException(error, {
      tags: {
        function: 'meeting-aggregate-insights-query',
        integration: 'anthropic',
      },
    });
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
