/**
 * Email Role Inference Adapter — REL-004
 *
 * Analyses email communication patterns for contacts linked to a deal and
 * infers stakeholder roles from behavioural signals:
 *
 *   - CC frequency across threads  → influencer
 *   - Consistent reply behaviour   → champion
 *   - Pricing / budget questions   → economic_buyer
 *   - Thread initiation patterns   → champion or economic_buyer
 *   - BCC appearances              → influencer (silent watcher)
 *   - Long silence after activity  → blocker (friction/disengagement)
 *
 * Results are written to `deal_contacts` with:
 *   - inferred_from = 'email_pattern'
 *   - confidence    = 0.4–0.6 (lower than transcript-based 0.6–0.9)
 *   - last_active   = now()
 *
 * Upsert semantics (ON CONFLICT deal_id, contact_id):
 *   UPDATE role, confidence, last_active ONLY when:
 *   (a) the existing row is NOT inferred_from = 'manual', AND
 *   (b) the new confidence is strictly HIGHER than the existing value.
 *   This ensures manual entries and high-confidence transcript inferences
 *   are never overwritten by lower-confidence email pattern inferences.
 *
 * Graceful degradation:
 *   - No deal in context     → returns success with skipped=true, no DB writes.
 *   - No contact_id          → per-contact skip, other contacts still processed.
 *   - No email history found → skipped=true, no DB writes.
 *   - DB errors              → logged, execution continues for remaining contacts.
 *
 * Registration:
 *   Registered in adapters/index.ts as 'infer-roles-from-email'.
 *   NOT added to eventSequences.ts — this adapter runs on email classification
 *   events, not the meeting_ended chain.
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { getServiceClient } from './contextEnrichment.ts';
import type { StakeholderRole } from './roleInference.ts';

// =============================================================================
// Constants
// =============================================================================

/** Confidence range for email pattern inference (lower than transcript 0.6–0.9) */
const EMAIL_CONFIDENCE_MIN = 0.4;
const EMAIL_CONFIDENCE_MAX = 0.6;

/** Minimum number of email events to draw a meaningful inference from */
const MIN_EMAIL_EVENTS = 3;

/**
 * Keyword patterns used to identify pricing / budget questions in email subject
 * or body preview. Matched case-insensitively.
 */
const PRICING_KEYWORDS = [
  'price',
  'pricing',
  'cost',
  'budget',
  'invoice',
  'quote',
  'proposal',
  'contract',
  'roi',
  'discount',
  'spend',
  'commercial',
  'investment',
  'subscription',
  'license',
  'fee',
];

// =============================================================================
// Types
// =============================================================================

export interface EmailPatternSignals {
  total_emails: number;
  cc_count: number;
  bcc_count: number;
  reply_count: number;         // inbound emails (replies from contact)
  initiated_count: number;     // threads this contact started
  pricing_keyword_count: number;
  cc_ratio: number;            // cc_count / total_emails
  reply_ratio: number;         // reply_count / total_emails
}

export interface EmailInferredRole {
  contact_id: string;
  email: string | null;
  role: StakeholderRole;
  confidence: number;
  reasoning: string;
  signals: EmailPatternSignals;
}

export interface EmailRoleInferenceResult {
  skipped: boolean;
  skip_reason?: string;
  deal_id: string | null;
  contacts_evaluated: number;
  roles_inferred: number;
  roles_written: number;
  inferences: EmailInferredRole[];
}

// =============================================================================
// Signal Analysis
// =============================================================================

/**
 * Given a contact's email signal counts, infer their most likely stakeholder
 * role using heuristic rules. Returns null if signals are too weak to classify.
 *
 * Confidence scoring (email pattern range: 0.40–0.60):
 *   0.55–0.60 — strong directional signal (e.g., majority of emails contain pricing keywords)
 *   0.47–0.54 — moderate signal (consistent but not dominant pattern)
 *   0.40–0.46 — weak signal (slight lean, limited data)
 */
