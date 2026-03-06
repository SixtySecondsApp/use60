/**
 * Write Verification Output — Standardized before/after format
 *
 * Every write action emits a normalized payload:
 * - intent: what the user asked for
 * - target entity: type + id
 * - before snapshot: field values before mutation
 * - after snapshot: field values after mutation
 * - verification status: pass/fail/partial
 * - retry guidance: if verification fails
 *
 * Consumed by structuredResponseDetector for user-facing rendering
 * and telemetry for verification pass/fail tracking.
 */

import type { WriteResult } from './writePolicy.ts';

// =============================================================================
// Types
// =============================================================================

export type VerificationStatus = 'verified' | 'unverified' | 'partial' | 'failed';

export interface WriteVerificationOutput {
  intent: string;
  target: {
    entityType: string;
    entityId?: string;
  };
  operation: string; // create, update, delete, associate
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  changedFields: FieldChange[];
  verification: {
    status: VerificationStatus;
    message: string;
    retryGuidance?: string;
  };
  syncStatus?: string;
  timestamp: string;
}

export interface FieldChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  verified: boolean;
}

// =============================================================================
// Builder
// =============================================================================

/**
 * Build a standardized write verification output from a WriteResult.
 */
export function buildWriteVerificationOutput(
  writeResult: WriteResult,
  intent: string,
): WriteVerificationOutput {
  const changedFields = computeChangedFields(
    writeResult.before || null,
    writeResult.after || null,
  );

  const verification = mapVerificationStatus(writeResult);

  return {
    intent,
    target: {
      entityType: writeResult.entityType,
      entityId: writeResult.entityId,
    },
    operation: writeResult.operationClass,
    before: writeResult.before || null,
    after: writeResult.after || null,
    changedFields,
    verification,
    syncStatus: writeResult.syncStatus,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build verification output for a non-policy write (legacy adapter).
 * Use this when integrating with existing write paths that don't use writePolicy.
 */
export function buildLegacyVerificationOutput(
  entityType: string,
  entityId: string | undefined,
  operation: string,
  intent: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  success: boolean,
  error?: string,
): WriteVerificationOutput {
  const changedFields = computeChangedFields(before, after);
  const allVerified = changedFields.length > 0 && changedFields.every((f) => f.verified);

  return {
    intent,
    target: { entityType, entityId },
    operation,
    before,
    after,
    changedFields,
    verification: {
      status: !success ? 'failed' : allVerified ? 'verified' : after ? 'partial' : 'unverified',
      message: !success
        ? `Write failed: ${error || 'unknown error'}`
        : allVerified
        ? 'All fields verified successfully'
        : after
        ? 'Some fields could not be verified'
        : 'Verification re-read was not performed',
      retryGuidance: !success ? 'Try the update again or check field values.' : undefined,
    },
    timestamp: new Date().toISOString(),
  };
}

// =============================================================================
// Helpers
// =============================================================================

function computeChangedFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): FieldChange[] {
  if (!before && !after) return [];

  const changes: FieldChange[] = [];
  const allKeys = new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ]);

  for (const field of allKeys) {
    if (field === 'id' || field === 'created_at' || field === 'updated_at') continue;

    const oldVal = before?.[field] ?? null;
    const newVal = after?.[field] ?? null;

    // Only include fields that actually changed
    if (oldVal !== newVal && !(oldVal == null && newVal == null)) {
      changes.push({
        field,
        oldValue: oldVal,
        newValue: newVal,
        verified: after != null, // Verified if we have an after snapshot
      });
    }
  }

  return changes;
}

function mapVerificationStatus(wr: WriteResult): {
  status: VerificationStatus;
  message: string;
  retryGuidance?: string;
} {
  if (wr.status === 'failed' || wr.status === 'validation_error') {
    return {
      status: 'failed',
      message: wr.error?.message || 'Write failed',
      retryGuidance: wr.error?.userGuidance || 'Please try again.',
    };
  }

  if (!wr.verified) {
    return {
      status: wr.after ? 'partial' : 'unverified',
      message: wr.after
        ? 'Write succeeded but some fields did not match expected values'
        : 'Write succeeded but verification re-read was not performed',
      retryGuidance: 'Verify the record manually to confirm changes.',
    };
  }

  return {
    status: 'verified',
    message: 'All fields verified successfully after write',
  };
}

// =============================================================================
// Telemetry
// =============================================================================

/**
 * Record write verification telemetry (for tracking pass/fail rates).
 * Non-blocking — errors are logged but never thrown.
 */
export async function recordWriteVerificationTelemetry(
  client: any,
  output: WriteVerificationOutput,
  orgId: string,
  userId: string,
): Promise<void> {
  try {
    await client.from('activities').insert({
      type: 'write_verification',
      user_id: userId,
      details: JSON.stringify({
        entity_type: output.target.entityType,
        entity_id: output.target.entityId,
        operation: output.operation,
        verification_status: output.verification.status,
        changed_fields_count: output.changedFields.length,
        sync_status: output.syncStatus,
      }),
    });
  } catch (err) {
    console.warn('[writeVerification] Telemetry recording failed:', err);
  }
}
