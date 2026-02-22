/**
 * CRM HubSpot Sync Adapter
 *
 * Syncs auto-applied (or approved) CRM field changes to HubSpot after they
 * have been written to the local deals table.
 *
 * This is intentionally a thin adapter — it delegates all HubSpot HTTP
 * communication to the shared HubSpotClient from _shared/hubspot.ts and
 * follows the token-refresh pattern established in hubspot-admin/index.ts.
 *
 * Field mapping (Sixty → HubSpot deal properties):
 *   stage        → dealstage  (HubSpot pipeline stage ID — best-effort lookup)
 *   next_steps   → hs_next_step
 *   close_date   → closedate  (YYYY-MM-DD)
 *   deal_value   → amount     (numeric string)
 *   notes/stakeholders/blockers/summary/activity_log → hs_deal_stage_probability comment via note
 *
 * Fields that are appended to notes in Sixty are written as HubSpot Note
 * engagements (POST /crm/v3/objects/notes) associated to the deal.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { HubSpotClient } from '../../hubspot.ts';
import type { AppliedChange } from './crmAutoApply.ts';
import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { getServiceClient } from './contextEnrichment.ts';
import { getAgentConfig } from '../../config/agentConfigEngine.ts';

// =============================================================================
// Types
// =============================================================================

export interface HubSpotSyncConfig {
  hubspot_sync_enabled: boolean;
}

export interface HubSpotSyncResult {
  synced: boolean;
  hubspot_deal_id?: string;
  properties_updated?: string[];
  notes_created?: number;
  error?: string;
}

// =============================================================================
// Field mapping
// =============================================================================

/** Maps Sixty field names to HubSpot CRM deal properties */
const PROPERTY_FIELD_MAP: Record<string, string> = {
  next_steps: 'hs_next_step',
  close_date: 'closedate',
  deal_value: 'amount',
  stage: 'dealstage',
};

/**
 * Fields that don't map to a direct deal property — they are written as
 * HubSpot Note engagements attached to the deal.
 */
const NOTE_FIELDS: Set<string> = new Set([
  'notes',
  'stakeholders',
  'blockers',
  'activity_log',
  'summary',
  'meddic_score',
  'budget_confirmed',
]);

// =============================================================================
// Public API
// =============================================================================

/**
 * Sync applied CRM field changes to HubSpot.
 *
 * @param supabase       Supabase client (service role)
 * @param orgId          Sixty org UUID
 * @param dealId         Sixty deal UUID
 * @param appliedChanges Changes returned by autoApplyFields (or resolve_crm_approval_item)
 * @param agentConfig    Must include hubspot_sync_enabled
 */
