/**
 * Organization Store
 * 
 * Manages the active organization (tenant) for the current user session.
 * Provides organization switching, membership management, and org-aware utilities.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/lib/supabase/clientV2';
import { isMultiTenantEnabled, getDefaultOrgId } from '@/lib/utils/featureFlags';
import logger from '@/lib/utils/logger';

export interface Organization {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  is_active: boolean;

  // Organization branding
  logo_url?: string | null;
  remove_logo?: boolean;

  // Deactivation audit fields
  deactivated_at?: string | null;
  deactivated_by?: string | null;
  deactivation_reason?: string | null;

  // Org-level preferences / enrichment (nullable in DB, optional here for backwards compatibility)
  currency_code?: string | null;
  currency_locale?: string | null;
  company_domain?: string | null;
  company_website?: string | null;
  company_country_code?: string | null;
  company_timezone?: string | null;
  company_industry?: string | null;
  company_size?: string | null;
  company_bio?: string | null;
  company_linkedin_url?: string | null;
  company_enrichment_status?: 'not_started' | 'pending' | 'completed' | 'failed' | string | null;
  company_enriched_at?: string | null;
  company_enrichment_confidence?: number | null;
  company_enrichment_raw?: any | null;
}

export interface OrganizationMembership {
  org_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member' | 'readonly';
  created_at: string;
  updated_at: string;
  organization?: Organization;
}

interface OrgStore {
  // State
  activeOrgId: string | null;
  activeOrgRole: 'owner' | 'admin' | 'member' | 'readonly' | null; // Persisted role for quick access
  organizations: Organization[];
  memberships: OrganizationMembership[];
  isLoading: boolean;
  error: string | null;

  // Actions
  setActiveOrg: (orgId: string | null) => void;
  loadOrganizations: () => Promise<void>;
  refreshOrganizations: () => Promise<void>;
  createOrganization: (name: string) => Promise<Organization | null>;
  getActiveOrg: () => Organization | null;
  getUserRole: (orgId: string) => 'owner' | 'admin' | 'member' | 'readonly' | null;
  getActiveOrgRole: () => 'owner' | 'admin' | 'member' | 'readonly' | null;
  isOrgMember: (orgId: string) => boolean;
  clear: () => void;
}

export const useOrgStore = create<OrgStore>()(
  persist(
    (set, get) => ({
      // Initial state
      activeOrgId: null,
      activeOrgRole: null,
      organizations: [],
      memberships: [],
      isLoading: false,
      error: null,

      /**
       * Set the active organization
       */
      setActiveOrg: (orgId: string | null) => {
        logger.log('[OrgStore] Setting active org:', orgId);
        // Also update the cached role for this org
        const { memberships } = get();
        const membership = memberships.find((m) => m.org_id === orgId);
        const role = membership?.role || null;
        set({ activeOrgId: orgId, activeOrgRole: role });
      },

      /**
       * Load organizations and memberships for the current user
       */
      loadOrganizations: async () => {
        const { isLoading } = get();
        if (isLoading) return; // Prevent concurrent loads

        set({ isLoading: true, error: null });

        try {
          // If multi-tenant is disabled, we don't need organizations table
          if (!isMultiTenantEnabled()) {
            const defaultOrgId = getDefaultOrgId();
            if (defaultOrgId) {
              // Use the default org ID without querying the table
              logger.log('[OrgStore] Multi-tenant disabled, using default org ID:', defaultOrgId);
              set({
                activeOrgId: defaultOrgId,
                activeOrgRole: null, // No role in single-tenant mode
                organizations: [],
                memberships: [],
                isLoading: false,
                error: null,
              });
              return;
            }

            // No default org configured and multi-tenant is disabled
            // Use a placeholder/null orgId - the app should work without it
            logger.log('[OrgStore] Multi-tenant disabled, no default org configured - using null orgId');
            set({
              activeOrgId: null,
              activeOrgRole: null,
              organizations: [],
              memberships: [],
              isLoading: false,
              error: null,
            });
            return;
          }

          // Multi-tenant enabled: fetch user's memberships
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) {
            set({ isLoading: false, error: 'User not authenticated' });
            return;
          }

          // Fetch memberships with organization details
          // Try with member_status filter first (for ORGREM-016 support)
          let memberships: any[] = [];
          let membershipsError: any = null;

          // Try to query with member_status filter (only active memberships)
          const { data: dataWithStatus, error: errorWithStatus } = await (supabase as any)
            .from('organization_memberships')
            .select(`
              *,
              organization:organizations(*)
            `)
            .eq('user_id', user.id)
            .eq('member_status', 'active')
            .order('created_at', { ascending: true });

          if (!errorWithStatus) {
            // member_status column exists and query succeeded
            memberships = dataWithStatus || [];
          } else if (errorWithStatus?.code === '42703' || errorWithStatus?.code === '400') {
            // Column doesn't exist (42703 = column doesn't exist, 400 = bad request)
            // Fall back to fetching all memberships (assume all are active)
            logger.log('[OrgStore] member_status column not available, falling back to basic query');
            const { data: basicData, error: basicError } = await (supabase as any)
              .from('organization_memberships')
              .select(`
                *,
                organization:organizations(*)
              `)
              .eq('user_id', user.id)
              .order('created_at', { ascending: true });

            if (basicError) {
              membershipsError = basicError;
            } else {
              memberships = basicData || [];
            }
          } else {
            membershipsError = errorWithStatus;
          }

          if (membershipsError) throw membershipsError;

          const orgMemberships: OrganizationMembership[] = (memberships || []).map((m: any) => ({
            org_id: m.org_id,
            user_id: m.user_id,
            role: m.role,
            created_at: m.created_at,
            updated_at: m.updated_at,
            organization: m.organization,
          }));

          const orgs: Organization[] = orgMemberships
            .map((m) => m.organization)
            .filter((org): org is Organization => org !== undefined);

          // Choose active org (priority order):
          // 1) persisted activeOrgId if valid
          // 2) VITE_DEFAULT_ORG_ID if it exists in memberships
          // 3) org with name matching "Sixty Seconds" (case-insensitive) with most meetings
          // 4) org with most meetings (fallback)
          // 5) first org
          let activeOrgId = get().activeOrgId;

          const isValidPersisted = !!activeOrgId && orgs.some((o) => o.id === activeOrgId);
          if (!isValidPersisted) activeOrgId = null;

          const envDefaultOrgId = getDefaultOrgId();
          if (!activeOrgId && envDefaultOrgId && orgs.some((o) => o.id === envDefaultOrgId)) {
            activeOrgId = envDefaultOrgId;
          }

          if (!activeOrgId && orgs.length > 1) {
            // Count meetings per org (lightweight: head:true)
            // Prefer orgs with transcripts since Meeting Intelligence relies on transcript data.
            const counts = await Promise.all(
              orgs.map(async (org) => {
                try {
                  const { count } = await (supabase as any)
                    .from('meetings')
                    .select('id', { count: 'exact', head: true })
                    .eq('org_id', org.id)
                    .or('transcript.not.is.null,transcript_text.not.is.null');
                  return { orgId: org.id, orgName: org.name, count: count ?? 0 };
                } catch (e) {
                  return { orgId: org.id, orgName: org.name, count: 0 };
                }
              })
            );

            const isSixtySeconds = (name: string) => /sixty\s*seconds/i.test(name);
            const sixtySecondsOrgs = counts.filter((c) => isSixtySeconds(c.orgName));

            const pickMax = (arr: typeof counts) =>
              arr.reduce<{ orgId: string; orgName: string; count: number } | null>((best, cur) => {
                if (!best) return cur;
                if (cur.count > best.count) return cur;
                return best;
              }, null);

            const bestSixty = pickMax(sixtySecondsOrgs);
            const bestAny = pickMax(counts);

            activeOrgId = bestSixty?.orgId || bestAny?.orgId || null;
          }

          if (!activeOrgId) {
            activeOrgId = orgs[0]?.id || null;
          }

          // Get role for active org
          const activeMembership = orgMemberships.find((m) => m.org_id === activeOrgId);
          const activeOrgRole = activeMembership?.role || null;

          set({
            activeOrgId,
            activeOrgRole,
            organizations: orgs,
            memberships: orgMemberships,
            isLoading: false,
            error: null,
          });

          logger.log('[OrgStore] Loaded organizations:', {
            count: orgs.length,
            activeOrgId,
          });
        } catch (error: any) {
          logger.error('[OrgStore] Error loading organizations:', error);
          set({
            isLoading: false,
            error: error.message || 'Failed to load organizations',
          });
        }
      },

      /**
       * Refresh organizations (reload from server)
       */
      refreshOrganizations: async () => {
        await get().loadOrganizations();
      },

      /**
       * Create a new organization
       */
      createOrganization: async (name: string): Promise<Organization | null> => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) {
            throw new Error('User not authenticated');
          }

          // Create organization
          const { data: org, error: orgError } = await (supabase as any)
            .from('organizations')
            .insert({
              name: name.trim(),
              created_by: user.id,
              is_active: true,
            })
            .select()
            .single();

          if (orgError) throw orgError;

          // Create membership as owner
          const { error: membershipError } = await (supabase as any)
            .from('organization_memberships')
            .insert({
              org_id: (org as any).id,
              user_id: user.id,
              role: 'owner',
            });

          if (membershipError) throw membershipError;

          // Refresh organizations
          await get().refreshOrganizations();

          // Set as active org
          get().setActiveOrg((org as any).id);

          logger.log('[OrgStore] Created organization:', (org as any).id);
          return org as any;
        } catch (error: any) {
          logger.error('[OrgStore] Error creating organization:', error);
          set({ error: error.message || 'Failed to create organization' });
          return null;
        }
      },

      /**
       * Get the active organization
       */
      getActiveOrg: (): Organization | null => {
        const { activeOrgId, organizations } = get();
        if (!activeOrgId) return null;
        return organizations.find((o) => o.id === activeOrgId) || null;
      },

      /**
       * Get user's role in an organization
       */
      getUserRole: (orgId: string): 'owner' | 'admin' | 'member' | 'readonly' | null => {
        const { memberships } = get();
        const membership = memberships.find((m) => m.org_id === orgId);
        return membership?.role || null;
      },

      /**
       * Get user's role in the active organization (uses cached value for fast access)
       */
      getActiveOrgRole: (): 'owner' | 'admin' | 'member' | 'readonly' | null => {
        const { activeOrgRole, activeOrgId, memberships } = get();
        // First try to use cached role (persisted)
        if (activeOrgRole) return activeOrgRole;
        // Fallback to looking up from memberships if loaded
        if (activeOrgId && memberships.length > 0) {
          const membership = memberships.find((m) => m.org_id === activeOrgId);
          return membership?.role || null;
        }
        return null;
      },

      /**
       * Check if user is a member of an organization
       */
      isOrgMember: (orgId: string): boolean => {
        return get().getUserRole(orgId) !== null;
      },

      /**
       * Clear all organization data
       */
      clear: () => {
        set({
          activeOrgId: null,
          activeOrgRole: null,
          organizations: [],
          memberships: [],
          isLoading: false,
          error: null,
        });
      },
    }),
    {
      name: 'org-store', // localStorage key
      partialize: (state) => ({
        activeOrgId: state.activeOrgId,
        activeOrgRole: state.activeOrgRole, // Also persist role for quick access
      }),
    }
  )
);

