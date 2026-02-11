/**
 * Fact Profile Service
 *
 * CRUD operations for Client Fact Profiles (client_fact_profiles table).
 * Uses the Supabase client from clientV2 with explicit column selection.
 */

import { supabase } from '@/lib/supabase/clientV2';
import type {
  FactProfile,
  CreateFactProfilePayload,
  UpdateFactProfilePayload,
} from '@/lib/types/factProfile';

// ---------------------------------------------------------------------------
// Explicit column selection (never use select('*'))
// ---------------------------------------------------------------------------

const PROFILE_COLUMNS =
  'id, organization_id, created_by, company_name, company_domain, company_logo_url, profile_type, research_data, research_sources, research_status, approval_status, approval_feedback, approved_by, approved_at, share_token, is_public, share_password_hash, share_views, last_viewed_at, share_expires_at, linked_icp_profile_ids, version, created_at, updated_at';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const factProfileService = {
  /**
   * List all fact profiles for an organization, ordered by most recently updated.
   */
  async listProfiles(orgId: string): Promise<FactProfile[]> {
    const { data, error } = await supabase
      .from('client_fact_profiles')
      .select(PROFILE_COLUMNS)
      .eq('organization_id', orgId)
      .order('updated_at', { ascending: false });

    if (error) throw new Error(error.message || 'Failed to list fact profiles');
    return (data ?? []) as FactProfile[];
  },

  /**
   * Get a single fact profile by ID. Returns null if not found.
   */
  async getProfile(id: string): Promise<FactProfile | null> {
    const { data, error } = await supabase
      .from('client_fact_profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(error.message || 'Failed to get fact profile');
    return data as FactProfile | null;
  },

  /**
   * Create a new fact profile.
   */
  async createProfile(payload: CreateFactProfilePayload): Promise<FactProfile> {
    const { data, error } = await supabase
      .from('client_fact_profiles')
      .insert({
        organization_id: payload.organization_id,
        created_by: payload.created_by,
        company_name: payload.company_name,
        company_domain: payload.company_domain ?? null,
        profile_type: payload.profile_type ?? 'client_org',
      })
      .select(PROFILE_COLUMNS)
      .single();

    if (error) throw new Error(error.message || 'Failed to create fact profile');
    return data as FactProfile;
  },

  /**
   * Update an existing fact profile by ID.
   */
  async updateProfile(id: string, payload: UpdateFactProfilePayload): Promise<FactProfile> {
    const { data, error } = await supabase
      .from('client_fact_profiles')
      .update(payload)
      .eq('id', id)
      .select(PROFILE_COLUMNS)
      .single();

    if (error) throw new Error(error.message || 'Failed to update fact profile');
    return data as FactProfile;
  },

  /**
   * Delete a fact profile by ID.
   */
  async deleteProfile(id: string): Promise<void> {
    const { error } = await supabase
      .from('client_fact_profiles')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message || 'Failed to delete fact profile');
  },

  /**
   * Get a public fact profile by share token.
   * Returns null if not found or not public. No auth needed.
   */
  async getPublicProfile(shareToken: string): Promise<FactProfile | null> {
    const { data, error } = await supabase
      .from('client_fact_profiles')
      .select(PROFILE_COLUMNS)
      .eq('share_token', shareToken)
      .eq('is_public', true)
      .maybeSingle();

    if (error) throw new Error(error.message || 'Failed to get public fact profile');
    return data as FactProfile | null;
  },
};
