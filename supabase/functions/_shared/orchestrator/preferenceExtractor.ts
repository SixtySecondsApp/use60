/**
 * Preference Extractor (PST-010)
 *
 * Extracts and stores learning preferences from edit diffs.
 * Scans recent user edits to AI-generated content (email drafts, follow-ups)
 * and detects recurring patterns (e.g., "always shortens emails", "removes PS lines").
 *
 * Detected preferences are upserted into the `learning_preferences` table and
 * consumed by draft generation to personalize future output.
 *
 * Data sources:
 * - `ai_feedback` — records from the learningLoop with original_content / edited_content / edit_delta
 * - `hitl_pending_approvals` — HITL email drafts where status = 'edited' with original_content / edited_content (JSONB)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

type SupabaseClient = ReturnType<typeof createClient>;

// =============================================================================
// Types
// =============================================================================

export interface DetectedPreference {
  key: PreferenceKey;
  category: PreferenceCategory;
  confidence: number;
  sampleCount: number;
  matchCount: number;
  description: string;
}

export interface StoredPreference {
  key: string;
  value: string;
  confidence: number;
}

export type PreferenceKey =
  | 'shorter_emails'
  | 'longer_emails'
  | 'casual_greeting'
  | 'formal_greeting'
  | 'removes_ps_line'
  | 'adds_cta'
  | 'prefers_bullet_points'
  | 'removes_emojis';

export type PreferenceCategory =
  | 'tone'
  | 'length'
  | 'greeting'
  | 'structure'
  | 'content'
  | 'general';

/** A normalised edit pair — original and edited text from any source. */
interface EditPair {
  original: string;
  edited: string;
  editDelta?: Record<string, unknown> | null;
}

// =============================================================================
// Preference detection rules
// =============================================================================

interface DetectionRule {
  key: PreferenceKey;
  category: PreferenceCategory;
  description: string;
  /** Returns true if this edit pair exhibits the pattern. */
  detect: (pair: EditPair) => boolean;
}

const DETECTION_RULES: DetectionRule[] = [
  // --- Length ---
  {
    key: 'shorter_emails',
    category: 'length',
    description: 'User consistently shortens AI-generated drafts',
    detect: (pair) => {
      // Check edit_delta first if available
      if (pair.editDelta?.length_change === 'shorter') return true;
      if (!pair.original || !pair.edited) return false;
      const ratio = pair.edited.length / pair.original.length;
      return ratio < 0.85; // Removed 15%+ of content
    },
  },
  {
    key: 'longer_emails',
    category: 'length',
    description: 'User consistently adds more content to drafts',
    detect: (pair) => {
      if (pair.editDelta?.length_change === 'longer') return true;
      if (!pair.original || !pair.edited) return false;
      const ratio = pair.edited.length / pair.original.length;
      return ratio > 1.15; // Added 15%+ more content
    },
  },

  // --- Greeting tone ---
  {
    key: 'casual_greeting',
    category: 'greeting',
    description: 'User replaces formal greetings with casual ones',
    detect: (pair) => {
      if (pair.editDelta?.tone_shift === 'more_casual') return true;
      if (!pair.original || !pair.edited) return false;
      const formalGreetings = /^(dear|good morning|good afternoon|good evening)\b/im;
      const casualGreetings = /^(hey|hi|yo|hiya|howdy)\b/im;
      const originalHasFormal = formalGreetings.test(pair.original);
      const editedHasCasual = casualGreetings.test(pair.edited);
      return originalHasFormal && editedHasCasual;
    },
  },
  {
    key: 'formal_greeting',
    category: 'greeting',
    description: 'User replaces casual greetings with formal ones',
    detect: (pair) => {
      if (pair.editDelta?.tone_shift === 'more_formal') return true;
      if (!pair.original || !pair.edited) return false;
      const casualGreetings = /^(hey|hi|yo|hiya|howdy)\b/im;
      const formalGreetings = /^(dear|good morning|good afternoon|good evening)\b/im;
      const originalHasCasual = casualGreetings.test(pair.original);
      const editedHasFormal = formalGreetings.test(pair.edited);
      return originalHasCasual && editedHasFormal;
    },
  },

  // --- Content patterns ---
  {
    key: 'removes_ps_line',
    category: 'content',
    description: 'User removes PS/postscript lines from drafts',
    detect: (pair) => {
      if (!pair.original || !pair.edited) return false;
      const psPattern = /^p\.?s\.?\b/im;
      return psPattern.test(pair.original) && !psPattern.test(pair.edited);
    },
  },
  {
    key: 'adds_cta',
    category: 'content',
    description: 'User adds call-to-action when AI omits one',
    detect: (pair) => {
      if (pair.editDelta?.added_cta === true) return true;
      if (!pair.original || !pair.edited) return false;
      const ctaPatterns = [
        'let me know',
        'would you be open',
        'can we',
        'schedule a',
        'grab a time',
        'book a',
        'your thoughts',
        'next step',
        'get back to me',
        'shall we',
      ];
      const origLower = pair.original.toLowerCase();
      const editLower = pair.edited.toLowerCase();
      const originalHasCta = ctaPatterns.some((p) => origLower.includes(p));
      const editedHasCta = ctaPatterns.some((p) => editLower.includes(p));
      return !originalHasCta && editedHasCta;
    },
  },

  // --- Structure ---
  {
    key: 'prefers_bullet_points',
    category: 'structure',
    description: 'User restructures prose into bullet points',
    detect: (pair) => {
      if (pair.editDelta?.added_bullet_points === true) return true;
      if (!pair.original || !pair.edited) return false;
      const bulletPattern = /^[\s]*[-•*]\s/gm;
      const originalBullets = (pair.original.match(bulletPattern) || []).length;
      const editedBullets = (pair.edited.match(bulletPattern) || []).length;
      return editedBullets > originalBullets + 1; // Added 2+ bullet points
    },
  },

  // --- Emoji removal ---
  {
    key: 'removes_emojis',
    category: 'tone',
    description: 'User strips emojis from AI-generated content',
    detect: (pair) => {
      if (!pair.original || !pair.edited) return false;
      // Match common emoji unicode ranges
      const emojiPattern =
        /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;
      const originalEmojis = (pair.original.match(emojiPattern) || []).length;
      const editedEmojis = (pair.edited.match(emojiPattern) || []).length;
      return originalEmojis >= 2 && editedEmojis < originalEmojis;
    },
  },
];

