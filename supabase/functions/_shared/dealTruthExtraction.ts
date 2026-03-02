/**
 * Deal Truth Extraction Utilities
 *
 * Shared utilities for extracting Deal Truth fields from various sources:
 * - Meeting transcripts (structured summaries)
 * - Emails (engagement signals)
 * - CRM syncs
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

// Confidence scores by source type (higher = more trustworthy)
export const SOURCE_CONFIDENCE: Record<string, number> = {
  meeting_transcript: 0.85, // High confidence - direct from conversation
  email: 0.70,              // Good confidence - written communication
  crm_sync: 0.60,           // Moderate - may be outdated
  manual: 0.95,             // Highest - user explicitly set
  ai_inferred: 0.50,        // Lower - AI guessing
};

// Deal Truth field keys
export type DealTruthFieldKey = 'pain' | 'success_metric' | 'champion' | 'economic_buyer' | 'next_step' | 'top_risks';

export interface DealTruthExtraction {
  field_key: DealTruthFieldKey;
  value: string;
  confidence: number;
  source: 'meeting_transcript' | 'email' | 'crm_sync' | 'manual' | 'ai_inferred';
  source_id?: string;
  champion_strength?: 'strong' | 'moderate' | 'weak' | 'unknown';
  next_step_date?: string;
  contact_id?: string;
}

/**
 * Upsert a single Deal Truth field with confidence-aware logic
 * Only updates if new confidence >= existing confidence (unless existing is manual)
 */
export async function upsertDealTruthField(
  supabase: ReturnType<typeof createClient>,
  dealId: string,
  orgId: string,
  extraction: DealTruthExtraction
): Promise<{ updated: boolean; reason: string }> {
  // Check existing field confidence
  const { data: existing } = await supabase
    .from('deal_truth_fields')
    .select('id, confidence, source')
    .eq('deal_id', dealId)
    .eq('field_key', extraction.field_key)
    .maybeSingle();

  // Skip if existing has manual source - manual always wins
  if (existing && existing.source === 'manual') {
    return { updated: false, reason: 'manual entry preserved' };
  }

  // Skip if existing has higher confidence
  if (existing && existing.confidence > extraction.confidence) {
    return { updated: false, reason: `existing confidence ${existing.confidence} > new ${extraction.confidence}` };
  }

  // Upsert the field
  const { error } = await supabase
    .from('deal_truth_fields')
    .upsert({
      deal_id: dealId,
      org_id: orgId,
      field_key: extraction.field_key,
      value: extraction.value,
      confidence: extraction.confidence,
      source: extraction.source,
      source_id: extraction.source_id,
      champion_strength: extraction.champion_strength,
      next_step_date: extraction.next_step_date,
      contact_id: extraction.contact_id,
      last_updated_at: new Date().toISOString(),
    }, { onConflict: 'deal_id,field_key' });

  if (error) {
    console.error(`[deal-truth] Error upserting ${extraction.field_key}:`, error);
    return { updated: false, reason: error.message };
  }

  return { updated: true, reason: 'success' };
}

/**
 * Update champion engagement signal based on email activity
 * If we receive an email from the champion, boost their strength
 */
