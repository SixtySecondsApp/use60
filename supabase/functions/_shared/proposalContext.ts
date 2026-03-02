/**
 * Proposal Context Assembly
 *
 * Central module for gathering and merging all context needed to generate
 * a proposal. Covers three stories in the Proposal Generation Engine V2:
 *
 *   STY-003 — buildStyleFingerprint()
 *     Merges email-analysis tone settings, uploaded proposal-example style
 *     analysis, and org defaults into a single compound StyleFingerprint.
 *
 *   OFR-005 — getOfferingProfile() + assembleProposalContext()
 *     Wires org_offering_profiles into the context assembly pipeline, with
 *     a fallback to org_settings.value_propositions.
 *
 *   STY-005 — aggregateEditPatternsIntoStyle()
 *     Reads autopilot_signals for proposal.* edits, identifies trend
 *     patterns, and writes learned preferences back to user_tone_settings
 *     (additive, never destructive).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getStyleFingerprint, StyleFingerprint } from './proposalStyleFingerprint.ts'

// Re-export StyleFingerprint so consumers can import from one place
export type { StyleFingerprint }

// ============================================================================
// Types
// ============================================================================

/** Structured offering profile for an org. */
export interface OfferingProfile {
  id: string
  name: string
  description: string | null
  products: unknown[]
  services: unknown[]
  case_studies: unknown[]
  pricing_models: unknown[]
  differentiators: unknown[]
}

/** Deal context loaded for proposal generation. */
export interface DealContext {
  id: string
  name: string | null
  company: string | null
  value: number | null
  stage: string | null
  probability: number | null
  expected_close_date: string | null
  custom_fields: Record<string, unknown>
}

/** Contact profile loaded for proposal generation. */
export interface ContactProfile {
  id: string
  name: string | null
  email: string | null
  title: string | null
  company: string | null
  metadata: Record<string, unknown> | null
  recent_activities: Array<{
    id: string
    activity_type: string
    description: string | null
    created_at: string
  }>
}

/** Meeting context with optional transcript / AI summary. */
export interface MeetingContext {
  id: string
  title: string | null
  scheduled_at: string | null
  ai_summary: string | null
  /** Full transcript text — may be null or truncated; use ai_summary when > 15k tokens. */
  transcript: string | null
  /** TRUE when transcript exceeded the token budget and ai_summary was used instead. */
  used_summary: boolean
  previous_meetings: Array<{
    id: string
    title: string | null
    scheduled_at: string | null
    ai_summary: string | null
  }>
}

/** Org preferences relevant to proposal generation. */
export interface OrgPreferences {
  company_name: string | null
  value_propositions: unknown[]
  tone_guidelines: string | null
  industry: string | null
}

/** Full payload returned by assembleProposalContext(). */
export interface ProposalContextPayload {
  deal: DealContext | null
  contact: ContactProfile | null
  meeting: MeetingContext | null
  org_preferences: OrgPreferences
  style_fingerprint: StyleFingerprint
  offering_profile: OfferingProfile | null
  /** ISO-8601 timestamp of when context was assembled. */
  assembled_at: string
}

// ============================================================================
// Internal helpers
// ============================================================================

/** Rough token estimator: 4 chars ≈ 1 token. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/** Truncate a string to approximately maxTokens. */
function truncateToTokenBudget(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4
  if (text.length <= maxChars) return text
  return text.substring(0, maxChars) + '\n\n[... truncated to stay within token budget ...]'
}