export async function syncToHubSpot(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  dealId: string,
  appliedChanges: AppliedChange[],
  agentConfig: HubSpotSyncConfig,
): Promise<HubSpotSyncResult> {
  // -------------------------------------------------------------------------
  // 1. Short-circuit if sync is disabled in agent config
  // -------------------------------------------------------------------------
  if (!agentConfig.hubspot_sync_enabled) {
    console.log('[crm-hubspot-sync] Sync disabled via agent config, skipping');
    return { synced: false };
  }

  if (appliedChanges.length === 0) {
    return { synced: false };
  }

  // -------------------------------------------------------------------------
  // 2. Get a valid HubSpot access token (refreshes if needed)
  // -------------------------------------------------------------------------
  const { accessToken, error: tokenError } = await getValidAccessToken(supabase, orgId);

  if (tokenError || !accessToken) {
    console.log('[crm-hubspot-sync] HubSpot not connected:', tokenError);
    return { synced: false, error: tokenError ?? 'not_connected' };
  }

  // -------------------------------------------------------------------------
  // 3. Look up the HubSpot deal ID via hubspot_object_mappings
  // -------------------------------------------------------------------------
  const { data: mapping, error: mappingError } = await supabase
    .from('hubspot_object_mappings')
    .select('hubspot_id')
    .eq('org_id', orgId)
    .eq('object_type', 'deal')
    .eq('sixty_id', dealId)
    .maybeSingle();

  if (mappingError) {
    console.warn('[crm-hubspot-sync] Failed to look up HubSpot mapping:', mappingError.message);
    return { synced: false, error: `Mapping lookup failed: ${mappingError.message}` };
  }

  if (!mapping?.hubspot_id) {
    console.log('[crm-hubspot-sync] Deal not mapped to HubSpot, skipping sync');
    return { synced: false, error: 'deal_not_mapped' };
  }

  const hubspotDealId = mapping.hubspot_id as string;
  const client = new HubSpotClient({ accessToken });

  // -------------------------------------------------------------------------
  // 4. Separate property updates from note-type fields
  // -------------------------------------------------------------------------
  const propertyUpdates: Record<string, string> = {};
  const noteTexts: string[] = [];
  const propertiesUpdated: string[] = [];

  for (const change of appliedChanges) {
    const { field_name, applied_value } = change;

    if (NOTE_FIELDS.has(field_name)) {
      const label = labelFor(field_name);
      const text = typeof applied_value === 'string'
        ? applied_value
        : JSON.stringify(applied_value);
      noteTexts.push(`${label}: ${text}`);
      continue;
    }

    const hubspotProp = PROPERTY_FIELD_MAP[field_name];
    if (!hubspotProp) {
      // Unknown field — skip gracefully
      continue;
    }

    const stringValue = valueToString(field_name, applied_value);
    if (stringValue !== null) {
      propertyUpdates[hubspotProp] = stringValue;
      propertiesUpdated.push(hubspotProp);
    }
  }

  // -------------------------------------------------------------------------
  // 5. PATCH the HubSpot deal with property updates
  // -------------------------------------------------------------------------
  if (Object.keys(propertyUpdates).length > 0) {
    try {
      await client.request({
        method: 'PATCH',
        path: `/crm/v3/objects/deals/${hubspotDealId}`,
        body: { properties: propertyUpdates },
      });
      console.log(
        `[crm-hubspot-sync] Patched deal ${hubspotDealId} with properties:`,
        Object.keys(propertyUpdates).join(', '),
      );
    } catch (patchError) {
      const msg = patchError instanceof Error ? patchError.message : String(patchError);
      console.error('[crm-hubspot-sync] PATCH deal failed:', msg);
      return { synced: false, error: `HubSpot PATCH failed: ${msg}` };
    }
  }

  // -------------------------------------------------------------------------
  // 6. Create HubSpot Note engagement for note-type fields
  // -------------------------------------------------------------------------
  let notesCreated = 0;

  if (noteTexts.length > 0) {
    const datestamp = new Date().toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
    const noteBody = `[${datestamp}] CRM Auto-Update from meeting:\n${noteTexts.join('\n')}`;

    try {
      await client.request({
        method: 'POST',
        path: '/crm/v3/objects/notes',
        body: {
          properties: {
            hs_note_body: noteBody,
            hs_timestamp: new Date().toISOString(),
          },
          associations: [
            {
              to: { id: hubspotDealId },
              types: [
                {
                  associationCategory: 'HUBSPOT_DEFINED',
                  associationTypeId: 214, // Note → Deal association type
                },
              ],
            },
          ],
        },
      });
      notesCreated = 1;
      console.log(`[crm-hubspot-sync] Created note on deal ${hubspotDealId}`);
    } catch (noteError) {
      const msg = noteError instanceof Error ? noteError.message : String(noteError);
      console.warn('[crm-hubspot-sync] Note creation failed (non-fatal):', msg);
      // Note failure is non-fatal — deal properties were already patched
    }
  }

  console.log(
    `[crm-hubspot-sync] Sync complete for deal ${hubspotDealId}: ` +
    `${propertiesUpdated.length} properties, ${notesCreated} note(s)`,
  );

  return {
    synced: true,
    hubspot_deal_id: hubspotDealId,
    properties_updated: propertiesUpdated,
    notes_created: notesCreated,
  };
}

// =============================================================================
// Token refresh helper (mirrors hubspot-admin/index.ts pattern)
// =============================================================================

async function getValidAccessToken(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
): Promise<{ accessToken: string | null; error: string | null }> {
  const { data: creds, error: credsError } = await supabase
    .from('hubspot_org_credentials')
    .select('access_token, refresh_token, token_expires_at')
    .eq('org_id', orgId)
    .maybeSingle();

  if (credsError || !creds) {
    return { accessToken: null, error: 'HubSpot not connected' };
  }

  const accessToken = creds.access_token as string | null;
  const refreshToken = creds.refresh_token as string | null;
  const tokenExpiresAt = creds.token_expires_at as string | null;

  if (!accessToken || !refreshToken) {
    return { accessToken: null, error: 'HubSpot not connected' };
  }

  // Check if token needs refresh (5-minute buffer)
  const expiresAt = tokenExpiresAt ? new Date(tokenExpiresAt).getTime() : 0;
  const isExpiredOrExpiring = expiresAt - Date.now() < 5 * 60 * 1000;

  if (!isExpiredOrExpiring) {
    return { accessToken, error: null };
  }

  // Attempt token refresh
  const clientId = Deno.env.get('HUBSPOT_CLIENT_ID') ?? '';
  const clientSecret = Deno.env.get('HUBSPOT_CLIENT_SECRET') ?? '';

  if (!clientId || !clientSecret) {
    // Can't refresh but token might still work — return what we have
    console.warn('[crm-hubspot-sync] Cannot refresh token: missing HUBSPOT_CLIENT_ID/SECRET');
    return { accessToken, error: null };
  }

  try {
    const tokenResp = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }).toString(),
    });

    const tokenData = await tokenResp.json();

    if (!tokenResp.ok) {
      if (tokenData?.error === 'invalid_grant' || tokenResp.status === 400) {
        // Mark as disconnected
        await supabase
          .from('hubspot_org_integrations')
          .update({ is_active: false, is_connected: false, updated_at: new Date().toISOString() })
          .eq('org_id', orgId);
        return { accessToken: null, error: 'HubSpot connection expired. Please reconnect.' };
      }
      return { accessToken: null, error: 'Token refresh failed' };
    }

    const newAccessToken = tokenData.access_token as string;
    const newRefreshToken = (tokenData.refresh_token as string | undefined) || refreshToken;
    const expiresIn = Number(tokenData.expires_in || 1800);
    const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    await supabase
      .from('hubspot_org_credentials')
      .update({
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        token_expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', orgId);

    return { accessToken: newAccessToken, error: null };
  } catch (e) {
    console.error('[crm-hubspot-sync] Token refresh error:', e);
    // Return the existing token as a fallback — it may still work
    return { accessToken, error: null };
  }
}