// Minimum number of edits that match a pattern before we store the preference
const MIN_SAMPLES_FOR_PREFERENCE = 5;

// =============================================================================
// Extract Preferences
// =============================================================================

/**
 * Extract learning preferences from recent edit diffs.
 *
 * Scans `ai_feedback` and `hitl_pending_approvals` for the user's recent edits,
 * runs detection rules against each edit pair, and upserts any preferences
 * that reach the minimum sample threshold into `learning_preferences`.
 *
 * Non-blocking — errors are logged but never thrown.
 */
export async function extractPreferences(
  client: SupabaseClient,
  orgId: string,
  userId: string,
): Promise<{ extracted: DetectedPreference[]; errors: string[] }> {
  const errors: string[] = [];
  const editPairs: EditPair[] = [];

  // ------------------------------------------------------------------
  // 1. Collect edit pairs from ai_feedback (primary source)
  // ------------------------------------------------------------------
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: feedbackRows, error: fbError } = await client
      .from('ai_feedback')
      .select('original_content, edited_content, edit_delta')
      .eq('user_id', userId)
      .eq('action', 'edited')
      .gte('created_at', thirtyDaysAgo)
      .not('original_content', 'is', null)
      .not('edited_content', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200);

    if (fbError) {
      errors.push(`ai_feedback query failed: ${fbError.message}`);
    } else if (feedbackRows) {
      for (const row of feedbackRows) {
        const r = row as Record<string, unknown>;
        if (r.original_content && r.edited_content) {
          editPairs.push({
            original: String(r.original_content),
            edited: String(r.edited_content),
            editDelta: r.edit_delta as Record<string, unknown> | null,
          });
        }
      }
    }
  } catch (err) {
    errors.push(`ai_feedback exception: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ------------------------------------------------------------------
  // 2. Collect edit pairs from hitl_pending_approvals (secondary source)
  // ------------------------------------------------------------------
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: hitlRows, error: hitlError } = await client
      .from('hitl_pending_approvals')
      .select('original_content, edited_content')
      .eq('user_id', userId)
      .eq('status', 'edited')
      .in('resource_type', ['email_draft', 'follow_up'])
      .gte('created_at', thirtyDaysAgo)
      .not('edited_content', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200);

    if (hitlError) {
      errors.push(`hitl_pending_approvals query failed: ${hitlError.message}`);
    } else if (hitlRows) {
      for (const row of hitlRows) {
        const r = row as Record<string, unknown>;
        const original = r.original_content as Record<string, unknown> | null;
        const edited = r.edited_content as Record<string, unknown> | null;
        // HITL stores content as JSONB with a `body` field for email drafts
        const originalBody = original?.body ?? original?.text ?? null;
        const editedBody = edited?.body ?? edited?.text ?? null;
        if (originalBody && editedBody) {
          editPairs.push({
            original: String(originalBody),
            edited: String(editedBody),
            editDelta: null,
          });
        }
      }
    }
  } catch (err) {
    errors.push(`hitl_pending_approvals exception: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (editPairs.length === 0) {
    return { extracted: [], errors };
  }

  // ------------------------------------------------------------------
  // 3. Run detection rules across all edit pairs
  // ------------------------------------------------------------------
  const detected: DetectedPreference[] = [];

  for (const rule of DETECTION_RULES) {
    let matchCount = 0;
    for (const pair of editPairs) {
      try {
        if (rule.detect(pair)) matchCount++;
      } catch {
        // Skip individual detection failures silently
      }
    }

    if (matchCount >= MIN_SAMPLES_FOR_PREFERENCE) {
      // Confidence = consistency ratio, capped at 0.99
      const rawConfidence = matchCount / editPairs.length;
      const confidence = Math.min(0.99, Math.round(rawConfidence * 100) / 100);

      detected.push({
        key: rule.key,
        category: rule.category,
        confidence,
        sampleCount: editPairs.length,
        matchCount,
        description: rule.description,
      });
    }
  }

  // ------------------------------------------------------------------
  // 4. Upsert detected preferences into learning_preferences
  // ------------------------------------------------------------------
  for (const pref of detected) {
    try {
      // Check for existing row to decide insert vs update
      const { data: existing } = await client
        .from('learning_preferences')
        .select('id, sample_count, confidence')
        .eq('user_id', userId)
        .eq('preference_key', pref.key)
        .maybeSingle();

      if (existing) {
        // Update existing — blend confidence with prior value (weighted average)
        const blendedConfidence = Math.min(
          0.99,
          Math.round(((existing.confidence as number) * 0.3 + pref.confidence * 0.7) * 100) / 100,
        );

        const { error: updateError } = await client
          .from('learning_preferences')
          .update({
            confidence: blendedConfidence,
            sample_count: pref.sampleCount,
            preference_value: pref.description,
            last_evidence: {
              match_count: pref.matchCount,
              total_edits: pref.sampleCount,
              raw_confidence: pref.confidence,
              extracted_at: new Date().toISOString(),
            },
          })
          .eq('id', existing.id);

        if (updateError) {
          errors.push(`update ${pref.key}: ${updateError.message}`);
        }
      } else {
        // Insert new preference
        const { error: insertError } = await client
          .from('learning_preferences')
          .insert({
            user_id: userId,
            org_id: orgId,
            preference_key: pref.key,
            preference_value: pref.description,
            confidence: pref.confidence,
            sample_count: pref.sampleCount,
            category: pref.category,
            source_action_type: 'email_draft',
            last_evidence: {
              match_count: pref.matchCount,
              total_edits: pref.sampleCount,
              raw_confidence: pref.confidence,
              extracted_at: new Date().toISOString(),
            },
          });

        if (insertError) {
          errors.push(`insert ${pref.key}: ${insertError.message}`);
        }
      }
    } catch (err) {
      errors.push(`upsert ${pref.key}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (detected.length > 0) {
    console.log(
      `[preferenceExtractor] Extracted ${detected.length} preference(s) for user ${userId} ` +
        `from ${editPairs.length} edit pair(s): ${detected.map((d) => `${d.key}@${d.confidence}`).join(', ')}`,
    );
  }

  return { extracted: detected, errors };
}

// =============================================================================
// Get Top Preferences
// =============================================================================

/**
 * Return the top N preferences by confidence for a user.
 * Used by draft generation to customize output.
 */
export async function getTopPreferences(
  client: SupabaseClient,
  userId: string,
  limit: number = 3,
): Promise<StoredPreference[]> {
  try {
    const { data, error } = await client
      .from('learning_preferences')
      .select('preference_key, preference_value, confidence')
      .eq('user_id', userId)
      .gte('confidence', 0.5) // Only return preferences we're reasonably confident about
      .order('confidence', { ascending: false })
      .limit(limit);

    if (error || !data) {
      console.warn('[preferenceExtractor] getTopPreferences failed:', error?.message);
      return [];
    }

    return data.map((row) => ({
      key: (row as Record<string, unknown>).preference_key as string,
      value: (row as Record<string, unknown>).preference_value as string,
      confidence: (row as Record<string, unknown>).confidence as number,
    }));
  } catch (err) {
    console.warn('[preferenceExtractor] getTopPreferences exception:', err);
    return [];
  }
}
