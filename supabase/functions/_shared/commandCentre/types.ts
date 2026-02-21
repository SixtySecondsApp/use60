/**
 * Command Centre Types
 *
 * Shared types for the unified proactive AI inbox (command_centre_items table).
 * Used by all agents that write items to the Command Centre.
 */

// Source agent identifiers — matches source_agent column values in command_centre_items
export type SourceAgent =
  | 'post_meeting'
  | 'deal_risk'
  | 'pipeline_scan'
  | 'reengagement'
  | 'coaching'
  | 'intent_detection'
  | 'campaign_monitoring'
  | 'crm_update'
  | 'pre_meeting';

// Item types — matches item_type column values in command_centre_items
export type ItemType =
  | 'follow_up'
  | 'crm_update'
  | 'deal_action'
  | 'review'
  | 'outreach'
  | 'coaching'
  | 'alert'
  | 'meeting_prep'
  | 'insight';

// Status enum — must match CHECK constraint in command_centre_items
export type ItemStatus =
  | 'open'
  | 'enriching'
  | 'ready'
  | 'approved'
  | 'executing'
  | 'completed'
  | 'dismissed'
  | 'auto_resolved';

export type Urgency = 'critical' | 'high' | 'normal' | 'low';
export type EnrichmentStatus = 'pending' | 'enriched' | 'failed' | 'skipped';

export interface CommandCentreItem {
  id: string;
  org_id: string;
  user_id: string;
  source_agent: SourceAgent;
  source_event_id?: string;
  item_type: ItemType;
  title: string;
  summary?: string;
  context: Record<string, unknown>;
  priority_score?: number;
  priority_factors: Record<string, unknown>;
  urgency: Urgency;
  due_date?: string;
  enrichment_status: EnrichmentStatus;
  enrichment_context: Record<string, unknown>;
  drafted_action?: DraftedAction;
  confidence_score?: number;
  confidence_factors: Record<string, unknown>;
  requires_human_input?: string[];
  status: ItemStatus;
  resolution_channel?: string;
  created_at: string;
  updated_at: string;
  enriched_at?: string;
  resolved_at?: string;
  deal_id?: string;
  contact_id?: string;
  parent_item_id?: string;
}

export interface DraftedAction {
  type: 'send_email' | 'update_crm' | 'create_task' | 'schedule_meeting' | 'send_proposal';
  payload: {
    to?: string;
    subject?: string;
    body?: string;
    entity?: string;
    field_updates?: Record<string, unknown>;
    suggested_times?: string[];
    duration_minutes?: number;
  };
  display_text: string;
  editable_fields: string[];
  confidence: number;
  reasoning: string;
}

export interface WriteItemParams {
  org_id: string;
  user_id: string;
  source_agent: SourceAgent;
  item_type: ItemType;
  title: string;
  summary?: string;
  context?: Record<string, unknown>;
  deal_id?: string;
  contact_id?: string;
  source_event_id?: string;
  urgency?: Urgency;
  due_date?: string;
  parent_item_id?: string;
}
