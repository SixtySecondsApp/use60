/**
 * AI Analysis Module for Fathom Transcripts
 * Uses Claude Haiku 4.5 to extract action items, analyze talk time, and determine sentiment
 */

interface ActionItem {
  title: string
  assignedTo: string | null
  assignedToEmail: string | null
  deadline: string | null // ISO date string
  // Normalized category aligned with tasks UI
  category: 'call' | 'email' | 'meeting' | 'follow_up' | 'proposal' | 'demo' | 'general'
  priority: 'high' | 'medium' | 'low'
  confidence: number
  timestampSeconds: number | null // seconds into the call where this was discussed
}

interface TalkTimeAnalysis {
  repPct: number
  customerPct: number
  assessment: string
}

interface SentimentAnalysis {
  score: number // -1.0 to 1.0
  reasoning: string
  keyMoments: string[]
}

interface CoachingInsights {
  rating: number // 1-10 scale
  summary: string // Overall assessment with specific feedback
  strengths: string[] // What the rep did well
  improvements: string[] // Areas for improvement with actionable suggestions
  evaluationBreakdown: {
    area: string
    score: number // 1-10
    feedback: string
  }[]
}

export interface CallTypeClassification {
  callTypeId: string | null
  callTypeName: string | null
  confidence: number
  reasoning: string
}

export interface TranscriptAnalysis {
  actionItems: ActionItem[]
  talkTime: TalkTimeAnalysis
  sentiment: SentimentAnalysis
  coaching: CoachingInsights
  callType?: CallTypeClassification
}

interface Meeting {
  id: string
  title: string
  meeting_start: string
  owner_email: string | null
}

/**
 * Classify call type using Claude AI based on org-configured call types
 */
