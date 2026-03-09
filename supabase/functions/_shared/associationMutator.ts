/**
 * Association-Aware Mutation Paths
 *
 * Handles relationship writes through FK or junction tables instead of
 * display fields. Supports:
 * - Contact ↔ Company relink (create-or-link)
 * - Contact ↔ Deal association via deal_contacts junction
 * - Idempotent behavior — re-running returns same result
 *
 * Returns old and new relation identifiers for audit trail.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import type { WriteResult } from './copilot_adapters/writePolicy.ts';
import { policyWrite } from './copilot_adapters/writePolicy.ts';

type SupabaseClient = ReturnType<typeof createClient>;

// =============================================================================
// Types
// =============================================================================

export type AssociationType =
  | 'contact_company'
  | 'contact_deal'
  | 'deal_company';

export interface AssociationMutationRequest {
  type: AssociationType;
  sourceId: string; // The entity being modified
  targetId?: string; // The entity to associate with (if known)
  targetLookup?: { // Alternative: look up target by name/domain
    name?: string;
    domain?: string;
    email?: string;
  };
  userId: string;
  orgId: string;
  createIfMissing?: boolean; // Create target entity if not found (default: false)
}

export interface AssociationMutationResult {
  success: boolean;
  associationType: AssociationType;
  sourceId: string;
  targetId?: string;
  oldRelation?: { id: string; name?: string };
  newRelation?: { id: string; name?: string };
  created?: boolean; // Was target entity created?
  alreadyLinked?: boolean; // Was already in desired state?
  error?: string;
  userGuidance?: string;
}

// =============================================================================
// Association Configuration
// =============================================================================

interface AssociationConfig {
  sourceTable: string;
  targetTable: string;
  fkColumn?: string; // Direct FK on source table
  junctionTable?: string; // Junction table for M:N
  junctionSourceCol?: string;
  junctionTargetCol?: string;
}

const ASSOCIATION_CONFIGS: Record<AssociationType, AssociationConfig> = {
  contact_company: {
    sourceTable: 'contacts',
    targetTable: 'companies',
    fkColumn: 'company_id',
  },
  contact_deal: {
    sourceTable: 'contacts',
    targetTable: 'deals',
    junctionTable: 'deal_contacts',
    junctionSourceCol: 'contact_id',
    junctionTargetCol: 'deal_id',
  },
  deal_company: {
    sourceTable: 'deals',
    targetTable: 'companies',
    fkColumn: 'company_id',
  },
};

// =============================================================================
// Public API
// =============================================================================

/**
 * Execute an association mutation (link, relink, or create-and-link).
 */
export async function mutateAssociation(
  client: SupabaseClient,
  req: AssociationMutationRequest,
): Promise<AssociationMutationResult> {
  const config = ASSOCIATION_CONFIGS[req.type];
  if (!config) {
    return {
      success: false,
      associationType: req.type,
      sourceId: req.sourceId,
      error: `Unsupported association type: ${req.type}`,
      userGuidance: `This relationship type (${req.type}) is not supported yet. Try updating the record directly.`,
    };
  }

  // Resolve target entity
  let targetId = req.targetId;
  let targetName: string | undefined;
  let created = false;

  if (!targetId && req.targetLookup) {
    const resolved = await resolveTarget(client, config.targetTable, req.targetLookup, req.orgId);
    if (resolved) {
      targetId = resolved.id;
      targetName = resolved.name;
    } else if (req.createIfMissing) {
      const created_ = await createTarget(client, config.targetTable, req.targetLookup, req.userId, req.orgId);
      if (created_.error) {
        return {
          success: false,
          associationType: req.type,
          sourceId: req.sourceId,
          error: created_.error,
          userGuidance: `Could not create the ${config.targetTable.slice(0, -1)} to link. ${created_.error}`,
        };
      }
      targetId = created_.id;
      targetName = created_.name;
      created = true;
    } else {
      return {
        success: false,
        associationType: req.type,
        sourceId: req.sourceId,
        error: `Target ${config.targetTable.slice(0, -1)} not found`,
        userGuidance: `Could not find a matching ${config.targetTable.slice(0, -1)}. Try providing more details or set createIfMissing to auto-create.`,
      };
    }
  }

  if (!targetId) {
    return {
      success: false,
      associationType: req.type,
      sourceId: req.sourceId,
      error: 'No target entity specified or found',
      userGuidance: 'Please specify which entity to associate with.',
    };
  }

  // Execute the association
  if (config.fkColumn) {
    return executeFKAssociation(client, config, req, targetId, targetName, created);
  } else if (config.junctionTable) {
    return executeJunctionAssociation(client, config, req, targetId, targetName, created);
  }

  return {
    success: false,
    associationType: req.type,
    sourceId: req.sourceId,
    error: 'No association mechanism configured',
    userGuidance: 'This relationship type is not properly configured.',
  };
}

// =============================================================================
// FK-based Association (Contact → Company, Deal → Company)
// =============================================================================

