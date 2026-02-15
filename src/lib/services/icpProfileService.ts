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
  'id, organization_id, created_by, name, description, criteria, profile_type, parent_icp_id, target_provider, status, visibility, is_active, linked_table_id, last_tested_at, last_test_result_count, created_at, updated_at';

const SEARCH_HISTORY_COLUMNS =
  'id, icp_profile_id, organization_id, searched_by, provider, search_params, result_count, credits_consumed, duration_ms, created_at';

// ---------------------------------------------------------------------------
// Helper: Create linked ops table for ICP/Persona profile
// ---------------------------------------------------------------------------

async function createLinkedOpsTable(params: {
  orgId: string;
  userId: string;
  profileName: string;
  profileType: 'icp' | 'persona';
}): Promise<string> {
  // Use "Persona" instead of "PERSONA" for better readability
  const typeLabel = params.profileType === 'persona' ? 'Persona' : params.profileType.toUpperCase();
  const tableName = `${params.profileName} - ${typeLabel} Results`;

  // Create the dynamic table
  const { data: table, error: tableError } = await supabase
    .from('dynamic_tables')
    .insert({
      organization_id: params.orgId,
      created_by: params.userId,
      name: tableName,
      description: `Auto-created ops table for ${typeLabel} profile: ${params.profileName}`,
      source_type: 'icp',
      source_query: null,
      row_count: 0,
    })
    .select('id')
    .single();

  if (tableError) throw new Error(tableError.message || 'Failed to create linked ops table');

  const tableId = table.id;

  // Define standard columns for ICP/Persona results table
  const columns = [
    { key: 'contact_name', label: 'Contact Name', column_type: 'person', position: 0, width: 200 },
    { key: 'contact_email', label: 'Email', column_type: 'email', position: 1, width: 220 },
    { key: 'contact_title', label: 'Title', column_type: 'text', position: 2, width: 200 },
    { key: 'company_name', label: 'Company', column_type: 'company', position: 3, width: 200 },
    { key: 'company_domain', label: 'Domain', column_type: 'url', position: 4, width: 180 },
    { key: 'linkedin_url', label: 'LinkedIn', column_type: 'linkedin', position: 5, width: 180 },
    { key: 'location', label: 'Location', column_type: 'text', position: 6, width: 160 },
    {
      key: 'status',
      label: 'Status',
      column_type: 'status',
      position: 7,
      width: 140,
      dropdown_options: [
        { value: 'new', label: 'New', color: '#3B82F6' },
        { value: 'reviewing', label: 'Reviewing', color: '#F59E0B' },
        { value: 'qualified', label: 'Qualified', color: '#10B981' },
        { value: 'contacted', label: 'Contacted', color: '#8B5CF6' },
        { value: 'not_a_fit', label: 'Not a Fit', color: '#6B7280' },
      ],
    },
  ];

  // Insert columns
  const columnInserts = columns.map((col) => ({
    table_id: tableId,
    key: col.key,
    label: col.label,
    column_type: col.column_type,
    position: col.position,
    width: col.width,
    is_visible: true,
    is_enrichment: false,
    ...(col.column_type === 'status' && { dropdown_options: col.dropdown_options }),
  }));

  const { error: columnsError } = await supabase
    .from('dynamic_table_columns')
    .insert(columnInserts);

  if (columnsError) throw new Error(columnsError.message || 'Failed to create table columns');

  return tableId;
}

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
   * Create a new ICP profile with auto-created linked ops table.
   */
  async createProfile(payload: CreateICPProfilePayload): Promise<ICPProfile> {
    const profileType = payload.profile_type ?? 'icp';

    // Create the linked ops table
    const linkedTableId = await createLinkedOpsTable({
      orgId: payload.organization_id,
      userId: payload.created_by,
      profileName: payload.name,
      profileType,
    });

    const { data, error } = await supabase
      .from('icp_profiles')
      .insert({
        organization_id: payload.organization_id,
        created_by: payload.created_by,
        name: payload.name,
        description: payload.description ?? null,
        criteria: payload.criteria,
        profile_type: profileType,
        parent_icp_id: payload.parent_icp_id ?? null,
        target_provider: payload.target_provider ?? 'apollo',
        status: payload.status ?? 'active',
        visibility: payload.visibility ?? 'team_only',
        is_active: payload.is_active ?? true,
        linked_table_id: linkedTableId,
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
   * When duplicating a persona, inherits parent_icp_id from the source.
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
        profile_type: original.profile_type ?? 'icp',
        parent_icp_id: original.parent_icp_id ?? null,
        target_provider: original.target_provider,
        status: 'active' as const,
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

  // -----------------------------------------------------------------------
  // Parent ICP Helper (for chained searches)
  // -----------------------------------------------------------------------

  /**
   * Get parent ICP criteria for a persona profile.
   * Returns null if profile has no parent or parent doesn't exist.
   */
  async getParentCriteria(personaProfile: ICPProfile): Promise<{
    parent_icp_id: string;
    parent_criteria: ICPCriteria;
  } | null> {
    if (!personaProfile.parent_icp_id) return null;

    const parentProfile = await icpProfileService.getProfile(personaProfile.parent_icp_id);
    if (!parentProfile) return null;

    return {
      parent_icp_id: parentProfile.id,
      parent_criteria: parentProfile.criteria,
    };
  },

  // -----------------------------------------------------------------------
  // Lead Append with Deduplication
  // -----------------------------------------------------------------------

  /**
   * Append leads to an ICP profile's linked ops table with deduplication.
   * Dedups by email and company_domain to avoid duplicates.
   * Sets source_icp_id on all new rows.
   *
   * @param tableId - The dynamic table ID (linked_table_id from ICP profile)
   * @param icpProfileId - The ICP profile ID (for source_icp_id tagging)
   * @param leads - Array of lead objects from prospecting search
   * @returns Object with added_count, skipped_count (duplicates), and error details
   */
  async appendLeadsToTable(params: {
    tableId: string;
    icpProfileId: string;
    leads: Record<string, unknown>[];
  }): Promise<{ added_count: number; skipped_count: number; errors?: string[] }> {
    const { tableId, icpProfileId, leads } = params;

    if (leads.length === 0) {
      return { added_count: 0, skipped_count: 0 };
    }

    try {
      // Step 1: Fetch table columns to map lead data
      const { data: columns, error: colsError } = await supabase
        .from('dynamic_table_columns')
        .select('id, key, column_type')
        .eq('table_id', tableId)
        .eq('is_visible', true)
        .order('position', { ascending: true });

      if (colsError) throw new Error(`Failed to fetch columns: ${colsError.message}`);
      if (!columns || columns.length === 0) {
        throw new Error('Table has no visible columns');
      }

      // Step 2: Fetch existing rows to check for duplicates
      // Dedup by email or company_domain
      const { data: existingRows, error: rowsError } = await supabase
        .from('dynamic_table_rows')
        .select('id, cells')
        .eq('table_id', tableId);

      if (rowsError) throw new Error(`Failed to fetch existing rows: ${rowsError.message}`);

      // Build dedup set from existing rows
      const existingEmails = new Set<string>();
      const existingDomains = new Set<string>();

      (existingRows ?? []).forEach((row) => {
        const cells = row.cells as Record<string, { value: string }>;
        Object.entries(cells).forEach(([_key, cell]) => {
          const val = cell?.value?.toLowerCase();
          if (val && val.includes('@')) {
            existingEmails.add(val);
          }
          if (val && val.match(/^[a-z0-9.-]+\.[a-z]{2,}$/i)) {
            existingDomains.add(val.toLowerCase());
          }
        });
      });

      // Step 3: Map leads to rows, skipping duplicates
      const rowsToInsert: {
        table_id: string;
        source_icp_id: string;
        cells: Record<string, { value: string }>;
        row_index: number;
      }[] = [];

      const errors: string[] = [];
      let skippedCount = 0;

      const startIndex = (existingRows ?? []).length;

      leads.forEach((lead, idx) => {
        // Extract email and domain for dedup check
        const email = (lead.email || lead.contact_email || lead.person_email || lead.work_email || '') as string;
        const domain = (lead.company_domain || lead.domain || lead.organization_domain || '') as string;

        const emailLower = email.toLowerCase();
        const domainLower = domain.toLowerCase();

        // Skip if duplicate
        if ((emailLower && existingEmails.has(emailLower)) || (domainLower && existingDomains.has(domainLower))) {
          skippedCount++;
          return;
        }

        // Map lead fields to table columns
        const cells: Record<string, { value: string }> = {};

        columns.forEach((col) => {
          const key = col.key;
          let value = '';

          // Map common prospecting fields to column keys
          if (key === 'contact_name' || key === 'name') {
            value = (lead.name || lead.first_name && lead.last_name ? `${lead.first_name} ${lead.last_name}` : lead.contact_name || '') as string;
          } else if (key === 'contact_email' || key === 'email') {
            value = email;
          } else if (key === 'contact_title' || key === 'title') {
            value = (lead.title || lead.job_title || lead.contact_title || '') as string;
          } else if (key === 'company_name' || key === 'organization_name') {
            value = (lead.company_name || lead.organization_name || lead.organization || '') as string;
          } else if (key === 'company_domain' || key === 'domain') {
            value = domain;
          } else if (key === 'linkedin_url' || key === 'linkedin') {
            value = (lead.linkedin_url || lead.linkedin || lead.person_linkedin_url || '') as string;
          } else if (key === 'location') {
            value = (lead.location || lead.city || lead.state || lead.country || '') as string;
          } else if (key === 'status') {
            value = 'new';
          } else {
            // Try direct key match
            value = (lead[key] || '') as string;
          }

          cells[col.id] = { value: String(value || '') };
        });

        rowsToInsert.push({
          table_id: tableId,
          source_icp_id: icpProfileId,
          cells,
          row_index: startIndex + rowsToInsert.length,
        });

        // Add to dedup sets
        if (emailLower) existingEmails.add(emailLower);
        if (domainLower) existingDomains.add(domainLower);
      });

      // Step 4: Batch insert rows
      if (rowsToInsert.length === 0) {
        return { added_count: 0, skipped_count: skippedCount };
      }

      const { error: insertError } = await supabase
        .from('dynamic_table_rows')
        .insert(rowsToInsert);

      if (insertError) {
        errors.push(`Insert failed: ${insertError.message}`);
        throw new Error(insertError.message);
      }

      // Step 5: Update table row_count
      const { error: updateError } = await supabase
        .from('dynamic_tables')
        .update({ row_count: startIndex + rowsToInsert.length })
        .eq('id', tableId);

      if (updateError) {
        errors.push(`Failed to update row_count: ${updateError.message}`);
      }

      return {
        added_count: rowsToInsert.length,
        skipped_count: skippedCount,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (err: any) {
      console.error('[icpProfileService] appendLeadsToTable error:', err);
      throw err;
    }
  },
};
