/**
 * writeSkillMemory.ts -- Writes a copilot_memories entry after each skill execution.
 *
 * Creates institutional knowledge by recording what skills were executed,
 * what the user asked for, and what the skill produced. Deduplicates within
 * a 24-hour window to avoid flooding memories with repeated skill runs.
 *
 * Non-blocking: all errors are caught and logged, never thrown.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

/**
 * Write a copilot_memories entry for a completed skill execution.
 *
 * - Deduplicates: if a memory with the same subject exists within 24h for
 *   this user, updates content + updated_at instead of inserting.
 * - Non-blocking: wraps everything in try/catch, logs errors with
 *   console.warn, never throws.
 *
 * @param skillKey   - Skill identifier (e.g. "lead-research", "follow-up-drafter")
 * @param userId     - UUID of the user who triggered the skill
 * @param orgId      - Organization ID (stored in clerk_org_id column)
 * @param input      - The user's original request (will be truncated)
 * @param output     - The skill's output text (will be truncated)
 * @param entities   - Optional entity links (contactId, dealId, companyId)
 * @param supabase   - Supabase client (service role recommended for RLS bypass)
 */
export async function writeSkillMemory(
  skillKey: string,
  userId: string,
  orgId: string,
  input: string,
  output: string,
  entities: { contactId?: string; dealId?: string; companyId?: string },
  supabase: SupabaseClient
): Promise<void> {
  try {
    const subject = `Skill: ${skillKey} — ${output.slice(0, 80)}`;
    const content = output.slice(0, 500);
    const contextSummary = `Executed skill ${skillKey}. Input: ${input.slice(0, 100)}`;

    // -----------------------------------------------------------------------
    // Deduplication: check for existing memory with same subject within 24h
    // -----------------------------------------------------------------------
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: existing, error: lookupError } = await supabase
      .from('copilot_memories')
      .select('id')
      .eq('user_id', userId)
      .eq('subject', subject)
      .gte('created_at', twentyFourHoursAgo)
      .maybeSingle();

    if (lookupError) {
      console.warn(
        `[writeSkillMemory] Dedup lookup failed for skill "${skillKey}":`,
        lookupError.message
      );
      // Proceed to insert even if lookup fails -- better to have a near-dup
      // than to lose the memory entirely.
    }

    if (existing?.id) {
      // ---- Update existing memory ----
      const { error: updateError } = await supabase
        .from('copilot_memories')
        .update({
          content,
          context_summary: contextSummary,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (updateError) {
        console.warn(
          `[writeSkillMemory] Failed to update memory ${existing.id} for skill "${skillKey}":`,
          updateError.message
        );
      }

      return;
    }

    // -----------------------------------------------------------------------
    // Insert new memory
    // -----------------------------------------------------------------------
    const record: Record<string, unknown> = {
      user_id: userId,
      clerk_org_id: orgId,
      category: 'fact',
      subject,
      content,
      context_summary: contextSummary,
      confidence: 0.9,
    };

    // Attach entity links when provided
    if (entities.contactId) {
      record.contact_id = entities.contactId;
    }
    if (entities.companyId) {
      record.company_id = entities.companyId;
    }
    if (entities.dealId) {
      record.deal_id = entities.dealId;
    }

    const { error: insertError } = await supabase
      .from('copilot_memories')
      .insert(record);

    if (insertError) {
      console.warn(
        `[writeSkillMemory] Failed to insert memory for skill "${skillKey}":`,
        insertError.message
      );
    }
  } catch (err) {
    console.warn(
      '[writeSkillMemory] Unexpected error:',
      err instanceof Error ? err.message : String(err)
    );
  }
}