/**
 * Hook to get the active organization ID
 * Returns the active org ID or null, with fallback for single-tenant mode
 */
export function useActiveOrgId(): string | null {
  // Use selectors to avoid re-renders when unrelated store state changes
  const activeOrgId = useOrgStore((state) => state.activeOrgId);
  const firstOrgId = useOrgStore((state) => state.organizations[0]?.id ?? null);

  // If multi-tenant is disabled, return default or first org
  if (!isMultiTenantEnabled()) {
    const defaultOrgId = getDefaultOrgId();
    if (defaultOrgId) return defaultOrgId;

    // Use the selected first org ID instead of calling getActiveOrg()
    return firstOrgId;
  }

  return activeOrgId;
}

/**
 * Hook to get the active organization
 */
export function useActiveOrg(): Organization | null {
  return useOrgStore((state) => state.getActiveOrg());
}

/**
 * Hook to get the active organization role (persisted for fast access)
 */
export function useActiveOrgRole(): 'owner' | 'admin' | 'member' | 'readonly' | null {
  return useOrgStore((state) => state.getActiveOrgRole());
}

/**
 * Hook to check if user has a specific role in the active org
 */
export function useHasOrgRole(
  role: 'owner' | 'admin' | 'member' | 'readonly'
): boolean {
  const activeOrgId = useActiveOrgId();
  const getUserRole = useOrgStore((state) => state.getUserRole);

  if (!activeOrgId) return false;

  const userRole = getUserRole(activeOrgId);
  if (!userRole) return false;

  // Role hierarchy: owner > admin > member > readonly
  const roleHierarchy: Record<'owner' | 'admin' | 'member' | 'readonly', number> = {
    owner: 4,
    admin: 3,
    member: 2,
    readonly: 1,
  };

  return roleHierarchy[userRole] >= roleHierarchy[role];
}












