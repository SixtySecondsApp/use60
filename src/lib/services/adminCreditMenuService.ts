/**
 * Admin Credit Menu Service
 *
 * Platform admin CRUD for the credit_menu pricing table.
 * Calls the admin-credit-menu edge function.
 */

import { supabase } from '@/lib/supabase/clientV2';

const EDGE_FN = 'admin-credit-menu';

// ============================================================================
// Types
// ============================================================================

export interface CreditMenuEntry {
  action_id: string;
  display_name: string;
  description: string;
  category: string;
  unit: string;
  cost_low: number;
  cost_medium: number;
  cost_high: number;
  is_active: boolean;
  free_with_sub: boolean;
  is_flat_rate: boolean;
  menu_version: number;
  updated_at: string;
  updated_by: string;
  deleted_at: string | null;
}

export interface NewCreditMenuEntry {
  action_id: string;
  display_name: string;
  description?: string;
  category?: string;
  unit?: string;
  cost_low: number;
  cost_medium: number;
  cost_high: number;
  free_with_sub?: boolean;
  is_flat_rate?: boolean;
}

export interface CreditMenuUpdatePayload {
  display_name?: string;
  description?: string;
  category?: string;
  unit?: string;
  cost_low?: number;
  cost_medium?: number;
  cost_high?: number;
  free_with_sub?: boolean;
  is_flat_rate?: boolean;
}

export interface CreditMenuHistoryEntry {
  id: string;
  action_id: string;
  event_type: 'created' | 'updated' | 'activated' | 'deactivated';
  prev_cost_low: number | null;
  prev_cost_medium: number | null;
  prev_cost_high: number | null;
  prev_is_active: boolean | null;
  new_cost_low: number;
  new_cost_medium: number;
  new_cost_high: number;
  new_is_active: boolean;
  menu_version: number;
  reason: string | null;
  changed_by: string;
  changed_at: string;
}

// ============================================================================
// Helpers
// ============================================================================

async function invokeAdminFn<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const fnPath = path ? `${EDGE_FN}/${path}` : EDGE_FN;

  const { data, error } = await supabase.functions.invoke(fnPath, {
    method: (options.method ?? 'GET') as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    body: options.body,
  });

  if (error) {
    throw error;
  }

  if (data?.error) {
    throw new Error(data.error.message ?? 'Edge function returned an error');
  }

  return data as T;
}

// ============================================================================
// Service
// ============================================================================

export const adminCreditMenuService = {
  /** GET / — list all non-deleted credit menu entries */
  async listAll(): Promise<CreditMenuEntry[]> {
    const result = await invokeAdminFn<{ data: CreditMenuEntry[] }>('', { method: 'GET' });
    return result.data ?? [];
  },

  /** PUT /:action_id — update pricing or metadata fields */
  async update(actionId: string, payload: CreditMenuUpdatePayload): Promise<CreditMenuEntry> {
    const result = await invokeAdminFn<{ data: CreditMenuEntry }>(actionId, {
      method: 'PUT',
      body: payload,
    });
    return result.data;
  },

  /** POST / — create a new draft action */
  async create(payload: NewCreditMenuEntry): Promise<CreditMenuEntry> {
    const result = await invokeAdminFn<{ data: CreditMenuEntry }>('', {
      method: 'POST',
      body: payload,
    });
    return result.data;
  },

  /** PATCH /:action_id/activate — activate a draft entry */
  async activate(actionId: string): Promise<CreditMenuEntry> {
    const result = await invokeAdminFn<{ data: CreditMenuEntry }>(
      `${actionId}/activate`,
      { method: 'PATCH' }
    );
    return result.data;
  },

  /** PATCH /:action_id/deactivate — deactivate an active entry */
  async deactivate(actionId: string): Promise<CreditMenuEntry> {
    const result = await invokeAdminFn<{ data: CreditMenuEntry }>(
      `${actionId}/deactivate`,
      { method: 'PATCH' }
    );
    return result.data;
  },

  /** GET /history — full pricing audit trail, optionally filtered by action_id */
  async getHistory(actionId?: string): Promise<CreditMenuHistoryEntry[]> {
    const path = actionId ? `history?action_id=${encodeURIComponent(actionId)}` : 'history';
    const result = await invokeAdminFn<{ data: CreditMenuHistoryEntry[] }>(path, {
      method: 'GET',
    });
    return result.data ?? [];
  },
};
