import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WebhookConfig {
  id: string;
  table_id: string;
  is_enabled: boolean;
  /** Client-side masked display key, e.g. "sk_...XXXX". Full api_key never leaves this hook. */
  displayKey: string | null;
  auto_create_columns: boolean;
  field_mapping: Record<string, string> | null;
  first_call_received_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WebhookLog {
  id: string;
  webhook_id: string;
  direction: 'inbound' | 'outbound';
  status: number | null;
  payload: Record<string, unknown> | null;
  mapped_result: Record<string, unknown> | null;
  rows_affected: number | null;
  error: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

const QUERY_KEYS = {
  config: (tableId: string) => ['webhook-config', tableId],
  logs: (webhookId: string) => ['webhook-logs', webhookId],
};

// ---------------------------------------------------------------------------
// useWebhookConfig
// Fetches the webhook config for a given ops table.
// Returns null if no config exists yet.
// ---------------------------------------------------------------------------

export function useWebhookConfig(tableId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.config(tableId),
    queryFn: async () => {
      if (!tableId) return null;

      const { data, error } = await (supabase
        .from('ops_table_webhooks') as any)
        .select('id, table_id, is_enabled, api_key, auto_create_columns, field_mapping, first_call_received_at, created_at, updated_at')
        .eq('table_id', tableId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      // Mask api_key client-side — never expose full key via normal queries
      const { api_key, ...rest } = data;
      const displayKey = api_key ? `sk_...${(api_key as string).slice(-4)}` : null;
      return { ...rest, displayKey } as WebhookConfig;
    },
    enabled: !!tableId,
  });
}

// ---------------------------------------------------------------------------
// useWebhookLogs
// Fetches recent webhook activity logs for a given webhook.
// ---------------------------------------------------------------------------

export function useWebhookLogs(webhookId: string, limit = 10) {
  return useQuery({
    queryKey: QUERY_KEYS.logs(webhookId),
    queryFn: async () => {
      if (!webhookId) return [];

      const { data, error } = await (supabase
        .from('ops_webhook_logs') as any)
        .select('id, webhook_id, direction, status, payload, mapped_result, rows_affected, error, created_at')
        .eq('webhook_id', webhookId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []) as WebhookLog[];
    },
    enabled: !!webhookId,
  });
}

// ---------------------------------------------------------------------------
// useGenerateApiKey
// Calls the generate_webhook_api_key RPC which returns the full key as TEXT.
// The full key is only returned once — caller must display it immediately.
// After generation the webhook config is invalidated so the masked key refreshes.
// ---------------------------------------------------------------------------

export function useGenerateApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ tableId }: { tableId: string }) => {
      const { data, error } = await (supabase as any)
        .rpc('generate_webhook_api_key', { p_table_id: tableId });

      if (error) throw error;

      // RPC returns TEXT — the full api key (e.g. "sk_<64 hex chars>")
      const fullKey = data as string;
      return { fullKey };
    },
    onSuccess: (_data, variables) => {
      // Invalidate so the masked key refreshes in useWebhookConfig
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.config(variables.tableId) });
    },
  });
}

// ---------------------------------------------------------------------------
// useUpdateWebhookConfig
// Updates is_enabled, auto_create_columns, or field_mapping on an existing row.
// ---------------------------------------------------------------------------

export function useUpdateWebhookConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      webhookId,
      tableId,
      updates,
    }: {
      webhookId: string;
      tableId: string;
      updates: Partial<Pick<WebhookConfig, 'is_enabled' | 'auto_create_columns' | 'field_mapping'>>;
    }) => {
      const { error } = await (supabase
        .from('ops_table_webhooks') as any)
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', webhookId);

      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.config(variables.tableId) });
    },
  });
}
