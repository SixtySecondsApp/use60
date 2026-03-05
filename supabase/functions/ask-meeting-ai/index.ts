/**
 * Ask Meeting AI Edge Function
 *
 * Allows users to ask questions about a meeting transcript using Claude Haiku 4.
 * Maintains conversation history for follow-up questions.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { captureException } from '../_shared/sentryEdge.ts'
import { validateTranscript } from '../_shared/transcriptValidation.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface RequestBody {
  meetingId: string
  question: string
  conversationHistory?: Message[]
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse request body
    const { meetingId, question, conversationHistory = [] }: RequestBody = await req.json()

    if (!meetingId || !question) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: meetingId, question' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get authorization token
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    )

    // Get the authenticated user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'User not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const userId = user.id

    // Fetch meeting transcript
    const { data: meeting, error: meetingError } = await supabaseClient
      .from('meetings')
      .select('id, title, transcript_text, meeting_start')
      .eq('id', meetingId)
      .single()

    if (meetingError || !meeting) {
      return new Response(
        JSON.stringify({ error: 'Meeting not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const transcriptValidation = validateTranscript(meeting.transcript_text)
    if (!transcriptValidation.valid) {
      return new Response(
        JSON.stringify({ error: transcriptValidation.error, details: transcriptValidation.details }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get Anthropic API key
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) {
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build conversation messages for Claude
    const messages: Array<{ role: string; content: string }> = []

    // Add conversation history
    conversationHistory.forEach((msg) => {
      messages.push({
        role: msg.role,
        content: msg.content
      })
    })

    // Add current question
    messages.push({
      role: 'user',
      content: question
    })

    // System prompt with transcript context
    const systemPrompt = `You are an AI assistant helping analyze a meeting transcript. The user will ask you questions about the meeting, and you should provide helpful, accurate answers based on the transcript content.

Meeting Details:
- Title: ${meeting.title || 'Untitled Meeting'}
- Date: ${meeting.meeting_start ? new Date(meeting.meeting_start).toLocaleString() : 'Unknown'}

Full Transcript:
${meeting.transcript_text}

Instructions:
- Answer questions based solely on the transcript content
- If the transcript doesn't contain information to answer a question, say so clearly
- Be concise but thorough in your responses
- Reference specific moments or speakers when relevant
- Maintain a helpful, professional tone`;

    // Call Claude Haiku 4 API
    const model = Deno.env.get('CLAUDE_MODEL') || 'claude-haiku-4-5-20251001'
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        temperature: 0.7,
        system: systemPrompt,
        messages: messages
      }),
    })

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text()
      return new Response(
        JSON.stringify({ error: 'AI service error', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const anthropicData = await anthropicResponse.json()
    const aiResponse = anthropicData.content[0]?.text || 'I apologize, but I could not generate a response.'
    
    // Log cost event
    if (anthropicData.usage && userId) {
      try {
        const { logAICostEvent } = await import('../_shared/costTracking.ts')
        const supabaseClient = createClient(
          Deno.env.get('SUPABASE_URL') || '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
        )
        
        await logAICostEvent(
          supabaseClient,
          userId,
          null, // Will be resolved from user
          'anthropic',
          model.includes('haiku') ? 'claude-haiku-4-5' : 'claude-sonnet-4',
          anthropicData.usage.input_tokens || 0,
          anthropicData.usage.output_tokens || 0,
          'meeting_search',
          {
            meeting_id: meetingId,
          }
        )
      } catch (err) {
        // Silently fail - cost tracking is optional
        if (err instanceof Error && !err.message.includes('relation') && !err.message.includes('does not exist')) {
          console.warn('[AskMeetingAI] Error logging cost:', err)
        }
      }
    }
    
    return new Response(
      JSON.stringify({ response: aiResponse }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    await captureException(error, {
      tags: {
        function: 'ask-meeting-ai',
        integration: 'anthropic',
      },
    });
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
