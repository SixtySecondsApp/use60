/**
 * Apify Integration Service
 *
 * Wraps edge function calls for Apify connection, actor introspection,
 * and run management. Uses supabase.functions.invoke() for auth.
 */

import { supabase } from '@/lib/supabase/clientV2'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApifyConnectResult {
  connected: boolean
  user?: {
    username: string
    email: string
    plan: string | null
  }
  reason?: string
}

export interface ApifyActorSchema {
  actor_id: string
  name: string
  description: string | null
  input_schema: Record<string, unknown> | null
  default_input: Record<string, unknown> | null
  cached: boolean
  fetched_at: string
}

export interface ApifyRunResult {
  run_id: string
  apify_run_id: string
  status: string
  actor_id: string
}

export interface ApifyRateLimitWarning {
  warning: string
  require_confirmation: boolean
  code: string
}

export interface ApifyRun {
  id: string
  org_id: string
  actor_id: string
  actor_name: string | null
  apify_run_id: string | null
  dataset_id: string | null
  status: 'pending' | 'running' | 'complete' | 'failed' | 'partial'
  total_records: number
  mapped_records_count: number
  error_records_count: number
  gdpr_flagged_count: number
  error_message: string | null
  cost_usd: number | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface ApifyCostSummary {
  total_cost_usd: number
  total_runs: number
  total_records: number
}

export interface ApifyMappedRecord {
  id: string
  org_id: string
  run_id: string
  template_id: string | null
  source_result_id: string | null
  mapped_data: Record<string, unknown>
  dedup_key: string | null
  gdpr_flags: string[]
  mapping_confidence: 'high' | 'medium' | 'low'
  synced_to_crm: boolean
  synced_at: string | null
  created_at: string
}

export interface MappedRecordsPage {
  data: ApifyMappedRecord[]
  total: number
  page: number
  pageSize: number
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class ApifyService {
  /**
   * Connect an Apify API token (validates with Apify API)
   */
  async connect(token: string): Promise<ApifyConnectResult> {
    const { data, error } = await supabase.functions.invoke('apify-connect', {
      body: { action: 'connect', token },
    })

    if (error) throw new Error(error.message || 'Failed to connect Apify')
    if (data?.error) throw new Error(data.error)
    return data as ApifyConnectResult
  }

  /**
   * Disconnect Apify integration
   */
  async disconnect(): Promise<ApifyConnectResult> {
    const { data, error } = await supabase.functions.invoke('apify-connect', {
      body: { action: 'disconnect' },
    })

    if (error) throw new Error(error.message || 'Failed to disconnect Apify')
    if (data?.error) throw new Error(data.error)
    return data as ApifyConnectResult
  }

  /**
   * Revalidate existing Apify connection
   */
  async revalidate(): Promise<ApifyConnectResult> {
    const { data, error } = await supabase.functions.invoke('apify-connect', {
      body: { action: 'revalidate' },
    })

    if (error) throw new Error(error.message || 'Failed to check Apify status')
    if (data?.error) throw new Error(data.error)
    return data as ApifyConnectResult
  }

  /**
   * Fetch actor input schema (cached 24h)
   */
  async introspectActor(actorId: string): Promise<ApifyActorSchema> {
    const { data, error } = await supabase.functions.invoke('apify-actor-introspect', {
      body: { actor_id: actorId },
    })

    if (error) throw new Error(error.message || 'Failed to fetch actor schema')
    if (data?.error) throw new Error(data.error)
    return data as ApifyActorSchema
  }

  /**
   * Start an actor run. Returns run info or a rate-limit warning.
   */
  async startRun(params: {
    actor_id: string
    input?: Record<string, unknown>
    mapping_template_id?: string
    confirmed?: boolean
  }): Promise<ApifyRunResult | ApifyRateLimitWarning> {
    const { data, error } = await supabase.functions.invoke('apify-run-start', {
      body: params,
    })

    if (error) throw new Error(error.message || 'Failed to start actor run')
    if (data?.error) throw new Error(data.error)
    return data as ApifyRunResult | ApifyRateLimitWarning
  }

  /**
   * List runs for the current org
   */
  async listRuns(options?: {
    status?: string
    limit?: number
    offset?: number
  }): Promise<ApifyRun[]> {
    let query = supabase
      .from('apify_runs')
      .select('id, org_id, actor_id, actor_name, apify_run_id, dataset_id, status, total_records, mapped_records_count, error_records_count, gdpr_flagged_count, error_message, cost_usd, started_at, completed_at, created_at')
      .order('created_at', { ascending: false })

    if (options?.status) {
      query = query.eq('status', options.status)
    }
    if (options?.limit) {
      query = query.limit(options.limit)
    }
    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 20) - 1)
    }

