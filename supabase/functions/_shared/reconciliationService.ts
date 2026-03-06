/**
 * Cross-System Reconciliation Service
 *
 * Detects and resolves drift between local app records and CRM (HubSpot/Attio).
 *
 * Features:
 * - Field-level source-of-truth policy per entity type
 * - Drift detection with explicit conflict strategy
 * - Bounded retries with dead-letter handling for poison records
 * - Copilot responses annotated with sync status
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import type { CrmSource } from './enqueueWriteback.ts';

type SupabaseClient = ReturnType<typeof createClient>;

// =============================================================================
// Types
// =============================================================================

export type FieldTruth = 'local' | 'crm' | 'most_recent' | 'manual';
export type ConflictStrategy = 'crm_wins' | 'local_wins' | 'most_recent_wins' | 'flag_for_review';
export type ReconciliationAction = 'no_change' | 'update_local' | 'update_crm' | 'flag_conflict' | 'dead_letter';

export interface FieldPolicy {
  field: string;
  sourceOfTruth: FieldTruth;
  conflictStrategy: ConflictStrategy;
}

export interface DriftRecord {
  field: string;
  localValue: unknown;
  crmValue: unknown;
  action: ReconciliationAction;
  resolution?: unknown; // The resolved value
}

export interface ReconciliationResult {
  entityType: string;
  entityId: string;
  crmSource: CrmSource;
  crmRecordId: string;
  driftDetected: boolean;
  drifts: DriftRecord[];
  syncStatus: 'synced' | 'local_only' | 'crm_only' | 'drift_resolved' | 'conflict_flagged' | 'dead_letter';
  resolvedCount: number;
  conflictCount: number;
  error?: string;
}

// =============================================================================
// Default Field Policies
// =============================================================================

const CONTACT_FIELD_POLICIES: FieldPolicy[] = [
  { field: 'email', sourceOfTruth: 'crm', conflictStrategy: 'crm_wins' },
  { field: 'first_name', sourceOfTruth: 'crm', conflictStrategy: 'crm_wins' },
  { field: 'last_name', sourceOfTruth: 'crm', conflictStrategy: 'crm_wins' },
  { field: 'phone', sourceOfTruth: 'crm', conflictStrategy: 'crm_wins' },
  { field: 'title', sourceOfTruth: 'crm', conflictStrategy: 'crm_wins' },
  { field: 'company_id', sourceOfTruth: 'local', conflictStrategy: 'local_wins' },
  { field: 'lifecycle_stage', sourceOfTruth: 'crm', conflictStrategy: 'crm_wins' },
  { field: 'lead_status', sourceOfTruth: 'crm', conflictStrategy: 'crm_wins' },
];

const COMPANY_FIELD_POLICIES: FieldPolicy[] = [
  { field: 'name', sourceOfTruth: 'crm', conflictStrategy: 'crm_wins' },
  { field: 'domain', sourceOfTruth: 'crm', conflictStrategy: 'crm_wins' },
  { field: 'industry', sourceOfTruth: 'crm', conflictStrategy: 'crm_wins' },
  { field: 'description', sourceOfTruth: 'most_recent', conflictStrategy: 'most_recent_wins' },
];

const DEAL_FIELD_POLICIES: FieldPolicy[] = [
  { field: 'title', sourceOfTruth: 'crm', conflictStrategy: 'crm_wins' },
  { field: 'stage', sourceOfTruth: 'crm', conflictStrategy: 'crm_wins' },
  { field: 'value', sourceOfTruth: 'crm', conflictStrategy: 'crm_wins' },
  { field: 'close_date', sourceOfTruth: 'crm', conflictStrategy: 'crm_wins' },
  { field: 'status', sourceOfTruth: 'local', conflictStrategy: 'local_wins' },
];

function getFieldPolicies(entityType: string): FieldPolicy[] {
  switch (entityType) {
    case 'contact': return CONTACT_FIELD_POLICIES;
    case 'company': return COMPANY_FIELD_POLICIES;
    case 'deal': return DEAL_FIELD_POLICIES;
    default: return [];
  }
}

// =============================================================================
// Drift Detection
// =============================================================================

/**
 * Detect field-level drift between local and CRM records.
 */
export function detectDrift(
  entityType: string,
  localRecord: Record<string, unknown>,
  crmRecord: Record<string, unknown>,
  localUpdatedAt?: string,
  crmUpdatedAt?: string,
): DriftRecord[] {
  const policies = getFieldPolicies(entityType);
  const drifts: DriftRecord[] = [];

  for (const policy of policies) {
    const localVal = localRecord[policy.field];
    const crmVal = crmRecord[policy.field];

    // Skip if both null/undefined or equal
    if (localVal == null && crmVal == null) continue;
    if (localVal === crmVal) continue;

    // Drift detected
    const action = resolveConflict(policy, localVal, crmVal, localUpdatedAt, crmUpdatedAt);
    const resolution = getResolvedValue(action, localVal, crmVal);

    drifts.push({
      field: policy.field,
      localValue: localVal ?? null,
      crmValue: crmVal ?? null,
      action,
      resolution,
    });
  }

  return drifts;
}

function resolveConflict(
  policy: FieldPolicy,
  localVal: unknown,
  crmVal: unknown,
  localUpdatedAt?: string,
  crmUpdatedAt?: string,
): ReconciliationAction {
  switch (policy.conflictStrategy) {
    case 'crm_wins':
      return crmVal != null ? 'update_local' : 'no_change';
    case 'local_wins':
      return localVal != null ? 'update_crm' : 'no_change';
    case 'most_recent_wins': {
      if (!localUpdatedAt || !crmUpdatedAt) return 'flag_conflict';
      const localDate = new Date(localUpdatedAt).getTime();
      const crmDate = new Date(crmUpdatedAt).getTime();
      return crmDate > localDate ? 'update_local' : 'update_crm';
    }
    case 'flag_for_review':
      return 'flag_conflict';
    default:
      return 'flag_conflict';
  }
}