/** Average an array of numbers. Returns fallback when array is empty. */
function avg(values: number[], fallback: number): number {
  if (values.length === 0) return fallback
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

// ============================================================================
// DEFAULT fingerprint (matches proposalStyleFingerprint.ts defaults)
// ============================================================================

const DEFAULT_FINGERPRINT: StyleFingerprint = {
  formality: 0.7,
  directness: 0.7,
  warmth: 0.5,
  preferred_length: 'moderate',
  sentence_patterns: [
    'Lead with the client outcome, then explain the mechanism.',
    'Use short sentences to make key points land.',
    'Avoid passive voice — write as if you are the actor.',
  ],
  words_to_avoid: [],
  sign_off_style: null,
  source: 'default',
}

// ============================================================================
// STY-003 — buildStyleFingerprint
// ============================================================================

/**
 * Build a compound StyleFingerprint from up to three sources:
 *
 *   1. Email analysis  — from getStyleFingerprint() (user_tone_settings)
 *   2. Proposal examples — from proposal_templates where brand_config.style_analysis exists
 *   3. Org defaults — from org_settings / organization_enrichment tone fields
 *
 * Priority:
 *   - Explicit user settings (email_analysis) always anchor the result.
 *   - Proposal examples are blended in when present (averaged numerics, merged lists).
 *   - Org defaults act as a fallback only when neither user source exists.
 *
 * Returns source:'compound' when multiple sources were merged, otherwise the
 * individual source value from whichever single source was used.
 */
export async function buildStyleFingerprint(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  orgId: string,
): Promise<StyleFingerprint> {
  try {
    // 1. Fetch email-analysis fingerprint (always the primary anchor)
    const emailFingerprintPromise = getStyleFingerprint(supabase, userId, orgId)

    // 2. Fetch proposal templates with style_analysis in brand_config
    //    Scope to the user's org (or user-created personal templates).
    const proposalExamplesPromise = supabase
      .from('proposal_templates')
      .select('brand_config')
      .or(`org_id.eq.${orgId},user_id.eq.${userId}`)
      .not('brand_config', 'is', null)
      .limit(10)

    // 3. Fetch org-level tone preferences
    const orgTonePromise = supabase
      .from('organization_enrichment')
      .select('tone_of_voice, value_propositions')
      .eq('organization_id', orgId)
      .eq('status', 'completed')
      .maybeSingle()

    const [emailFingerprint, examplesResult, orgToneResult] = await Promise.all([
      emailFingerprintPromise,
      proposalExamplesPromise,
      orgTonePromise,
    ])

    // -----------------------------------------------------------------------
    // Extract style analyses from proposal examples
    // -----------------------------------------------------------------------

    interface StyleAnalysis {
      avg_sentence_length?: number
      vocabulary_formality?: 'casual' | 'professional' | 'technical' | 'academic'
      tone_formality?: 'formal' | 'semi-formal' | 'casual'
      tone_directness?: 'direct' | 'diplomatic'
      tone_warmth?: 'warm' | 'neutral' | 'cool'
      common_transition_phrases?: string[]
      style_summary?: string
    }

    const styleAnalyses: StyleAnalysis[] = []
    if (examplesResult.data && examplesResult.data.length > 0) {
      for (const row of examplesResult.data) {
        const bc = row.brand_config as Record<string, unknown> | null
        if (bc?.style_analysis && typeof bc.style_analysis === 'object') {
          styleAnalyses.push(bc.style_analysis as StyleAnalysis)
        }
      }
    }

    // If neither the email fingerprint has real data nor example styles exist,
    // check whether org defaults can improve the fallback.
    const emailHasData = emailFingerprint.source !== 'default'
    const hasExamples = styleAnalyses.length > 0

    if (!emailHasData && !hasExamples) {
      // Attempt org fallback
      const orgTone = orgToneResult.data
      if (orgTone?.tone_of_voice && typeof orgTone.tone_of_voice === 'string') {
        // Return a slightly enriched default based on the org's tone string
        return {
          ...DEFAULT_FINGERPRINT,
          sentence_patterns: [
            `Org tone guideline: ${orgTone.tone_of_voice}`,
            ...DEFAULT_FINGERPRINT.sentence_patterns,
          ],
          source: 'default',
        }
      }
      // Nothing available — return plain default
      return DEFAULT_FINGERPRINT
    }

    // -----------------------------------------------------------------------
    // Blend email fingerprint + proposal examples
    // -----------------------------------------------------------------------

    if (!hasExamples) {
      // Only email analysis — return as-is (source already set by getStyleFingerprint)
      return emailFingerprint
    }

    // Map StyleAnalysis categorical fields to 0–1 numeric scales
    function analysisFormality(sa: StyleAnalysis): number {
      switch (sa.tone_formality) {
        case 'formal': return 0.85
        case 'semi-formal': return 0.6
        case 'casual': return 0.25
        default: return 0.7
      }
    }

    function analysisDirectness(sa: StyleAnalysis): number {
      return sa.tone_directness === 'direct' ? 0.8 : 0.45
    }

    function analysisWarmth(sa: StyleAnalysis): number {
      switch (sa.tone_warmth) {
        case 'warm': return 0.75
        case 'cool': return 0.25
        default: return 0.5
      }
    }

    const exampleFormalities = styleAnalyses.map(analysisFormality)
    const exampleDirectnesses = styleAnalyses.map(analysisDirectness)
    const exampleWarmths = styleAnalyses.map(analysisWarmth)

    // Average across sources (email anchors at 60%, examples contribute remaining 40%)
    const blendedFormality = emailHasData
      ? emailFingerprint.formality * 0.6 + avg(exampleFormalities, emailFingerprint.formality) * 0.4
      : avg(exampleFormalities, DEFAULT_FINGERPRINT.formality)

    const blendedDirectness = emailHasData
      ? emailFingerprint.directness * 0.6 + avg(exampleDirectnesses, emailFingerprint.directness) * 0.4
      : avg(exampleDirectnesses, DEFAULT_FINGERPRINT.directness)

    const blendedWarmth = emailHasData
      ? emailFingerprint.warmth * 0.6 + avg(exampleWarmths, emailFingerprint.warmth) * 0.4
      : avg(exampleWarmths, DEFAULT_FINGERPRINT.warmth)

    // Merge sentence patterns (email patterns first, then transition phrases from examples)
    const mergedPatterns = [...emailFingerprint.sentence_patterns]
    for (const sa of styleAnalyses) {
      if (sa.common_transition_phrases && sa.common_transition_phrases.length > 0) {
        const phrases = sa.common_transition_phrases.slice(0, 3)
        mergedPatterns.push(`Common transition phrases from examples: ${phrases.join(', ')}.`)
        break // One block of transition phrases is enough
      }
    }
    const summaries = styleAnalyses.filter((sa) => sa.style_summary).map((sa) => sa.style_summary!)
    if (summaries.length > 0) {
      mergedPatterns.push(`Example proposal style: ${summaries[0]}`)
    }

    // Union words_to_avoid
    const wordsToAvoid = Array.from(
      new Set([
        ...emailFingerprint.words_to_avoid,
        // No words_to_avoid in StyleAnalysis — only email analysis contributes these
      ]),
    )

    return {
      formality: Math.round(blendedFormality * 100) / 100,
      directness: Math.round(blendedDirectness * 100) / 100,
      warmth: Math.round(blendedWarmth * 100) / 100,
      preferred_length: emailFingerprint.preferred_length,
      sentence_patterns: mergedPatterns.slice(0, 8),
      words_to_avoid: wordsToAvoid,
      sign_off_style: emailFingerprint.sign_off_style,
      source: 'compound',
    }
  } catch (err) {
    console.warn('[proposalContext] buildStyleFingerprint error (non-fatal):', err)
    return DEFAULT_FINGERPRINT
  }
}

// ============================================================================
// OFR-005 — getOfferingProfile
// ============================================================================

/**
 * Return the active offering profile for an org, or null if none exists.
 *
 * Falls back to org_settings.value_propositions wrapped as a minimal
 * OfferingProfile when no org_offering_profiles row is found.
 *
 * Uses maybeSingle() since the row may not exist.
 */
export async function getOfferingProfile(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
): Promise<OfferingProfile | null> {
  try {
    // Query the active offering profile for this org
    const { data: row, error } = await supabase
      .from('org_offering_profiles')
      .select(
        'id, name, description, products_json, services_json, case_studies_json, pricing_models_json, differentiators_json',
      )
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.warn('[proposalContext] Error fetching offering profile (non-fatal):', error.message)
    }

    if (row) {
      return {
        id: row.id,
        name: row.name,
        description: row.description ?? null,
        products: (row.products_json as unknown[]) ?? [],
        services: (row.services_json as unknown[]) ?? [],
        case_studies: (row.case_studies_json as unknown[]) ?? [],
        pricing_models: (row.pricing_models_json as unknown[]) ?? [],
        differentiators: (row.differentiators_json as unknown[]) ?? [],
      }
    }

    // -----------------------------------------------------------------------
    // Fallback: org_settings / organization_enrichment value_propositions
    // -----------------------------------------------------------------------
    const { data: enrichment } = await supabase
      .from('organization_enrichment')
      .select('company_name, value_propositions, products')
      .eq('organization_id', orgId)
      .eq('status', 'completed')
      .maybeSingle()

    if (enrichment) {
      const valueProp = (enrichment.value_propositions as unknown[]) ?? []
      const products = (enrichment.products as unknown[]) ?? []
      if (valueProp.length > 0 || products.length > 0) {
        return {
          id: `fallback-${orgId}`,
          name: `${enrichment.company_name ?? 'Org'} Offering (auto-generated from enrichment)`,
          description: null,
          products,
          services: [],
          case_studies: [],
          pricing_models: [],
          differentiators: valueProp,
        }
      }
    }

    return null
  } catch (err) {
    console.warn('[proposalContext] getOfferingProfile error (non-fatal):', err)
    return null
  }
}