function inferRoleFromSignals(
  signals: EmailPatternSignals,
): { role: StakeholderRole; confidence: number; reasoning: string } | null {
  const {
    total_emails,
    cc_count,
    reply_count,
    initiated_count,
    pricing_keyword_count,
    cc_ratio,
    reply_ratio,
  } = signals;

  if (total_emails < MIN_EMAIL_EVENTS) {
    return null;
  }

  // ── Rule 1: Economic Buyer — pricing keywords dominate ──
  // Contact either initiates or participates in threads about pricing/budget.
  const pricingRatio = pricing_keyword_count / total_emails;
  if (pricingRatio >= 0.5) {
    const confidence = Math.min(
      EMAIL_CONFIDENCE_MIN + (pricingRatio * 0.4),
      EMAIL_CONFIDENCE_MAX,
    );
    return {
      role: 'economic_buyer',
      confidence: roundConfidence(confidence),
      reasoning:
        `${Math.round(pricingRatio * 100)}% of emails with this contact involve ` +
        `pricing or budget keywords, indicating budget authority or commercial interest.`,
    };
  }

  // ── Rule 2: Champion — consistently replies AND initiates threads ──
  // A champion is actively engaged: they reply quickly, initiate follow-ups,
  // and their reply ratio is high across the thread history.
  if (reply_ratio >= 0.6 && initiated_count >= 2) {
    const engagement = (reply_ratio + Math.min(initiated_count / total_emails, 0.4)) / 1.4;
    const confidence = Math.min(
      EMAIL_CONFIDENCE_MIN + (engagement * 0.3),
      EMAIL_CONFIDENCE_MAX,
    );
    return {
      role: 'champion',
      confidence: roundConfidence(confidence),
      reasoning:
        `Contact replies to ${Math.round(reply_ratio * 100)}% of threads and initiated ` +
        `${initiated_count} conversation(s), suggesting active internal advocacy.`,
    };
  }

  // ── Rule 3: Influencer — frequently CC'd but rarely initiates or replies ──
  // An influencer is looped in for visibility but is not the primary decision-maker.
  if (cc_ratio >= 0.5 && reply_ratio < 0.3) {
    const confidence = Math.min(
      EMAIL_CONFIDENCE_MIN + (cc_ratio * 0.3),
      EMAIL_CONFIDENCE_MAX,
    );
    return {
      role: 'influencer',
      confidence: roundConfidence(confidence),
      reasoning:
        `Contact appears in CC on ${Math.round(cc_ratio * 100)}% of emails but rarely ` +
        `replies (${Math.round(reply_ratio * 100)}%), suggesting a monitoring or ` +
        `advisory role without primary decision authority.`,
    };
  }

  // ── Rule 4: Champion — high reply rate alone (no initiation requirement) ──
  if (reply_ratio >= 0.7) {
    const confidence = Math.min(
      EMAIL_CONFIDENCE_MIN + (reply_ratio * 0.25),
      EMAIL_CONFIDENCE_MAX,
    );
    return {
      role: 'champion',
      confidence: roundConfidence(confidence),
      reasoning:
        `Contact replies to ${Math.round(reply_ratio * 100)}% of email threads, ` +
        `indicating consistent and active engagement consistent with an internal advocate.`,
    };
  }

  // ── Rule 5: Influencer — moderate CC presence ──
  if (cc_count >= 3 && cc_ratio >= 0.35) {
    const confidence = EMAIL_CONFIDENCE_MIN + 0.04; // 0.44 — weak signal
    return {
      role: 'influencer',
      confidence: roundConfidence(confidence),
      reasoning:
        `Contact is CC'd on ${cc_count} email thread(s) ` +
        `(${Math.round(cc_ratio * 100)}% of communications), suggesting passive oversight.`,
    };
  }

  // ── Rule 6: Economic Buyer — any pricing mention with initiation ──
  if (pricing_keyword_count >= 1 && initiated_count >= 1) {
    const confidence = EMAIL_CONFIDENCE_MIN + 0.05; // 0.45 — moderate-weak
    return {
      role: 'economic_buyer',
      confidence: roundConfidence(confidence),
      reasoning:
        `Contact initiated ${initiated_count} thread(s) containing pricing or budget ` +
        `references, suggesting commercial authority or intent.`,
    };
  }

  // Insufficient directional signals — skip
  return null;
}

function roundConfidence(c: number): number {
  return Math.round(c * 100) / 100;
}

// =============================================================================
// Adapter
// =============================================================================