function getResolvedValue(
  action: ReconciliationAction,
  localVal: unknown,
  crmVal: unknown,
): unknown {
  switch (action) {
    case 'update_local': return crmVal;
    case 'update_crm': return localVal;
    default: return undefined;
  }
}

// =============================================================================
// Reconciliation Executor
// =============================================================================

const MAX_RECONCILIATION_RETRIES = 3;

/**
 * Reconcile a single entity between local and CRM.
 */
export async function reconcileEntity(
  client: SupabaseClient,
  entityType: string,
  entityId: string,
  crmSource: CrmSource,
  crmRecordId: string,
  crmRecord: Record<string, unknown>,
  opts?: { crmUpdatedAt?: string; retryCount?: number },
): Promise<ReconciliationResult> {
  const tableName = entityType === 'contact' ? 'contacts'
    : entityType === 'company' ? 'companies'
    : entityType === 'deal' ? 'deals'
    : entityType;

  // Load local record
  const fields = getFieldPolicies(entityType).map((p) => p.field);
  const { data: localRecord, error: loadErr } = await client
    .from(tableName)
    .select([...fields, 'id', 'updated_at'].join(', '))
    .eq('id', entityId)
    .maybeSingle();

  if (loadErr || !localRecord) {
    return {
      entityType,
      entityId,
      crmSource,
      crmRecordId,
      driftDetected: false,
      drifts: [],
      syncStatus: 'local_only',
      resolvedCount: 0,
      conflictCount: 0,
      error: loadErr?.message || 'Local record not found',
    };
  }

  const local = localRecord as Record<string, unknown>;
  const drifts = detectDrift(
    entityType,
    local,
    crmRecord,
    local.updated_at as string,
    opts?.crmUpdatedAt,
  );

  if (drifts.length === 0) {
    return {
      entityType, entityId, crmSource, crmRecordId,
      driftDetected: false,
      drifts: [],
      syncStatus: 'synced',
      resolvedCount: 0,
      conflictCount: 0,
    };
  }

  // Apply resolutions
  const localUpdates: Record<string, unknown> = {};
  const crmUpdates: Record<string, unknown> = {};
  let conflictCount = 0;

  for (const drift of drifts) {
    switch (drift.action) {
      case 'update_local':
        localUpdates[drift.field] = drift.resolution;
        break;
      case 'update_crm':
        crmUpdates[drift.field] = drift.resolution;
        break;
      case 'flag_conflict':
      case 'dead_letter':
        conflictCount++;
        break;
    }
  }

  // Apply local updates
  if (Object.keys(localUpdates).length > 0) {
    const { error: updateErr } = await client
      .from(tableName)
      .update(localUpdates)
      .eq('id', entityId);

    if (updateErr) {
      const retryCount = (opts?.retryCount || 0) + 1;
      if (retryCount >= MAX_RECONCILIATION_RETRIES) {
        return {
          entityType, entityId, crmSource, crmRecordId,
          driftDetected: true,
          drifts,
          syncStatus: 'dead_letter',
          resolvedCount: 0,
          conflictCount: drifts.length,
          error: `Failed after ${retryCount} retries: ${updateErr.message}`,
        };
      }
      // Retry
      return reconcileEntity(client, entityType, entityId, crmSource, crmRecordId, crmRecord, {
        ...opts,
        retryCount,
      });
    }
  }

  // Enqueue CRM updates if needed
  if (Object.keys(crmUpdates).length > 0) {
    // Import dynamically to avoid circular deps
    try {
      const { enqueueWriteback } = await import('./enqueueWriteback.ts');
      await enqueueWriteback({
        supabase: client,
        orgId: (local as any).owner_id || '',
        crmSource,
        entityType: entityType as any,
        operation: 'update',
        crmRecordId,
        payload: crmUpdates,
        triggeredBy: 'automation',
        priority: 7, // Low priority for reconciliation
      });
    } catch (err) {
      console.warn('[reconciliation] Failed to enqueue CRM writeback:', err);
    }
  }

  const resolvedCount = Object.keys(localUpdates).length + Object.keys(crmUpdates).length;

  return {
    entityType, entityId, crmSource, crmRecordId,
    driftDetected: true,
    drifts,
    syncStatus: conflictCount > 0 ? 'conflict_flagged' : 'drift_resolved',
    resolvedCount,
    conflictCount,
  };
}

// =============================================================================
// Sync Status Annotation for Copilot
// =============================================================================

export type CopilotSyncAnnotation = 'local_only' | 'crm_synced' | 'sync_queued' | 'drift_detected' | 'unknown';

/**
 * Annotate a copilot response with sync status for user transparency.
 */
export function annotateSyncStatus(
  reconciliationResult?: ReconciliationResult | null,
  writebackQueued?: boolean,
): CopilotSyncAnnotation {
  if (!reconciliationResult) {
    return writebackQueued ? 'sync_queued' : 'unknown';
  }

  switch (reconciliationResult.syncStatus) {
    case 'synced': return 'crm_synced';
    case 'drift_resolved': return 'crm_synced';
    case 'local_only': return 'local_only';
    case 'conflict_flagged':
    case 'dead_letter': return 'drift_detected';
    default: return writebackQueued ? 'sync_queued' : 'unknown';
  }
}
