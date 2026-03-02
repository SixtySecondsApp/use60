import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing authorization header')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        }
      }
    )

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      throw new Error('Unauthorized')
    }

    const { action_item_ids } = await req.json()
    console.log('Received action_item_ids:', action_item_ids)

    if (!action_item_ids || !Array.isArray(action_item_ids) || action_item_ids.length === 0) {
      throw new Error('action_item_ids array is required')
    }

    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY environment variable is not set')
    }

    console.log('Fetching action items from database...')
    // Fetch action items
    const { data: actionItems, error: fetchError } = await supabase
      .from('meeting_action_items')
      .select('id, title, category, priority, deadline_at')
      .in('id', action_item_ids)

    if (fetchError) {
      console.error('Database fetch error:', fetchError)
      throw new Error(`Failed to fetch action items: ${fetchError.message}`)
    }

    if (!actionItems || actionItems.length === 0) {
      console.error('No action items found for IDs:', action_item_ids)
      throw new Error('No action items found')
    }

    console.log(`Found ${actionItems.length} action items`)

    // Use OpenAI to analyze importance
    const analysisPrompt = `Analyze the following action items and classify their importance level as CRITICAL, HIGH, MEDIUM, or LOW.

Importance Level Definitions:
- CRITICAL: Mission-critical tasks, contract deadlines, executive requests, immediate escalations, revenue at risk
- HIGH: Important commitments, urgent tasks, key deliverables, tight deadlines (< 7 days)
- MEDIUM: Standard follow-ups, routine tasks, moderate urgency, regular check-ins
- LOW: Optional tasks, exploratory items, low priority, nice-to-have actions

Action Items:
${actionItems.map((item, i) => `
${i + 1}. ID: ${item.id}
   Title: ${item.title}
   Category: ${item.category || 'N/A'}
   Priority: ${item.priority || 'N/A'}
   Deadline: ${item.deadline_at ? new Date(item.deadline_at).toLocaleDateString() : 'N/A'}
`).join('\n')}

Return a JSON array with the format:
[
  { "id": "actual-uuid-from-above", "importance": "critical|high|medium|low" },
  ...
]

IMPORTANT: Use the exact UUID from the "ID:" field above for each action item.

Only return the JSON array, no additional text.`

    console.log('Calling OpenRouter API with model: anthropic/claude-haiku-4.5')
    const requestBody = {
      model: 'anthropic/claude-haiku-4.5',
      messages: [
        {
          role: 'user',
          content: 'You are an AI assistant that analyzes action items and classifies their importance level. You must respond ONLY with a valid JSON object containing an "items" array, with no additional text or explanation.\n\n' +
                   analysisPrompt.replace('Return a JSON array with the format:', 'Return a JSON object with the format: { "items": [') + '] }'
        }
      ],
      temperature: 0.3
    }
    console.log('Request body:', JSON.stringify(requestBody, null, 2))

    const openaiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://sixty-sales-dashboard.vercel.app',
        'X-Title': 'Sixty Sales Dashboard - Action Item Importance Analysis'
      },
      body: JSON.stringify(requestBody)
    })

    console.log('OpenRouter response status:', openaiResponse.status)
    console.log('OpenRouter response headers:', Object.fromEntries(openaiResponse.headers.entries()))

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text()
      console.error('OpenRouter API error response:', errorText)
      throw new Error(`OpenRouter API error: ${openaiResponse.status} - ${errorText}`)
    }

    console.log('Parsing OpenRouter response...')
    const openaiData = await openaiResponse.json()
    console.log('OpenRouter response:', JSON.stringify(openaiData, null, 2))

    console.log('Extracting analysis text from response...')
    let analysisText = openaiData.choices[0].message.content
    console.log('Raw analysis text:', analysisText)

    // Strip markdown code block markers if present (Claude often wraps JSON in ```json ... ```)
    if (analysisText.startsWith('```')) {
      console.log('Detected markdown code block, stripping markers...')
      // Remove ```json or ``` at the start and ``` at the end
      analysisText = analysisText
        .replace(/^```(?:json)?\s*\n?/i, '')
        .replace(/\n?```\s*$/i, '')
        .trim()
      console.log('Cleaned analysis text:', analysisText)
    }

    let analysis
    try {
      console.log('Parsing analysis text as JSON...')
      const parsed = JSON.parse(analysisText)
      console.log('Parsed response:', JSON.stringify(parsed, null, 2))

      // Extract array from response
      if (Array.isArray(parsed)) {
        console.log('Response is array format')
        analysis = parsed
      } else if (parsed.items && Array.isArray(parsed.items)) {
        console.log('Response has items property')
        analysis = parsed.items
      } else {
        // Look for any array property
        const arrayKey = Object.keys(parsed).find(key => Array.isArray(parsed[key]))
        if (arrayKey) {
          console.log(`Response has array property: ${arrayKey}`)
          analysis = parsed[arrayKey]
        } else {
          throw new Error('Response does not contain an array')
        }
      }
      console.log(`Extracted ${analysis.length} items for processing`)
    } catch (e) {
      console.error('Failed to parse OpenRouter response:', analysisText)
      console.error('Parse error:', e)
      throw new Error(`Failed to parse AI response: ${e.message}`)
    }

    // Update action items with new importance levels
    console.log('Starting database updates...')
    let updatedCount = 0
    const errors = []

    for (const result of analysis) {
      try {
        console.log(`Updating action item ${result.id} with importance: ${result.importance}`)
        const { error: updateError } = await supabase
          .from('meeting_action_items')
          .update({
            importance: result.importance.toLowerCase(),
            updated_at: new Date().toISOString()
          })
          .eq('id', result.id)

        if (updateError) {
          console.error(`Update error for ${result.id}:`, updateError)
          errors.push({ id: result.id, error: updateError.message })
        } else {
          console.log(`Successfully updated ${result.id}`)
          updatedCount++
        }
      } catch (e) {
        console.error(`Exception updating ${result.id}:`, e)
        errors.push({ id: result.id, error: e.message })
      }
    }
    console.log(`Database updates complete. Updated: ${updatedCount}, Errors: ${errors.length}`)

    return new Response(
      JSON.stringify({
        success: true,
        updated_count: updatedCount,
        total_items: actionItems.length,
        errors: errors.length > 0 ? errors : undefined
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Caught error in main handler:', error)
    console.error('Error type:', error?.constructor?.name)
    console.error('Error message:', error instanceof Error ? error.message : 'Unknown error')
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace')

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        error_type: error?.constructor?.name
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