async function classifyCallType(
  transcript: string,
  meeting: Meeting,
  orgCallTypes: any[],
  supabaseClient: any
): Promise<CallTypeClassification> {
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured')
  }

  if (!orgCallTypes || orgCallTypes.length === 0) {
    return {
      callTypeId: null,
      callTypeName: null,
      confidence: 0,
      reasoning: 'No call types configured for organization',
    }
  }

  // Filter to active call types only
  const activeCallTypes = orgCallTypes.filter((ct: any) => ct.is_active)

  if (activeCallTypes.length === 0) {
    return {
      callTypeId: null,
      callTypeName: null,
      confidence: 0,
      reasoning: 'No active call types configured',
    }
  }

  // Build call types context for prompt
  const callTypesContext = activeCallTypes.map((ct: any) => ({
    id: ct.id,
    name: ct.name,
    description: ct.description || '',
    keywords: ct.keywords || [],
  }))

  const model = Deno.env.get('CLAUDE_MODEL') || 'claude-haiku-4-5-20251001'
  const prompt = `Analyze this meeting transcript and classify it into one of the configured call types.

MEETING CONTEXT:
- Title: ${meeting.title}
- Meeting Date: ${new Date(meeting.meeting_start).toISOString().split('T')[0]}

AVAILABLE CALL TYPES:
${callTypesContext.map((ct: any) => `- ${ct.name} (ID: ${ct.id})
  Description: ${ct.description}
  Keywords: ${ct.keywords.join(', ')}`).join('\n\n')}

TRANSCRIPT:
${transcript.substring(0, 8000)}${transcript.length > 8000 ? '...' : ''}

Based on the transcript content, meeting title, and keywords, classify this call into the most appropriate call type.

Return ONLY valid JSON in this exact format:
{
  "callTypeId": "uuid-of-selected-call-type",
  "callTypeName": "Name of selected call type",
  "confidence": 0.85,
  "reasoning": "Brief explanation of why this call type was selected, referencing specific keywords or content from the transcript"
}

IMPORTANT:
- Return ONLY the JSON, no other text
- Confidence should be between 0.0 and 1.0
- If no call type matches well (confidence < 0.5), set callTypeId to null and explain why
- Reference specific keywords or phrases from the transcript in your reasoning`

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
        max_tokens: 512,
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
    const content = data.content[0]?.text || ''

    // Parse JSON response
    let jsonText = content.trim()
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?$/g, '')
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\n?/g, '').replace(/```\n?$/g, '')
    }

    const parsed = JSON.parse(jsonText)

    // Validate the call type ID exists
    if (parsed.callTypeId) {
      const callTypeExists = activeCallTypes.some((ct: any) => ct.id === parsed.callTypeId)
      if (!callTypeExists) {
        console.warn(`Call type ID ${parsed.callTypeId} not found in active call types`)
        return {
          callTypeId: null,
          callTypeName: null,
          confidence: 0,
          reasoning: `Selected call type ID not found in active call types`,
        }
      }
    }

    return {
      callTypeId: parsed.callTypeId || null,
      callTypeName: parsed.callTypeName || null,
      confidence: Math.max(0, Math.min(1, parsed.confidence || 0)),
      reasoning: parsed.reasoning || 'No reasoning provided',
    }
  } catch (error) {
    console.error('Error classifying call type:', error)
    return {
      callTypeId: null,
      callTypeName: null,
      confidence: 0,
      reasoning: `Classification error: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Analyze transcript using Claude Haiku 4.5
 * Also applies custom extraction rules if userId provided (Phase 6.3)
 * Now includes call type classification if orgId provided
 */
export async function analyzeTranscriptWithClaude(
  transcript: string,
  meeting: Meeting,
  supabaseClient?: any,
  userId?: string,
  orgId?: string
): Promise<TranscriptAnalysis> {
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured')
  }

  // Fetch org call types for classification
  let orgCallTypes: any[] = []
  if (orgId && supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('org_call_types')
        .select('*')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .order('display_order', { ascending: true })

      if (!error && data) {
        orgCallTypes = data
      }
    } catch (error) {
      console.warn('Failed to fetch org call types:', error instanceof Error ? error.message : String(error))
    }
  }

  // Fetch user coaching preferences if available
  let coachingPreferences: any = null
  let referenceMeetings: any = null
  if (userId && supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('user_coaching_preferences')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single()

      if (!error && data) {
        coachingPreferences = data

        // Fetch reference meetings if user has selected them
        if ((data.good_example_meeting_ids?.length > 0) || (data.bad_example_meeting_ids?.length > 0)) {
          try {
            const { data: refMeetingsData, error: refError } = await supabaseClient.rpc(
              'get_coaching_reference_meetings',
              {
                p_user_id: userId,
                p_good_meeting_ids: data.good_example_meeting_ids || [],
                p_bad_meeting_ids: data.bad_example_meeting_ids || []
              }
            )

            if (!refError && refMeetingsData) {
              referenceMeetings = refMeetingsData
            }
          } catch (refError) {
            // Non-fatal - continue without reference meetings
            console.warn('Failed to fetch reference meetings:', refError instanceof Error ? refError.message : String(refError))
          }
        }
      }
    } catch (error) {
      // Non-fatal - continue with default coaching criteria
      console.warn('Failed to fetch coaching preferences:', error instanceof Error ? error.message : String(error))
    }
  }

  const model = Deno.env.get('CLAUDE_MODEL') || 'claude-haiku-4-5-20251001'
  const prompt = buildAnalysisPrompt(transcript, meeting, coachingPreferences, referenceMeetings)

  // Apply custom extraction rules first if userId and supabase client provided
  let ruleBasedActionItems: ActionItem[] = []
  if (userId && supabaseClient) {
    ruleBasedActionItems = await applyExtractionRulesToTranscript(
      supabaseClient,
      userId,
      transcript,
      meeting
    )
  }

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
        max_tokens: 4096,
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
    
    // Log cost event if we have the necessary information
    if (supabaseClient && userId && data.usage && meeting.owner_user_id) {
      try {
        // Get organization ID from meeting owner
        const { data: membership } = await supabaseClient
          .from('organization_memberships')
          .select('org_id')
          .eq('user_id', meeting.owner_user_id)
          .order('created_at', { ascending: true })
          .limit(1)
          .single()
        
        if (membership?.org_id) {
          // Import cost tracking helper
          const { logAICostEvent } = await import('../_shared/costTracking.ts')
          await logAICostEvent(
            supabaseClient,
            meeting.owner_user_id,
            membership.org_id,
            'anthropic',
            model.includes('haiku') ? 'claude-haiku-4-5' : 'claude-sonnet-4',
            data.usage.input_tokens || 0,
            data.usage.output_tokens || 0,
            'transcript_analysis',
            {
              meeting_id: meeting.id,
              meeting_title: meeting.title,
            }
          )
        }
      } catch (err) {
        // Silently fail - cost tracking is optional
        if (err instanceof Error && !err.message.includes('relation') && !err.message.includes('does not exist')) {
          console.warn('[FathomSync] Error logging cost:', err)
        }
      }
    }
    
    // Parse JSON response
    const analysis = parseClaudeResponse(content)

    // Merge rule-based action items with AI-extracted items (prioritize rules)
    if (ruleBasedActionItems.length > 0) {
      analysis.actionItems = mergeActionItems(ruleBasedActionItems, analysis.actionItems)
    }

    // Classify call type if org call types are available
    if (orgCallTypes.length > 0 && supabaseClient) {
      try {
        const callTypeClassification = await classifyCallType(
          transcript,
          meeting,
          orgCallTypes,
          supabaseClient
        )
        analysis.callType = callTypeClassification
      } catch (error) {
        console.warn('Failed to classify call type:', error instanceof Error ? error.message : String(error))
        // Non-fatal - continue without call type classification
      }
    }

    return analysis
  } catch (error) {
    throw error
  }
}

