// supabase/functions/get-credit-menu/index.ts
// Returns the credit menu (pricing catalogue) for authenticated users.
// Optional ?tier=low|medium|high query param resolves a single cost column via RPC.
// Results are grouped by category and cached for 5 minutes (Cache-Control: public, max-age=300).

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

type Tier = 'low' | 'medium' | 'high';

interface MenuItemBase {
  action_id: string;
  display_name: string;
  description: string;
  unit: string;
  free_with_sub: boolean;
  is_flat_rate: boolean;
}

interface MenuItemFull extends MenuItemBase {
  cost_low: number;
  cost_medium: number;
  cost_high: number;
}

interface MenuItemTier extends MenuItemBase {
  cost: number;
  resolved_cost: number;
}

type MenuItem = MenuItemFull | MenuItemTier;

interface GroupedMenu {
  ai_actions: MenuItem[];
  agents: MenuItem[];
  integrations: MenuItem[];
  enrichment: MenuItem[];
  storage: MenuItem[];
  [key: string]: MenuItem[];
}

const VALID_TIERS: Tier[] = ['low', 'medium', 'high'];

serve(async (req: Request) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'GET' && req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    // 1. Verify JWT — use user-scoped client (anon key + user's token)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Missing authorization header', req, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return errorResponse('Invalid authentication', req, 401);
    }

    // 2. Parse optional ?tier query param
    const url = new URL(req.url);
    const tierParam = url.searchParams.get('tier');
    const tier: Tier | null = tierParam && VALID_TIERS.includes(tierParam as Tier)
      ? (tierParam as Tier)
      : null;

    if (tierParam && !tier) {
      return errorResponse(`Invalid tier. Must be one of: ${VALID_TIERS.join(', ')}`, req, 400);
    }

    let grouped: GroupedMenu = {
      ai_actions: [],
      agents: [],
      integrations: [],
      enrichment: [],
      storage: [],
    };

    if (tier) {
      // 3. Tier path: call get_credit_menu_for_tier RPC, returns resolved cost column
      const { data, error } = await supabase.rpc('get_credit_menu_for_tier', {
        p_tier: tier,
      });

      if (error) {
        console.error('RPC get_credit_menu_for_tier error:', error);
        return errorResponse('Failed to fetch credit menu', req, 500);
      }

      for (const row of data ?? []) {
        const category: string = row.category ?? 'ai_actions';
        if (!grouped[category]) {
          grouped[category] = [];
        }
        const item: MenuItemTier = {
          action_id: row.action_id,
          display_name: row.display_name,
          description: row.description,
          unit: row.unit,
          free_with_sub: row.free_with_sub ?? false,
          is_flat_rate: row.is_flat_rate ?? false,
          cost: row.cost,
          resolved_cost: row.cost,
        };
        grouped[category].push(item);
      }
    } else {
      // 4. No tier: direct query returning all cost tiers
      const { data, error } = await supabase
        .from('credit_menu')
        .select(
          'action_id, display_name, description, category, unit, cost_low, cost_medium, cost_high, free_with_sub, is_flat_rate'
        )
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('category', { ascending: true })
        .order('display_name', { ascending: true });

      if (error) {
        console.error('credit_menu query error:', error);
        return errorResponse('Failed to fetch credit menu', req, 500);
      }

      for (const row of data ?? []) {
        const category: string = row.category ?? 'ai_actions';
        if (!grouped[category]) {
          grouped[category] = [];
        }
        const item: MenuItemFull = {
          action_id: row.action_id,
          display_name: row.display_name,
          description: row.description,
          unit: row.unit,
          free_with_sub: row.free_with_sub ?? false,
          is_flat_rate: row.is_flat_rate ?? false,
          cost_low: row.cost_low,
          cost_medium: row.cost_medium,
          cost_high: row.cost_high,
        };
        grouped[category].push(item);
      }
    }

    // 5. Build response with cache headers
    const corsHeaders = getCorsHeaders(req);
    return new Response(JSON.stringify(grouped), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (error) {
    console.error('Error in get-credit-menu:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(message, req, 500);
  }
});
