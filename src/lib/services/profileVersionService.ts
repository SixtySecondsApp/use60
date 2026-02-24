/**
 * Profile Version History Service
 *
 * Generic version listing and revert operations for fact, product, and ICP profiles.
 * Uses VERSION_TABLE_CONFIG for table/column resolution so the same code handles all 3 types.
 */

import { supabase } from '@/lib/supabase/clientV2';
import type { ProfileType, ProfileVersion } from '@/lib/types/profileVersion';
import { VERSION_TABLE_CONFIG } from '@/lib/types/profileVersion';

// ---------------------------------------------------------------------------
// Column selections per version table
// ---------------------------------------------------------------------------

const VERSION_COLUMNS: Record<ProfileType, string> = {
  fact_profile:
    'id, fact_profile_id, version_number, snapshot, research_sources, changed_by, change_summary, created_at',
  product_profile:
    'id, product_profile_id, version_number, snapshot, research_sources, changed_by, change_summary, created_at',
  icp_profile:
    'id, icp_profile_id, version_number, snapshot, name_snapshot, description_snapshot, changed_by, change_summary, created_at',
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const profileVersionService = {
  /**
   * List all version snapshots for a given profile, newest first.
   */
  async listVersions(profileType: ProfileType, profileId: string): Promise<ProfileVersion[]> {
    const config = VERSION_TABLE_CONFIG[profileType];
    const columns = VERSION_COLUMNS[profileType];

    const { data, error } = await supabase
      .from(config.table)
      .select(columns)
      .eq(config.fkColumn, profileId)
      .order('version_number', { ascending: false });

    if (error) throw new Error(error.message || 'Failed to list version history');
    return (data ?? []) as ProfileVersion[];
  },

  /**
   * Revert a fact profile to a previous version.
   * Updates research_data from the snapshot — the DB trigger will auto-snapshot
   * the current state before applying.
   */
  async revertFactProfile(profileId: string, versionId: string): Promise<void> {
    // Fetch the target version
    const { data: version, error: fetchError } = await supabase
      .from('fact_profile_versions')
      .select('snapshot, research_sources')
      .eq('id', versionId)
      .single();

    if (fetchError || !version) throw new Error('Version not found');

    // Update the parent — trigger will snapshot current state first
    const { error: updateError } = await supabase
      .from('client_fact_profiles')
      .update({
        research_data: version.snapshot,
        research_sources: version.research_sources ?? [],
      })
      .eq('id', profileId);

    if (updateError) throw new Error(updateError.message || 'Failed to revert fact profile');
  },

  /**
   * Revert a product profile to a previous version.
   */
  async revertProductProfile(profileId: string, versionId: string): Promise<void> {
    const { data: version, error: fetchError } = await supabase
      .from('product_profile_versions')
      .select('snapshot, research_sources')
      .eq('id', versionId)
      .single();

    if (fetchError || !version) throw new Error('Version not found');

    const { error: updateError } = await supabase
      .from('product_profiles')
      .update({
        research_data: version.snapshot,
        research_sources: version.research_sources ?? [],
      })
      .eq('id', profileId);

    if (updateError) throw new Error(updateError.message || 'Failed to revert product profile');
  },

  /**
   * Revert an ICP profile to a previous version.
   * Restores criteria, name, and description.
   */
  async revertICPProfile(profileId: string, versionId: string): Promise<void> {
    const { data: version, error: fetchError } = await supabase
      .from('icp_profile_versions')
      .select('snapshot, name_snapshot, description_snapshot')
      .eq('id', versionId)
      .single();

    if (fetchError || !version) throw new Error('Version not found');

    const updates: Record<string, unknown> = { criteria: version.snapshot };
    if (version.name_snapshot !== null) updates.name = version.name_snapshot;
    if (version.description_snapshot !== null) updates.description = version.description_snapshot;

    const { error: updateError } = await supabase
      .from('icp_profiles')
      .update(updates)
      .eq('id', profileId);

    if (updateError) throw new Error(updateError.message || 'Failed to revert ICP profile');
  },
};
