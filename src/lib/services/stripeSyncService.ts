/**
 * Stripe Sync Service
 *
 * Handles synchronization between subscription plans and Stripe products/prices
 */

import { supabase } from '@/lib/supabase/clientV2';
import type {
  SubscriptionPlan,
  StripeSyncRequest,
  StripeSyncResponse,
} from '@/lib/types/subscription';
import logger from '@/lib/utils/logger';

const EDGE_FUNCTION_BASE = (import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL) + '/functions/v1';

// ============================================================================
// Stripe Product/Price Management
// ============================================================================

/**
 * Create a new Stripe product and prices for a plan
 */
export async function createStripeProduct(planId: string): Promise<StripeSyncResponse> {
  try {
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.access_token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${EDGE_FUNCTION_BASE}/stripe-router`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.session.access_token}`,
      },
      body: JSON.stringify({ action: 'create_product', plan_id: planId }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to create Stripe product');
    }

    // Update the plan with Stripe IDs
    if (result.stripe_product_id) {
      await supabase
        .from('subscription_plans')
        .update({
          stripe_product_id: result.stripe_product_id,
          stripe_price_id_monthly: result.stripe_price_id_monthly,
          stripe_price_id_yearly: result.stripe_price_id_yearly,
          stripe_synced_at: new Date().toISOString(),
          stripe_sync_error: null,
        })
        .eq('id', planId);
    }

    return {
      success: true,
      stripe_product_id: result.stripe_product_id,
      stripe_price_id_monthly: result.stripe_price_id_monthly,
      stripe_price_id_yearly: result.stripe_price_id_yearly,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Stripe Sync] Error creating product:', error);

    // Update plan with sync error
    await supabase
      .from('subscription_plans')
      .update({
        stripe_sync_error: errorMessage,
      })
      .eq('id', planId);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Update an existing Stripe product
 */
export async function updateStripeProduct(planId: string): Promise<StripeSyncResponse> {
  try {
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.access_token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${EDGE_FUNCTION_BASE}/stripe-router`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.session.access_token}`,
      },
      body: JSON.stringify({ action: 'update_product', plan_id: planId }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to update Stripe product');
    }

    // Update sync timestamp
    await supabase
      .from('subscription_plans')
      .update({
        stripe_synced_at: new Date().toISOString(),
        stripe_sync_error: null,
      })
      .eq('id', planId);

    return {
      success: true,
      stripe_product_id: result.stripe_product_id,
      stripe_price_id_monthly: result.stripe_price_id_monthly,
      stripe_price_id_yearly: result.stripe_price_id_yearly,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Stripe Sync] Error updating product:', error);

    await supabase
      .from('subscription_plans')
      .update({
        stripe_sync_error: errorMessage,
      })
      .eq('id', planId);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Sync product data from Stripe back to the database
 */
export async function syncFromStripe(planId: string): Promise<StripeSyncResponse> {
  try {
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.access_token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${EDGE_FUNCTION_BASE}/stripe-router`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.session.access_token}`,
      },
      body: JSON.stringify({ action: 'sync_product', plan_id: planId }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to sync from Stripe');
    }

    return {
      success: true,
      stripe_product_id: result.stripe_product_id,
      stripe_price_id_monthly: result.stripe_price_id_monthly,
      stripe_price_id_yearly: result.stripe_price_id_yearly,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Stripe Sync] Error syncing from Stripe:', error);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Validate that Stripe IDs exist and are valid
 */
export async function validateStripeIds(plan: SubscriptionPlan): Promise<{
  valid: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  // Free tier plans don't need Stripe IDs
  if (plan.is_free_tier) {
    return { valid: true, errors: [] };
  }

  // For paid plans, check if we have product ID
  if (plan.price_monthly > 0 || plan.price_yearly > 0) {
    if (!plan.stripe_product_id) {
      errors.push('Missing Stripe Product ID');
    }

    if (plan.price_monthly > 0 && !plan.stripe_price_id_monthly) {
      errors.push('Missing monthly price ID');
    }

    if (plan.price_yearly > 0 && !plan.stripe_price_id_yearly) {
      errors.push('Missing yearly price ID');
    }
    
    // Team plan needs a seat price ID for additional seats
    if (plan.slug === 'team' && plan.per_seat_price > 0 && !plan.stripe_seat_price_id) {
      errors.push('Missing per-seat price ID (required for Team plan)');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if a plan can accept payments (has valid Stripe configuration)
 */
export function canAcceptPayments(plan: SubscriptionPlan): boolean {
  // Free tier doesn't need payment
  if (plan.is_free_tier) {
    return false;
  }

  // Must have Stripe product ID
  if (!plan.stripe_product_id) {
    return false;
  }

  // Must have at least one price ID configured
  const hasMonthlyPrice = plan.price_monthly > 0 && !!plan.stripe_price_id_monthly;
  const hasYearlyPrice = plan.price_yearly > 0 && !!plan.stripe_price_id_yearly;

  return hasMonthlyPrice || hasYearlyPrice;
}

/**
 * Sync a plan with Stripe (create, update, or sync based on current state)
 */
export async function syncPlanWithStripe(request: StripeSyncRequest): Promise<StripeSyncResponse> {
  switch (request.action) {
    case 'create':
      return createStripeProduct(request.plan_id);
    case 'update':
      return updateStripeProduct(request.plan_id);
    case 'sync':
      return syncFromStripe(request.plan_id);
    default:
      return {
        success: false,
        error: `Unknown action: ${request.action}`,
      };
  }
}

// ============================================================================
// Public Plans for Pricing Page
// ============================================================================

/**
 * Get all public plans for the pricing page
 */
export async function getPublicPlans(): Promise<SubscriptionPlan[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .eq('is_public', true)
    .order('display_order', { ascending: true });

  if (error) {
    logger.error('[Stripe Sync] Error fetching public plans:', error);
    throw error;
  }

  return (data || []) as SubscriptionPlan[];
}

/**
 * Get the free tier plan
 */
export async function getFreeTierPlan(): Promise<SubscriptionPlan | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('subscription_plans')
    .select('*')
    .eq('is_free_tier', true)
    .eq('is_active', true)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error('[Stripe Sync] Error fetching free tier plan:', error);
    throw error;
  }

  return data as SubscriptionPlan | null;
}

// ============================================================================
// Plan Reordering
// ============================================================================

/**
 * Update display order for multiple plans
 */
export async function updatePlanOrder(
  planOrders: { id: string; display_order: number }[]
): Promise<void> {
  // Update each plan's display order
  const updates = planOrders.map(({ id, display_order }) =>
    supabase
      .from('subscription_plans')
      .update({ display_order, updated_at: new Date().toISOString() })
      .eq('id', id)
  );

  const results = await Promise.all(updates);

  const errors = results.filter((r) => r.error);
  if (errors.length > 0) {
    logger.error('[Stripe Sync] Error updating plan order:', errors);
    throw new Error('Failed to update plan order');
  }
}