/**
 * Build the analysis prompt for Claude
 */
function buildAnalysisPrompt(transcript: string, meeting: Meeting, coachingPreferences?: any, referenceMeetings?: any): string {
  const meetingDate = new Date(meeting.meeting_start).toISOString().split('T')[0]
  const currentDate = new Date().toISOString().split('T')[0]  // Current date for deadline calculations

  // Build coaching section based on user preferences or defaults
  const coachingFramework = coachingPreferences?.coaching_framework ||
    'Evaluate the sales representative\'s performance across key areas: discovery, objection handling, value articulation, closing technique, and relationship building.'

  const evaluationCriteria = coachingPreferences?.evaluation_criteria || [
    {area: 'Discovery', weight: 20, description: 'How well did the rep uncover customer needs and pain points?'},
    {area: 'Listening', weight: 20, description: 'Did the rep actively listen and respond appropriately?'},
    {area: 'Value Articulation', weight: 20, description: 'How clearly did the rep communicate value and differentiation?'},
    {area: 'Objection Handling', weight: 20, description: 'How effectively did the rep address concerns and objections?'},
    {area: 'Next Steps', weight: 20, description: 'Did the rep secure clear next steps and commitment?'}
  ]

  const goodExamples = coachingPreferences?.good_examples ||
    'GOOD EXAMPLES:\n- "Tell me more about your current process..." (open-ended discovery)\n- "Based on what you shared, here\'s how we can help..." (value alignment)\n- "That\'s a great concern. Here\'s how we address that..." (confident objection handling)\n- "Let\'s get that demo scheduled for next Tuesday - does 2pm work?" (clear next step)'

  const badExamples = coachingPreferences?.bad_examples ||
    'BAD EXAMPLES:\n- Talking more than 70% of the time (poor listening)\n- Pitching features before understanding needs (premature presentation)\n- Avoiding or dismissing objections (defensive behavior)\n- Ending without clear next steps or commitment (weak closing)'

  // Build reference meetings context if available
  let referenceMeetingsContext = ''
  if (referenceMeetings) {
    if (referenceMeetings.good_examples?.length > 0) {
      referenceMeetingsContext += '\n\n📞 REFERENCE: EXCELLENT CALLS TO EMULATE\n'
      referenceMeetingsContext += 'The user has marked these actual recorded calls as excellent examples to benchmark against:\n'
      referenceMeetings.good_examples.forEach((meeting: any, i: number) => {
        const meetingDate = new Date(meeting.meeting_start).toLocaleDateString()
        const rating = meeting.coach_rating ? `${meeting.coach_rating}/10` : 'Unrated'
        const sentiment = meeting.sentiment_score ? `${(meeting.sentiment_score * 100).toFixed(0)}% positive` : 'N/A'
        referenceMeetingsContext += `\n${i + 1}. "${meeting.title}" (${meetingDate})\n`
        referenceMeetingsContext += `   Rating: ${rating} | Sentiment: ${sentiment}\n`
        referenceMeetingsContext += `   Transcript excerpt: "${meeting.transcript_preview}..."\n`
      })
      referenceMeetingsContext += '\nWhen coaching, compare this call to the excellent examples above. What did those calls do well that this call could emulate?\n'
    }

    if (referenceMeetings.bad_examples?.length > 0) {
      referenceMeetingsContext += '\n\n⚠️ REFERENCE: CALLS WITH ISSUES TO AVOID\n'
      referenceMeetingsContext += 'The user has marked these actual recorded calls as examples of techniques to avoid:\n'
      referenceMeetings.bad_examples.forEach((meeting: any, i: number) => {
        const meetingDate = new Date(meeting.meeting_start).toLocaleDateString()
        const rating = meeting.coach_rating ? `${meeting.coach_rating}/10` : 'Unrated'
        const sentiment = meeting.sentiment_score ? `${(meeting.sentiment_score * 100).toFixed(0)}% positive` : 'N/A'
        referenceMeetingsContext += `\n${i + 1}. "${meeting.title}" (${meetingDate})\n`
        referenceMeetingsContext += `   Rating: ${rating} | Sentiment: ${sentiment}\n`
        referenceMeetingsContext += `   Transcript excerpt: "${meeting.transcript_preview}..."\n`
      })
      referenceMeetingsContext += '\nWhen coaching, identify if this call exhibits any of the problematic patterns from the examples above.\n'
    }
  }

  const ratingScale = coachingPreferences?.rating_scale || {
    '1-3': 'Poor - Significant improvement needed. Multiple areas performed below standard.',
    '4-5': 'Below Average - Some good moments but key areas need work.',
    '6-7': 'Good - Solid performance with a few areas to improve.',
    '8-9': 'Excellent - Strong performance across most areas.',
    '10': 'Outstanding - Exceptional performance, best-in-class execution.'
  }

  const customInstructions = coachingPreferences?.custom_instructions ||
    'Focus on actionable feedback. Be specific about what was done well and what could be improved. Provide 2-3 concrete improvement suggestions.'

  return `Analyze this sales call transcript and extract structured information.

MEETING CONTEXT:
- Title: ${meeting.title}
- Meeting Date: ${meetingDate}
- Today's Date: ${currentDate}
- Host: ${meeting.owner_email || 'Unknown'}

TRANSCRIPT:
${transcript}

Please analyze the transcript and provide:

1. ACTION ITEMS (ONLY concrete, agreed, assignable next steps):
   Extract action items that are clearly agreed upon and require action. Exclude ideas, suggestions, opinions, or vague topics.

   IMPORTANT: Look for BOTH explicit and implicit action items, but include ONLY if they represent a concrete next step:
   - Explicit: "I'll send you the proposal by Friday"
   - Implicit: "We need to review the contract" (creates action for someone)
   - Commitments: "We'll get back to you with those numbers"
   - Questions to follow up on: "Let me check with the team and circle back"
   - Next steps agreed upon: "Let's schedule a follow-up for next week"

   Extract action items for BOTH parties:
   - Sales Rep tasks: Things the rep/your team needs to do
   - Prospect/Customer tasks: Things the customer agreed to do

   Common action items to look for:
   - Send information (proposal, pricing, case studies, documentation)
   - Schedule meetings (demos, follow-ups, stakeholder calls)
   - Internal tasks (check with team, get approval, review documents)
   - Customer tasks (review materials, provide information, make decisions)
   - Technical items (set up integrations, provide access, configure)

   For each action item:
   - Title: Clear, specific description of what needs to be done
   - Assigned to: Person's name who should do it (sales rep name, customer name, or role like "Sales Team" or "Customer")
   - Assigned to email: Email address if mentioned, otherwise null
   - Deadline: Date when it's due. CRITICAL - Calculate relative to TODAY's date (${currentDate}), NOT the meeting date! Parse phrases like:
     * "tomorrow" = ${currentDate} + 1 day
     * "next week" = ${currentDate} + 7 days
     * "end of week" = nearest Friday from ${currentDate}
     * "by Friday" = nearest Friday from ${currentDate}
     * "in 2 days" = ${currentDate} + 2 days
     * EXCEPTION: If explicitly mentioned relative to the call (e.g., "right after this call", "same day as meeting"), use meeting date: ${meetingDate}
     * If no deadline mentioned or vague ("soon", "later"), use null
   - Category: Map to ONE of: call, email, meeting, follow_up, proposal, demo, general (use general for anything else)
   - Priority: Assess as high (urgent/time-sensitive), medium (important but flexible), or low (nice to have)
   - Importance: Classify as high, medium, or low based on business impact and urgency
     * high = Must be done, explicit commitment, deadline <7 days, critical for deal progression
     * medium = Should be done, standard follow-up, deadline 7-30 days, important for relationship
     * low = Nice to have, optional task, vague commitment, exploratory, no immediate deadline
   - Confidence: How confident are you this is a real action item (0.0 to 1.0)
     * 0.9-1.0: Explicit commitment ("I will...")
     * 0.7-0.9: Strong indication ("We should...")
     * 0.5-0.7: Implied action ("That would be helpful...")
     * <0.5: Unclear or speculative
   - Timestamp: If the transcript contains [HH:MM:SS] time markers, identify the approximate
     timestamp (in seconds) where this action item was discussed or agreed upon.
     Convert [HH:MM:SS] to seconds (e.g., [00:05:32] = 332). If no timestamp markers
     are present in the transcript, use null.

2. TALK TIME ANALYSIS:
   Analyze who spoke more during the call:
   - Rep percentage: Estimated % of time sales rep(s) spoke
   - Customer percentage: Estimated % of time customer(s) spoke
   - Assessment: Brief evaluation (e.g., "Balanced conversation", "Rep talked too much", "Good listening")

3. SENTIMENT ANALYSIS:
   Evaluate the overall tone and sentiment of the call:
   - Score: Overall sentiment from -1.0 (very negative) to 1.0 (very positive)
   - Reasoning: Brief explanation of why you gave this score
   - Key moments: List 2-3 significant positive or negative moments

4. SALES COACHING INSIGHTS:
   ${coachingFramework}

   EVALUATION CRITERIA (rate each area 1-10):
${evaluationCriteria.map((c: any) => `   - ${c.area} (${c.weight}% weight): ${c.description}`).join('\n')}

   ${goodExamples}

   ${badExamples}
${referenceMeetingsContext}

   RATING SCALE:
${Object.entries(ratingScale).map(([range, desc]) => `   ${range}: ${desc}`).join('\n')}

   ${customInstructions}

   Provide:
   - Overall rating (1-10): Holistic assessment of the sales rep's performance
   - Summary: 2-3 sentence overall assessment highlighting key strengths and areas for improvement
   - Strengths: List 2-3 specific things the rep did well with examples from the call
   - Improvements: List 2-3 actionable suggestions with specific examples of what could be done better
   - Evaluation breakdown: Score (1-10) and brief feedback for each criterion above

Return ONLY valid JSON in this exact format and include ONLY 3-8 of the most important action items that meet the criteria:
{
  "actionItems": [
    {
      "title": "Send detailed pricing proposal with enterprise tier options",
      "assignedTo": "John Smith",
      "assignedToEmail": "john@company.com",
      "deadline": "2025-11-05",
      "category": "proposal",
      "priority": "high",
      "importance": "high",
      "confidence": 0.95,
      "timestampSeconds": 332
    },
    {
      "title": "Schedule technical demo with engineering team",
      "assignedTo": "Sales Team",
      "assignedToEmail": null,
      "deadline": "2025-11-08",
      "category": "demo",
      "priority": "high",
      "importance": "high",
      "confidence": 0.9,
      "timestampSeconds": 1245
    },
    {
      "title": "Review proposal and provide feedback to team",
      "assignedTo": "Sarah Johnson",
      "assignedToEmail": "sarah@prospect.com",
      "deadline": "2025-11-10",
      "category": "follow_up",
      "priority": "medium",
      "importance": "medium",
      "confidence": 0.85,
      "timestampSeconds": 1580
    },
    {
      "title": "Get budget approval from finance",
      "assignedTo": "Customer",
      "assignedToEmail": null,
      "deadline": null,
      "category": "general",
      "priority": "high",
      "importance": "medium",
      "confidence": 0.8,
      "timestampSeconds": null
    }
  ],
  "talkTime": {
    "repPct": 45.5,
    "customerPct": 54.5,
    "assessment": "Well-balanced conversation with good listening"
  },
  "sentiment": {
    "score": 0.75,
    "reasoning": "Positive and engaged conversation with strong interest",
    "keyMoments": [
      "Customer expressed enthusiasm about the product",
      "Pricing concerns were addressed satisfactorily",
      "Clear next steps established"
    ]
  },
  "coaching": {
    "rating": 8,
    "summary": "Strong performance overall with excellent discovery and value articulation. The rep demonstrated active listening and built good rapport. Key improvement area is objection handling - could be more confident and provide specific examples.",
    "strengths": [
      "Excellent discovery questions that uncovered the customer's pain points around manual processes",
      "Strong value articulation linking features directly to their needs",
      "Built genuine rapport and engaged the customer effectively"
    ],
    "improvements": [
      "When addressing pricing concerns, provide specific ROI examples rather than generic statements",
      "Ask more probing questions when customer raises objections to understand the root concern",
      "Secure more specific next steps with exact dates rather than 'early next week'"
    ],
    "evaluationBreakdown": [
      {
        "area": "Discovery",
        "score": 9,
        "feedback": "Excellent open-ended questions. Uncovered multiple pain points and decision criteria."
      },
      {
        "area": "Listening",
        "score": 8,
        "feedback": "Good listening with appropriate follow-up questions. Could pause more to let customer elaborate."
      },
      {
        "area": "Value Articulation",
        "score": 8,
        "feedback": "Clearly connected features to customer needs. Strong differentiation messaging."
      },
      {
        "area": "Objection Handling",
        "score": 7,
        "feedback": "Addressed concerns but could be more confident. Provide specific data/examples."
      },
      {
        "area": "Next Steps",
        "score": 7,
        "feedback": "Secured follow-up meeting but could be more specific with dates and agenda."
      }
    ]
  }
}

IMPORTANT:
- Return ONLY the JSON, no other text
- Use null for missing values
- Ensure all percentages sum to 100
- Include BOTH sales rep tasks AND customer/prospect tasks
- Exclude ideas or vague statements (e.g., "it might be good to...", "we could consider...")
- Only include items with clear ownership and a concrete verb (send, schedule, review, provide, decide, sign, integrate, configure, follow up)
- Prefer items with an explicit or reasonably inferred deadline
- Mark confidence appropriately; avoid items below 0.7 confidence
- If truly no action items found, return empty array (but this should be rare for sales calls)`
}

