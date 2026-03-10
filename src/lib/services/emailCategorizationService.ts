/**
 * Email Categorization Service
 * 
 * Manages Fyxer-style email categorization:
 * - Category definitions and defaults
 * - Gmail label mapping and resolution
 * - Collision-safe label creation
 * - Org settings management
 */

import { supabase } from '@/lib/supabase/clientV2';
import type { Database } from '@/lib/database.types';

// Helper to get auth headers for edge functions
async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('No active session');
  }
  return { Authorization: `Bearer ${session.access_token}` };
}

// ============================================================================
// Types
// ============================================================================

export type EmailCategory = 'to_respond' | 'fyi' | 'marketing' | 'calendar_related' | 'automated' | 'uncategorized';
export type LabelMode = 'mode_a_internal_only' | 'mode_b_use_existing' | 'mode_c_sync_labels';
export type SyncDirection = 'gmail_to_sixty' | 'sixty_to_gmail' | 'bidirectional' | 'none';
export type CategorizationSource = 'ai' | 'rules' | 'label_map' | 'user_override';

export interface CategoryDefinition {
  key: EmailCategory;
  name: string;
  description: string;
  defaultLabelName: string; // Plain label name (no prefix per user preference)
  color: {
    bg: string;
    text: string;
  };
}

export interface GmailLabel {
  id: string;
  name: string;
  type: 'system' | 'user';
  messagesTotal?: number;
  messagesUnread?: number;
  color?: {
    backgroundColor?: string;
    textColor?: string;
  };
}

export interface LabelMapping {
  id: string;
  userId: string;
  orgId: string | null;
  categoryKey: EmailCategory;
  gmailLabelId: string;
  gmailLabelName: string;
  isSixtyManaged: boolean;
  syncDirection: SyncDirection;
  createdAt: string;
  updatedAt: string;
}

export interface OrgCategorizationSettings {
  id: string;
  orgId: string;
  isEnabled: boolean;
  labelMode: LabelMode;
  archiveNonActionable: boolean;
  useAiCategorization: boolean;
  useRulesCategorization: boolean;
  enabledCategories: string[];
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
}

export interface EmailSignals {
  response_required?: boolean;
  urgency?: 'low' | 'medium' | 'high';
  keywords?: string[];
  deal_id?: string;
  contact_id?: string;
  sentiment?: number;
  ghost_risk?: boolean;
  follow_up_due?: string;
  action_items?: string[];
}

