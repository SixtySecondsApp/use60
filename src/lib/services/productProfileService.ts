/**
 * Product Profile Service
 *
 * CRUD operations for Product Profiles (product_profiles table).
 * Uses the Supabase client from clientV2 with explicit column selection.
 */

import { supabase } from '@/lib/supabase/clientV2';
import type {
  ProductProfile,
  CreateProductProfilePayload,
  UpdateProductProfilePayload,
} from '@/lib/types/productProfile';

// ---------------------------------------------------------------------------
// Explicit column selection (never use select('*'))
// ---------------------------------------------------------------------------

const PROFILE_COLUMNS =
  'id, organization_id, fact_profile_id, created_by, name, description, category, product_url, logo_url, research_data, research_sources, research_status, is_primary, version, created_at, updated_at';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const productProfileService = {
  /**
   * List all product profiles for an organization, ordered by most recently updated.
   */
  async listByOrg(orgId: string): Promise<ProductProfile[]> {
    const { data, error } = await supabase
      .from('product_profiles')
      .select(PROFILE_COLUMNS)
      .eq('organization_id', orgId)
      .order('updated_at', { ascending: false });

    if (error) throw new Error(error.message || 'Failed to list product profiles');
    return (data ?? []) as ProductProfile[];
  },

  /**
   * List product profiles linked to a specific fact profile.
   */
  async listByFactProfile(factProfileId: string): Promise<ProductProfile[]> {
    const { data, error } = await supabase
      .from('product_profiles')
      .select(PROFILE_COLUMNS)
      .eq('fact_profile_id', factProfileId)
      .order('is_primary', { ascending: false })
      .order('updated_at', { ascending: false });

    if (error) throw new Error(error.message || 'Failed to list product profiles by fact profile');
    return (data ?? []) as ProductProfile[];
  },

  /**
   * Get a single product profile by ID. Returns null if not found.
   */
  async getProfile(id: string): Promise<ProductProfile | null> {
    const { data, error } = await supabase
      .from('product_profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(error.message || 'Failed to get product profile');
    return data as ProductProfile | null;
  },

  /**
   * Create a new product profile.
   */
  async createProfile(payload: CreateProductProfilePayload): Promise<ProductProfile> {
    const { data, error } = await supabase
      .from('product_profiles')
      .insert({
        organization_id: payload.organization_id,
        created_by: payload.created_by,
        name: payload.name,
        description: payload.description ?? null,
        category: payload.category ?? null,
        product_url: payload.product_url ?? null,
        fact_profile_id: payload.fact_profile_id ?? null,
      })
      .select(PROFILE_COLUMNS)
      .single();

    if (error) throw new Error(error.message || 'Failed to create product profile');
    return data as ProductProfile;
  },

  /**
   * Update an existing product profile by ID.
   */
  async updateProfile(id: string, payload: UpdateProductProfilePayload): Promise<ProductProfile> {
    const { data, error } = await supabase
      .from('product_profiles')
      .update(payload)
      .eq('id', id)
      .select(PROFILE_COLUMNS)
      .single();

    if (error) throw new Error(error.message || 'Failed to update product profile');
    return data as ProductProfile;
  },

  /**
   * Delete a product profile by ID.
   */
  async deleteProfile(id: string): Promise<void> {
    const { error } = await supabase
      .from('product_profiles')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message || 'Failed to delete product profile');
  },
};
