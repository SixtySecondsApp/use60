import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

interface BootstrapConfigItem {
  config_key: string;
  value: unknown;
  agent_type: string;
  confidence: 'low' | 'medium' | 'high';
  source: string;
}

interface ConfirmBootstrapConfigBody {
  items: BootstrapConfigItem[];
}

export async function handleConfirmBootstrapConfig(
  serviceClient: SupabaseClient,
  orgId: string,
  userId: string,
  body: ConfirmBootstrapConfigBody,
): Promise<{ items_written: number; methodology_applied?: string }> {
  const { items } = body;

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('items must be a non-empty array');
  }

  // ------------------------------------------------------------------
  // 1. Batch-upsert all items into agent_config_org_overrides
  // ------------------------------------------------------------------
  const upsertRows = items.map((item) => ({
    org_id: orgId,
    agent_type: item.agent_type,
    config_key: item.config_key,
    config_value: item.value,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  }));

  const { error: upsertError } = await serviceClient
    .from('agent_config_org_overrides')
    .upsert(upsertRows, { onConflict: 'org_id,agent_type,config_key' });

  if (upsertError) {
    console.error('[bootstrapConfig] upsert error:', upsertError);
    throw new Error('Failed to write bootstrap config items');
  }

  // ------------------------------------------------------------------
  // 2. If a high-confidence sales_methodology item exists, also apply
  //    methodology-specific defaults via the apply_methodology RPC.
  // ------------------------------------------------------------------
  let methodologyApplied: string | undefined;

  const methodologyItem = items.find(
    (item) => item.config_key === 'sales_methodology' && item.confidence === 'high',
  );

  if (methodologyItem) {
    const methodologyKey = String(methodologyItem.value);

    const { error: rpcError } = await serviceClient.rpc('apply_methodology', {
      p_org_id: orgId,
      p_methodology_key: methodologyKey,
      p_applied_by: userId,
    });

    if (rpcError) {
      // Non-fatal: log and continue — the direct upsert already captured the value.
      console.warn('[bootstrapConfig] apply_methodology RPC error (non-fatal):', rpcError);
    } else {
      methodologyApplied = methodologyKey;
    }
  }

  // ------------------------------------------------------------------
  // 3. Mark any pending onboarding questions whose config_key is now
  //    covered by the bootstrap items as 'skipped'.
  // ------------------------------------------------------------------
  const configuredKeys = items.map((item) => item.config_key);

  const { error: skipError } = await serviceClient
    .from('agent_config_onboarding_questions')
    .update({ status: 'skipped', updated_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('status', 'pending')
    .in('config_key', configuredKeys);

  if (skipError) {
    // Non-fatal: skipping is a UX convenience; don't fail the whole request.
    console.warn('[bootstrapConfig] skip pending questions error (non-fatal):', skipError);
  }

  return {
    items_written: items.length,
    ...(methodologyApplied !== undefined ? { methodology_applied: methodologyApplied } : {}),
  };
}
