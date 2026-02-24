/**
 * Database model definitions
 * 
 * This file defines TypeScript interfaces that match our database schema
 * to provide type safety across the application.
 */

/**
 * Company model - NEW CRM ENTITY
 */
export interface Company {
  id: string;
  name: string;
  domain?: string;
  industry?: string;
  size?: 'startup' | 'small' | 'medium' | 'large' | 'enterprise';
  website?: string;
  address?: string;
  phone?: string;
  description?: string;
  linkedin_url?: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  status?: 'active' | 'prospect' | 'client' | 'churned';
  enrichment_data?: any;
  enriched_at?: string;

  // Computed/joined fields
  contacts?: Contact[];
  deals?: Deal[];
  contactCount?: number;
  dealsValue?: number;
}

/**
 * Enhanced Contact model - UPDATED FOR CRM
 */
export interface Contact {
  id: string;
  company_id?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string; // Generated column (doesn't exist in DB, computed in app)
  email: string;
  phone?: string;
  title?: string; // Job title
  company_name?: string; // Optional - doesn't exist in DB, may be computed from company relation
  linkedin_url?: string;
  is_primary?: boolean; // Optional as it doesn't exist in current DB schema
  notes?: string; // Notes field
  owner_id?: string;
  created_at: string;
  updated_at: string;
  last_interaction_at?: string; // Date of last activity/meeting (not updated_at)
  
  // Joined relations
  company?: Company;
  deals?: Deal[];
  deal_contacts?: DealContact[];
  contact_preferences?: ContactPreference;
  profiles?: {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
    stage?: string | null;
  };
}

/**
 * Deal Contact relationship - NEW CRM ENTITY
 */
export interface DealContact {
  id: string;
  deal_id: string;
  contact_id: string;
  role: 'decision_maker' | 'influencer' | 'stakeholder' | 'champion' | 'blocker';
  created_at: string;
  
  // Joined relations
  deals?: Deal;
  contacts?: Contact;
}

/**
 * Contact Preferences - NEW CRM ENTITY
 */
export interface ContactPreference {
  id: string;
  contact_id: string;
  preferred_method: 'email' | 'phone' | 'linkedin' | 'text';
  timezone?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Activity Sync Rules - NEW CRM ENTITY
 */
export interface ActivitySyncRule {
  id: string;
  activity_type: 'sale' | 'outbound' | 'meeting' | 'proposal';
  min_priority: 'low' | 'medium' | 'high';
  auto_create_deal: boolean;
  target_stage_name?: string;
  owner_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Deal Stage model
 */
export interface DealStage {
  id: string;
  name: string;
  description?: string;
  color: string;
  order_position: number;
  default_probability: number;
  created_at: string;
  updated_at: string;
}

/**
 * Enhanced Deal model - UPDATED FOR CRM
 */
export interface Deal {
  id: string;
  name: string;
  company: string; // Legacy field
  contact_name?: string; // Legacy field
  contact_email?: string; // Legacy field
  contact_phone?: string; // Legacy field
  value: number;
  description?: string;
  notes?: string;
  stage_id: string;
  owner_id: string;
  expected_close_date?: string;
  first_billing_date?: string;
  probability?: number;
  status: 'active' | 'archived' | 'deleted';
  created_at: string;
  updated_at: string;
  stage_changed_at: string;
  next_steps?: string;
  contact_identifier?: string;
  contact_identifier_type?: string;
  
  // NEW CRM RELATIONSHIPS
  company_id?: string;
  primary_contact_id?: string;
  
  // REVENUE MODEL FIELDS
  one_off_revenue?: number;
  monthly_mrr?: number;
  annual_value?: number;
  
  // Joined relations
  companies?: Company;
  contacts?: Contact; // Primary contact
  deal_stages?: DealStage;
  deal_activities?: DealActivity[];
  deal_contacts?: DealContact[]; // All contacts involved
  
  // Computed fields
  daysInStage?: number;
  timeStatus?: 'normal' | 'warning' | 'danger';
}

/**
 * Deal Split model - NEW FEATURE
 * Allows deals to be split between multiple team members
 */
export interface DealSplit {
  id: string;
  deal_id: string;
  user_id: string;
  percentage: number; // 0-100
  amount: number; // Calculated field: deal_value * (percentage / 100)
  notes?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Deal Split with User Info - Joined view
 * Includes user details for easier display
 */
export interface DealSplitWithUser extends DealSplit {
  first_name?: string;
  last_name?: string;
  email?: string;
  full_name?: string;
  deal_name: string;
  deal_value: number;
  deal_owner_id: string;
}

/**
 * Deal with Splits - Extended Deal interface
 * Includes split information when needed
 */
export interface DealWithSplits extends Deal {
  splits?: DealSplitWithUser[];
  my_split_percentage?: number; // Current user's split percentage
  my_split_amount?: number; // Current user's split amount
  remaining_percentage?: number; // 100 - total allocated percentage
}

/**
 * Enhanced Deal Activity model - UPDATED FOR CRM
 */
export interface DealActivity {
  id: string;
  deal_id: string;
  user_id: string;
  activity_type: 'note' | 'call' | 'email' | 'meeting' | 'task' | 'stage_change';
  notes?: string;
  due_date?: string;
  completed: boolean;
  created_at: string;
  updated_at: string;
  
