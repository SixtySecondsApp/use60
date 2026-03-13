/**
 * Preference Loader — US-029
 *
 * Fetches learned user preferences from copilot_memories (category='preference')
 * and formats them as a prompt section for injection into draft generation.
 *
 * Resolution order:
 *   1. Contact-specific preferences (if contactId provided)
 *   2. Action-type-specific preferences (subject contains action_type)
 *   3. General writing preferences
 *
 * Contact-specific preferences override general ones when subjects match.
 * Returns empty string if no preferences exist (graceful degradation).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PreferenceMemory {
  id: string;
  subject: string;
  content: string;
  confidence: number;
  contact_id: string | null;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Load user writing preferences relevant to the given action type and
 * optional contact. Returns a formatted prompt section string.
 *
 * @param supabase   - Supabase client (service role for cross-user reads)
 * @param userId     - The user whose preferences to load
 * @param actionType - DraftedAction type (e.g., 'send_email', 'update_crm')
 * @param contactId  - Optional contact ID for contact-specific preferences
 * @returns          - Formatted prompt section or empty string
 */
export async function loadUserPreferences(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  actionType: string,
  contactId?: string,
): Promise<string> {
  try {
    // Fetch all preference memories for this user
    const { data, error } = await supabase
      .from('copilot_memories')
      .select('id, subject, content, confidence, contact_id, updated_at')
      .eq('user_id', userId)
      .eq('category', 'preference')
      .gte('confidence', 0.5)
      .or('expires_at.is.null,expires_at.gt.now()')
      .order('confidence', { ascending: false })
      .limit(30);

    if (error) {
      console.error('[loadPreferences] query error:', error.message);
      return '';
    }

    if (!data || data.length === 0) {
      return '';
    }

    const allPrefs = data as PreferenceMemory[];

    // Partition into contact-specific and general
    const contactPrefs: PreferenceMemory[] = [];
    const actionPrefs: PreferenceMemory[] = [];
    const generalPrefs: PreferenceMemory[] = [];

    for (const pref of allPrefs) {
      if (contactId && pref.contact_id === contactId) {
        contactPrefs.push(pref);
      } else if (pref.subject.toLowerCase().includes(actionType.toLowerCase())) {
        actionPrefs.push(pref);
      } else {
        generalPrefs.push(pref);
      }
    }

    // Build deduplicated preference list: contact > action-specific > general
    const seenSubjects = new Set<string>();
    const orderedPrefs: PreferenceMemory[] = [];

    for (const list of [contactPrefs, actionPrefs, generalPrefs]) {
      for (const pref of list) {
        const normalised = pref.subject.toLowerCase().trim();
        if (!seenSubjects.has(normalised)) {
          seenSubjects.add(normalised);
          orderedPrefs.push(pref);
        }
      }
    }

    // Cap at 10 preferences to avoid prompt bloat
    const topPrefs = orderedPrefs.slice(0, 10);

    if (topPrefs.length === 0) {
      return '';
    }

    // Format as prompt section
    const lines = topPrefs.map((p) => `- ${p.content}`);

    const contactNote = contactPrefs.length > 0
      ? `\n(${contactPrefs.length} preference${contactPrefs.length > 1 ? 's' : ''} specific to this contact)`
      : '';

    return `\n## USER WRITING PREFERENCES (learned from past edits)${contactNote}\n${lines.join('\n')}\n`;
  } catch (err) {
    console.error('[loadPreferences] unexpected error:', String(err));
    return ''; // Graceful degradation — no preferences is not an error
  }
}
