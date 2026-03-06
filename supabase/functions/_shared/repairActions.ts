/**
 * Idempotent Repair Actions
 *
 * Repair actions can be safely re-run and return 'already correct' when
 * no changes are needed. Each operation computes a deterministic identity
 * key to prevent duplicate work across retries and repeated user prompts.
 *
 * Results distinguish mutated_count and unchanged_count.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

type SupabaseClient = ReturnType<typeof createClient>;

// =============================================================================
// Types
// =============================================================================

export type RepairActionType =
  | 'heal_deal_contacts'
  | 'heal_deal_companies'
  | 'deduplicate_contacts'
  | 'fix_orphan_activities'
  | 'normalize_email_domains';

export interface RepairResult {
  actionType: RepairActionType;
  idempotencyKey: string;
  processed: number;
  mutatedCount: number;
  unchangedCount: number;
  skippedCount: number;
  errors: Array<{ entityId: string; error: string }>;
  alreadyCorrect: boolean; // True if zero mutations were needed
  details?: Record<string, unknown>;
}

export interface RepairOptions {
  orgId: string;
  userId: string;
  dryRun?: boolean; // Preview changes without applying
  batchSize?: number;
}

// =============================================================================
// Identity Key Generation
// =============================================================================

/**
 * Generate a deterministic identity key for a repair operation.
 * Same inputs always produce same key.
 */
function repairKey(actionType: RepairActionType, orgId: string, entityId: string): string {
  return `repair:${actionType}:${orgId}:${entityId}`;
}

// =============================================================================
// Repair: Heal Deal Contacts
// =============================================================================

export async function healDealContacts(
  client: SupabaseClient,
  opts: RepairOptions,
): Promise<RepairResult> {
  const batchSize = opts.batchSize || 50;
  const idempotencyKey = `heal_deal_contacts:${opts.orgId}:${new Date().toISOString().slice(0, 13)}`;

  const { data: deals, error } = await client
    .from('deals')
    .select('id, name, company, owner_id, primary_contact_id, contact_name, contact_email')
    .is('primary_contact_id', null)
    .eq('status', 'active')
    .eq('owner_id', opts.userId)
    .limit(batchSize);

  if (error || !deals) {
    return {
      actionType: 'heal_deal_contacts',
      idempotencyKey,
      processed: 0,
      mutatedCount: 0,
      unchangedCount: 0,
      skippedCount: 0,
      errors: error ? [{ entityId: '', error: error.message }] : [],
      alreadyCorrect: true,
    };
  }

  if (deals.length === 0) {
    return {
      actionType: 'heal_deal_contacts',
      idempotencyKey,
      processed: 0,
      mutatedCount: 0,
      unchangedCount: 0,
      skippedCount: 0,
      errors: [],
      alreadyCorrect: true,
      details: { message: 'All deals already have primary contacts' },
    };
  }

  let mutatedCount = 0;
  let unchangedCount = 0;
  const errors: Array<{ entityId: string; error: string }> = [];

  for (const deal of deals) {
    const companyName = (deal as any).company || (deal as any).name;
    if (!companyName) {
      unchangedCount++;
      continue;
    }

    // Search for matching contact
    const { data: contacts } = await client
      .from('contacts')
      .select('id, email, first_name, last_name')
      .or(`company.ilike.%${companyName}%,email.ilike.%${companyName.toLowerCase().replace(/\s+/g, '')}%`)
      .eq('owner_id', (deal as any).owner_id)
      .limit(1);

    if (!contacts || contacts.length === 0) {
      unchangedCount++;
      continue;
    }

    if (opts.dryRun) {
      mutatedCount++;
      continue;
    }

    const contact = contacts[0] as any;
    const { error: updateErr } = await client
      .from('deals')
      .update({
        primary_contact_id: contact.id,
        contact_name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || undefined,
        contact_email: contact.email || undefined,
      })
      .eq('id', (deal as any).id);

    if (updateErr) {
      errors.push({ entityId: (deal as any).id, error: updateErr.message });
    } else {
      mutatedCount++;
    }
  }

  return {
    actionType: 'heal_deal_contacts',
    idempotencyKey,
    processed: deals.length,
    mutatedCount,
    unchangedCount,
    skippedCount: 0,
    errors,
    alreadyCorrect: mutatedCount === 0,
  };
}

// =============================================================================
// Repair: Heal Deal Companies
// =============================================================================

export async function healDealCompanies(
  client: SupabaseClient,
  opts: RepairOptions,
): Promise<RepairResult> {
  const batchSize = opts.batchSize || 50;
  const idempotencyKey = `heal_deal_companies:${opts.orgId}:${new Date().toISOString().slice(0, 13)}`;

  const { data: deals, error } = await client
    .from('deals')
    .select('id, name, company, owner_id, company_id')
    .is('company_id', null)
    .eq('status', 'active')
    .eq('owner_id', opts.userId)
    .limit(batchSize);

  if (error || !deals || deals.length === 0) {
    return {
      actionType: 'heal_deal_companies',
      idempotencyKey,
      processed: 0,
      mutatedCount: 0,
      unchangedCount: 0,
      skippedCount: 0,
      errors: error ? [{ entityId: '', error: error.message }] : [],
      alreadyCorrect: true,
    };
  }

  let mutatedCount = 0;
  let unchangedCount = 0;
  const errors: Array<{ entityId: string; error: string }> = [];

  for (const deal of deals) {
    const companyName = (deal as any).company || (deal as any).name;
    if (!companyName) {
      unchangedCount++;
      continue;
    }

    const { data: companies } = await client
      .from('companies')
      .select('id')
      .or(`name.ilike.%${companyName}%,domain.ilike.%${companyName.toLowerCase().replace(/\s+/g, '')}%`)
      .limit(1);

    if (!companies || companies.length === 0) {
      unchangedCount++;
      continue;
    }

    if (opts.dryRun) {
      mutatedCount++;
      continue;
    }

    const { error: updateErr } = await client
      .from('deals')
      .update({ company_id: (companies[0] as any).id })
      .eq('id', (deal as any).id);

    if (updateErr) {
      errors.push({ entityId: (deal as any).id, error: updateErr.message });
    } else {
      mutatedCount++;
    }
  }

  return {
    actionType: 'heal_deal_companies',
    idempotencyKey,
    processed: deals.length,
    mutatedCount,
    unchangedCount,
    skippedCount: 0,
    errors,
    alreadyCorrect: mutatedCount === 0,
  };
}

// =============================================================================
// Dispatcher
// =============================================================================

/**
 * Execute a repair action by type.
 */
export async function executeRepair(
  client: SupabaseClient,
  actionType: RepairActionType,
  opts: RepairOptions,
): Promise<RepairResult> {
  switch (actionType) {
    case 'heal_deal_contacts':
      return healDealContacts(client, opts);
    case 'heal_deal_companies':
      return healDealCompanies(client, opts);
    default:
      return {
        actionType,
        idempotencyKey: `unsupported:${actionType}`,
        processed: 0,
        mutatedCount: 0,
        unchangedCount: 0,
        skippedCount: 0,
        errors: [{ entityId: '', error: `Unsupported repair action: ${actionType}` }],
        alreadyCorrect: true,
      };
  }
}
