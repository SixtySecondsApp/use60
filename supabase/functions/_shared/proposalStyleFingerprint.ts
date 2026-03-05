/**
 * Proposal Style Fingerprint
 *
 * Fetches the user's tone settings and composes them into a typed StyleFingerprint
 * that can be injected into proposal composition prompts.
 *
 * Sources ranked by priority:
 *   1. user_tone_settings row for the 'email' content type (best proxy for proposal writing)
 *   2. Professional defaults — formal, consultative, confident
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'

// ============================================================================
// Types
// ============================================================================

export interface StyleFingerprint {
  /** 0–1 scale: 0 = casual, 1 = highly formal */
  formality: number
  /** 0–1 scale: 0 = diplomatic/hedging, 1 = direct/assertive */
  directness: number
  /** 0–1 scale: 0 = neutral/transactional, 1 = warm/personal */
  warmth: number
  preferred_length: 'brief' | 'moderate' | 'detailed'
  sentence_patterns: string[]
  words_to_avoid: string[]
  sign_off_style: string | null
  /**
   * How this fingerprint was assembled:
   *  - 'email_analysis'       — derived from analyzed Gmail examples
   *  - 'proposal_examples'    — derived from uploaded proposal documents
   *  - 'edit_learning'        — updated by the user editing AI output
   *  - 'compound'             — merged from multiple sources
   *  - 'default'              — no user settings found; professional defaults used
   */
  source: 'email_analysis' | 'proposal_examples' | 'edit_learning' | 'compound' | 'default'
}

// ============================================================================
// Internal: DB row shape (only the columns we need)
// ============================================================================

interface ToneSettingsRow {
  tone_style: string | null
  formality_level: number | null   // 1–10
  brand_voice_description: string | null
  sample_phrases: string[] | null
  words_to_avoid: string[] | null
  preferred_keywords: string[] | null
  email_sign_off: string | null
}

// ============================================================================
// Default fingerprint (professional, consultative, confident)
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
// Helpers
// ============================================================================

/**
 * Map a 1–10 formality_level to a 0–1 scale.
 * The DB stores 1 = very casual, 10 = very formal.
 */
function formalityToScale(level: number): number {
  const clamped = Math.max(1, Math.min(10, level))
  return (clamped - 1) / 9
}

/**
 * Derive directness from tone_style string heuristics.
 * Falls back to 0.65 (moderately direct) when nothing useful is found.
 */
function deriveDirectness(toneStyle: string | null): number {
  if (!toneStyle) return 0.65
  const lower = toneStyle.toLowerCase()
  if (lower.includes('direct') || lower.includes('assertive') || lower.includes('confident')) return 0.85
  if (lower.includes('diplomatic') || lower.includes('soft') || lower.includes('gentle')) return 0.35
  if (lower.includes('conversational') || lower.includes('friendly')) return 0.55
  return 0.65
}

/**
 * Derive warmth from tone_style and brand_voice strings.
 * Falls back to 0.5 (neutral) when nothing useful is found.
 */
function deriveWarmth(toneStyle: string | null, brandVoice: string | null): number {
  const combined = `${toneStyle || ''} ${brandVoice || ''}`.toLowerCase()
  if (combined.includes('warm') || combined.includes('personal') || combined.includes('friendly')) return 0.75
  if (combined.includes('formal') || combined.includes('corporate') || combined.includes('neutral')) return 0.3
  if (combined.includes('consultative') || combined.includes('professional')) return 0.5
  return 0.5
}

/**
 * Derive preferred_length from the DB settings.
 * max_length_override = null → moderate; <= 300 → brief; >= 600 → detailed.
 */