    const { data, error } = await query

    if (error) throw new Error(error.message || 'Failed to list runs')
    return (data || []) as ApifyRun[]
  }

  /**
   * Get a single run by ID
   */
  async getRun(runId: string): Promise<ApifyRun | null> {
    const { data, error } = await supabase
      .from('apify_runs')
      .select('id, org_id, actor_id, actor_name, apify_run_id, dataset_id, status, total_records, mapped_records_count, error_records_count, gdpr_flagged_count, error_message, cost_usd, started_at, completed_at, created_at')
      .eq('id', runId)
      .maybeSingle()

    if (error) throw new Error(error.message || 'Failed to get run')
    return data as ApifyRun | null
  }
  /**
   * List mapped records with pagination and filters
   */
  async listMappedRecords(options: {
    runId?: string
    confidence?: string
    gdprOnly?: boolean
    search?: string
    page?: number
    pageSize?: number
  }): Promise<MappedRecordsPage> {
    const page = options.page || 0
    const pageSize = options.pageSize || 25
    const from = page * pageSize
    const to = from + pageSize - 1

    const SELECT_COLS = 'id, org_id, run_id, template_id, source_result_id, mapped_data, dedup_key, gdpr_flags, mapping_confidence, synced_to_crm, synced_at, created_at'

    let query = supabase
      .from('mapped_records')
      .select(SELECT_COLS, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (options.runId) {
      query = query.eq('run_id', options.runId)
    }
    if (options.confidence) {
      query = query.eq('mapping_confidence', options.confidence)
    }
    if (options.gdprOnly) {
      query = query.not('gdpr_flags', 'eq', '{}')
    }
    if (options.search) {
      // Cast mapped_data to text for ilike search
      query = query.ilike('mapped_data::text', `%${options.search}%`)
    }

    const { data, error, count } = await query

    if (error) throw new Error(error.message || 'Failed to list mapped records')
    return {
      data: (data || []) as ApifyMappedRecord[],
      total: count || 0,
      page,
      pageSize,
    }
  }

  /**
   * Get raw result data for a specific result ID
   */
  async getRawResult(resultId: string): Promise<Record<string, unknown> | null> {
    const { data, error } = await supabase
      .from('apify_results')
      .select('id, raw_data, mapping_status, mapping_error')
      .eq('id', resultId)
      .maybeSingle()

    if (error) throw new Error(error.message || 'Failed to get raw result')
    return data as Record<string, unknown> | null
  }

  /**
   * Get cost summary for the current month
   */
  async getCostSummary(): Promise<ApifyCostSummary> {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const { data, error } = await supabase
      .from('apify_runs')
      .select('cost_usd, total_records')
      .gte('created_at', startOfMonth.toISOString())

    if (error) throw new Error(error.message || 'Failed to get cost summary')

    const rows = data || []
    return {
      total_cost_usd: rows.reduce((sum, r) => sum + (r.cost_usd || 0), 0),
      total_runs: rows.length,
      total_records: rows.reduce((sum, r) => sum + (r.total_records || 0), 0),
    }
  }
}

export const apifyService = new ApifyService()