export interface EmailCategorization {
  id: string;
  userId: string;
  orgId: string | null;
  externalId: string;
  threadId: string | null;
  direction: 'inbound' | 'outbound';
  receivedAt: string | null;
  category: EmailCategory;
  categoryConfidence: number | null;
  signals: EmailSignals;
  source: CategorizationSource;
  communicationEventId: string | null;
  gmailLabelApplied: boolean;
  gmailLabelAppliedAt: string | null;
  processedAt: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Category Definitions (Fyxer-inspired)
// ============================================================================

export const CATEGORY_DEFINITIONS: CategoryDefinition[] = [
  {
    key: 'to_respond',
    name: 'To Respond',
    description: 'Messages requiring your reply',
    defaultLabelName: 'To Respond', // Plain label, no prefix
    color: { bg: '#e8f5e9', text: '#2e7d32' }, // Green
  },
  {
    key: 'fyi',
    name: 'FYI',
    description: 'Informational emails, low urgency',
    defaultLabelName: 'FYI',
    color: { bg: '#e3f2fd', text: '#1565c0' }, // Blue
  },
  {
    key: 'marketing',
    name: 'Marketing',
    description: 'Newsletters, promotions, and marketing emails',
    defaultLabelName: 'Marketing',
    color: { bg: '#fff3e0', text: '#ef6c00' }, // Orange
  },
  {
    key: 'calendar_related',
    name: 'Calendar',
    description: 'Calendar invites and updates',
    defaultLabelName: 'Calendar',
    color: { bg: '#fce4ec', text: '#c2185b' }, // Pink
  },
  {
    key: 'automated',
    name: 'Automated',
    description: 'Auto-generated emails (receipts, notifications)',
    defaultLabelName: 'Automated',
    color: { bg: '#f3e5f5', text: '#7b1fa2' }, // Purple
  },
];

export function getCategoryDefinition(key: EmailCategory): CategoryDefinition | undefined {
  return CATEGORY_DEFINITIONS.find(c => c.key === key);
}

// ============================================================================
// Gmail Label Operations
// ============================================================================

/**
 * Fetch all Gmail labels for the current user
 */
export async function fetchGmailLabels(): Promise<GmailLabel[]> {
  const headers = await getAuthHeaders();
  const { data, error } = await supabase.functions.invoke('google-services-router', { body: { action: 'gmail', handlerAction: 'list-labels' },
    headers
  });

  if (error) {
    console.error('[emailCategorizationService] Error fetching Gmail labels:', error);
    throw new Error(error.message || 'Failed to fetch Gmail labels');
  }

  return data?.labels || [];
}

/**
 * Find a Gmail label by name (case-insensitive)
 */
export async function findGmailLabelByName(name: string): Promise<GmailLabel | null> {
  const headers = await getAuthHeaders();
  const { data, error } = await supabase.functions.invoke('google-services-router', { body: { action: 'gmail', handlerAction: 'find-label', name },
    headers
  });

  if (error) {
    console.error('[emailCategorizationService] Error finding Gmail label:', error);
    throw new Error(error.message || 'Failed to find Gmail label');
  }

  return data;
}

/**
 * Create a new Gmail label (collision-safe)
 * If label already exists, returns existing label without modification
 */
export async function getOrCreateGmailLabel(
  name: string,
  options?: {
    backgroundColor?: string;
    textColor?: string;
  }
): Promise<{ label: GmailLabel; created: boolean; isSixtyManaged: boolean }> {
  const headers = await getAuthHeaders();
  const { data, error } = await supabase.functions.invoke('google-services-router', { body: { action: 'gmail', handlerAction: 'get-or-create-label',
      name,
      backgroundColor: options?.backgroundColor,
      textColor: options?.textColor,
    },
    headers
  });

  if (error) {
    console.error('[emailCategorizationService] Error creating Gmail label:', error);
    throw new Error(error.message || 'Failed to create Gmail label');
  }

  return data;
}

// ============================================================================
// Label Mapping Operations
// ============================================================================

/**
 * Get all label mappings for the current user
 */
export async function getLabelMappings(): Promise<LabelMapping[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  
  const { data, error } = await supabase
    .from('gmail_label_mappings')
    .select('*')
    .eq('user_id', user.id);
  
  if (error) {
    console.error('[emailCategorizationService] Error fetching label mappings:', error);
    throw new Error(error.message);
  }
  
  return (data || []).map(row => ({
    id: row.id,
    userId: row.user_id,
    orgId: row.org_id,
    categoryKey: row.category_key as EmailCategory,
    gmailLabelId: row.gmail_label_id,
    gmailLabelName: row.gmail_label_name,
    isSixtyManaged: row.is_sixty_managed,
    syncDirection: row.sync_direction as SyncDirection,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Create or update a label mapping
 */
export async function upsertLabelMapping(
  categoryKey: EmailCategory,
  gmailLabelId: string,
  gmailLabelName: string,
  options?: {
    isSixtyManaged?: boolean;
    syncDirection?: SyncDirection;
    orgId?: string;
  }
): Promise<LabelMapping> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  
  const { data, error } = await supabase
    .from('gmail_label_mappings')
    .upsert({
      user_id: user.id,
      org_id: options?.orgId || null,
      category_key: categoryKey,
      gmail_label_id: gmailLabelId,
      gmail_label_name: gmailLabelName,
      is_sixty_managed: options?.isSixtyManaged ?? false,
      sync_direction: options?.syncDirection ?? 'none',
    }, {
      onConflict: 'user_id,category_key',
    })
    .select()
    .single();
  
  if (error) {
    console.error('[emailCategorizationService] Error upserting label mapping:', error);
    throw new Error(error.message);
  }
  
  return {
    id: data.id,
    userId: data.user_id,
    orgId: data.org_id,
    categoryKey: data.category_key as EmailCategory,
    gmailLabelId: data.gmail_label_id,
    gmailLabelName: data.gmail_label_name,
    isSixtyManaged: data.is_sixty_managed,
    syncDirection: data.sync_direction as SyncDirection,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Delete a label mapping
 */
export async function deleteLabelMapping(mappingId: string): Promise<void> {
  const { error } = await supabase
    .from('gmail_label_mappings')
    .delete()
    .eq('id', mappingId);
  
  if (error) {
    console.error('[emailCategorizationService] Error deleting label mapping:', error);
    throw new Error(error.message);
  }
}

/**
 * Set up default label mappings for a category
 * Uses collision-safe label creation (won't overwrite existing labels)
 */
export async function setupDefaultMapping(
  categoryKey: EmailCategory,
  options?: {
    createInGmail?: boolean; // If true, create label in Gmail (modeC)
    syncDirection?: SyncDirection;
    orgId?: string;
  }
): Promise<LabelMapping> {
  const definition = getCategoryDefinition(categoryKey);
  if (!definition) {
    throw new Error(`Unknown category: ${categoryKey}`);
  }
  
  let gmailLabelId = '';
  let gmailLabelName = definition.defaultLabelName;
  let isSixtyManaged = false;
  
  if (options?.createInGmail) {
    // Create label in Gmail using collision-safe approach
    const result = await getOrCreateGmailLabel(definition.defaultLabelName, {
      backgroundColor: definition.color.bg,
      textColor: definition.color.text,
    });
    
    gmailLabelId = result.label.id;
    gmailLabelName = result.label.name;
    isSixtyManaged = result.isSixtyManaged;
  }
  
  // Store the mapping
  return upsertLabelMapping(categoryKey, gmailLabelId, gmailLabelName, {
    isSixtyManaged,
    syncDirection: options?.syncDirection ?? 'none',
    orgId: options?.orgId,
  });
}

// ============================================================================
// Org Settings Operations
// ============================================================================

/**
 * Get categorization settings for an org
 */
export async function getOrgCategorizationSettings(orgId: string): Promise<OrgCategorizationSettings | null> {
  const { data, error } = await supabase
    .from('org_email_categorization_settings')
    .select('*')
    .eq('org_id', orgId)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    console.error('[emailCategorizationService] Error fetching org settings:', error);
    throw new Error(error.message);
  }
  
  return {
    id: data.id,
    orgId: data.org_id,
    isEnabled: data.is_enabled,
    labelMode: data.label_mode as LabelMode,
    archiveNonActionable: data.archive_non_actionable,
    useAiCategorization: data.use_ai_categorization,
    useRulesCategorization: data.use_rules_categorization,
    enabledCategories: data.enabled_categories,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    updatedBy: data.updated_by,
  };
}

/**
 * Update categorization settings for an org
 */
export async function updateOrgCategorizationSettings(
  orgId: string,
  updates: Partial<{
    isEnabled: boolean;
    labelMode: LabelMode;
    archiveNonActionable: boolean;
    useAiCategorization: boolean;
    useRulesCategorization: boolean;
    enabledCategories: string[];
  }>
): Promise<OrgCategorizationSettings> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  
  const updateData: any = { updated_by: user.id };
  
  if (updates.isEnabled !== undefined) updateData.is_enabled = updates.isEnabled;
  if (updates.labelMode !== undefined) updateData.label_mode = updates.labelMode;
  if (updates.archiveNonActionable !== undefined) updateData.archive_non_actionable = updates.archiveNonActionable;
  if (updates.useAiCategorization !== undefined) updateData.use_ai_categorization = updates.useAiCategorization;
  if (updates.useRulesCategorization !== undefined) updateData.use_rules_categorization = updates.useRulesCategorization;
  if (updates.enabledCategories !== undefined) updateData.enabled_categories = updates.enabledCategories;
  
  const { data, error } = await supabase
    .from('org_email_categorization_settings')
    .update(updateData)
    .eq('org_id', orgId)
    .select()
    .single();
  
  if (error) {
    console.error('[emailCategorizationService] Error updating org settings:', error);
    throw new Error(error.message);
  }
  
  return {
    id: data.id,
    orgId: data.org_id,
    isEnabled: data.is_enabled,
    labelMode: data.label_mode as LabelMode,
    archiveNonActionable: data.archive_non_actionable,
    useAiCategorization: data.use_ai_categorization,
    useRulesCategorization: data.use_rules_categorization,
    enabledCategories: data.enabled_categories,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    updatedBy: data.updated_by,
  };
}

// ============================================================================
// Email Categorization CRUD
// ============================================================================

/**
 * Get recent email categorizations for a user
 */
export async function getRecentCategorizations(options?: {
  limit?: number;
  category?: EmailCategory;
  sinceProcessedAt?: string;
}): Promise<EmailCategorization[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  
  let query = supabase
    .from('email_categorizations')
    .select('*')
    .eq('user_id', user.id)
    .order('processed_at', { ascending: false });
  
  if (options?.limit) {
    query = query.limit(options.limit);
  }
  
  if (options?.category) {
    query = query.eq('category', options.category);
  }
  
  if (options?.sinceProcessedAt) {
    query = query.gte('processed_at', options.sinceProcessedAt);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('[emailCategorizationService] Error fetching categorizations:', error);
    throw new Error(error.message);
  }
  
  return (data || []).map(row => ({
    id: row.id,
    userId: row.user_id,
    orgId: row.org_id,
    externalId: row.external_id,
    threadId: row.thread_id,
    direction: row.direction as 'inbound' | 'outbound',
    receivedAt: row.received_at,
    category: row.category as EmailCategory,
    categoryConfidence: row.category_confidence,
    signals: row.signals as EmailSignals,
    source: row.source as CategorizationSource,
    communicationEventId: row.communication_event_id,
    gmailLabelApplied: row.gmail_label_applied,
    gmailLabelAppliedAt: row.gmail_label_applied_at,
    processedAt: row.processed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Get category counts for a user (for dashboard/preview)
 */
export async function getCategoryCounts(options?: {
  sinceProcessedAt?: string;
}): Promise<Record<EmailCategory, number>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  
  let query = supabase
    .from('email_categorizations')
    .select('category')
    .eq('user_id', user.id);
  
  if (options?.sinceProcessedAt) {
    query = query.gte('processed_at', options.sinceProcessedAt);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('[emailCategorizationService] Error fetching category counts:', error);
    throw new Error(error.message);
  }
  
  // Initialize counts
  const counts: Record<EmailCategory, number> = {
    to_respond: 0,
    fyi: 0,
    marketing: 0,
    calendar_related: 0,
    automated: 0,
    uncategorized: 0,
  };
  
  // Count each category
  for (const row of data || []) {
    const category = row.category as EmailCategory;
    if (category in counts) {
      counts[category]++;
    }
  }
  
  return counts;
}

// ============================================================================
// Export service object
// ============================================================================

export const emailCategorizationService = {
  // Category definitions
  CATEGORY_DEFINITIONS,
  getCategoryDefinition,
  
  // Gmail labels
  fetchGmailLabels,
  findGmailLabelByName,
  getOrCreateGmailLabel,
  
  // Label mappings
  getLabelMappings,
  upsertLabelMapping,
  deleteLabelMapping,
  setupDefaultMapping,
  
  // Org settings
  getOrgCategorizationSettings,
  updateOrgCategorizationSettings,
  
  // Categorizations
  getRecentCategorizations,
  getCategoryCounts,
};

