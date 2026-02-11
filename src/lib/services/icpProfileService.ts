/**
 * ICP Profile Service
 *
 * CRUD operations for Ideal Customer Profiles (icp_profiles table).
 * Uses the Supabase client from clientV2 with explicit column selection.
 */

import { supabase } from '@/lib/supabase/clientV2';
import type {
  ICPProfile,
  ICPSearchHistoryEntry,
  CreateICPProfilePayload,
  UpdateICPProfilePayload,
} from '@/lib/types/prospecting';

// ---------------------------------------------------------------------------
// Explicit column selection (never use select('*'))
// ---------------------------------------------------------------------------

const PROFILE_COLUMNS =
  'id, organization_id, created_by, name, description, criteria, target_provider, status, visibility, is_active, last_tested_at, last_test_result_count, created_at, updated_at';

const SEARCH_HISTORY_COLUMNS =
  'id, icp_profile_id, organization_id, searched_by, provider, search_params, result_count, credits_consumed, duration_ms, created_at';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const icpProfileService = {
  /**
   * List all ICP profiles for an organization, ordered by most recently updated.
   */
  async listProfiles(orgId: string): Promise<ICPProfile[]> {
    const { data, error } = await supabase
      .from('icp_profiles')
      .select(PROFILE_COLUMNS)
      .eq('organization_id', orgId)
      .order('updated_at', { ascending: false });

    if (error) throw new Error(error.message || 'Failed to list ICP profiles');
    return (data ?? []) as ICPProfile[];
  },

  /**
   * Get a single ICP profile by ID. Returns null if not found.
   */
  async getProfile(id: string): Promise<ICPProfile | null> {
    const { data, error } = await supabase
      .from('icp_profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(error.message || 'Failed to get ICP profile');
    return data as ICPProfile | null;
  },

  /**
   * Create a new ICP profile.
   */
  async createProfile(payload: CreateICPProfilePayload): Promise<ICPProfile> {
    const { data, error } = await supabase
      .from('icp_profiles')
      .insert({
        organization_id: payload.organization_id,
        created_by: payload.created_by,
        name: payload.name,
        description: payload.description ?? null,
        criteria: payload.criteria,
        target_provider: payload.target_provider ?? 'apollo',
        status: payload.status ?? 'draft',
        visibility: payload.visibility ?? 'team_only',
        is_active: payload.is_active ?? true,
      })
      .select(PROFILE_COLUMNS)
      .single();

    if (error) throw new Error(error.message || 'Failed to create ICP profile');
    return data as ICPProfile;
  },

  /**
   * Update an existing ICP profile by ID.
   */
  async updateProfile(id: string, payload: UpdateICPProfilePayload): Promise<ICPProfile> {
    const { data, error } = await supabase
      .from('icp_profiles')
      .update(payload)
      .eq('id', id)
      .select(PROFILE_COLUMNS)
      .single();

    if (error) throw new Error(error.message || 'Failed to update ICP profile');
    return data as ICPProfile;
  },

  /**
   * Delete an ICP profile by ID.
   */
  async deleteProfile(id: string): Promise<void> {
    const { error } = await supabase
      .from('icp_profiles')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message || 'Failed to delete ICP profile');
  },

  /**
   * Duplicate an ICP profile with a new name.
   * Fetches the original, strips identity fields, and inserts a copy.
   */
  async duplicateProfile(id: string, newName: string): Promise<ICPProfile> {
    const original = await icpProfileService.getProfile(id);
    if (!original) throw new Error('ICP profile not found');

    const { data, error } = await supabase
      .from('icp_profiles')
      .insert({
        organization_id: original.organization_id,
        created_by: original.created_by,
        name: newName,
        description: original.description,
        criteria: original.criteria,
        target_provider: original.target_provider,
        status: 'draft' as const,
        visibility: original.visibility,
        is_active: true,
      })
      .select(PROFILE_COLUMNS)
      .single();

    if (error) throw new Error(error.message || 'Failed to duplicate ICP profile');
    return data as ICPProfile;
  },

  // -----------------------------------------------------------------------
  // Search History
  // -----------------------------------------------------------------------

  /**
   * List search history entries for a specific ICP profile, newest first.
   */
  async listSearchHistory(profileId: string): Promise<ICPSearchHistoryEntry[]> {
    const { data, error } = await supabase
      .from('icp_search_history')
      .select(SEARCH_HISTORY_COLUMNS)
      .eq('icp_profile_id', profileId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message || 'Failed to list search history');
    return (data ?? []) as ICPSearchHistoryEntry[];
  },

  /**
   * Delete a search history entry by ID.
   */
  async deleteSearchHistory(id: string): Promise<void> {
    const { error } = await supabase
      .from('icp_search_history')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message || 'Failed to delete search history entry');
  },
};
