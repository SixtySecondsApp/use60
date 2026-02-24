/**
 * Tool Call Types for Copilot Animations
 * Defines the visual tool types used in the copilot UI
 */

export type ToolType =
  | 'task_search'
  | 'pipeline_data'
  | 'email_draft'
  | 'email_search'
  | 'calendar_search'
  | 'next_meeting_prep'
  | 'post_meeting_followup_pack'
  | 'contact_lookup'
  | 'contact_search'
  | 'deal_health'
  | 'meeting_analysis'
  | 'roadmap_create'
  | 'sales_coach'
  | 'entity_resolution' // Smart contact/person lookup by first name
  | 'general_query'; // Fallback for all other queries - ensures loading animation for every message

export type ToolState = 
  | 'pending'
  | 'initiating'
  | 'fetching'
  | 'processing'
  | 'completing'
  | 'complete'
  | 'active'
  | 'error';

export interface ToolStep {
  id: string;
  label: string;
  icon: string;
  state: ToolState;
  duration?: number;
  metadata?: Record<string, any>;
  capability?: string;
  provider?: string;
}

export interface ToolCall {
  id: string;
  tool: ToolType;
  state: ToolState;
  startTime: number;
  endTime?: number;
  steps: ToolStep[];
  result?: any;
  error?: string;
  capability?: string;
  provider?: string;
  /** AI-generated contextual label based on user query */
  customLabel?: string;
}

