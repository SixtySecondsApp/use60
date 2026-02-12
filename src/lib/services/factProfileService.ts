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
  'id, organization_id, created_by, company_name, company_domain, company_logo_url, profile_type, is_org_profile, research_data, research_sources, research_status, approval_status, approval_feedback, approved_by, approved_at, share_token, is_public, share_password_hash, share_views, last_viewed_at, share_expires_at, linked_icp_profile_ids, linked_contact_id, linked_deal_id, linked_company_domain, version, created_at, updated_at';

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
        is_org_profile: payload.is_org_profile ?? false,
        linked_contact_id: payload.linked_contact_id ?? null,
        linked_deal_id: payload.linked_deal_id ?? null,
        linked_company_domain: payload.linked_company_domain ?? null,
      })
      .select(PROFILE_COLUMNS)
      .single();

    if (error) {
      // Include error code for unique constraint violation detection (23505)
      const code = (error as any).code;
      throw new Error(code ? `${code}: ${error.message}` : (error.message || 'Failed to create fact profile'));
    }
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
   * Get the organization's own fact profile (is_org_profile = true).
   * Returns null if the org hasn't created one yet.
   */
  async getOrgProfile(orgId: string): Promise<FactProfile | null> {
    const { data, error } = await supabase
      .from('client_fact_profiles')
      .select(PROFILE_COLUMNS)
      .eq('organization_id', orgId)
      .eq('is_org_profile', true)
      .maybeSingle();

    if (error) throw new Error(error.message || 'Failed to get org fact profile');
    return data as FactProfile | null;
  },

  /**
   * Sync a fact profile's research data to organization_context.
   * Maps the 8 research sections to flat key-value pairs for skill interpolation.
   * Only intended for org profiles (is_org_profile = true).
   */
  async syncToOrgContext(
    profileId: string,
    orgId: string
  ): Promise<{ synced: number }> {
    const profile = await this.getProfile(profileId);
    if (!profile) throw new Error('Fact profile not found');
    if (!profile.research_data) throw new Error('No research data to sync');

    const rd = profile.research_data;
    const updates: Array<{ key: string; value: unknown }> = [];

    // company_overview
    if (rd.company_overview) {
      const co = rd.company_overview;
      if (co.name) updates.push({ key: 'company_name', value: co.name });
      if (co.tagline) updates.push({ key: 'tagline', value: co.tagline });
      if (co.description) updates.push({ key: 'description', value: co.description });
      if (co.headquarters) updates.push({ key: 'headquarters', value: co.headquarters });
      if (co.website) updates.push({ key: 'website', value: co.website });
      if (co.company_type) updates.push({ key: 'company_type', value: co.company_type });
    }

    // market_position
    if (rd.market_position) {
      const mp = rd.market_position;
      if (mp.industry) updates.push({ key: 'industry', value: mp.industry });
      if (mp.target_market) updates.push({ key: 'target_market', value: mp.target_market });
      if (mp.competitors?.length) updates.push({ key: 'competitors', value: mp.competitors });
      if (mp.differentiators?.length) updates.push({ key: 'differentiators', value: mp.differentiators });
      if (mp.market_size) updates.push({ key: 'market_size', value: mp.market_size });
    }

    // products_services
    if (rd.products_services) {
      const ps = rd.products_services;
      if (ps.products?.length) updates.push({ key: 'products', value: ps.products });
      if (ps.key_features?.length) updates.push({ key: 'key_features', value: ps.key_features });
      if (ps.use_cases?.length) updates.push({ key: 'use_cases', value: ps.use_cases });
      if (ps.pricing_model) updates.push({ key: 'pricing_model', value: ps.pricing_model });
    }

    // team_leadership
    if (rd.team_leadership) {
      const tl = rd.team_leadership;
      if (tl.key_people?.length) updates.push({ key: 'key_people', value: tl.key_people });
      if (tl.employee_count) updates.push({ key: 'employee_count', value: tl.employee_count });
      if (tl.employee_range) updates.push({ key: 'employee_range', value: tl.employee_range });
      if (tl.departments?.length) updates.push({ key: 'departments', value: tl.departments });
    }

    // financials
    if (rd.financials) {
      const fi = rd.financials;
      if (fi.revenue_range) updates.push({ key: 'revenue_range', value: fi.revenue_range });
      if (fi.funding_status) updates.push({ key: 'funding_status', value: fi.funding_status });
      if (fi.total_raised) updates.push({ key: 'total_raised', value: fi.total_raised });
      if (fi.investors?.length) updates.push({ key: 'investors', value: fi.investors });
    }

    // technology
    if (rd.technology) {
      const te = rd.technology;
      if (te.tech_stack?.length) updates.push({ key: 'tech_stack', value: te.tech_stack });
      if (te.platforms?.length) updates.push({ key: 'platforms', value: te.platforms });
      if (te.integrations?.length) updates.push({ key: 'integrations', value: te.integrations });
    }

    // ideal_customer_indicators
    if (rd.ideal_customer_indicators) {
      const ic = rd.ideal_customer_indicators;
      if (ic.target_industries?.length) updates.push({ key: 'target_industries', value: ic.target_industries });
      if (ic.target_roles?.length) updates.push({ key: 'target_roles', value: ic.target_roles });
      if (ic.pain_points?.length) updates.push({ key: 'pain_points', value: ic.pain_points });
      if (ic.value_propositions?.length) updates.push({ key: 'value_propositions', value: ic.value_propositions });
      if (ic.buying_signals?.length) updates.push({ key: 'buying_signals', value: ic.buying_signals });
    }

    // Upsert each context key
    let synced = 0;
    for (const update of updates) {
      const { error } = await supabase.rpc('upsert_organization_context', {
        p_org_id: orgId,
        p_key: update.key,
        p_value: JSON.stringify(update.value),
        p_source: 'enrichment',
        p_confidence: 0.85,
      });
      if (!error) synced++;
    }

    return { synced };
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
