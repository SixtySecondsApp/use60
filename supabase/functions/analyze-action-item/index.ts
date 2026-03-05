/**
 * Edge Function: Analyze Action Item with AI
 *
 * Uses Claude Haiku 4.5 to:
 * 1. Categorize action item to correct task type
 * 2. Determine ideal deadline based on context
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { logAICostEvent, extractAnthropicUsage } from '../_shared/costTracking.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

interface ActionItemAnalysisRequest {
  action_item_id: string;
  title: string;
  category?: string;
  priority?: string;
  deadline_at?: string;
  meeting_title?: string;
  meeting_summary?: string;
  timestamp_context?: string;
}

interface ActionItemAnalysisResponse {
  task_type: 'call' | 'email' | 'meeting' | 'follow_up' | 'proposal' | 'demo' | 'general';
  ideal_deadline: string; // ISO date string
  confidence_score: number; // 0-1
  reasoning: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

let _lastTokenUsage = { inputTokens: 0, outputTokens: 0 };

async function analyzeActionItemWithAI(
  request: ActionItemAnalysisRequest
): Promise<ActionItemAnalysisResponse> {
  const today = new Date().toISOString().split('T')[0];

  const prompt = `You are an expert sales task manager analyzing meeting action items to categorize them and determine ideal deadlines.

MEETING CONTEXT:
- Meeting Title: ${request.meeting_title || 'Unknown'}
- Meeting Summary: ${request.meeting_summary || 'Not available'}

ACTION ITEM:
- Title: ${request.title}
- Category: ${request.category || 'Not specified'}
- Priority: ${request.priority || 'Not specified'}
- Suggested Deadline: ${request.deadline_at ? new Date(request.deadline_at).toLocaleDateString() : 'Not specified'}
- Context from transcript: ${request.timestamp_context || 'Not available'}

TASK TYPES:
- call: Phone calls to prospects/clients
- email: Email communications
- meeting: Schedule or attend meetings
- follow_up: General follow-up tasks
- proposal: Send or create proposals
- demo: Product demonstrations
- general: Other tasks

DEADLINE GUIDELINES:
- Urgent/High priority: 1-2 days
- Proposal-related: 2-3 days
- Demo prep: 3-5 days
- Follow-ups: 3-7 days
- General tasks: 5-14 days
- Consider: Priority, type, and any mentioned timeframes in the action item

Today's date: ${today}

ANALYZE THE ACTION ITEM AND RESPOND IN THIS EXACT JSON FORMAT:
{
  "task_type": "one of: call, email, meeting, follow_up, proposal, demo, general",
  "ideal_deadline": "YYYY-MM-DD format (must be >= today)",
  "confidence_score": 0.95,
  "reasoning": "Brief explanation of your categorization and deadline choice"
}

IMPORTANT:
- Be specific with task_type based on the action item content
- Set realistic deadlines based on priority and task complexity
- If the action item mentions "send proposal", use task_type "proposal"
- If it mentions "schedule call" or "call", use task_type "call"
- If it mentions "email" or "send email", use task_type "email"
- Consider the priority level when setting deadlines
- Ensure deadline is not in the past`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-20250514',
        max_tokens: 500,
        temperature: 0.3, // Lower temperature for more consistent results
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${error}`);
    }

    const data = await response.json();
    _lastTokenUsage = extractAnthropicUsage(data);
    const aiResponse = data.content[0].text;
    // Parse JSON from AI response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse AI response as JSON');
    }

    const analysis: ActionItemAnalysisResponse = JSON.parse(jsonMatch[0]);

    // Validate deadline is not in the past
    const deadlineDate = new Date(analysis.ideal_deadline);
    const todayDate = new Date(today);
    if (deadlineDate < todayDate) {
      // If AI suggested a past date, default to 3 days from now
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
      analysis.ideal_deadline = threeDaysFromNow.toISOString().split('T')[0];
      analysis.reasoning += ' (Adjusted: Original deadline was in the past)';
    }

    // Validate task_type
    const validTaskTypes = ['call', 'email', 'meeting', 'follow_up', 'proposal', 'demo', 'general'];
    if (!validTaskTypes.includes(analysis.task_type)) {
      analysis.task_type = 'follow_up';
    }

    return analysis;
  } catch (error) {
    // Fallback to heuristic-based analysis
    return fallbackAnalysis(request);
  }
}

function fallbackAnalysis(request: ActionItemAnalysisRequest): ActionItemAnalysisResponse {
  const title = request.title.toLowerCase();

  // Determine task type based on keywords
  let task_type: ActionItemAnalysisResponse['task_type'] = 'follow_up';

  if (title.includes('call') || title.includes('phone')) {
    task_type = 'call';
  } else if (title.includes('email') || title.includes('send email')) {
    task_type = 'email';
  } else if (title.includes('meeting') || title.includes('schedule')) {
    task_type = 'meeting';
  } else if (title.includes('proposal') || title.includes('quote')) {
    task_type = 'proposal';
  } else if (title.includes('demo') || title.includes('demonstration')) {
    task_type = 'demo';
  } else if (title.includes('follow up') || title.includes('follow-up')) {
    task_type = 'follow_up';
  }

  // Determine deadline based on priority
  let daysToAdd = 3; // Default

  if (request.priority === 'urgent') {
    daysToAdd = 1;
  } else if (request.priority === 'high') {
    daysToAdd = 2;
  } else if (request.priority === 'medium') {
    daysToAdd = 5;
  } else if (request.priority === 'low') {
    daysToAdd = 7;
  }

  // If deadline already specified, use it
  if (request.deadline_at) {
    const specifiedDeadline = new Date(request.deadline_at);
    if (specifiedDeadline > new Date()) {
      const ideal_deadline = specifiedDeadline.toISOString().split('T')[0];
      return {
        task_type,
        ideal_deadline,
        confidence_score: 0.6,
        reasoning: 'Fallback analysis: Used specified deadline and keyword-based categorization',
      };
    }
  }

  const deadline = new Date();
  deadline.setDate(deadline.getDate() + daysToAdd);
  const ideal_deadline = deadline.toISOString().split('T')[0];

  return {
    task_type,
    ideal_deadline,
    confidence_score: 0.5,
    reasoning: `Fallback analysis: Categorized as ${task_type} based on keywords, deadline set to ${daysToAdd} days based on ${request.priority || 'default'} priority`,
  };
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const { action_item_id } = await req.json();

    if (!action_item_id) {
      return new Response(
        JSON.stringify({ error: 'action_item_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch action item and meeting details
    const { data: actionItem, error: fetchError } = await supabase
      .from('meeting_action_items')
      .select(`
        id,
        title,
        category,
        priority,
        deadline_at,
        timestamp_seconds,
        meeting_id,
        meetings (
          title,
          summary,
          owner_user_id,
          org_id
        )
      `)
      .eq('id', action_item_id)
      .single();

    if (fetchError || !actionItem) {
      return new Response(
        JSON.stringify({ error: 'Action item not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare request for AI analysis
    const analysisRequest: ActionItemAnalysisRequest = {
      action_item_id: actionItem.id,
      title: actionItem.title,
      category: actionItem.category,
      priority: actionItem.priority,
      deadline_at: actionItem.deadline_at,
      meeting_title: actionItem.meetings?.title,
      meeting_summary: actionItem.meetings?.summary,
    };

    // Analyze with AI
    const analysis = await analyzeActionItemWithAI(analysisRequest);

    // Log AI cost event (fire-and-forget, gracefully skipped if no user context)
    const ownerUserId = (actionItem.meetings as any)?.owner_user_id;
    const ownerOrgId = (actionItem.meetings as any)?.org_id;
    if (ownerUserId && _lastTokenUsage.inputTokens > 0) {
      logAICostEvent(
        supabase, ownerUserId, ownerOrgId,
        'anthropic', 'claude-haiku-4-20250514',
        _lastTokenUsage.inputTokens, _lastTokenUsage.outputTokens,
        'analyze_action_item',
      ).catch((e: unknown) => console.warn('[analyze-action-item] cost log error:', e));
    }

    // Save analysis results to database
    const { data: saveResult, error: saveError } = await supabase.rpc(
      'apply_ai_analysis_to_task',
      {
        p_action_item_id: action_item_id,
        p_task_type: analysis.task_type,
        p_ideal_deadline: analysis.ideal_deadline,
        p_confidence_score: analysis.confidence_score,
        p_reasoning: analysis.reasoning,
      }
    );

    if (saveError) {
      return new Response(
        JSON.stringify({
          error: 'Failed to save analysis results',
          details: saveError.message,
          analysis // Still return the analysis even if save failed
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    return new Response(
      JSON.stringify({
        ...analysis,
        saved: true,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