/**
 * Parse and validate Claude's JSON response
 */
function parseClaudeResponse(content: string): TranscriptAnalysis {
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
    if (!parsed.actionItems || !Array.isArray(parsed.actionItems)) {
      throw new Error('Missing or invalid actionItems array')
    }
    if (!parsed.talkTime || typeof parsed.talkTime !== 'object') {
      throw new Error('Missing or invalid talkTime object')
    }
    if (!parsed.sentiment || typeof parsed.sentiment !== 'object') {
      throw new Error('Missing or invalid sentiment object')
    }

    // Validate and normalize action items
    const actionItems: ActionItem[] = parsed.actionItems.map((item: any) => ({
      title: String(item.title || 'Untitled action item'),
      assignedTo: item.assignedTo || null,
      assignedToEmail: item.assignedToEmail || null,
      deadline: item.deadline || null,
      category: validateCategory(item.category),
      priority: validatePriority(item.priority),
      confidence: Math.min(Math.max(Number(item.confidence || 0.5), 0), 1),
      timestampSeconds: item.timestampSeconds != null ? Math.max(0, Math.floor(Number(item.timestampSeconds))) : null,
    }))

    // Validate and normalize talk time
    const talkTime: TalkTimeAnalysis = {
      repPct: Math.min(Math.max(Number(parsed.talkTime.repPct || 50), 0), 100),
      customerPct: Math.min(Math.max(Number(parsed.talkTime.customerPct || 50), 0), 100),
      assessment: String(parsed.talkTime.assessment || 'Unable to assess'),
    }

    // Validate and normalize sentiment
    const sentiment: SentimentAnalysis = {
      score: Math.min(Math.max(Number(parsed.sentiment.score || 0), -1), 1),
      reasoning: String(parsed.sentiment.reasoning || 'No reasoning provided'),
      keyMoments: Array.isArray(parsed.sentiment.keyMoments)
        ? parsed.sentiment.keyMoments.map(String).slice(0, 5)
        : [],
    }

    // Validate and normalize coaching insights
    if (!parsed.coaching || typeof parsed.coaching !== 'object') {
      throw new Error('Missing or invalid coaching object')
    }

    const coaching: CoachingInsights = {
      rating: Math.min(Math.max(Number(parsed.coaching.rating || 5), 1), 10),
      summary: String(parsed.coaching.summary || 'No assessment provided'),
      strengths: Array.isArray(parsed.coaching.strengths)
        ? parsed.coaching.strengths.map(String).slice(0, 5)
        : [],
      improvements: Array.isArray(parsed.coaching.improvements)
        ? parsed.coaching.improvements.map(String).slice(0, 5)
        : [],
      evaluationBreakdown: Array.isArray(parsed.coaching.evaluationBreakdown)
        ? parsed.coaching.evaluationBreakdown.map((item: any) => ({
            area: String(item.area || 'Unknown'),
            score: Math.min(Math.max(Number(item.score || 5), 1), 10),
            feedback: String(item.feedback || 'No feedback provided'),
          }))
        : [],
    }

    return {
      actionItems,
      talkTime,
      sentiment,
      coaching,
    }
  } catch (error) {
    throw new Error(`Failed to parse Claude response: ${error.message}`)
  }
}

