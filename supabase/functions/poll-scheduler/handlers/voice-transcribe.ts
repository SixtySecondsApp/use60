import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4"
import { createMeetingFromVoiceRecording } from "./meetingIntegration.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GEMINI_MODEL = Deno.env.get("GEMINI_FLASH_MODEL") ?? Deno.env.get("GEMINI_MODEL") ?? "gemini-3-flash"
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("GOOGLE_GEMINI_API_KEY") ?? ""

interface PollRequest {
  recording_id: string
}

interface GladiaUtterance {
  speaker: number
  text: string
  start: number
  end: number
  confidence: number
}

interface GladiaPollResponse {
  id: string
  status: 'queued' | 'processing' | 'done' | 'error'
  error?: string
  result?: {
    metadata: {
      audio_duration: number
      number_of_channels: number
      billing_time: number
    }
    transcription: {
      full_transcript: string
      languages: string[]
      utterances: GladiaUtterance[]
    }
    summarization?: {
      success: boolean
      results: string
    }
  }
}

/**
 * Voice Transcribe Poll Edge Function
 *
 * Polls Gladia for transcription results and updates the recording.
 * Should be called periodically by the client until status is 'completed' or 'failed'.
 *
 * Required Environment Variables:
 * - GLADIA_API_KEY
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 */
export async function handlePoll(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get auth token
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify user from token
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { recording_id }: PollRequest = await req.json()

    if (!recording_id) {
      return new Response(
        JSON.stringify({ error: 'recording_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get recording from database
    const { data: recording, error: recordingError } = await supabase
      .from('voice_recordings')
      .select('*')
      .eq('id', recording_id)
      .single()

    if (recordingError || !recording) {
      return new Response(
        JSON.stringify({ error: 'Recording not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user has access
    if (recording.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Access denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // If already completed or failed, return current status
    if (recording.status === 'completed' || recording.status === 'failed') {
      return new Response(
        JSON.stringify({
          success: true,
          recording_id,
          status: recording.status,
          transcript: recording.transcript_text,
          speakers: recording.speakers,
          summary: recording.summary,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if we have a result URL to poll
    if (!recording.gladia_result_url) {
      return new Response(
        JSON.stringify({
          success: true,
          recording_id,
          status: recording.status,
          message: 'No transcription started yet',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get Gladia API key
    const gladiaApiKey = Deno.env.get('GLADIA_API_KEY')
    if (!gladiaApiKey) {
      return new Response(
        JSON.stringify({ error: 'Transcription service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Poll Gladia for results
    console.log('Polling Gladia for recording:', recording_id)
    const pollResponse = await fetch(recording.gladia_result_url, {
      headers: {
        'x-gladia-key': gladiaApiKey,
      },
    })

    if (!pollResponse.ok) {
      console.error('Gladia poll failed:', pollResponse.status)
      return new Response(
        JSON.stringify({
          success: true,
          recording_id,
          status: 'transcribing',
          message: 'Still processing',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const pollResult: GladiaPollResponse = await pollResponse.json()
    console.log('Gladia poll status:', pollResult.status)

    // Handle different statuses
    if (pollResult.status === 'queued' || pollResult.status === 'processing') {
      return new Response(
        JSON.stringify({
          success: true,
          recording_id,
          status: 'transcribing',
          gladia_status: pollResult.status,
          message: 'Still processing',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (pollResult.status === 'error') {
      await supabase
        .from('voice_recordings')
        .update({
          status: 'failed',
          error_message: pollResult.error || 'Transcription failed',
        })
        .eq('id', recording_id)

      return new Response(
        JSON.stringify({
          success: false,
          recording_id,
          status: 'failed',
          error: pollResult.error || 'Transcription failed',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Status is 'done' - process results
    if (pollResult.status === 'done' && pollResult.result) {
      console.log('Transcription complete, processing results...')

      const transcriptionData = pollResult.result.transcription
      const utterances = transcriptionData?.utterances || []
      const fullTranscript = transcriptionData?.full_transcript || ''
      const detectedLanguages = transcriptionData?.languages || ['en']
      const summary = pollResult.result.summarization?.results || ''

      // Extract unique speakers
      const speakerSet = new Set(utterances.map(u => u.speaker))
      const speakers = Array.from(speakerSet).map((speakerId, index) => ({
        id: speakerId,
        name: `Speaker ${index + 1}`,
        initials: `S${index + 1}`,
      }))

      // Format transcript segments
      const transcriptSegments = utterances.map(u => ({
        speaker: `Speaker ${u.speaker + 1}`,
        speaker_id: u.speaker,
        text: u.text,
        start_time: u.start,
        end_time: u.end,
        confidence: u.confidence,
      }))

      // Get recording type for context-aware extraction
      const recordingType = recording.recording_type || 'meeting'

      // Generate action items using Gemini AI (with fallback to basic)
      const actionItems = await extractActionItemsWithGemini(fullTranscript, summary, speakers, recordingType)
      console.log(`Extracted ${actionItems.length} action items using Gemini`)

      // Generate AI-powered title based on transcript content
      const aiTitle = await generateTitleWithGemini(fullTranscript, summary, recordingType)
      console.log(`Generated AI title: ${aiTitle}`)

      // Update recording with results
      const { error: updateError } = await supabase
        .from('voice_recordings')
        .update({
          status: 'completed',
          title: aiTitle,
          transcript_text: fullTranscript,
          transcript_segments: transcriptSegments,
          speakers: speakers,
          language: detectedLanguages[0] || 'en',
          summary: summary || 'Meeting transcription completed.',
          action_items: actionItems,
          processed_at: new Date().toISOString(),
        })
        .eq('id', recording_id)

      if (updateError) {
        console.error('Failed to update recording:', updateError)
        return new Response(
          JSON.stringify({ error: 'Failed to save transcription' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // If recording type is 'meeting', create a linked meeting record with AI analysis
      let meetingIntelligence = null
      if (recordingType === 'meeting') {
        console.log('Recording is type "meeting", creating linked meeting record...')

        // Build recording object for meeting integration
        const recordingForMeeting = {
          id: recording_id,
          user_id: recording.user_id,
          org_id: recording.org_id,
          title: aiTitle,
          created_at: recording.created_at,
          duration_seconds: pollResult.result?.metadata?.audio_duration || null,
          recording_type: recordingType,
        }

        meetingIntelligence = await createMeetingFromVoiceRecording(
          supabase,
          recordingForMeeting,
          fullTranscript,
          summary || 'Voice recording transcription completed.',
          speakers,
          transcriptSegments
        )

        if (meetingIntelligence) {
          console.log(`Created meeting ${meetingIntelligence.meeting_id} from voice recording`)
        } else {
          console.warn('Failed to create meeting from voice recording, continuing...')
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          recording_id,
          status: 'completed',
          transcript: fullTranscript,
          speakers: speakers,
          summary: summary,
          segments_count: transcriptSegments.length,
          meeting_id: meetingIntelligence?.meeting_id || null,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fallback
    return new Response(
      JSON.stringify({
        success: true,
        recording_id,
        status: 'transcribing',
        message: 'Processing',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('Voice transcribe poll error:', error)
    return new Response(
      JSON.stringify({
        error: message,
        success: false
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

/**
 * Extract action items using Gemini 3 Flash for intelligent extraction
 */
async function extractActionItemsWithGemini(
  transcript: string,
  summary: string,
  speakers: { id: number; name: string }[],
  recordingType: string
): Promise<Array<{
  id: string
  text: string
  owner: string
  deadline: string
  done: boolean
  priority: 'high' | 'medium' | 'low'
  category: string
}>> {
  // If no Gemini API key, fall back to basic extraction
  if (!GEMINI_API_KEY) {
    console.log('No Gemini API key, using basic extraction')
    return extractActionItemsBasic(summary, speakers)
  }

  const speakerNames = speakers.map(s => s.name).join(', ') || 'Unknown speakers'
  const today = new Date().toISOString().split('T')[0]

  // Recording type context for better extraction
  const typeContext = {
    meeting: 'This is a business meeting recording. Focus on commitments, decisions, follow-ups, and deliverables.',
    call: 'This is a phone/video call recording. Focus on promised actions, callbacks, and next steps.',
    note: 'This is a voice note. Focus on personal action items, reminders, and self-assigned tasks.',
    idea: 'This is an idea capture. Focus on research tasks, exploration items, and things to investigate.',
  }[recordingType] || 'Focus on any actionable items mentioned.'

  const prompt = `You are an expert at extracting actionable items from voice recordings. Analyze this transcript and extract ONLY clear, specific action items.

CONTEXT:
- Recording Type: ${recordingType}
- ${typeContext}
- Speakers: ${speakerNames}
- Today's Date: ${today}

TRANSCRIPT:
${transcript.slice(0, 8000)}

${summary ? `SUMMARY:\n${summary}` : ''}

EXTRACTION RULES:
1. Extract ONLY explicit commitments, promises, or assigned tasks
2. Each action item must be specific and measurable
3. Infer the owner from context (who said "I will" or was assigned the task)
4. Estimate realistic deadlines based on context (today, this week, next week, this month)
5. Assign priority: high (urgent/time-sensitive), medium (important), low (nice-to-have)
6. Categorize: follow_up, deliverable, research, meeting, communication, decision, other
7. Do NOT include vague intentions or general discussion points
8. Maximum 7 action items, focus on the most important ones
9. Write action items as clear imperative sentences (e.g., "Send proposal to client" not "They mentioned sending a proposal")

RESPONSE FORMAT (JSON only, no markdown):
{
  "action_items": [
    {
      "text": "Clear action item description",
      "owner": "Person name or 'Team'",
      "deadline": "Today|This week|Next week|This month|[specific date]",
      "priority": "high|medium|low",
      "category": "follow_up|deliverable|research|meeting|communication|decision|other",
      "context": "Brief quote or reference from transcript"
    }
  ]
}

Return ONLY valid JSON, no explanation.`

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${GEMINI_API_KEY}`

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          topP: 0.8,
          maxOutputTokens: 2000,
          responseMimeType: 'application/json',
        },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Gemini API error:', errorText)
      return extractActionItemsBasic(summary, speakers)
    }

    const result = await response.json()
    const textContent = result.candidates?.[0]?.content?.parts?.[0]?.text || ''

    // Parse the JSON response
    const parsed = parseGeminiJSON(textContent)

    if (!parsed?.action_items || !Array.isArray(parsed.action_items)) {
      console.error('Invalid Gemini response format')
      return extractActionItemsBasic(summary, speakers)
    }

    // Transform to our format
    return parsed.action_items.slice(0, 7).map((item: any, index: number) => ({
      id: `action-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 9)}`,
      text: item.text || 'Action item',
      owner: item.owner || speakers[0]?.name || 'Team',
      deadline: item.deadline || 'This week',
      done: false,
      priority: item.priority || 'medium',
      category: item.category || 'other',
    }))
  } catch (error) {
    console.error('Gemini extraction error:', error)
    return extractActionItemsBasic(summary, speakers)
  }
}

/**
 * Generate a descriptive title using Gemini AI
 */
async function generateTitleWithGemini(
  transcript: string,
  summary: string,
  recordingType: string
): Promise<string> {
  // Default fallback title with date
  const today = new Date()
  const dateStr = today.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit'
  }).replace('/', '-')
  const defaultTitle = `Recording ${dateStr}`

  // If no Gemini API key, return default
  if (!GEMINI_API_KEY) {
    console.log('No Gemini API key, using default title')
    return defaultTitle
  }

  // Recording type context for better titles
  const typeContext = {
    meeting: 'business meeting or discussion',
    call: 'phone or video call',
    note: 'voice note or memo',
    idea: 'idea capture or brainstorm',
  }[recordingType] || 'voice recording'

  const prompt = `Generate a concise, descriptive title for this ${typeContext} recording.

TRANSCRIPT EXCERPT:
${transcript.slice(0, 3000)}

${summary ? `SUMMARY:\n${summary}` : ''}

TITLE REQUIREMENTS:
1. Maximum 6 words
2. Capture the main topic or purpose
3. Use title case (capitalize main words)
4. Do NOT include dates, times, or "Recording"
5. Do NOT use generic phrases like "Discussion About" or "Meeting About"
6. Be specific and descriptive
7. Examples of good titles:
   - "Q4 Sales Strategy Review"
   - "Customer Onboarding Process"
   - "Website Redesign Planning"
   - "Team Performance Feedback"
   - "Product Launch Timeline"

RESPONSE FORMAT:
Return ONLY the title text, nothing else. No quotes, no explanation.`

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${GEMINI_API_KEY}`

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          topP: 0.8,
          maxOutputTokens: 50,
        },
      }),
    })

    if (!response.ok) {
      console.error('Gemini title generation failed:', response.status)
      return defaultTitle
    }

    const result = await response.json()
    const generatedTitle = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''

    // Validate and clean the title
    if (generatedTitle && generatedTitle.length > 0 && generatedTitle.length <= 60) {
      // Remove quotes if present
      const cleanTitle = generatedTitle.replace(/^["']|["']$/g, '').trim()
      // Append date for uniqueness
      return `${cleanTitle} ${dateStr}`
    }

    return defaultTitle
  } catch (error) {
    console.error('Gemini title generation error:', error)
    return defaultTitle
  }
}

/**
 * Parse Gemini JSON response with error handling
 */
function parseGeminiJSON(text: string): any {
  // Remove markdown code blocks if present
  const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
  let jsonString = jsonMatch ? jsonMatch[1] : text

  // Find JSON object
  if (!jsonString.trim().startsWith('{')) {
    const objectMatch = jsonString.match(/\{[\s\S]*\}/)
    if (objectMatch) jsonString = objectMatch[0]
  }

  jsonString = jsonString.trim()
  const firstBrace = jsonString.indexOf('{')
  const lastBrace = jsonString.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    jsonString = jsonString.substring(firstBrace, lastBrace + 1)
  }

  try {
    return JSON.parse(jsonString)
  } catch {
    // Try to repair common issues
    let repaired = jsonString
      .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
      .replace(/'/g, '"') // Replace single quotes

    try {
      return JSON.parse(repaired)
    } catch {
      return null
    }
  }
}

/**
 * Basic fallback extraction using regex patterns
 */
function extractActionItemsBasic(summary: string, speakers: { id: number; name: string }[]): Array<{
  id: string
  text: string
  owner: string
  deadline: string
  done: boolean
  priority: 'high' | 'medium' | 'low'
  category: string
}> {
  const items: Array<{
    id: string
    text: string
    owner: string
    deadline: string
    done: boolean
    priority: 'high' | 'medium' | 'low'
    category: string
  }> = []

  const patterns = [
    /(?:will|should|need to|must|going to)\s+(.+?)(?:\.|$)/gi,
    /action[:\s]+(.+?)(?:\.|$)/gi,
    /todo[:\s]+(.+?)(?:\.|$)/gi,
    /follow[- ]?up[:\s]+(.+?)(?:\.|$)/gi,
  ]

  for (const pattern of patterns) {
    const matches = summary.matchAll(pattern)
    for (const match of matches) {
      if (match[1] && match[1].length > 10 && match[1].length < 200) {
        items.push({
          id: `action-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          text: match[1].trim(),
          owner: speakers[0]?.name || 'Team',
          deadline: 'This week',
          done: false,
          priority: 'medium',
          category: 'other',
        })
      }
    }
  }

  return items.slice(0, 5)
}
