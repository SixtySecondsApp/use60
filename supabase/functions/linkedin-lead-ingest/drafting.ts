import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'

/**
 * First Follow-Up Email Draft Generation for LinkedIn Leads
 *
 * Generates a personalized follow-up referencing campaign/form/event context.
 * Uses Claude Sonnet for quality. Draft is stored for HITL approval.
 */

interface DraftInput {
  contact_name: string
  contact_title: string | null
  company_name: string | null
  email: string
  lead_type: 'ad_form' | 'event_form'
  campaign_name: string | null
  event_name: string | null
  form_answers: Record<string, string>
  icp_score: number
  urgency: string
}

export interface DraftResult {
  subject: string
  body: string
  model_used: string
}

export async function generateLinkedInLeadDraft(
  supabase: SupabaseClient,
  input: DraftInput,
  orgId: string,
  ownerId: string | null
): Promise<DraftResult> {
  // Load org voice settings if available
  let voiceSettings: Record<string, unknown> | null = null
  let signOff = ''
  let ownerName = ''

  if (ownerId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, first_name')
      .eq('id', ownerId)
      .maybeSingle()
    ownerName = profile?.full_name || profile?.first_name || ''
    signOff = ownerName
  }

  // Load tone settings
  const { data: toneSettings } = await supabase
    .from('user_settings')
    .select('preferences')
    .eq('user_id', ownerId)
    .maybeSingle()

  if (toneSettings?.preferences) {
    voiceSettings = toneSettings.preferences as Record<string, unknown>
    if (voiceSettings?.email_signature) {
      signOff = String(voiceSettings.email_signature)
    }
  }

  // Build the prompt
  const contextParts: string[] = []

  if (input.lead_type === 'event_form' && input.event_name) {
    contextParts.push(`They registered for the event: "${input.event_name}"`)
  } else if (input.campaign_name) {
    contextParts.push(`They responded to the campaign: "${input.campaign_name}"`)
  }

  if (input.contact_title) {
    contextParts.push(`Their role: ${input.contact_title}`)
  }
  if (input.company_name) {
    contextParts.push(`Their company: ${input.company_name}`)
  }

  // Include notable form answers
  const notableAnswers = Object.entries(input.form_answers)
    .filter(([, v]) => v.length > 2)
    .slice(0, 5)
  if (notableAnswers.length > 0) {
    contextParts.push('Form responses:')
    for (const [q, a] of notableAnswers) {
      contextParts.push(`  - ${q}: ${a}`)
    }
  }

  const ctaType = determineCTA(input)

  const systemPrompt = `You are writing a follow-up email on behalf of ${ownerName || 'a sales representative'}.
The recipient just submitted a LinkedIn ${input.lead_type === 'event_form' ? 'event registration' : 'lead gen'} form.

Rules:
- Keep it under 150 words
- Sound human, warm, and direct — not salesy
- Reference WHY they filled out the form (the campaign/event context)
- End with a clear ${ctaType} CTA
- No em-dashes (—)
- No generic "I noticed you..." openers
- One short paragraph max, then CTA
${voiceSettings ? `- Tone preferences: ${JSON.stringify(voiceSettings)}` : ''}

Sign off as: ${signOff || ownerName || 'the team'}`

  const userPrompt = `Write a follow-up email to ${input.contact_name}${input.email ? ` (${input.email})` : ''}.

Context:
${contextParts.join('\n')}

ICP fit: ${input.icp_score}/100 (${input.urgency})

Return ONLY a JSON object: { "subject": "...", "body": "..." }
The body should be plain text (no HTML).`

  // Try Claude Sonnet first
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (anthropicKey) {
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      })

      if (resp.ok) {
        const data = await resp.json()
        const text = data?.content?.[0]?.text || ''
        const parsed = parseEmailJSON(text)
        if (parsed) {
          return { ...parsed, model_used: 'claude-sonnet-4' }
        }
      }
    } catch (err) {
      console.warn('[drafting] Claude Sonnet failed, falling back to Gemini:', err)
    }
  }

  // Fallback: Gemini Flash
  const geminiKey = Deno.env.get('GEMINI_API_KEY')
  if (geminiKey) {
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.7,
              maxOutputTokens: 500,
            },
          }),
        }
      )

      if (resp.ok) {
        const data = await resp.json()
        const text = data?.candidates?.[0]?.content?.parts
          ?.filter((p: { thought?: boolean }) => !p.thought)
          ?.map((p: { text?: string }) => p.text)
          ?.join('') || ''
        const parsed = parseEmailJSON(text)
        if (parsed) {
          return { ...parsed, model_used: 'gemini-2.5-flash' }
        }
      }
    } catch (err) {
      console.warn('[drafting] Gemini Flash also failed:', err)
    }
  }

  // Ultimate fallback: simple template
  return {
    subject: `Following up${input.campaign_name ? ` — ${input.campaign_name}` : ''}`,
    body: `Hi ${input.contact_name.split(' ')[0]},\n\nThanks for ${input.lead_type === 'event_form' ? 'registering' : 'your interest'}${input.campaign_name ? ` via ${input.campaign_name}` : ''}. I'd love to learn more about what you're looking to achieve.\n\nWould you be open to a quick call this week?\n\n${signOff || 'Best'}`,
    model_used: 'template_fallback',
  }
}

function determineCTA(input: DraftInput): string {
  const campaignLower = (input.campaign_name || '').toLowerCase()
  if (campaignLower.includes('demo')) return 'schedule a demo'
  if (campaignLower.includes('webinar') || input.lead_type === 'event_form') return 'connect after the event'
  if (campaignLower.includes('whitepaper') || campaignLower.includes('ebook') || campaignLower.includes('guide')) return 'discuss what they learned'
  if (input.icp_score >= 80) return 'schedule a call'
  return 'start a conversation'
}

function parseEmailJSON(text: string): { subject: string; body: string } | null {
  try {
    // Try direct parse
    const parsed = JSON.parse(text)
    if (parsed.subject && parsed.body) {
      // Strip em-dashes (biggest AI tell)
      return {
        subject: parsed.subject.replace(/—/g, '-'),
        body: parsed.body.replace(/—/g, '-'),
      }
    }
  } catch {
    // Try extracting JSON from markdown code block
    const match = text.match(/\{[\s\S]*"subject"[\s\S]*"body"[\s\S]*\}/)
    if (match) {
      try {
        const parsed = JSON.parse(match[0])
        return {
          subject: parsed.subject.replace(/—/g, '-'),
          body: parsed.body.replace(/—/g, '-'),
        }
      } catch { /* ignore */ }
    }
  }
  return null
}