// =============================================================================
// Helpers
// =============================================================================

function labelFor(fieldName: string): string {
  const labels: Record<string, string> = {
    notes: 'Notes',
    stakeholders: 'Stakeholders',
    blockers: 'Blockers',
    activity_log: 'Activity',
    summary: 'Meeting Summary',
    meddic_score: 'MEDDIC Score',
    budget_confirmed: 'Budget Confirmed',
  };
  return labels[fieldName] ?? fieldName;
}

/**
 * Convert an applied field value to the string format HubSpot expects.
 * Returns null if the value cannot be mapped.
 */
function valueToString(fieldName: string, value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (fieldName === 'close_date') {
    // HubSpot expects YYYY-MM-DD
    const dateStr = String(value);
    const parsed = new Date(dateStr);
    if (isNaN(parsed.getTime())) return null;
    return parsed.toISOString().split('T')[0];
  }

  if (fieldName === 'deal_value') {
    const num = typeof value === 'number' ? value : parseFloat(String(value).replace(/[$,]/g, ''));
    if (isNaN(num)) return null;
    return String(num);
  }

  return String(value);
}

// =============================================================================
// SkillAdapter wrapper — used by the fleet runner registry
// =============================================================================

/**
 * Fleet runner adapter for the 'hubspot-sync-crm-fields' sequence step.
 *
 * Reads auto-applied changes from the upstream 'auto-apply-crm-fields' step,
 * checks agent config for hubspot_sync_enabled, and calls syncToHubSpot().
 *
 * Output shape: HubSpotSyncResult (synced, hubspot_deal_id, properties_updated, …)
 */
export const crmHubSpotSyncAdapter: SkillAdapter = {
  name: 'hubspot-sync-crm-fields',

  async execute(state: SequenceState, _step: SequenceStep): Promise<StepResult> {
    const start = Date.now();

    try {
      const deal = state.context.tier2?.deal;
      if (!deal?.id) {
        return {
          success: true,
          output: { synced: false, skipped: true, reason: 'No deal in context' },
          duration_ms: Date.now() - start,
        };
      }

      // Get applied changes from upstream auto-apply step
      const autoApplyOutput = state.outputs['auto-apply-crm-fields'] as
        | { applied?: AppliedChange[] }
        | undefined;
      const appliedChanges: AppliedChange[] = autoApplyOutput?.applied ?? [];

      if (appliedChanges.length === 0) {
        return {
          success: true,
          output: { synced: false, skipped: true, reason: 'No auto-applied fields to sync' },
          duration_ms: Date.now() - start,
        };
      }

      // Load agent config for hubspot_sync_enabled
      const supabase = getServiceClient();
      let syncEnabled = true; // default on

      try {
        const agentCfg = await getAgentConfig(
          supabase,
          state.event.org_id,
          state.event.user_id ?? null,
          'crm_update' as any,
        );
        const entry = agentCfg?.entries?.['hubspot_sync_enabled'];
        if (entry?.config_value === false || entry?.config_value === 'false') {
          syncEnabled = false;
        }
      } catch (cfgErr) {
        console.warn('[hubspot-sync-crm-fields] Config load failed, defaulting sync enabled:', cfgErr);
      }

      const result = await syncToHubSpot(
        supabase,
        state.event.org_id,
        deal.id,
        appliedChanges,
        { hubspot_sync_enabled: syncEnabled },
      );

      return {
        success: true,
        output: result,
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      console.error('[hubspot-sync-crm-fields] Error:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        duration_ms: Date.now() - start,
      };
    }
  },
};
