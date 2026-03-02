/**
 * App Data Batch Edge Function
 *
 * Consolidates multiple data queries into a single request to reduce
 * edge function invocations. Replaces 4-8 separate calls per page load
 * with a single batched request.
 *
 * Supported resources:
 * - deals: Pipeline deals with stages and health scores
 * - activities: Recent activities for dashboard/timeline
 * - tasks: User tasks with filtering
 * - health-scores: Deal health score summaries
 * - contacts: Contact records
 * - meetings: Meeting records with Fathom data
 * - notifications: User notifications
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

// CORS headers for browser requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ============================================================================
// Types
// ============================================================================

interface BatchOperation {
  id: string;
  type: 'query' | 'mutation';
  resource: string;
  action: string;
  params?: Record<string, unknown>;
}

interface BatchRequest {
  operations: BatchOperation[];
  userId?: string;
  orgId?: string;
}

interface BatchResult {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
  timing?: number;
}

interface BatchResponse {
  results: Record<string, BatchResult>;
  totalTime: number;
  operationCount: number;
}

// ============================================================================
// Resource Handlers
// ============================================================================

type ResourceHandler = (
  supabase: ReturnType<typeof createClient>,
  action: string,
  params: Record<string, unknown>,
  userId: string,
  orgId?: string
) => Promise<unknown>;

const resourceHandlers: Record<string, ResourceHandler> = {
  // Deals resource
  deals: async (supabase, action, params, userId, orgId) => {
    switch (action) {
      case 'list': {
        const { stage, limit = 50, offset = 0 } = params;
        let query = supabase
          .from('deals')
          .select(
            `
            id,
            name,
            stage,
            value,
            probability,
            expected_close_date,
            company_id,
            contact_id,
            user_id,
            created_at,
            updated_at,
            companies:company_id (id, name),
            contacts:contact_id (id, first_name, last_name, email)
          `
          )
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (stage && stage !== 'all') {
          query = query.eq('stage', stage);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data;
      }

      case 'get': {
        const { dealId } = params;
        if (!dealId) throw new Error('dealId required');

        const { data, error } = await supabase
          .from('deals')
          .select(
            `
            *,
            companies:company_id (*),
            contacts:contact_id (*)
          `
          )
          .eq('id', dealId)
          .eq('user_id', userId)
          .single();

        if (error) throw error;
        return data;
      }

      case 'stats': {
        const { data, error } = await supabase
          .from('deals')
          .select('id, stage, value, probability')
          .eq('user_id', userId);

        if (error) throw error;

        // Calculate pipeline stats
        const stats = {
          totalDeals: data?.length || 0,
          totalValue: data?.reduce((sum, d) => sum + (d.value || 0), 0) || 0,
          weightedValue:
            data?.reduce(
              (sum, d) => sum + (d.value || 0) * ((d.probability || 0) / 100),
              0
            ) || 0,
          byStage: {} as Record<string, { count: number; value: number }>,
        };

        data?.forEach((deal) => {
          const stage = deal.stage || 'unknown';
          if (!stats.byStage[stage]) {
            stats.byStage[stage] = { count: 0, value: 0 };
          }
          stats.byStage[stage].count++;
          stats.byStage[stage].value += deal.value || 0;
        });

        return stats;
      }

      default:
        throw new Error(`Unknown deals action: ${action}`);
    }
  },

  // Activities resource
  activities: async (supabase, action, params, userId) => {
    switch (action) {
      case 'list':
      case 'recent': {
        const { limit = 20, offset = 0, type, dealId, contactId } = params;

        let query = supabase
          .from('activities')
          .select(
            `
            id,
            type,
            subject,
            notes,
            completed,
            due_date,
            deal_id,
            contact_id,
            user_id,
            created_at,
            deals:deal_id (id, name),
            contacts:contact_id (id, first_name, last_name)
          `
          )
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (type) query = query.eq('type', type);
        if (dealId) query = query.eq('deal_id', dealId);
        if (contactId) query = query.eq('contact_id', contactId);

        const { data, error } = await query;
        if (error) throw error;
        return data;
      }

      case 'upcoming': {
        const { limit = 10 } = params;
        const now = new Date().toISOString();

        const { data, error } = await supabase
          .from('activities')
          .select(
            `
            id,
            type,
            subject,
            due_date,
            deal_id,
            contact_id,
            deals:deal_id (id, name),
            contacts:contact_id (id, first_name, last_name)
          `
          )
          .eq('user_id', userId)
          .eq('completed', false)
          .gte('due_date', now)
          .order('due_date', { ascending: true })
          .limit(limit);

        if (error) throw error;
        return data;
      }

      default:
        throw new Error(`Unknown activities action: ${action}`);
    }
  },

  // Tasks resource
  tasks: async (supabase, action, params, userId) => {
    switch (action) {
      case 'list': {
        const { status, limit = 50, offset = 0 } = params;

        let query = supabase
          .from('tasks')
          .select(
            `
            id,
            title,
            description,
            status,
            priority,
            due_date,
            deal_id,
            contact_id,
            created_at,
            updated_at
          `
          )
          .eq('user_id', userId)
          .order('due_date', { ascending: true, nullsFirst: false })
          .range(offset, offset + limit - 1);

        if (status) query = query.eq('status', status);

        const { data, error } = await query;
        if (error) throw error;
        return data;
      }

      case 'overdue': {
        const { limit = 20 } = params;
        const now = new Date().toISOString();

        const { data, error } = await supabase
          .from('tasks')
          .select('id, title, priority, due_date, deal_id')
          .eq('user_id', userId)
          .neq('status', 'completed')
          .lt('due_date', now)
          .order('due_date', { ascending: true })
          .limit(limit);

        if (error) throw error;
        return data;
      }

      case 'today': {
        const today = new Date();
        const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
        const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();

        const { data, error } = await supabase
          .from('tasks')
          .select('id, title, priority, due_date, status, deal_id')
          .eq('user_id', userId)
          .gte('due_date', startOfDay)
          .lte('due_date', endOfDay)
          .order('priority', { ascending: false });

        if (error) throw error;
        return data;
      }

      default:
        throw new Error(`Unknown tasks action: ${action}`);
    }
  },

  // Health scores resource
  'health-scores': async (supabase, action, params, userId) => {
    switch (action) {
      case 'list': {
        const { data, error } = await supabase
          .from('deal_health_scores')
          .select(
            `
            id,
            deal_id,
            overall_score,
            engagement_score,
            momentum_score,
            relationship_score,
            activity_score,
            risk_level,
            calculated_at,
            deals:deal_id (id, name, stage, value)
          `
          )
          .eq('user_id', userId)
          .order('calculated_at', { ascending: false });

        if (error) throw error;
        return data;
      }

      case 'at-risk': {
        const { threshold = 50 } = params;

        const { data, error } = await supabase
          .from('deal_health_scores')
          .select(
            `
            id,
            deal_id,
            overall_score,
            risk_level,
            deals:deal_id (id, name, stage, value)
          `
          )
          .eq('user_id', userId)
          .lt('overall_score', threshold)
          .order('overall_score', { ascending: true });

        if (error) throw error;
        return data;
      }

      case 'summary': {
        const { data, error } = await supabase
          .from('deal_health_scores')
          .select('overall_score, risk_level')
          .eq('user_id', userId);

        if (error) throw error;

        const summary = {
          total: data?.length || 0,
          avgScore:
            data?.reduce((sum, h) => sum + (h.overall_score || 0), 0) /
              (data?.length || 1) || 0,
          byRisk: {
            low: data?.filter((h) => h.risk_level === 'low').length || 0,
            medium: data?.filter((h) => h.risk_level === 'medium').length || 0,
            high: data?.filter((h) => h.risk_level === 'high').length || 0,
          },
        };

        return summary;
      }

      default:
        throw new Error(`Unknown health-scores action: ${action}`);
    }
  },

  // Contacts resource
  contacts: async (supabase, action, params, userId) => {
    switch (action) {
      case 'list': {
        const { limit = 50, offset = 0, companyId, search } = params;

        let query = supabase
          .from('contacts')
          .select(
            `
            id,
            first_name,
            last_name,
            email,
            phone,
            title,
            company_id,
            created_at,
            companies:company_id (id, name)
          `
          )
          .eq('user_id', userId)
          .order('last_name', { ascending: true })
          .range(offset, offset + limit - 1);

        if (companyId) query = query.eq('company_id', companyId);
        if (search) {
          query = query.or(
            `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`
          );
        }

        const { data, error } = await query;
        if (error) throw error;
        return data;
      }

      case 'recent': {
        const { limit = 10 } = params;

        const { data, error } = await supabase
          .from('contacts')
          .select(
            `
            id,
            first_name,
            last_name,
            email,
            company_id,
            companies:company_id (id, name)
          `
          )
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (error) throw error;
        return data;
      }

      default:
        throw new Error(`Unknown contacts action: ${action}`);
    }
  },

  // Meetings resource
  meetings: async (supabase, action, params, userId) => {
    switch (action) {
      case 'list': {
        const { limit = 20, offset = 0, upcoming } = params;

        let query = supabase
          .from('meetings')
          .select(
            `
            id,
            title,
            start_time,
            end_time,
            status,
            fathom_call_id,
            deal_id,
            contact_id,
            created_at
          `
          )
          .eq('owner_user_id', userId)
          .order('start_time', { ascending: upcoming ? true : false })
          .range(offset, offset + limit - 1);

        if (upcoming) {
          query = query.gte('start_time', new Date().toISOString());
        }

        const { data, error } = await query;
        if (error) throw error;
        return data;
      }

      case 'upcoming': {
        const { limit = 5 } = params;

        const { data, error } = await supabase
          .from('meetings')
          .select(
            `
            id,
            title,
            start_time,
            end_time,
            deal_id,
            contact_id
          `
          )
          .eq('owner_user_id', userId)
          .gte('start_time', new Date().toISOString())
          .order('start_time', { ascending: true })
          .limit(limit);

        if (error) throw error;
        return data;
      }

      default:
        throw new Error(`Unknown meetings action: ${action}`);
    }
  },

  // Notifications resource
  notifications: async (supabase, action, params, userId) => {
    switch (action) {
      case 'unread': {
        const { limit = 20 } = params;

        const { data, error } = await supabase
          .from('notifications')
          .select('id, type, title, message, data, created_at')
          .eq('user_id', userId)
          .eq('read', false)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (error) throw error;
        return data;
      }

      case 'count': {
        const { data, error, count } = await supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('read', false);

        if (error) throw error;
        return { unreadCount: count || 0 };
      }

      default:
        throw new Error(`Unknown notifications action: ${action}`);
    }
  },
};

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Validate method
    if (req.method !== 'POST') {
      throw new Error('Method not allowed. Use POST.');
    }

    // Parse request body
    const body: BatchRequest = await req.json();
    const { operations, userId: requestUserId, orgId } = body;

    if (!operations || !Array.isArray(operations) || operations.length === 0) {
      throw new Error('operations array is required and must not be empty');
    }

    if (operations.length > 20) {
      throw new Error('Maximum 20 operations per batch request');
    }

    // Get authorization and create Supabase client
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Authorization header required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get user from JWT
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error('Unauthorized: Invalid or expired token');
    }

    const userId = requestUserId || user.id;

    // Process all operations in parallel
    const results: Record<string, BatchResult> = {};

    await Promise.all(
      operations.map(async (op) => {
        const opStartTime = Date.now();

        try {
          // Validate operation
          if (!op.id || !op.resource || !op.action) {
            results[op.id || 'unknown'] = {
              id: op.id || 'unknown',
              success: false,
              error: 'Operation must have id, resource, and action',
            };
            return;
          }

          // Get handler for resource
          const handler = resourceHandlers[op.resource];
          if (!handler) {
            results[op.id] = {
              id: op.id,
              success: false,
              error: `Unknown resource: ${op.resource}`,
            };
            return;
          }

          // Execute handler
          const data = await handler(
            supabase,
            op.action,
            op.params || {},
            userId,
            orgId
          );

          results[op.id] = {
            id: op.id,
            success: true,
            data,
            timing: Date.now() - opStartTime,
          };
        } catch (err) {
          results[op.id] = {
            id: op.id,
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
            timing: Date.now() - opStartTime,
          };
        }
      })
    );

    const response: BatchResponse = {
      results,
      totalTime: Date.now() - startTime,
      operationCount: operations.length,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err) {
    console.error('Batch request error:', err);

    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Unknown error',
        totalTime: Date.now() - startTime,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: err instanceof Error && err.message.includes('Unauthorized') ? 401 : 400,
      }
    );
  }
});