export async function updateChampionEngagementFromEmail(
  supabase: ReturnType<typeof createClient>,
  dealId: string,
  orgId: string,
  fromEmail: string,
  emailId: string
): Promise<{ updated: boolean; reason: string }> {
  // Check if sender matches the current champion
  const { data: championField } = await supabase
    .from('deal_truth_fields')
    .select('id, value, confidence, source, champion_strength, contact_id')
    .eq('deal_id', dealId)
    .eq('field_key', 'champion')
    .maybeSingle();

  if (!championField || !championField.contact_id) {
    return { updated: false, reason: 'no champion with contact_id' };
  }

  // Get the champion's email
  const { data: contact } = await supabase
    .from('contacts')
    .select('email')
    .eq('id', championField.contact_id)
    .maybeSingle();

  if (!contact?.email) {
    return { updated: false, reason: 'champion contact has no email' };
  }

  // Check if the email is from the champion
  if (contact.email.toLowerCase().trim() !== fromEmail.toLowerCase().trim()) {
    return { updated: false, reason: 'email not from champion' };
  }

  // Boost champion strength based on engagement
  let newStrength = championField.champion_strength;
  if (newStrength === 'unknown' || newStrength === 'weak') {
    newStrength = 'moderate';
  } else if (newStrength === 'moderate') {
    // Could upgrade to strong if we have multiple engagement signals
    // For now, keep moderate but boost confidence
  }

  const newConfidence = Math.min(0.95, (championField.confidence || 0.7) + 0.05);

  const { error } = await supabase
    .from('deal_truth_fields')
    .update({
      champion_strength: newStrength,
      confidence: newConfidence,
      last_updated_at: new Date().toISOString(),
    })
    .eq('id', championField.id);

  if (error) {
    return { updated: false, reason: error.message };
  }

  console.log(`[deal-truth] Champion engagement boosted for deal ${dealId} from email ${emailId}`);
  return { updated: true, reason: 'champion engagement boosted' };
}

/**
 * Check email subject/content for next step indicators
 * Returns extracted next step if found
 */
export function extractNextStepFromEmailSubject(subject: string): string | null {
  const patterns = [
    /(?:scheduled|confirmed|booked|set up).*(?:call|meeting|demo|session)/i,
    /(?:follow[- ]?up|next steps?).*(?:on|for|by)/i,
    /(?:meeting|call|demo).*(?:tomorrow|next week|on \w+day)/i,
    /RE:.*(?:proposal|quote|pricing)/i,
  ];

  for (const pattern of patterns) {
    if (pattern.test(subject)) {
      return subject;
    }
  }

  return null;
}

/**
 * Find deal for a contact by email
 */
export async function findDealForContact(
  supabase: ReturnType<typeof createClient>,
  contactEmail: string,
  userId: string
): Promise<{ dealId: string; orgId: string } | null> {
  // First find the contact
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, company_id')
    .ilike('email', contactEmail)
    .eq('owner_id', userId)
    .limit(1)
    .maybeSingle();

  if (!contact) {
    return null;
  }

  // Find active deal for this company
  if (contact.company_id) {
    const { data: deal } = await supabase
      .from('deals')
      .select('id, org_id')
      .eq('company_id', contact.company_id)
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (deal) {
      return { dealId: deal.id, orgId: deal.org_id };
    }
  }

  return null;
}

/**
 * Process email for Deal Truth extraction
 * Called from email sync functions
 */
export async function processEmailForDealTruth(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  emailId: string,
  fromEmail: string,
  toEmails: string[],
  subject: string
): Promise<{ processed: boolean; updates: string[] }> {
  const updates: string[] = [];

  // Try to find a deal for either the sender or recipients
  let dealInfo = await findDealForContact(supabase, fromEmail, userId);

  if (!dealInfo) {
    for (const toEmail of toEmails) {
      dealInfo = await findDealForContact(supabase, toEmail, userId);
      if (dealInfo) break;
    }
  }

  if (!dealInfo) {
    return { processed: false, updates: [] };
  }

  // 1. Update champion engagement if email is from champion
  const championResult = await updateChampionEngagementFromEmail(
    supabase,
    dealInfo.dealId,
    dealInfo.orgId,
    fromEmail,
    emailId
  );
  if (championResult.updated) {
    updates.push('champion engagement boosted');
  }

  // 2. Check for next step indicators in subject
  const nextStep = extractNextStepFromEmailSubject(subject);
  if (nextStep) {
    const nextStepResult = await upsertDealTruthField(
      supabase,
      dealInfo.dealId,
      dealInfo.orgId,
      {
        field_key: 'next_step',
        value: nextStep,
        confidence: SOURCE_CONFIDENCE.email * 0.9, // Slightly lower - inferred from subject
        source: 'email',
        source_id: emailId,
      }
    );
    if (nextStepResult.updated) {
      updates.push('next step extracted from email subject');
    }
  }

  return { processed: true, updates };
}
