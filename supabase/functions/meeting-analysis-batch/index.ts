/**
 * Meeting Analysis Batch Edge Function
 *
 * Consolidates meeting detail page data into a single request.
 * Reduces 4+ separate queries to 1 for meeting detail page loads.
 *
 * Supported analyses:
 * - details: Meeting metadata (title, date, participants, etc.)
 * - action-items: AI-extracted action items with completion status
 * - topics: Key topics/themes from the meeting
 * - suggestions: Next action suggestions for the meeting
 * - summary: Condensed meeting summary
 * - transcript-search: Search within transcript (if query provided)
 * - related-deals: Deals linked to this meeting
 * - related-contacts: Contacts associated with this meeting
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ============================================================================
// Types
// ============================================================================

type AnalysisType =
  | 'details'
  | 'action-items'
  | 'topics'
  | 'suggestions'
  | 'summary'
  | 'transcript-search'
  | 'related-deals'
  | 'related-contacts';

interface BatchRequest {
  meetingId: string;
  analyses: AnalysisType[];
  params?: {
    searchQuery?: string; // For transcript-search
  };
}

interface BatchResult {
  type: AnalysisType;
  success: boolean;
  data?: unknown;
  error?: string;
  timing?: number;
}

interface BatchResponse {
  results: Record<string, BatchResult>;
  meetingId: string;
  totalTime: number;
  analysisCount: number;
}

// ============================================================================
// Analysis Handlers
// ============================================================================

type AnalysisHandler = (
  supabase: ReturnType<typeof createClient>,
  meetingId: string,
  params?: Record<string, unknown>
) => Promise<unknown>;

const analysisHandlers: Record<AnalysisType, AnalysisHandler> = {
  // Meeting details
  details: async (supabase, meetingId) => {
    const { data, error } = await supabase
      .from('meetings')
      .select(
        `
        id,
        title,
        meeting_start,
        meeting_end,
        duration_seconds,
        fathom_call_id,
        fathom_meeting_id,
        fathom_recording_id,
        owner_email,
        owner_user_id,
        attendees,
        video_url,
        thumbnail_url,
        has_transcript,
        processing_status,
        ai_summary,
        created_at,
        updated_at,
        deal_id,
        deals:deal_id (id, name, stage, value)
      `
      )
      .eq('id', meetingId)
      .single();

    if (error) throw error;
    return data;
  },

  // Action items for the meeting
  'action-items': async (supabase, meetingId) => {
    const { data, error } = await supabase
      .from('meeting_action_items')
      .select(
        `
        id,
        title,
        assignee_name,
        assignee_email,
        priority,
        category,
        deadline_at,
        completed,
        completed_at,
        ai_generated,
        ai_confidence,
        synced_to_task,
        task_id,
        timestamp_seconds,
        playback_url,
        created_at
      `
      )
      .eq('meeting_id', meetingId)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Group by completion status
    const items = data || [];
    return {
      items,
      total: items.length,
      completed: items.filter((i) => i.completed).length,
      pending: items.filter((i) => !i.completed).length,
      byPriority: {
        high: items.filter((i) => i.priority === 'high').length,
        medium: items.filter((i) => i.priority === 'medium').length,
        low: items.filter((i) => i.priority === 'low').length,
      },
    };
  },

  // Topics extracted from meeting
  topics: async (supabase, meetingId) => {
    const { data, error } = await supabase
      .from('meeting_topics')
      .select(
        `
        id,
        title,
        description,
        relevance_score,
        duration_seconds,
        start_timestamp,
        end_timestamp,
        ai_confidence,
        category,
        created_at
      `
      )
      .eq('meeting_id', meetingId)
      .order('relevance_score', { ascending: false });

    if (error) throw error;
    return { topics: data || [], total: data?.length || 0 };
  },

  // Next action suggestions
  suggestions: async (supabase, meetingId) => {
    const { data, error } = await supabase
      .from('next_action_suggestions')
      .select(
        `
        id,
        suggested_action,
        urgency,
        confidence_score,
        reasoning,
        status,
        activity_type,
        suggested_due_date,
        created_at
      `
      )
      .eq('activity_id', meetingId)
      .eq('activity_type', 'meeting')
      .order('urgency', { ascending: false })
      .order('confidence_score', { ascending: false });

    if (error) throw error;

    const items = data || [];
    return {
      suggestions: items,
      total: items.length,
      pending: items.filter((s) => s.status === 'pending').length,
      byUrgency: {
        high: items.filter((s) => s.urgency === 'high').length,
        medium: items.filter((s) => s.urgency === 'medium').length,
        low: items.filter((s) => s.urgency === 'low').length,
      },
    };
  },

  // Condensed summary
  summary: async (supabase, meetingId) => {
    const { data, error } = await supabase
      .from('meetings')
      .select('ai_summary, title, meeting_start, duration_seconds')
      .eq('id', meetingId)
      .single();

    if (error) throw error;

    return {
      title: data?.title,
      date: data?.meeting_start,
      duration: data?.duration_seconds,
      summary: data?.ai_summary || null,
      hasSummary: !!data?.ai_summary,
    };
  },

  // Transcript search
  'transcript-search': async (supabase, meetingId, params) => {
    const searchQuery = params?.searchQuery as string;

    if (!searchQuery) {
      return { matches: [], message: 'No search query provided' };
    }

    // Get transcript
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('transcript_text')
      .eq('id', meetingId)
      .single();

    if (meetingError) throw meetingError;
    if (!meeting?.transcript_text) {
      return { matches: [], message: 'No transcript available' };
    }

    // Simple search - find matching segments
    const transcript = meeting.transcript_text;
    const lowerQuery = searchQuery.toLowerCase();
    const lines = transcript.split('\n');
    const matches: Array<{
      line: number;
      text: string;
      context: string;
    }> = [];

    lines.forEach((line, index) => {
      if (line.toLowerCase().includes(lowerQuery)) {
        // Get context (line before and after)
        const contextStart = Math.max(0, index - 1);
        const contextEnd = Math.min(lines.length - 1, index + 1);
        const context = lines.slice(contextStart, contextEnd + 1).join('\n');

        matches.push({
          line: index + 1,
          text: line,
          context,
        });
      }
    });

    return {
      matches: matches.slice(0, 20), // Limit to 20 matches
      total: matches.length,
      query: searchQuery,
    };
  },

  // Related deals
  'related-deals': async (supabase, meetingId) => {
    // First get the meeting to find linked deal
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('deal_id, owner_user_id')
      .eq('id', meetingId)
      .single();

    if (meetingError) throw meetingError;

    if (!meeting?.deal_id) {
      return { deals: [], linkedDealId: null };
    }

    // Get the linked deal details
    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .select(
        `
        id,
        name,
        stage,
        value,
        probability,
        expected_close_date,
        companies:company_id (id, name)
      `
      )
      .eq('id', meeting.deal_id)
      .single();

    if (dealError) throw dealError;

    return {
      deals: deal ? [deal] : [],
      linkedDealId: meeting.deal_id,
    };
  },

  // Related contacts
  'related-contacts': async (supabase, meetingId) => {
    // Get meeting attendees
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('attendees, owner_user_id')
      .eq('id', meetingId)
      .single();

    if (meetingError) throw meetingError;

    if (!meeting?.attendees || meeting.attendees.length === 0) {
      return { contacts: [], attendeeEmails: [] };
    }

    // Extract email addresses from attendees
    const attendeeEmails: string[] = [];
    meeting.attendees.forEach((attendee: any) => {
      const email = typeof attendee === 'string' ? attendee : attendee?.email;
      if (email) attendeeEmails.push(email);
    });

    if (attendeeEmails.length === 0) {
      return { contacts: [], attendeeEmails: [] };
    }

    // Find matching contacts
    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .select(
        `
        id,
        first_name,
        last_name,
        email,
        title,
        company_id,
        companies:company_id (id, name)
      `
      )
      .in('email', attendeeEmails);

    if (contactsError) throw contactsError;

    return {
      contacts: contacts || [],
      attendeeEmails,
      matchedCount: contacts?.length || 0,
    };
  },
};

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed. Use POST.' }),
      {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  const startTime = Date.now();

  try {
    // Get authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Authorization required');
    }

    // Parse request
    const body: BatchRequest = await req.json();
    const { meetingId, analyses, params } = body;

    if (!meetingId) {
      throw new Error('meetingId is required');
    }

    if (!analyses || !Array.isArray(analyses) || analyses.length === 0) {
      throw new Error('analyses array is required and must not be empty');
    }

    if (analyses.length > 10) {
      throw new Error('Maximum 10 analyses per batch request');
    }

    // Create Supabase client with user's auth
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user has access to meeting (RLS will handle this)
    const { error: accessError } = await supabase
      .from('meetings')
      .select('id')
      .eq('id', meetingId)
      .single();

    if (accessError) {
      throw new Error('Meeting not found or access denied');
    }

    // Process all analyses in parallel
    const results: Record<string, BatchResult> = {};

    await Promise.all(
      analyses.map(async (analysisType) => {
        const opStartTime = Date.now();

        try {
          const handler = analysisHandlers[analysisType];
          if (!handler) {
            results[analysisType] = {
              type: analysisType,
              success: false,
              error: `Unknown analysis type: ${analysisType}`,
            };
            return;
          }

          const data = await handler(supabase, meetingId, params);

          results[analysisType] = {
            type: analysisType,
            success: true,
            data,
            timing: Date.now() - opStartTime,
          };
        } catch (err) {
          results[analysisType] = {
            type: analysisType,
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
            timing: Date.now() - opStartTime,
          };
        }
      })
    );

    const response: BatchResponse = {
      results,
      meetingId,
      totalTime: Date.now() - startTime,
      analysisCount: analyses.length,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err) {
    console.error('[meeting-analysis-batch] Error:', err);

    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Unknown error',
        totalTime: Date.now() - startTime,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: err instanceof Error && err.message.includes('denied') ? 403 : 400,
      }
    );
  }
});
