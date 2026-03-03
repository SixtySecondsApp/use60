/**
 * Condense Meeting Summary Edge Function
 *
 * Uses Claude Haiku 4.5 to condense long meeting summaries into two concise one-liners:
 * 1. What was discussed (max 15 words)
 * 2. Next steps (max 15 words)
 *
 * This improves readability in the activity table and provides scannable meeting insights.
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { logAICostEvent } from '../_shared/costTracking.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CondenseRequest {
  summary: string
  meetingTitle?: string
  user_id?: string
  org_id?: string
}

interface CondenseResponse {
  success: boolean
  meeting_about?: string
  next_steps?: string
  error?: string
}

/**
 * Condense a meeting summary using Claude Haiku 4.5
 */
async function condenseSummaryWithClaude(
  summary: string,
  meetingTitle?: string
): Promise<{ meeting_about: string; next_steps: string }> {
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured')
  }

  const model = 'claude-haiku-4-5-20251001' // Claude Haiku 4.5 - fastest, most cost-effective
  const prompt = buildCondensePrompt(summary, meetingTitle)

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 256, // Very small - we only need 2 short sentences
        temperature: 0.3, // Low temperature for consistent, focused output
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Claude API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    const content = data.content[0].text
    // Parse JSON response
    const result = parseClaudeResponse(content)

    // Attach token usage for caller to log costs
    ;(result as any).__usage = {
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
      model,
    }
    return result
  } catch (error) {
    throw error
  }
}

/**
 * Build the condensing prompt for Claude
 */
function buildCondensePrompt(summary: string, meetingTitle?: string): string {
  const titleContext = meetingTitle ? `\n- Meeting Title: ${meetingTitle}` : ''

  return `Analyze this meeting summary and condense it into two concise one-liners for a CRM activity table.${titleContext}

MEETING SUMMARY:
${summary}

Extract TWO essential insights:

1. MEETING ABOUT (max 15 words): What was the primary topic or purpose of this meeting?
   - Focus on the main discussion point, decision, or objective
   - Be specific but concise (e.g., "Discussed Q4 pricing strategy and enterprise tier options" NOT "Had a meeting about pricing")
   - Use active, descriptive language

2. NEXT STEPS (max 15 words): What are the key actions or next steps agreed upon?
   - Focus on the most important action items or commitments
   - Include who does what if clear (e.g., "Sales team to send proposal by Friday, customer reviews by Monday")
   - If no clear next steps, use "No immediate action items" or "Follow up scheduled"

IMPORTANT RULES:
- Each line MUST be 15 words or fewer
- Be specific and actionable
- Avoid generic phrases like "discussed various topics" or "meeting went well"
- Focus on concrete outcomes and commitments
- Use present tense or past tense consistently

Return ONLY valid JSON in this exact format (no markdown, no extra text):
{
  "meeting_about": "Discussed enterprise pricing tier, implementation timeline, and security requirements for Q1 rollout",
  "next_steps": "Send detailed proposal with pricing breakdown by Friday, schedule technical demo next week"
}`
}

/**
 * Parse and validate Claude's JSON response
 */
function parseClaudeResponse(content: string): { meeting_about: string; next_steps: string } {
  try {
    // Extract JSON from markdown code blocks if present
    let jsonText = content.trim()
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?$/g, '')
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\n?/g, '').replace(/```\n?$/g, '')
    }

    const parsed = JSON.parse(jsonText)

    // Validate structure
    if (!parsed.meeting_about || typeof parsed.meeting_about !== 'string') {
      throw new Error('Missing or invalid meeting_about field')
    }
    if (!parsed.next_steps || typeof parsed.next_steps !== 'string') {
      throw new Error('Missing or invalid next_steps field')
    }

    // Truncate if too long (safety check)
    const truncate = (text: string, maxWords: number): string => {
      const words = text.trim().split(/\s+/)
      if (words.length <= maxWords) return text.trim()
      return words.slice(0, maxWords).join(' ') + '...'
    }

    return {
      meeting_about: truncate(parsed.meeting_about, 15),
      next_steps: truncate(parsed.next_steps, 15),
    }
  } catch (error) {
    throw new Error(`Failed to parse Claude response: ${error.message}`)
  }
}

/**
 * Fallback: Truncate summary if AI fails
 */
function fallbackTruncate(summary: string): { meeting_about: string; next_steps: string } {
  const lines = summary.split(/\n+/).filter(line => line.trim().length > 0)

  // Take first line as meeting about, second as next steps (or generic fallback)
  const meetingAbout = lines[0]?.substring(0, 100) || 'Meeting summary unavailable'
  const nextSteps = lines[1]?.substring(0, 100) || 'Follow up to be scheduled'

  return {
    meeting_about: meetingAbout,
    next_steps: nextSteps,
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body: CondenseRequest = await req.json()

    if (!body.summary || body.summary.trim().length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Summary is required',
        } as CondenseResponse),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
    // Try AI condensing first
    try {
      const result = await condenseSummaryWithClaude(body.summary, body.meetingTitle)

      // Log AI cost event (fire-and-forget)
      const usage = (result as any).__usage
      delete (result as any).__usage
      if (body.user_id && usage?.inputTokens > 0) {
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        )
        logAICostEvent(
          supabase, body.user_id, body.org_id ?? null,
          'anthropic', usage.model || 'claude-haiku-4-5-20251001',
          usage.inputTokens, usage.outputTokens,
          'condense_meeting_summary',
        ).catch((e: unknown) => console.warn('[condense-meeting-summary] cost log error:', e))
      }

      return new Response(
        JSON.stringify({
          success: true,
          meeting_about: result.meeting_about,
          next_steps: result.next_steps,
        } as CondenseResponse),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    } catch (aiError) {
      // Fallback to simple truncation
      const fallback = fallbackTruncate(body.summary)

      return new Response(
        JSON.stringify({
          success: true,
          meeting_about: fallback.meeting_about,
          next_steps: fallback.next_steps,
        } as CondenseResponse),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      } as CondenseResponse),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