async function executeFKAssociation(
  client: SupabaseClient,
  config: AssociationConfig,
  req: AssociationMutationRequest,
  targetId: string,
  targetName: string | undefined,
  created: boolean,
): Promise<AssociationMutationResult> {
  // Get current value
  const { data: current } = await client
    .from(config.sourceTable)
    .select(`id, ${config.fkColumn!}`)
    .eq('id', req.sourceId)
    .maybeSingle();

  if (!current) {
    return {
      success: false,
      associationType: req.type,
      sourceId: req.sourceId,
      error: `Source entity not found in ${config.sourceTable}`,
      userGuidance: `The ${config.sourceTable.slice(0, -1)} you're trying to update doesn't exist.`,
    };
  }

  const oldFk = (current as Record<string, unknown>)[config.fkColumn!] as string | null;

  // Already linked to the same target — idempotent
  if (oldFk === targetId) {
    return {
      success: true,
      associationType: req.type,
      sourceId: req.sourceId,
      targetId,
      oldRelation: oldFk ? { id: oldFk, name: targetName } : undefined,
      newRelation: { id: targetId, name: targetName },
      alreadyLinked: true,
    };
  }

  // Get old relation name for audit
  let oldRelationName: string | undefined;
  if (oldFk) {
    const { data: oldTarget } = await client
      .from(config.targetTable)
      .select('id, name')
      .eq('id', oldFk)
      .maybeSingle();
    oldRelationName = (oldTarget as any)?.name;
  }

  // Use write policy for the actual update
  const writeResult = await policyWrite(client, {
    entityType: config.sourceTable.slice(0, -1), // contacts → contact
    entityId: req.sourceId,
    operationClass: 'associate',
    fields: { [config.fkColumn!]: targetId },
    userId: req.userId,
    orgId: req.orgId,
  });

  if (writeResult.status === 'success' || writeResult.status === 'partial') {
    return {
      success: true,
      associationType: req.type,
      sourceId: req.sourceId,
      targetId,
      oldRelation: oldFk ? { id: oldFk, name: oldRelationName } : undefined,
      newRelation: { id: targetId, name: targetName },
      created,
    };
  }

  return {
    success: false,
    associationType: req.type,
    sourceId: req.sourceId,
    targetId,
    error: writeResult.error?.message,
    userGuidance: writeResult.error?.userGuidance,
  };
}

// =============================================================================
// Junction-based Association (Contact ↔ Deal)
// =============================================================================

async function executeJunctionAssociation(
  client: SupabaseClient,
  config: AssociationConfig,
  req: AssociationMutationRequest,
  targetId: string,
  targetName: string | undefined,
  created: boolean,
): Promise<AssociationMutationResult> {
  // Check if already linked
  const { data: existing } = await client
    .from(config.junctionTable!)
    .select('id')
    .eq(config.junctionSourceCol!, req.sourceId)
    .eq(config.junctionTargetCol!, targetId)
    .maybeSingle();

  if (existing) {
    return {
      success: true,
      associationType: req.type,
      sourceId: req.sourceId,
      targetId,
      newRelation: { id: targetId, name: targetName },
      alreadyLinked: true,
    };
  }

  // Insert junction record
  const { error } = await client
    .from(config.junctionTable!)
    .insert({
      [config.junctionSourceCol!]: req.sourceId,
      [config.junctionTargetCol!]: targetId,
    });

  if (error) {
    return {
      success: false,
      associationType: req.type,
      sourceId: req.sourceId,
      targetId,
      error: error.message,
      userGuidance: `Failed to create the association. ${error.message}`,
    };
  }

  return {
    success: true,
    associationType: req.type,
    sourceId: req.sourceId,
    targetId,
    newRelation: { id: targetId, name: targetName },
    created,
  };
}

// =============================================================================
// Target Resolution
// =============================================================================

async function resolveTarget(
  client: SupabaseClient,
  table: string,
  lookup: { name?: string; domain?: string; email?: string },
  orgId: string,
): Promise<{ id: string; name?: string } | null> {
  if (lookup.domain && table === 'companies') {
    const { data } = await client
      .from('companies')
      .select('id, name')
      .eq('domain', lookup.domain)
      .maybeSingle();
    if (data) return { id: (data as any).id, name: (data as any).name };
  }

  if (lookup.name) {
    const { data } = await client
      .from(table)
      .select('id, name')
      .ilike('name', `%${lookup.name}%`)
      .limit(1)
      .maybeSingle();
    if (data) return { id: (data as any).id, name: (data as any).name };
  }

  if (lookup.email && table === 'contacts') {
    const { data } = await client
      .from('contacts')
      .select('id, full_name')
      .eq('email', lookup.email)
      .maybeSingle();
    if (data) return { id: (data as any).id, name: (data as any).full_name };
  }

  return null;
}

async function createTarget(
  client: SupabaseClient,
  table: string,
  lookup: { name?: string; domain?: string; email?: string },
  userId: string,
  orgId: string,
): Promise<{ id?: string; name?: string; error?: string }> {
  const insertData: Record<string, unknown> = { owner_id: userId };

  if (table === 'companies') {
    if (!lookup.name && !lookup.domain) return { error: 'Company name or domain required' };
    insertData.name = lookup.name || lookup.domain;
    if (lookup.domain) insertData.domain = lookup.domain;
  } else if (table === 'contacts') {
    if (!lookup.email && !lookup.name) return { error: 'Contact email or name required' };
    if (lookup.email) insertData.email = lookup.email;
    if (lookup.name) {
      const parts = lookup.name.split(' ');
      insertData.first_name = parts[0];
      insertData.last_name = parts.slice(1).join(' ') || null;
      insertData.full_name = lookup.name;
    }
  }

  const { data, error } = await client
    .from(table)
    .insert(insertData)
    .select('id, name')
    .maybeSingle();

  if (error) return { error: error.message };
  return { id: (data as any)?.id, name: (data as any)?.name || lookup.name };
}