/**
 * Validate and normalize category
 */
function validateCategory(
  category: string
): 'follow_up' | 'demo' | 'proposal' | 'contract' | 'technical' | 'other' {
  const validCategories = ['follow_up', 'demo', 'proposal', 'contract', 'technical', 'other']
  const normalized = String(category || 'other').toLowerCase().replace(/[- ]/g, '_')

  if (validCategories.includes(normalized)) {
    return normalized as any
  }

  return 'other'
}

/**
 * Validate and normalize priority
 */
function validatePriority(priority: string): 'high' | 'medium' | 'low' {
  const normalized = String(priority || 'medium').toLowerCase()

  if (['high', 'medium', 'low'].includes(normalized)) {
    return normalized as any
  }

  return 'medium'
}

/**
 * Deduplicate action items against existing Fathom action items
 */
export function deduplicateActionItems(
  aiItems: ActionItem[],
  fathomItems: any[]
): ActionItem[] {
  if (!fathomItems || fathomItems.length === 0) {
    return aiItems
  }

  const uniqueAIItems: ActionItem[] = []

  for (const aiItem of aiItems) {
    const isDuplicate = fathomItems.some(fathomItem => {
      return isSimilarActionItem(aiItem.title, fathomItem.title || fathomItem.description)
    })

    if (!isDuplicate) {
      uniqueAIItems.push(aiItem)
    } else {
    }
  }
  return uniqueAIItems
}