function derivePreferredLength(
  maxLengthOverride: number | null | undefined,
  toneStyle: string | null,
): StyleFingerprint['preferred_length'] {
  if (maxLengthOverride !== null && maxLengthOverride !== undefined) {
    if (maxLengthOverride <= 300) return 'brief'
    if (maxLengthOverride >= 600) return 'detailed'
    return 'moderate'
  }
  const lower = (toneStyle || '').toLowerCase()
  if (lower.includes('concise') || lower.includes('brief') || lower.includes('short')) return 'brief'
  if (lower.includes('comprehensive') || lower.includes('detailed') || lower.includes('thorough')) return 'detailed'
  return 'moderate'
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Build a StyleFingerprint for the given user from their stored tone settings.
 *
 * Falls back to DEFAULT_FINGERPRINT (source: 'default') when the user has no
 * settings row. Uses maybeSingle() since the row may not exist.
 *
 * @param supabase  An authenticated SupabaseClient (service role or user-scoped)
 * @param userId    The user's UUID
 * @param _orgId    Reserved for future org-level settings; currently unused
 */
export async function getStyleFingerprint(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  _orgId: string,
): Promise<StyleFingerprint> {
  try {
    // We prefer the 'email' tone settings as the closest proxy for proposal voice.
    // Use maybeSingle() because the row may not exist.
    const { data: row, error } = await supabase
      .from('user_tone_settings')
      .select(
        'tone_style, formality_level, brand_voice_description, sample_phrases, words_to_avoid, preferred_keywords, email_sign_off',
      )
      .eq('user_id', userId)
      .eq('content_type', 'email')
      .maybeSingle<ToneSettingsRow>()

    if (error) {
      console.warn('[proposalStyleFingerprint] Error querying user_tone_settings (non-fatal):', error.message)
      return DEFAULT_FINGERPRINT
    }

    if (!row) {
      console.log('[proposalStyleFingerprint] No tone settings found for user — using professional defaults')
      return DEFAULT_FINGERPRINT
    }

    // Build sentence_patterns from sample_phrases + preferred_keywords
    const sentencePatterns: string[] = []
    if (row.sample_phrases && row.sample_phrases.length > 0) {
      sentencePatterns.push(...row.sample_phrases.slice(0, 5))
    }
    if (row.preferred_keywords && row.preferred_keywords.length > 0) {
      sentencePatterns.push(
        `Prefer using these phrases where natural: ${row.preferred_keywords.slice(0, 8).join(', ')}.`,
      )
    }
    // If no patterns at all, fall back to the defaults
    if (sentencePatterns.length === 0) {
      sentencePatterns.push(...DEFAULT_FINGERPRINT.sentence_patterns)
    }

    const formality = row.formality_level != null
      ? formalityToScale(row.formality_level)
      : DEFAULT_FINGERPRINT.formality

    return {
      formality,
      directness: deriveDirectness(row.tone_style),
      warmth: deriveWarmth(row.tone_style, row.brand_voice_description),
      preferred_length: derivePreferredLength(null, row.tone_style),
      sentence_patterns: sentencePatterns,
      words_to_avoid: row.words_to_avoid || [],
      sign_off_style: row.email_sign_off || null,
      source: 'email_analysis',
    }
  } catch (err) {
    console.warn('[proposalStyleFingerprint] Unexpected error (non-fatal):', err)
    return DEFAULT_FINGERPRINT
  }
}

// ============================================================================
// Prompt helpers
// ============================================================================

/**
 * Convert a StyleFingerprint into a concise prose block suitable for injection
 * into a generation prompt.
 *
 * Example output:
 *
 *   WRITING STYLE REQUIREMENTS:
 *   - Tone: moderately formal, direct, with a warm personal touch
 *   - Length preference: moderate — balance depth with brevity
 *   - Words/phrases to avoid: synergy, leverage, utilize
 *   - Sign-off style: "Best,"
 *   - Style patterns:
 *     • Lead with the client outcome, then explain the mechanism.
 */
export function styleFingerPrintToPromptBlock(fp: StyleFingerprint): string {
  const formalityLabel =
    fp.formality >= 0.75 ? 'highly formal' :
    fp.formality >= 0.5  ? 'moderately formal' :
    fp.formality >= 0.25 ? 'semi-casual' : 'casual'

  const directnessLabel =
    fp.directness >= 0.75 ? 'direct and assertive' :
    fp.directness >= 0.5  ? 'moderately direct' : 'diplomatic and measured'

  const warmthLabel =
    fp.warmth >= 0.65 ? 'warm and personal' :
    fp.warmth >= 0.4  ? 'professionally friendly' : 'neutral and transactional'

  const lengthLabel =
    fp.preferred_length === 'brief'    ? 'keep it concise — fewer words, bigger impact' :
    fp.preferred_length === 'detailed' ? 'comprehensive depth is valued — cover all angles' :
                                         'balance depth with brevity'

  const lines: string[] = [
    'WRITING STYLE REQUIREMENTS:',
    `- Tone: ${formalityLabel}, ${directnessLabel}, ${warmthLabel}`,
    `- Length preference: ${fp.preferred_length} — ${lengthLabel}`,
    '- Language: British English spelling (e.g. "optimise" not "optimize", "colour" not "color", "centre" not "center", "specialised" not "specialized")',
    '- Punctuation: Use en-dashes (–) not em-dashes (—). Prefer commas or semicolons over dashes where possible.',
  ]

  if (fp.words_to_avoid.length > 0) {
    lines.push(`- Words/phrases to avoid: ${fp.words_to_avoid.join(', ')}`)
  }

  if (fp.sign_off_style) {
    lines.push(`- Sign-off style: "${fp.sign_off_style}"`)
  }

  if (fp.sentence_patterns.length > 0) {
    lines.push('- Style patterns:')
    fp.sentence_patterns.forEach((p) => lines.push(`  • ${p}`))
  }

  if (fp.source === 'default') {
    lines.push('(Style sourced from professional defaults — no personal settings found.)')
  }

  return lines.join('\n')
}
