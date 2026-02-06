/**
 * OrgContext - Multi-Tenant Organization Context Provider
 *
 * Provides organization context to the application, integrating with
 * AuthContext for automatic organization loading on authentication.
 *
 * Features:
 * - Auto-loads organizations when user authenticates
 * - Provides activeOrgId, activeOrg, and organizations list
 * - Permission helpers for team/settings management
 * - Organization switching capability
 * - Session-level org override support
 */

import React, { createContext, useContext, useEffect, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import {
  useOrgStore,
  useActiveOrgId,
  useActiveOrg,
  useActiveOrgRole,
  useHasOrgRole,
  type Organization,
  type OrganizationMembership
} from '@/lib/stores/orgStore';
import { supabase } from '@/lib/supabase/clientV2';
import { isMultiTenantEnabled } from '@/lib/utils/featureFlags';
import { invalidateAllOrgQueries } from '@/lib/utils/orgQueryUtils';
import logger from '@/lib/utils/logger';

// =====================================================
// Types
// =====================================================

export type OrgRole = 'owner' | 'admin' | 'member' | 'readonly';

export interface OrgPermissions {
  canManageTeam: boolean;      // Can invite/remove members, change roles
  canManageSettings: boolean;  // Can edit org settings
  canManageData: boolean;      // Can write data (not readonly)
  canDeleteOrg: boolean;       // Can delete organization (owner only)
  isOwner: boolean;            // Is organization owner
  isAdmin: boolean;            // Is owner or admin
}

export interface OrgContextType {
  // State
  activeOrgId: string | null;
  activeOrg: Organization | null;
  organizations: Organization[];
  memberships: OrganizationMembership[];
  userRole: OrgRole | null;
  isLoading: boolean;
  error: string | null;
  isMultiTenant: boolean;

  // Permissions
  permissions: OrgPermissions;

  // Actions
  switchOrg: (orgId: string) => Promise<void>;
  refreshOrgs: () => Promise<void>;
  createOrg: (name: string) => Promise<Organization | null>;
  setSessionOrg: (orgId: string) => Promise<void>;

  // Utilities
  isOrgMember: (orgId: string) => boolean;
  getRoleInOrg: (orgId: string) => OrgRole | null;
}

// =====================================================
// Context
// =====================================================

const OrgContext = createContext<OrgContextType | undefined>(undefined);

// =====================================================
// Custom Hook
// =====================================================

export function useOrg(): OrgContextType {
  const context = useContext(OrgContext);
  if (context === undefined) {
    throw new Error('useOrg must be used within an OrgProvider');
  }
  return context;
}

// Convenience hooks for common use cases
export function useOrgId(): string | null {
  const context = useContext(OrgContext);
  return context?.activeOrgId ?? null;
}

export function useOrgPermissions(): OrgPermissions {
  const context = useContext(OrgContext);
  return context?.permissions ?? {
    canManageTeam: false,
    canManageSettings: false,
    canManageData: false,
    canDeleteOrg: false,
    isOwner: false,
    isAdmin: false,
  };
}

// =====================================================
// Provider Component
// =====================================================

interface OrgProviderProps {
  children: React.ReactNode;
}

export function OrgProvider({ children }: OrgProviderProps) {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  // Get store state with selectors to avoid re-renders on unrelated state changes
  const organizations = useOrgStore((state) => state.organizations);
  const memberships = useOrgStore((state) => state.memberships);
  const isLoading = useOrgStore((state) => state.isLoading);
  const error = useOrgStore((state) => state.error);
  const getUserRole = useOrgStore((state) => state.getUserRole);
  const isOrgMember = useOrgStore((state) => state.isOrgMember);

  // Get actions using getState() to avoid reference changes causing effect re-runs
  // These functions are stable and don't need to be in dependency arrays
  const storeActions = useOrgStore.getState();

  // Use hooks for reactive values
  const activeOrgId = useActiveOrgId();
  const activeOrg = useActiveOrg();
  const persistedOrgRole = useActiveOrgRole();

  // Check if multi-tenant is enabled
  const isMultiTenant = isMultiTenantEnabled();

  // Get user's role in active org
  // Uses persisted role for immediate access, falls back to computed role when memberships are loaded
  const userRole = useMemo(() => {
    // First try persisted role (for fast initial render)
    if (persistedOrgRole) return persistedOrgRole;
    // Fall back to computed role from memberships
    if (!activeOrgId) return null;
    return getUserRole(activeOrgId);
  }, [activeOrgId, getUserRole, persistedOrgRole]);

  // Calculate permissions based on role
  const permissions = useMemo((): OrgPermissions => {
    if (!userRole) {
      return {
        canManageTeam: false,
        canManageSettings: false,
        canManageData: false,
        canDeleteOrg: false,
        isOwner: false,
        isAdmin: false,
      };
    }

    const roleHierarchy: Record<OrgRole, number> = {
      owner: 4,
      admin: 3,
      member: 2,
      readonly: 1,
    };

    const roleLevel = roleHierarchy[userRole];

    return {
      canManageTeam: roleLevel >= roleHierarchy.admin,       // admin, owner
      canManageSettings: roleLevel >= roleHierarchy.admin,   // admin, owner
      canManageData: roleLevel >= roleHierarchy.member,      // member, admin, owner
      canDeleteOrg: userRole === 'owner',                    // owner only
      isOwner: userRole === 'owner',
      isAdmin: roleLevel >= roleHierarchy.admin,
    };
  }, [userRole]);

  // Load organizations when user authenticates
  // Use user?.id instead of user object to prevent effect from re-running
  // when user object reference changes but ID stays the same
  // Use storeActions.loadOrganizations/clear which are stable references
  useEffect(() => {
    if (authLoading) return;

    if (isAuthenticated && user) {
      logger.log('[OrgContext] User authenticated, loading organizations');
      storeActions.loadOrganizations();
    } else {
      logger.log('[OrgContext] User not authenticated, clearing org store');
      storeActions.clear();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.id, authLoading]);

  // Set up realtime subscriptions to organization changes
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    const unsubscribe = storeActions.subscribeToOrgChanges(user.id);

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.id]);

  // Check if active org is inactive and redirect to inactive page
  useEffect(() => {
    if (!activeOrg || !activeOrgId) return;

    // Prevent redirect loop when already on inactive organization page
    if (window.location.pathname.includes('/inactive-organization')) return;

    // If org is inactive, redirect immediately
    if (activeOrg.is_active === false) {
      logger.log('[OrgContext] Active org is inactive, redirecting to inactive page');
      window.location.href = '/inactive-organization';
    }
  }, [activeOrg, activeOrgId]);

  // Switch to a different organization
  const switchOrg = useCallback(async (orgId: string) => {
    logger.log('[OrgContext] Switching to org:', orgId);

    // Validate user has access to this org
    if (!isOrgMember(orgId)) {
      logger.error('[OrgContext] Cannot switch to org - not a member:', orgId);
      return;
    }

    // Check if org is active before allowing switch
    const org = organizations.find((o) => o.id === orgId);
    if (org && org.is_active === false) {
      logger.warn('[OrgContext] Attempting to switch to inactive org - redirecting to inactive page');
      // Set as active org (needed for inactive page to display org data)
      storeActions.setActiveOrg(orgId);
      // Redirect to inactive page
      window.location.href = '/inactive-organization';
      return;
    }

    // Only switch if org is active
    storeActions.setActiveOrg(orgId);

    // Invalidate all org-scoped queries to refetch with new RLS context
    logger.log('[OrgContext] Invalidating all org queries for cache refresh');
    invalidateAllOrgQueries(queryClient);
  }, [isOrgMember, organizations, queryClient, storeActions]);

  // Refresh organizations from server
  const refreshOrgs = useCallback(async () => {
    logger.log('[OrgContext] Refreshing organizations');
    await storeActions.loadOrganizations();
  }, [storeActions]);

  // Create a new organization
  const createOrg = useCallback(async (name: string): Promise<Organization | null> => {
    logger.log('[OrgContext] Creating organization:', name);
    return storeActions.createOrganization(name);
  }, [storeActions]);

  // Set session-level org override (for database queries)
  // Note: With Supabase, RLS uses auth.uid() directly through organization_memberships
  // This function is kept for compatibility but org switching is handled via the store
  const setSessionOrg = useCallback(async (orgId: string) => {
    logger.log('[OrgContext] Session org set request:', orgId);
    // The actual org filtering happens through RLS policies that check
    // organization_memberships based on auth.uid() - no session variable needed
    // Org switching is already handled by setActiveOrg in the store
  }, []);

  // Get role in a specific org
  const getRoleInOrg = useCallback((orgId: string): OrgRole | null => {
    return getUserRole(orgId);
  }, [getUserRole]);

  // Context value
  const value = useMemo((): OrgContextType => ({
    // State
    activeOrgId,
    activeOrg,
    organizations,
    memberships,
    userRole,
    isLoading,
    error,
    isMultiTenant,

    // Permissions
    permissions,

    // Actions
    switchOrg,
    refreshOrgs,
    createOrg,
    setSessionOrg,

    // Utilities
    isOrgMember,
    getRoleInOrg,
  }), [
    activeOrgId,
    activeOrg,
    organizations,
    memberships,
    userRole,
    isLoading,
    error,
    isMultiTenant,
    permissions,
    switchOrg,
    refreshOrgs,
    createOrg,
    setSessionOrg,
    isOrgMember,
    getRoleInOrg,
  ]);

  return (
    <OrgContext.Provider value={value}>
      {children}
    </OrgContext.Provider>
  );
}

// =====================================================
// Export Types
// =====================================================

export type { Organization, OrganizationMembership };
