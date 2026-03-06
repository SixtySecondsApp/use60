/**
 * Write Policy Adapter — Deterministic CRM Write Reliability
 *
 * All mutating copilot actions route through this adapter to get:
 * - Operation classification (create, update, delete, associate)
 * - Source-of-truth hints (local-only, crm-only, bidirectional)
 * - Foreign key and ownership validation before update
 * - Automatic verification re-read after mutation
 * - Typed error payloads suitable for user-facing fallback guidance
 * - Retry policy per operation class
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

type SupabaseClient = ReturnType<typeof createClient>;

// =============================================================================
// Types
// =============================================================================

export type OperationClass = 'create' | 'update' | 'delete' | 'associate' | 'disassociate';

export type SourceOfTruth = 'local' | 'crm' | 'bidirectional';

export type WriteStatus = 'success' | 'partial' | 'failed' | 'validation_error';

export interface WritePolicy {
  operationClass: OperationClass;
  entityType: string;
  sourceOfTruth: SourceOfTruth;
  retryPolicy: RetryPolicy;
  requiresOwnershipCheck: boolean;
  requiresFKValidation: boolean;
}

export interface RetryPolicy {
  maxRetries: number;
  backoffMs: number;
  retryOn: string[]; // error codes that are retryable
}

export interface WriteRequest {
  entityType: 'contact' | 'company' | 'deal' | 'task' | 'activity';
  entityId?: string;
  operationClass: OperationClass;
  fields: Record<string, unknown>;
  userId: string;
  orgId: string;
  confirm?: boolean;
}

export interface WriteResult {
  status: WriteStatus;
  entityType: string;
  entityId?: string;
  operationClass: OperationClass;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  verified: boolean;
  error?: WriteError;
  syncStatus?: 'local_only' | 'crm_synced' | 'sync_queued' | 'sync_failed';
}

export interface WriteError {
  code: string;
  message: string;
  userGuidance: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

// =============================================================================
// Default Policies per Entity
// =============================================================================

const DEFAULT_POLICIES: Record<string, Partial<WritePolicy>> = {
  contact: {
    sourceOfTruth: 'bidirectional',
    requiresOwnershipCheck: true,
    requiresFKValidation: true,
    retryPolicy: { maxRetries: 2, backoffMs: 1000, retryOn: ['PGRST301', 'timeout'] },
  },
  company: {
    sourceOfTruth: 'bidirectional',
    requiresOwnershipCheck: true,
    requiresFKValidation: false,
    retryPolicy: { maxRetries: 2, backoffMs: 1000, retryOn: ['PGRST301', 'timeout'] },
  },
  deal: {
    sourceOfTruth: 'bidirectional',
    requiresOwnershipCheck: true,
    requiresFKValidation: true,
    retryPolicy: { maxRetries: 2, backoffMs: 1000, retryOn: ['PGRST301', 'timeout'] },
  },
  task: {
    sourceOfTruth: 'local',
    requiresOwnershipCheck: true,
    requiresFKValidation: false,
    retryPolicy: { maxRetries: 1, backoffMs: 500, retryOn: ['timeout'] },
  },
  activity: {
    sourceOfTruth: 'local',
    requiresOwnershipCheck: true,
    requiresFKValidation: false,
    retryPolicy: { maxRetries: 1, backoffMs: 500, retryOn: ['timeout'] },
  },
};

// Ownership column per entity type (matches CLAUDE.md table)
const OWNER_COLUMNS: Record<string, string> = {
  contact: 'owner_id',
  company: 'owner_id',
  deal: 'owner_id',
  task: 'assigned_to',
  activity: 'user_id',
};

// =============================================================================
// Core Write Policy Engine
// =============================================================================

/**
 * Resolve the write policy for a given operation.
 */
export function resolveWritePolicy(req: WriteRequest): WritePolicy {
  const defaults = DEFAULT_POLICIES[req.entityType] || {};
  return {
    operationClass: req.operationClass,
    entityType: req.entityType,
    sourceOfTruth: defaults.sourceOfTruth || 'local',
    requiresOwnershipCheck: defaults.requiresOwnershipCheck ?? true,
    requiresFKValidation: defaults.requiresFKValidation ?? false,
    retryPolicy: defaults.retryPolicy || { maxRetries: 1, backoffMs: 500, retryOn: ['timeout'] },
  };
}