/**
 * Check if two action items are similar (fuzzy matching)
 */
function isSimilarActionItem(text1: string, text2: string): boolean {
  if (!text1 || !text2) return false

  const normalize = (str: string) =>
    str
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .trim()

  const norm1 = normalize(text1)
  const norm2 = normalize(text2)

  // Exact match
  if (norm1 === norm2) return true

  // One contains the other
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    return true
  }

  // Calculate similarity ratio (simple word overlap)
  const words1 = new Set(norm1.split(/\s+/))
  const words2 = new Set(norm2.split(/\s+/))
  const intersection = new Set([...words1].filter(x => words2.has(x)))
  const union = new Set([...words1, ...words2])

  const similarity = intersection.size / union.size

  // Consider similar if >60% word overlap
  return similarity > 0.6
}

/**
 * Apply custom extraction rules to transcript (Phase 6.3)
 * Converts matched rules into ActionItem format
 */
async function applyExtractionRulesToTranscript(
  supabaseClient: any,
  userId: string,
  transcript: string,
  meeting: Meeting
): Promise<ActionItem[]> {
  try {
    // Fetch active extraction rules for user
    const { data: rules, error } = await supabaseClient
      .from('task_extraction_rules')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)

    if (error || !rules || rules.length === 0) {
      return []
    }

    const lowerTranscript = transcript.toLowerCase()
    const actionItems: ActionItem[] = []

    // Check each rule against transcript
    for (const rule of rules) {
      // Check if any trigger phrase matches
      const matchingPhrase = rule.trigger_phrases.find((phrase: string) =>
        lowerTranscript.includes(phrase.toLowerCase())
      )

      if (matchingPhrase) {
        // Find the sentence containing the trigger phrase
        const sentences = transcript.split(/[.!?]\s+/)
        const matchingSentence = sentences.find((sentence: string) =>
          sentence.toLowerCase().includes(matchingPhrase.toLowerCase())
        )

        // Create task title from sentence or phrase
        const taskTitle = matchingSentence?.trim() || `Follow up on: ${matchingPhrase}`

        // Calculate deadline based on rule's default_deadline_days
        const meetingDate = new Date(meeting.meeting_start)
        const deadline = rule.default_deadline_days
          ? new Date(meetingDate.getTime() + rule.default_deadline_days * 24 * 60 * 60 * 1000)
              .toISOString()
              .split('T')[0]
          : null

        // Map priority
        const priorityMap: Record<string, 'high' | 'medium' | 'low'> = {
          'low': 'low',
          'medium': 'medium',
          'high': 'high',
          'urgent': 'high'
        }

        // Map category to valid ActionItem category
        const categoryMap: Record<string, ActionItem['category']> = {
          'call': 'call',
          'email': 'email',
          'meeting': 'meeting',
          'follow_up': 'follow_up',
          'proposal': 'proposal',
          'demo': 'demo',
          'general': 'general'
        }

        actionItems.push({
          title: taskTitle,
          assignedTo: meeting.owner_email ? meeting.owner_email.split('@')[0] : 'Sales Rep',
          assignedToEmail: meeting.owner_email,
          deadline: deadline,
          category: categoryMap[rule.task_category] || 'general',
          priority: priorityMap[rule.default_priority] || 'medium',
          confidence: 0.95 // High confidence for rule-based extraction
        })
      }
    }

    return actionItems
  } catch (error) {
    console.error('Error applying extraction rules:', error)
    return []
  }
}

/**
 * Merge rule-based action items with AI-extracted items
 * Prioritizes custom rules over AI analysis
 */
function mergeActionItems(
  ruleItems: ActionItem[],
  aiItems: ActionItem[]
): ActionItem[] {
  const merged: ActionItem[] = []
  const seenTitles = new Set<string>()

  // Add rule-based items first (higher priority)
  for (const item of ruleItems) {
    const key = item.title.toLowerCase().trim()
    if (!seenTitles.has(key)) {
      merged.push(item)
      seenTitles.add(key)
    }
  }

  // Add AI items that don't conflict
  for (const item of aiItems) {
    const key = item.title.toLowerCase().trim()
    if (!seenTitles.has(key)) {
      merged.push(item)
      seenTitles.add(key)
    }
  }

  return merged
}
