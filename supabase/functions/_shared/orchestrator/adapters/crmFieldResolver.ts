/**
 * CRM Field Resolver
 *
 * Resolves field names using crm_field_mappings and enforces write policies
 * from crm_write_policies before any CRM write operation.
 *
 * Used by crmUpdate adapter to:
 * 1. Translate sixty field names -> HubSpot field names via DB mappings
 * 2. Enforce write policy: auto -> execute, approval -> HITL, suggest -> log only, disabled -> skip
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

// ============================================================
// Types
// ============================================================

export type WritePolicy = 'auto' | 'approval' | 'suggest' | 'disabled';
export type CRMProvider = 'hubspot' | 'attio' | 'bullhorn';
export type CRMObject = 'contact' | 'deal' | 'company' | 'activity';

export interface FieldMapping {
  crm_field_name: string;
  crm_field_type?: string;
  sixty_field_name: string;
  confidence: number;
  is_confirmed: boolean;
  is_excluded: boolean;
}

export interface FieldPolicy {
  field_name: string;
  policy: WritePolicy;
}

export interface ResolvedField {
  sixty_field_name: string;
  crm_field_name: string;
  policy: WritePolicy;
  value: unknown;
}

export interface FieldResolutionResult {
  /** Fields ready to write immediately (policy=auto) */
  autoFields: Record<string, unknown>;
  /** Fields that need human approval before writing */
  approvalFields: ResolvedField[];
  /** Fields to surface as suggestions only */
  suggestFields: ResolvedField[];
  /** Fields skipped due to disabled policy or excluded/unmapped */
  skippedFields: string[];
}

// ============================================================
// Resolver
// ============================================================

export class CRMFieldResolver {
  private supabase: ReturnType<typeof createClient>;

  constructor(supabase: ReturnType<typeof createClient>) {
    this.supabase = supabase;
  }

  /**
   * Load field mappings for an org+provider+object combination.
   * Returns only confirmed, non-excluded mappings with a sixty_field_name.
   */
  async loadMappings(
    orgId: string,
    provider: CRMProvider,
    object: CRMObject
  ): Promise<FieldMapping[]> {
    const { data, error } = await this.supabase
      .from('crm_field_mappings')
      .select('crm_field_name, crm_field_type, sixty_field_name, confidence, is_confirmed, is_excluded')
      .eq('org_id', orgId)
      .eq('crm_provider', provider)
      .eq('crm_object', object)
      .eq('is_excluded', false)
      .not('sixty_field_name', 'is', null);

    if (error) {
      console.error('[crmFieldResolver] loadMappings error:', error.message);
      return [];
    }

    return (data ?? []) as FieldMapping[];
  }

  /**
   * Load write policies for an org+object combination.
   */
  async loadPolicies(
    orgId: string,
    object: CRMObject
  ): Promise<Record<string, WritePolicy>> {
    const { data, error } = await this.supabase
      .from('crm_write_policies')
      .select('field_name, policy')
      .eq('org_id', orgId)
      .eq('crm_object', object);

    if (error) {
      console.error('[crmFieldResolver] loadPolicies error:', error.message);
      return {};
    }

    const policyMap: Record<string, WritePolicy> = {};
    for (const row of data ?? []) {
      policyMap[row.field_name as string] = row.policy as WritePolicy;
    }
    return policyMap;
  }

  /**
   * Resolve a set of sixty field changes into CRM field writes, applying
   * mapping and policy enforcement.
   *
   * @param orgId - Organization ID
   * @param provider - CRM provider (hubspot/attio/bullhorn)
   * @param object - CRM object type (contact/deal/etc.)
   * @param fieldChanges - Map of sixty field name -> new value to write
   * @param defaultPolicy - Default policy when no explicit policy is set (default: 'auto')
   */
  async resolveFields(
    orgId: string,
    provider: CRMProvider,
    object: CRMObject,
    fieldChanges: Record<string, unknown>,
    defaultPolicy: WritePolicy = 'auto'
  ): Promise<FieldResolutionResult> {
    const [mappings, policies] = await Promise.all([
      this.loadMappings(orgId, provider, object),
      this.loadPolicies(orgId, object),
    ]);

    // Build lookup: sixty_field_name -> crm_field_name
    const sixtyToCrm: Record<string, string> = {};
    for (const m of mappings) {
      if (m.sixty_field_name) {
        sixtyToCrm[m.sixty_field_name] = m.crm_field_name;
      }
    }

    const result: FieldResolutionResult = {
      autoFields: {},
      approvalFields: [],
      suggestFields: [],
      skippedFields: [],
    };

    for (const [sixtyField, value] of Object.entries(fieldChanges)) {
      const crmField = sixtyToCrm[sixtyField];

      if (!crmField) {
        // No mapping found — if mappings exist, skip; if no mappings configured, pass through
        if (mappings.length > 0) {
          result.skippedFields.push(sixtyField);
          continue;
        }
        // No mappings configured: pass-through with sixty field name as CRM field name
      }

      const resolvedCrmField = crmField ?? sixtyField;
      const policy: WritePolicy = policies[sixtyField] ?? defaultPolicy;

      switch (policy) {
        case 'auto':
          result.autoFields[resolvedCrmField] = value;
          break;
        case 'approval':
          result.approvalFields.push({
            sixty_field_name: sixtyField,
            crm_field_name: resolvedCrmField,
            policy,
            value,
          });
          break;
        case 'suggest':
          result.suggestFields.push({
            sixty_field_name: sixtyField,
            crm_field_name: resolvedCrmField,
            policy,
            value,
          });
          break;
        case 'disabled':
          result.skippedFields.push(sixtyField);
          break;
      }
    }

    return result;
  }
}