// ============================================================================
// OFR-005 — assembleProposalContext
// ============================================================================

/**
 * Assemble all context needed to generate a proposal.
 *
 * Queries are parallelised where there are no data dependencies. The total
 * token budget across offering and meeting data is kept to 30k tokens; long
 * transcripts are replaced with their ai_summary automatically.
 *
 * Column ownership:
 *   meetings   → owner_user_id
 *   deals      → owner_id
 *   contacts   → owner_id
 *   activities → user_id
 */
export async function assembleProposalContext(
  supabase: ReturnType<typeof createClient>,
  params: {
    userId: string
    orgId: string
    meetingId?: string
    dealId?: string
    contactId?: string
  },
): Promise<ProposalContextPayload> {
  const { userId, orgId, meetingId, dealId, contactId } = params

  // -------------------------------------------------------------------------
  // Resolve contactId from deal when not explicitly provided
  // -------------------------------------------------------------------------
  let resolvedContactId = contactId

  // Run independent queries in parallel
  const [
    dealResult,
    orgEnrichmentResult,
    styleFingerprint,
    offeringProfile,
  ] = await Promise.all([
    // 1. Deal context
    dealId
      ? supabase
          .from('deals')
          .select(
            'id, name, company, value, probability, expected_close_date, owner_id',
          )
          .eq('id', dealId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    // 2. Org preferences (enrichment)
    supabase
      .from('organization_enrichment')
      .select('company_name, value_propositions, tone_of_voice, industry')
      .eq('organization_id', orgId)
      .eq('status', 'completed')
      .maybeSingle(),

    // 3. Style fingerprint (compound merge)
    buildStyleFingerprint(supabase, userId, orgId),

    // 4. Offering profile
    getOfferingProfile(supabase, orgId),
  ])

  // -------------------------------------------------------------------------
  // Resolve contactId from deal.primary_contact_id if still unknown
  // -------------------------------------------------------------------------
  if (!resolvedContactId && dealResult.data) {
    // Try to get primary contact from deal_contacts join table
    const { data: dealContact } = await supabase
      .from('deal_contacts')
      .select('contact_id')
      .eq('deal_id', dealId!)
      .limit(1)
      .maybeSingle()

    if (dealContact?.contact_id) {
      resolvedContactId = dealContact.contact_id
    }
  }

  // -------------------------------------------------------------------------
  // Fetch contact profile + activities in parallel
  // -------------------------------------------------------------------------
  const [contactResult, activitiesResult] = await Promise.all([
    resolvedContactId
      ? supabase
          .from('contacts')
          .select('id, name, email, title, company, metadata, owner_id')
          .eq('id', resolvedContactId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    resolvedContactId
      ? supabase
          .from('activities')
          .select('id, activity_type, description, created_at')
          .eq('contact_id', resolvedContactId)
          .order('created_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: null, error: null }),
  ])

  // -------------------------------------------------------------------------
  // Fetch meeting context (transcript-aware)
  // -------------------------------------------------------------------------
  let meetingContext: MeetingContext | null = null

  if (meetingId) {
    const { data: meeting } = await supabase
      .from('meetings')
      .select('id, title, scheduled_at, ai_summary, owner_user_id, deal_id')
      .eq('id', meetingId)
      .maybeSingle()

    if (meeting) {
      // Fetch recording/transcript separately; fall back to ai_summary when > 15k tokens
      const { data: recording } = await supabase
        .from('recordings')
        .select('transcript, ai_summary')
        .eq('meeting_id', meetingId)
        .maybeSingle()

      let transcript: string | null = null
      let usedSummary = false

      const rawTranscript = recording?.transcript ?? null
      if (rawTranscript && estimateTokens(rawTranscript) > 15000) {
        // Too long — prefer AI summary
        transcript = null
        usedSummary = true
      } else {
        transcript = rawTranscript
        usedSummary = false
      }

      const aiSummary = meeting.ai_summary ?? recording?.ai_summary ?? null

      // Previous meetings for the same deal (conversation history)
      const prevMeetingDealId = meeting.deal_id || dealId
      let previousMeetings: MeetingContext['previous_meetings'] = []

      if (prevMeetingDealId) {
        const { data: prevMeetings } = await supabase
          .from('meetings')
          .select('id, title, scheduled_at, ai_summary')
          .eq('deal_id', prevMeetingDealId)
          .neq('id', meetingId)
          .order('scheduled_at', { ascending: false })
          .limit(5)

        previousMeetings = (prevMeetings ?? []).map((m) => ({
          id: m.id,
          title: m.title ?? null,
          scheduled_at: m.scheduled_at ?? null,
          ai_summary: m.ai_summary ?? null,
        }))
      }

      meetingContext = {
        id: meeting.id,
        title: meeting.title ?? null,
        scheduled_at: meeting.scheduled_at ?? null,
        ai_summary: aiSummary,
        transcript,
        used_summary: usedSummary,
        previous_meetings: previousMeetings,
      }
    }
  }

  // -------------------------------------------------------------------------
  // Assemble deal context
  // -------------------------------------------------------------------------
  let dealContext: DealContext | null = null

  if (dealResult.data) {
    // Fetch custom fields
    const { data: customFields } = await supabase
      .from('deal_custom_fields')
      .select('field_key, field_value')
      .eq('deal_id', dealId!)
      .limit(50)

    const cfMap: Record<string, unknown> = {}
    for (const cf of customFields ?? []) {
      cfMap[cf.field_key] = cf.field_value
    }

    dealContext = {
      id: dealResult.data.id,
      name: dealResult.data.name ?? null,
      company: dealResult.data.company ?? null,
      value: dealResult.data.value ?? null,
      stage: null, // stage_id resolved separately if needed
      probability: dealResult.data.probability ?? null,
      expected_close_date: dealResult.data.expected_close_date ?? null,
      custom_fields: cfMap,
    }
  }

  // -------------------------------------------------------------------------
  // Assemble contact profile
  // -------------------------------------------------------------------------
  let contactProfile: ContactProfile | null = null

  if (contactResult.data) {
    contactProfile = {
      id: contactResult.data.id,
      name: contactResult.data.name ?? null,
      email: contactResult.data.email ?? null,
      title: contactResult.data.title ?? null,
      company: contactResult.data.company ?? null,
      metadata: (contactResult.data.metadata as Record<string, unknown>) ?? null,
      recent_activities: (activitiesResult.data ?? []).map((a) => ({
        id: a.id,
        activity_type: a.activity_type,
        description: a.description ?? null,
        created_at: a.created_at,
      })),
    }
  }

  // -------------------------------------------------------------------------
  // Assemble org preferences
  // -------------------------------------------------------------------------
  const enrichment = orgEnrichmentResult.data
  const orgPreferences: OrgPreferences = {
    company_name: enrichment?.company_name ?? null,
    value_propositions: (enrichment?.value_propositions as unknown[]) ?? [],
    tone_guidelines: (enrichment?.tone_of_voice as string) ?? null,
    industry: (enrichment?.industry as string) ?? null,
  }

  // -------------------------------------------------------------------------
  // Token-budget enforcement for offering profile (30k budget shared)
  // -------------------------------------------------------------------------
  if (offeringProfile) {
    const offeringJson = JSON.stringify(offeringProfile)
    if (estimateTokens(offeringJson) > 8000) {
      // Truncate case studies first (usually longest), then other arrays
      offeringProfile.case_studies = offeringProfile.case_studies.slice(0, 3)
      offeringProfile.pricing_models = offeringProfile.pricing_models.slice(0, 3)
      offeringProfile.products = offeringProfile.products.slice(0, 5)
      offeringProfile.services = offeringProfile.services.slice(0, 5)
    }
  }

  // Truncate transcript if present (within remaining budget)
  if (meetingContext?.transcript) {
    meetingContext = {
      ...meetingContext,
      transcript: truncateToTokenBudget(meetingContext.transcript, 12000),
    }
  }

  return {
    deal: dealContext,
    contact: contactProfile,
    meeting: meetingContext,
    org_preferences: orgPreferences,
    style_fingerprint: styleFingerprint,
    offering_profile: offeringProfile,
    assembled_at: new Date().toISOString(),
  }
}

// ============================================================================
// STY-005 — aggregateEditPatternsIntoStyle
// ============================================================================

/**
 * Aggregate proposal edit patterns from autopilot_signals and update
 * user_tone_settings with learned preferences.
 *
 * Rules:
 *   - Requires at minimum 5 `approved_edited` signals before making any update.
 *   - Updates are additive — never overwrites existing values destructively.
 *   - If overall average edit distance > 0.3, the user is consistently
 *     rewriting AI output; adjust tone descriptors accordingly.
 *   - Identifies the most-edited section type (e.g. 'pricing', 'executive_summary')
 *     and annotates brand_voice_description with an observation.
 *
 * Called periodically (e.g. from a cron edge function) after proposals are approved.
 */
export async function aggregateEditPatternsIntoStyle(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  orgId: string,
): Promise<void> {
  try {
    // -----------------------------------------------------------------------
    // 1. Query autopilot_signals for approved_edited proposal actions
    // -----------------------------------------------------------------------
    const { data: signals, error: signalsError } = await supabase
      .from('autopilot_signals')
      .select('action_type, edit_distance, edit_fields, created_at')
      .eq('user_id', userId)
      .eq('org_id', orgId)
      .eq('signal', 'approved_edited')
      .ilike('action_type', 'proposal.%')
      .order('created_at', { ascending: false })
      .limit(100)

    if (signalsError) {
      console.warn('[proposalContext] aggregateEditPatternsIntoStyle: error querying signals:', signalsError.message)
      return
    }

    if (!signals || signals.length < 5) {
      console.log(
        `[proposalContext] aggregateEditPatternsIntoStyle: insufficient signals (${signals?.length ?? 0} < 5) — skipping update`,
      )
      return
    }

    // -----------------------------------------------------------------------
    // 2. Compute aggregate metrics
    // -----------------------------------------------------------------------

    const editDistances = signals
      .map((s) => typeof s.edit_distance === 'number' ? s.edit_distance : 0)
      .filter((d) => d > 0)

    const avgEditDistance = editDistances.length > 0
      ? editDistances.reduce((sum, d) => sum + d, 0) / editDistances.length
      : 0

    // Identify most-edited section type from action_type (e.g. 'proposal.pricing')
    const sectionCounts: Record<string, number> = {}
    for (const s of signals) {
      // action_type is like 'proposal.pricing', 'proposal.executive_summary', etc.
      const parts = s.action_type.split('.')
      const section = parts[1] ?? 'unknown'
      sectionCounts[section] = (sectionCounts[section] ?? 0) + 1
    }

    const mostEditedSection = Object.entries(sectionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    // Also look at edit_fields for field-level patterns
    const fieldCounts: Record<string, number> = {}
    for (const s of signals) {
      for (const field of s.edit_fields ?? []) {
        fieldCounts[field] = (fieldCounts[field] ?? 0) + 1
      }
    }
    console.log(
      `[proposalContext] aggregateEditPatternsIntoStyle: ${signals.length} signals, avg_edit_distance=${avgEditDistance.toFixed(2)}, most_edited_section=${mostEditedSection}`,
    )

    // -----------------------------------------------------------------------
    // 3. Read current tone settings (to apply additive updates)
    // -----------------------------------------------------------------------
    const { data: currentTone } = await supabase
      .from('user_tone_settings')
      .select('tone_style, formality_level, brand_voice_description, words_to_avoid')
      .eq('user_id', userId)
      .eq('content_type', 'email')
      .maybeSingle()

    // -----------------------------------------------------------------------
    // 4. Build update payload (additive — never destructive)
    // -----------------------------------------------------------------------
    const updates: Record<string, unknown> = {}

    // High edit distance → user consistently rewrites output → surface as a note
    if (avgEditDistance > 0.3) {
      const highEditNote = `[Auto-learned] User consistently edits proposal output (avg distance ${avgEditDistance.toFixed(2)}). ` +
        `Most-edited section: ${mostEditedSection ?? 'unknown'}.`

      const existingVoice = currentTone?.brand_voice_description ?? ''
      // Only append if the note isn't already present
      if (!existingVoice.includes('[Auto-learned]')) {
        updates['brand_voice_description'] = existingVoice
          ? `${existingVoice}\n\n${highEditNote}`
          : highEditNote
      } else {
        // Update the existing auto-learned block
        const cleanedVoice = existingVoice.replace(/\[Auto-learned\].*$/, '').trim()
        updates['brand_voice_description'] = cleanedVoice
          ? `${cleanedVoice}\n\n${highEditNote}`
          : highEditNote
      }
    }

    // If pricing section is most-edited, flag it
    if (mostEditedSection === 'pricing' && sectionCounts['pricing'] >= 3) {
      const pricingNote = '[Auto-learned] Pricing sections are frequently edited — AI may need different pricing language.'
      const existingVoice = (updates['brand_voice_description'] as string) ?? currentTone?.brand_voice_description ?? ''
      if (!existingVoice.includes('Pricing sections are frequently edited')) {
        updates['brand_voice_description'] = existingVoice
          ? `${existingVoice}\n${pricingNote}`
          : pricingNote
      }
    }

    // Overall high-edit pattern → reduce formality slightly (from current baseline)
    if (avgEditDistance > 0.3 && currentTone?.formality_level != null) {
      const currentFormality = currentTone.formality_level as number
      // Reduce formality by 1 step (minimum 1) if currently >= 7
      if (currentFormality >= 7) {
        updates['formality_level'] = currentFormality - 1
      }
    }

    // If field 'tone' or 'voice' is commonly edited, note directness preference
    const directnessFields = ['tone', 'voice', 'style', 'language']
    const directnessEdits = directnessFields.reduce((sum, f) => sum + (fieldCounts[f] ?? 0), 0)
    if (directnessEdits >= 3) {
      const existingToneStyle = currentTone?.tone_style ?? ''
      if (!existingToneStyle.includes('[auto]')) {
        updates['tone_style'] = existingToneStyle
          ? `${existingToneStyle} [auto: directness adjusted from edit patterns]`
          : '[auto: directness adjusted from edit patterns]'
      }
    }

    if (Object.keys(updates).length === 0) {
      console.log('[proposalContext] aggregateEditPatternsIntoStyle: no updates warranted')
      return
    }

    updates['updated_at'] = new Date().toISOString()

    // -----------------------------------------------------------------------
    // 5. Upsert user_tone_settings (additive)
    // -----------------------------------------------------------------------
    const { error: upsertError } = await supabase
      .from('user_tone_settings')
      .upsert(
        {
          user_id: userId,
          content_type: 'email',
          ...updates,
        },
        {
          onConflict: 'user_id,content_type',
          ignoreDuplicates: false,
        },
      )

    if (upsertError) {
      console.warn('[proposalContext] aggregateEditPatternsIntoStyle: upsert error:', upsertError.message)
      return
    }

    console.log(
      `[proposalContext] aggregateEditPatternsIntoStyle: updated user_tone_settings for user ${userId} with fields: ${Object.keys(updates).join(', ')}`,
    )
  } catch (err) {
    console.warn('[proposalContext] aggregateEditPatternsIntoStyle: unexpected error (non-fatal):', err)
  }
}
