import { supabase } from '@/lib/supabase/clientV2'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConversionRule {
  id: string
  name: string
  milestone_event: string
  linkedin_ad_account_id: string
  linkedin_rule_id: string | null
  attribution_type: string
  post_click_window_days: number
  view_through_window_days: number
  conversion_value_amount: number | null
  conversion_value_currency: string | null
  is_active: boolean
  is_synced: boolean
  last_synced_at: string | null
  sync_error: string | null
  created_at: string
  updated_at: string
}

export interface ConversionMapping {
  id: string
  rule_id: string
  milestone_event: string
  is_enabled: boolean
  value_amount: number | null
  value_currency: string | null
  version: number
  changed_at: string
  created_at: string
  updated_at: string
}

export interface ConversionEvent {
  id: string
  milestone_event: string
  status: string
  event_time: string
  deal_id: string | null
  contact_id: string | null
  user_email: string | null
  value_amount: number | null
  retry_count: number
  last_error: string | null
  delivered_at: string | null
  created_at: string
}

export interface ConversionStats {
  total_events: number
  delivered: number
  pending: number
  failed: number
  delivery_rate: number
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class ConversionService {
  // Rules
  async getRules(): Promise<ConversionRule[]> {
    const { data, error } = await supabase.functions.invoke('linkedin-conversion-config', {
      body: { action: 'get_rules' },
    })
    if (error) throw new Error(error.message || 'Failed to load conversion rules')
    if (data?.error) throw new Error(data.error)
    return data.rules as ConversionRule[]
  }

  async createRule(params: {
    name: string
    milestone_event: string
    linkedin_ad_account_id: string
    attribution_type?: string
    post_click_window_days?: number
    view_through_window_days?: number
    conversion_value_amount?: number
    conversion_value_currency?: string
  }): Promise<ConversionRule> {
    const { data, error } = await supabase.functions.invoke('linkedin-conversion-config', {
      body: { action: 'create_rule', ...params },
    })
    if (error) throw new Error(error.message || 'Failed to create conversion rule')
    if (data?.error) throw new Error(data.error)
    return data.rule as ConversionRule
  }

  async updateRule(rule_id: string, updates: Partial<ConversionRule>): Promise<ConversionRule> {
    const { data, error } = await supabase.functions.invoke('linkedin-conversion-config', {
      body: { action: 'update_rule', rule_id, ...updates },
    })
    if (error) throw new Error(error.message || 'Failed to update conversion rule')
    if (data?.error) throw new Error(data.error)
    return data.rule as ConversionRule
  }

  async deleteRule(rule_id: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke('linkedin-conversion-config', {
      body: { action: 'delete_rule', rule_id },
    })
    if (error) throw new Error(error.message || 'Failed to delete conversion rule')
    if (data?.error) throw new Error(data.error)
  }

  async syncRuleToLinkedIn(rule_id: string): Promise<{ linkedin_rule_id: string }> {
    const { data, error } = await supabase.functions.invoke('linkedin-conversion-config', {
      body: { action: 'sync_rule_to_linkedin', rule_id },
    })
    if (error) throw new Error(error.message || 'Failed to sync rule to LinkedIn')
    if (data?.error) throw new Error(data.error)
    return data as { linkedin_rule_id: string }
  }

  // Mappings
  async getMappings(): Promise<ConversionMapping[]> {
    const { data, error } = await supabase.functions.invoke('linkedin-conversion-config', {
      body: { action: 'get_mappings' },
    })
    if (error) throw new Error(error.message || 'Failed to load mappings')
    if (data?.error) throw new Error(data.error)
    return data.mappings as ConversionMapping[]
  }

  async toggleMapping(mapping_id: string, is_enabled?: boolean): Promise<ConversionMapping> {
    const { data, error } = await supabase.functions.invoke('linkedin-conversion-config', {
      body: { action: 'toggle_mapping', mapping_id, is_enabled },
    })
    if (error) throw new Error(error.message || 'Failed to toggle mapping')
    if (data?.error) throw new Error(data.error)
    return data.mapping as ConversionMapping
  }

  // Events & Status
  async getConversionStatus(page = 0, page_size = 20): Promise<{
    events: ConversionEvent[]
    stats: ConversionStats
    page: number
    page_size: number
  }> {
    const { data, error } = await supabase.functions.invoke('linkedin-conversion-config', {
      body: { action: 'get_conversion_status', page, page_size },
    })
    if (error) throw new Error(error.message || 'Failed to load conversion status')
    if (data?.error) throw new Error(data.error)
    return data
  }

  // Trigger
  async triggerMilestone(params: {
    org_id: string
    milestone_event: string
    deal_id?: string
    contact_id?: string
    meeting_id?: string
    lead_id?: string
  }): Promise<{ queued: boolean; event_id: string | null }> {
    const { data, error } = await supabase.functions.invoke('linkedin-conversion-trigger', {
      body: { action: 'trigger_milestone', ...params },
    })
    if (error) throw new Error(error.message || 'Failed to trigger milestone')
    if (data?.error) throw new Error(data.error)
    return data
  }

  // Stream
  async retryFailed(org_id: string): Promise<{ retried: number }> {
    const { data, error } = await supabase.functions.invoke('linkedin-conversion-stream', {
      body: { action: 'retry_failed', org_id },
    })
    if (error) throw new Error(error.message || 'Failed to retry events')
    if (data?.error) throw new Error(data.error)
    return data
  }
}

export const conversionService = new ConversionService()