/**
 * Validate a write request against its policy.
 * Returns null if valid, or a WriteError if validation fails.
 */
export async function validateWrite(
  client: SupabaseClient,
  req: WriteRequest,
  policy: WritePolicy,
): Promise<WriteError | null> {
  // Ownership check
  if (policy.requiresOwnershipCheck && req.entityId && req.operationClass !== 'create') {
    const ownerCol = OWNER_COLUMNS[req.entityType];
    if (ownerCol) {
      const tableName = getTableName(req.entityType);
      const { data, error } = await client
        .from(tableName)
        .select(`id, ${ownerCol}`)
        .eq('id', req.entityId)
        .maybeSingle();

      if (error) {
        return {
          code: 'OWNERSHIP_CHECK_FAILED',
          message: `Could not verify ownership: ${error.message}`,
          userGuidance: 'Unable to verify you have permission to modify this record. Try again or contact support.',
          retryable: true,
        };
      }

      if (!data) {
        return {
          code: 'ENTITY_NOT_FOUND',
          message: `${req.entityType} ${req.entityId} not found`,
          userGuidance: `The ${req.entityType} you're trying to update doesn't exist or may have been deleted.`,
          retryable: false,
        };
      }

      // Check ownership — allow if user owns the record OR is in the same org
      const ownerId = (data as Record<string, unknown>)[ownerCol];
      if (ownerId && ownerId !== req.userId) {
        // Not direct owner — check org membership as fallback
        const { data: orgMember } = await client
          .from('organization_members')
          .select('id')
          .eq('organization_id', req.orgId)
          .eq('user_id', req.userId)
          .maybeSingle();

        if (!orgMember) {
          return {
            code: 'NOT_AUTHORIZED',
            message: `User ${req.userId} does not own ${req.entityType} ${req.entityId}`,
            userGuidance: `You don't have permission to modify this ${req.entityType}. It belongs to another user.`,
            retryable: false,
          };
        }
      }
    }
  }

  // FK validation for association writes
  if (policy.requiresFKValidation && req.operationClass === 'associate') {
    const fkErrors = await validateForeignKeys(client, req);
    if (fkErrors) return fkErrors;
  }

  return null;
}

/**
 * Execute a validated write with before/after snapshot and verification re-read.
 */
export async function executeValidatedWrite(
  client: SupabaseClient,
  req: WriteRequest,
  policy: WritePolicy,
): Promise<WriteResult> {
  const tableName = getTableName(req.entityType);

  // Capture before snapshot (for updates)
  let before: Record<string, unknown> | undefined;
  if (req.entityId && req.operationClass !== 'create') {
    const { data } = await client
      .from(tableName)
      .select(Object.keys(req.fields).join(', ') + ', id')
      .eq('id', req.entityId)
      .maybeSingle();
    if (data) before = data as Record<string, unknown>;
  }

  // Execute with retry
  let lastError: string | undefined;
  for (let attempt = 0; attempt <= policy.retryPolicy.maxRetries; attempt++) {
    try {
      const result = await performWrite(client, tableName, req);
      if (result.error) {
        lastError = result.error;
        const isRetryable = policy.retryPolicy.retryOn.some((code) =>
          result.error!.includes(code)
        );
        if (isRetryable && attempt < policy.retryPolicy.maxRetries) {
          await sleep(policy.retryPolicy.backoffMs * (attempt + 1));
          continue;
        }
        return {
          status: 'failed',
          entityType: req.entityType,
          entityId: req.entityId,
          operationClass: req.operationClass,
          before,
          verified: false,
          error: {
            code: 'WRITE_FAILED',
            message: result.error,
            userGuidance: `Failed to ${req.operationClass} ${req.entityType}. ${isRetryable ? 'This may be a temporary issue — try again.' : 'Check the data and try again.'}`,
            retryable: isRetryable,
          },
        };
      }

      // Verification re-read
      const entityId = result.entityId || req.entityId;
      let after: Record<string, unknown> | undefined;
      let verified = false;
      if (entityId) {
        const { data: verifyData } = await client
          .from(tableName)
          .select(Object.keys(req.fields).join(', ') + ', id')
          .eq('id', entityId)
          .maybeSingle();
        if (verifyData) {
          after = verifyData as Record<string, unknown>;
          verified = verifyFields(req.fields, after);
        }
      }

      return {
        status: verified ? 'success' : 'partial',
        entityType: req.entityType,
        entityId,
        operationClass: req.operationClass,
        before,
        after,
        verified,
        error: verified ? undefined : {
          code: 'VERIFICATION_FAILED',
          message: 'Write succeeded but verification re-read did not match expected values',
          userGuidance: 'The update was saved but some fields may not have been applied correctly. Please verify the record.',
          retryable: true,
        },
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < policy.retryPolicy.maxRetries) {
        await sleep(policy.retryPolicy.backoffMs * (attempt + 1));
        continue;
      }
    }
  }

  return {
    status: 'failed',
    entityType: req.entityType,
    entityId: req.entityId,
    operationClass: req.operationClass,
    before,
    verified: false,
    error: {
      code: 'WRITE_EXHAUSTED',
      message: lastError || 'All retry attempts failed',
      userGuidance: `Unable to ${req.operationClass} the ${req.entityType} after multiple attempts. Please try again later.`,
      retryable: true,
    },
  };
}