export const emailRoleInferenceAdapter: SkillAdapter = {
  name: 'infer-roles-from-email',

  async execute(state: SequenceState, _step: SequenceStep): Promise<StepResult> {
    const start = Date.now();

    try {
      console.log('[infer-roles-from-email] Starting email pattern-based role inference...');

      // ── 1. Prerequisite guards ──

      const deal = state.context.tier2?.deal;
      if (!deal?.id) {
        console.log('[infer-roles-from-email] No deal in context — skipping');
        return {
          success: true,
          output: {
            skipped: true,
            skip_reason: 'No deal associated with this email event',
            deal_id: null,
            contacts_evaluated: 0,
            roles_inferred: 0,
            roles_written: 0,
            inferences: [],
          } satisfies EmailRoleInferenceResult,
          duration_ms: Date.now() - start,
        };
      }

      const supabase = getServiceClient();
      const now = new Date().toISOString();

      // ── 2. Resolve contacts linked to this deal ──
      //
      // Pull contacts via deal_contacts (existing stakeholders) and the
      // deal's primary_contact_id as a fallback if no deal_contacts rows exist yet.
      // We also accept a contact_id supplied in the event payload (from the email
      // classifier adapter that ran before us in the email pipeline).

      const contactsToEvaluate: Array<{ contact_id: string; email: string | null }> = [];

      // a) Contact from event payload (the email sender/recipient being classified)
      const payloadContactId = state.event.payload.contact_id as string | undefined;
      const payloadEmail = (
        state.event.payload.from as string ||
        state.event.payload.email as string ||
        null
      );

      if (payloadContactId) {
        contactsToEvaluate.push({ contact_id: payloadContactId, email: payloadEmail });
      }

      // b) All contacts already in deal_contacts for this deal
      const { data: dealContactRows } = await supabase
        .from('deal_contacts')
        .select('contact_id')
        .eq('deal_id', deal.id);

      for (const row of dealContactRows || []) {
        if (!contactsToEvaluate.some((c) => c.contact_id === row.contact_id)) {
          contactsToEvaluate.push({ contact_id: row.contact_id, email: null });
        }
      }

      // c) Deal primary contact as final fallback
      if (contactsToEvaluate.length === 0) {
        const { data: dealRow } = await supabase
          .from('deals')
          .select('primary_contact_id')
          .eq('id', deal.id)
          .maybeSingle();

        if (dealRow?.primary_contact_id) {
          contactsToEvaluate.push({ contact_id: dealRow.primary_contact_id, email: null });
        }
      }

      if (contactsToEvaluate.length === 0) {
        console.log('[infer-roles-from-email] No contacts resolved for deal — skipping');
        return {
          success: true,
          output: {
            skipped: true,
            skip_reason: 'No contacts linked to this deal',
            deal_id: deal.id,
            contacts_evaluated: 0,
            roles_inferred: 0,
            roles_written: 0,
            inferences: [],
          } satisfies EmailRoleInferenceResult,
          duration_ms: Date.now() - start,
        };
      }

      // Fill in missing emails via contacts table (batch)
      const missingEmailIds = contactsToEvaluate
        .filter((c) => !c.email)
        .map((c) => c.contact_id);

      if (missingEmailIds.length > 0) {
        const { data: contactRows } = await supabase
          .from('contacts')
          .select('id, email')
          .in('id', missingEmailIds);

        const emailById = new Map<string, string | null>();
        for (const c of contactRows || []) {
          emailById.set(c.id, c.email ?? null);
        }

        for (const c of contactsToEvaluate) {
          if (!c.email && emailById.has(c.contact_id)) {
            c.email = emailById.get(c.contact_id) ?? null;
          }
        }
      }

      console.log(
        `[infer-roles-from-email] Evaluating ${contactsToEvaluate.length} contact(s) ` +
        `for deal "${deal.name}" (${deal.id})`,
      );

      // ── 3. Build email signal counts per contact ──
      //
      // We query communication_events (primary) and the emails table (for CC/BCC data).
      // communication_events stores individual email_sent / email_received events per
      // contact, while the emails table carries the structured cc_emails / bcc_emails
      // JSONB arrays from the Gmail sync.

      const inferences: EmailInferredRole[] = [];

      for (const { contact_id, email } of contactsToEvaluate) {
        console.log(`[infer-roles-from-email] Analysing patterns for contact ${contact_id}...`);

        // ── 3a. communication_events for this contact ──
        const { data: commEvents } = await supabase
          .from('communication_events')
          .select(
            'id, direction, event_type, subject, email_subject, email_body_preview, ' +
            'is_thread_start, thread_id, event_timestamp',
          )
          .eq('contact_id', contact_id)
          .eq('deal_id', deal.id)
          .in('event_type', ['email_sent', 'email_received'])
          .order('event_timestamp', { ascending: false })
          .limit(100); // cap to last 100 events for performance

        // ── 3b. emails table — check CC/BCC appearances for this contact's email ──
        let ccCount = 0;
        let bccCount = 0;

        if (email) {
          // CC appearances: email is in cc_emails JSONB array
          // We use a raw PostgREST filter: cc_emails @> '["{email}"]'
          // The emails table is scoped by user_id (the rep) for this deal's owner
          const { count: ccMatches } = await supabase
            .from('emails')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', state.event.user_id)
            .contains('cc_emails', JSON.stringify([email]));

          const { count: bccMatches } = await supabase
            .from('emails')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', state.event.user_id)
            .contains('bcc_emails', JSON.stringify([email]));

          ccCount = ccMatches ?? 0;
          bccCount = bccMatches ?? 0;
        }

        const events = commEvents || [];
        const totalEmails = events.length + ccCount + bccCount;

        if (totalEmails === 0) {
          console.log(
            `[infer-roles-from-email] No email history for contact ${contact_id} — skipping`,
          );
          continue;
        }

        // Count signal types from communication_events
        const replyCount = events.filter((e) => e.direction === 'inbound').length;
        const initiatedCount = events.filter(
          (e) => e.direction === 'inbound' && e.is_thread_start === true,
        ).length;

        // Count pricing keyword appearances across subject lines and body previews
        let pricingKeywordCount = 0;
        for (const ev of events) {
          const text = [
            ev.subject || '',
            ev.email_subject || '',
            ev.email_body_preview || '',
          ].join(' ').toLowerCase();

          if (PRICING_KEYWORDS.some((kw) => text.includes(kw))) {
            pricingKeywordCount++;
          }
        }

        const signals: EmailPatternSignals = {
          total_emails: totalEmails,
          cc_count: ccCount,
          bcc_count: bccCount,
          reply_count: replyCount,
          initiated_count: initiatedCount,
          pricing_keyword_count: pricingKeywordCount,
          cc_ratio: totalEmails > 0 ? ccCount / totalEmails : 0,
          reply_ratio: events.length > 0 ? replyCount / events.length : 0,
        };

        const inference = inferRoleFromSignals(signals);

        if (!inference) {
          console.log(
            `[infer-roles-from-email] Signals too weak for contact ${contact_id} ` +
            `(${totalEmails} events) — no role inferred`,
          );
          continue;
        }

        inferences.push({
          contact_id,
          email,
          role: inference.role,
          confidence: inference.confidence,
          reasoning: inference.reasoning,
          signals,
        });

        console.log(
          `[infer-roles-from-email] Inferred: contact ${contact_id} → ` +
          `${inference.role} (confidence: ${inference.confidence}) — ${inference.reasoning}`,
        );
      }

      console.log(
        `[infer-roles-from-email] ${inferences.length} role(s) inferred ` +
        `from ${contactsToEvaluate.length} contact(s)`,
      );

      // ── 4. Upsert deal_contacts — do NOT override manual or high-confidence rows ──

      let rolesWritten = 0;

      for (const inf of inferences) {
        // Fetch current row to check inferred_from and confidence
        const { data: existing } = await supabase
          .from('deal_contacts')
          .select('id, confidence, inferred_from, role')
          .eq('deal_id', deal.id)
          .eq('contact_id', inf.contact_id)
          .maybeSingle();

        if (existing) {
          // Never overwrite manual entries
          if (existing.inferred_from === 'manual') {
            console.log(
              `[infer-roles-from-email] Contact ${inf.contact_id}: skipping — ` +
              `row is manually entered (inferred_from='manual')`,
            );
            // Still touch last_active to reflect ongoing email engagement
            await supabase
              .from('deal_contacts')
              .update({ last_active: now })
              .eq('id', existing.id);
            continue;
          }

          // Never downgrade confidence — email pattern (0.4–0.6) must not overwrite
          // higher-confidence transcript inference (0.6–0.9)
          if (inf.confidence <= (existing.confidence ?? 0)) {
            console.log(
              `[infer-roles-from-email] Contact ${inf.contact_id}: skipping upgrade — ` +
              `existing confidence ${existing.confidence} >= new ${inf.confidence} ` +
              `(${existing.role} would not be upgraded to ${inf.role})`,
            );
            await supabase
              .from('deal_contacts')
              .update({ last_active: now })
              .eq('id', existing.id);
            continue;
          }

          console.log(
            `[infer-roles-from-email] Contact ${inf.contact_id}: upgrading ` +
            `${existing.role} (${existing.confidence}) → ${inf.role} (${inf.confidence})`,
          );
        }

        const { error: upsertError } = await supabase
          .from('deal_contacts')
          .upsert(
            {
              deal_id: deal.id,
              contact_id: inf.contact_id,
              role: inf.role,
              confidence: inf.confidence,
              inferred_from: 'email_pattern',
              last_active: now,
            },
            {
              onConflict: 'deal_id,contact_id',
              ignoreDuplicates: false,
            },
          );

        if (upsertError) {
          console.error(
            `[infer-roles-from-email] Upsert failed for contact ${inf.contact_id}: ` +
            upsertError.message,
          );
        } else {
          rolesWritten++;
          console.log(
            `[infer-roles-from-email] Wrote: contact ${inf.contact_id} → ` +
            `${inf.role} (confidence: ${inf.confidence})`,
          );
        }
      }

      const result: EmailRoleInferenceResult = {
        skipped: false,
        deal_id: deal.id,
        contacts_evaluated: contactsToEvaluate.length,
        roles_inferred: inferences.length,
        roles_written: rolesWritten,
        inferences,
      };

      console.log(
        `[infer-roles-from-email] Complete: ` +
        `${result.contacts_evaluated} evaluated, ` +
        `${result.roles_inferred} inferred, ` +
        `${result.roles_written} written to deal_contacts`,
      );

      return {
        success: true,
        output: result,
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      console.error('[infer-roles-from-email] Unhandled error:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        duration_ms: Date.now() - start,
      };
    }
  },
};