  // Joined relations
  profiles?: {
    id: string;
    full_name?: string;
    avatar_url?: string;
  };
}

/**
 * Enhanced Activity model - UPDATED FOR CRM
 */
export interface Activity {
  id: string;
  user_id: string;
  type: 'sale' | 'outbound' | 'meeting' | 'proposal';
  status: 'pending' | 'completed' | 'cancelled' | 'no_show';
  priority: 'low' | 'medium' | 'high';
  client_name: string;
  sales_rep: string;
  details?: string;
  amount?: number;
  date: string;
  created_at: string;
  updated_at: string;
  quantity: number;
  contact_identifier?: string;
  contact_identifier_type?: string;
  is_processed?: boolean;
  
  // NEW CRM RELATIONSHIPS
  company_id?: string;
  contact_id?: string;
  deal_id?: string;
  auto_matched?: boolean;
  
  // Joined relations
  companies?: Company;
  contacts?: Contact;
  deals?: Deal;
}

/**
 * Profile model (existing)
 */
export interface Profile {
  id: string;
  first_name?: string;
  last_name?: string;
  email: string;
  stage?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
  is_admin?: boolean;
}

/**
 * Deal Stage History model
 */
export interface DealStageHistory {
  id: string;
  deal_id: string;
  stage_id: string;
  user_id: string;
  entered_at: string;
  exited_at?: string;
  duration_seconds?: number;
}

/**
 * User Profile model
 */
export interface UserProfile {
  id: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Task model - NEW CRM ENTITY
 */
export interface Task {
  id: string;
  title: string;
  description?: string;
  notes?: string;
  due_date?: string;
  completed: boolean;
  completed_at?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'overdue' | 'pending_review' | 'ai_working' | 'draft_ready' | 'approved' | 'dismissed' | 'expired';
  task_type: 'call' | 'email' | 'meeting' | 'follow_up' | 'proposal' | 'demo' | 'general' | 'research' | 'meeting_prep' | 'crm_update' | 'slack_message' | 'content' | 'alert' | 'insight';

  // Relationships
  assigned_to: string;
  created_by: string;
  deal_id?: string;
  company_id?: string;
  contact_id?: string;
  contact_email?: string;
  contact_name?: string;
  // Legacy field for backward compatibility; in some queries this is also a joined object
  company?: string | Company;
  parent_task_id?: string; // References parent task for subtask chains
  meeting_action_item_id?: string; // Link to Fathom meeting action item
  meeting_id?: string; // Direct reference to meeting
  call_action_item_id?: string; // Link to Call action item
  call_id?: string; // Direct reference to call

  // AI / Command Centre fields
  source?: 'manual' | 'ai_proactive' | 'meeting_transcript' | 'meeting_ai' | 'email_detected' | 'deal_signal' | 'calendar_trigger' | 'copilot';
  ai_status?: 'none' | 'queued' | 'working' | 'draft_ready' | 'approved' | 'executed' | 'failed' | 'expired';
  deliverable_type?: 'email_draft' | 'research_brief' | 'meeting_prep' | 'crm_update' | 'content_draft' | 'action_plan' | 'insight';
  deliverable_data?: Record<string, unknown>;
  risk_level?: 'low' | 'medium' | 'high' | 'info';
  confidence_score?: number;
  reasoning?: string;
  trigger_event?: string;
  expires_at?: string;
  actioned_at?: string;
  auto_group?: string;

  // Metadata
  metadata?: Record<string, any>; // JSONB metadata field for structured data
  created_at: string;
  updated_at: string;

  // Joined relations
  assignee?: UserProfile;
  creator?: UserProfile;
  deal?: Deal;
  contact?: Contact;
  // Backwards compatibility for older codepaths
  companies?: Company;
  contacts?: Contact;
}

/**
 * Proposal Template model
 */
export interface ProposalTemplate {
  id: string;
  name: string;
  type: 'goals' | 'sow' | 'proposal';
  content: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Proposal model
 */
export interface Proposal {
  id: string;
  meeting_id?: string;
  contact_id?: string;
  type: 'goals' | 'sow' | 'proposal';
  status: 'draft' | 'completed';
  content: string;
  title?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}
 