// =============================================================================
// Convenience: validate + execute in one call
// =============================================================================

export async function policyWrite(
  client: SupabaseClient,
  req: WriteRequest,
): Promise<WriteResult> {
  const policy = resolveWritePolicy(req);

  const validationError = await validateWrite(client, req, policy);
  if (validationError) {
    return {
      status: 'validation_error',
      entityType: req.entityType,
      entityId: req.entityId,
      operationClass: req.operationClass,
      verified: false,
      error: validationError,
    };
  }

  return executeValidatedWrite(client, req, policy);
}

// =============================================================================
// Helpers
// =============================================================================

function getTableName(entityType: string): string {
  const map: Record<string, string> = {
    contact: 'contacts',
    company: 'companies',
    deal: 'deals',
    task: 'tasks',
    activity: 'activities',
  };
  return map[entityType] || entityType;
}

async function performWrite(
  client: SupabaseClient,
  tableName: string,
  req: WriteRequest,
): Promise<{ entityId?: string; error?: string }> {
  switch (req.operationClass) {
    case 'create': {
      const { data, error } = await client
        .from(tableName)
        .insert(req.fields)
        .select('id')
        .maybeSingle();
      if (error) return { error: error.message };
      return { entityId: (data as any)?.id };
    }
    case 'update': {
      if (!req.entityId) return { error: 'entityId required for update' };
      const { error } = await client
        .from(tableName)
        .update(req.fields)
        .eq('id', req.entityId);
      if (error) return { error: error.message };
      return { entityId: req.entityId };
    }
    case 'delete': {
      if (!req.entityId) return { error: 'entityId required for delete' };
      const { error } = await client
        .from(tableName)
        .delete()
        .eq('id', req.entityId);
      if (error) return { error: error.message };
      return { entityId: req.entityId };
    }
    case 'associate':
    case 'disassociate': {
      // Association writes are handled as updates on the entity
      if (!req.entityId) return { error: 'entityId required for association' };
      const { error } = await client
        .from(tableName)
        .update(req.fields)
        .eq('id', req.entityId);
      if (error) return { error: error.message };
      return { entityId: req.entityId };
    }
    default:
      return { error: `Unknown operation class: ${req.operationClass}` };
  }
}

function verifyFields(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
): boolean {
  for (const [key, value] of Object.entries(expected)) {
    if (key === 'id') continue;
    if (actual[key] !== value) {
      // Allow null/undefined equivalence
      if (value == null && actual[key] == null) continue;
      return false;
    }
  }
  return true;
}

async function validateForeignKeys(
  client: SupabaseClient,
  req: WriteRequest,
): Promise<WriteError | null> {
  // Check common FK fields
  const fkChecks: Array<{ field: string; table: string }> = [
    { field: 'company_id', table: 'companies' },
    { field: 'contact_id', table: 'contacts' },
    { field: 'deal_id', table: 'deals' },
  ];

  for (const { field, table } of fkChecks) {
    const fkValue = req.fields[field];
    if (!fkValue) continue;

    const { data, error } = await client
      .from(table)
      .select('id')
      .eq('id', String(fkValue))
      .maybeSingle();

    if (error || !data) {
      return {
        code: 'FK_VALIDATION_FAILED',
        message: `Referenced ${field} "${fkValue}" does not exist in ${table}`,
        userGuidance: `The ${field.replace('_id', '')} you're trying to link doesn't exist. Please check and try again.`,
        retryable: false,
        details: { field, table, value: fkValue },
      };
    }
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
