// Instantly.ai Integration Types

// ---------------------------------------------------------------------------
// Column subtypes for the 'instantly' column_type
// ---------------------------------------------------------------------------

export type InstantlyColumnSubtype =
  | 'campaign_config'
  | 'push_action'
  | 'engagement_status'
  | 'email_status'
  | 'last_contacted'
  | 'reply_count'
  | 'open_count'
  | 'sequence_step';

export type InstantlySequenceMode = 'use_existing' | 'map_variables' | 'author_steps';

export interface InstantlyColumnConfig {
  instantly_subtype: InstantlyColumnSubtype;

  // For campaign_config subtype
  campaign_id?: string;
  campaign_name?: string;
  field_mapping?: InstantlyFieldMapping;
  sequence_mode?: InstantlySequenceMode;

  // For push_action subtype
  push_config?: {
    campaign_id: string;
    auto_field_mapping: boolean;
  };

  // For sequence_step subtype
  step_config?: {
    step_number: number;
    field: 'subject' | 'body';
  };

  // For engagement subtypes (auto-created)
  engagement_field?: string;
}

export interface InstantlyCampaign {
  id: string
  name: string
  status: number
  is_evergreen?: boolean
  campaign_schedule?: any
  sequences?: any[]
}

export interface InstantlyCampaignLink {
  id: string
  table_id: string
  campaign_id: string
  campaign_name: string | null
  field_mapping: InstantlyFieldMapping
  auto_sync_engagement: boolean
  linked_at: string
  last_push_at: string | null
  last_engagement_sync_at: string | null
}

export interface InstantlyFieldMapping {
  email: string
  first_name?: string
  last_name?: string
  company_name?: string
  custom_variables?: Record<string, string>
}

export interface InstantlyAnalytics {
  campaign_name?: string
  campaign_id?: string
  leads_count?: number
  contacted_count?: number
  emails_sent_count?: number
  new_leads_contacted_count?: number
  open_count?: number
  open_count_unique?: number
  link_click_count?: number
  link_click_count_unique?: number
  reply_count?: number
  reply_count_unique?: number
  bounced_count?: number
  unsubscribed_count?: number
  completed_count?: number
  total_interested?: number
  total_meeting_booked?: number
  total_meeting_completed?: number
  total_closed?: number
}

export interface InstantlySyncHistoryEntry {
  id: string
  table_id: string
  campaign_id: string
  synced_by: string | null
  synced_at: string
  new_leads_count: number
  updated_leads_count: number
  pushed_leads_count: number
  sync_type: 'engagement_pull' | 'lead_push'
  sync_duration_ms: number | null
  error_message: string | null
}

export interface InstantlyPushResult {
  success: boolean
  pushed_count: number
  skipped_count: number
  error_count: number
  total_rows: number
}

export interface InstantlySyncResult {
  success: boolean
  matched_leads: number
  unmatched_leads: number
  total_instantly_leads: number
  cells_updated: number
  columns_created: number
}
