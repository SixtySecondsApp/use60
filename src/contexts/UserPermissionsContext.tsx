/**
 * UserPermissionsContext - Unified Permission Management
 *
 * Provides user type detection (internal vs external) and feature access control.
 * Integrates with AuthContext for user email and OrgContext for organization roles.
 *
 * Features:
 * - Email domain-based user type detection (internal = @sixtyseconds.video)
 * - 3-Tier Permission System:
 *   - Tier 1: User (all authenticated users) - personal preferences
 *   - Tier 2: Org Admin (org owners/admins) - team/org management
 *   - Tier 3: Platform Admin (internal + is_admin) - system configuration
 * - Feature access flags based on user type
 * - "View as External" toggle for platform admins to preview customer experience
 * - Route access control helpers
 */

import React, {
  createContext,
  useContext,
  useMemo,
  useCallback,
  useState,
  useEffect,
} from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrg, type OrgRole } from '@/lib/contexts/OrgContext';
import { useUser } from '@/lib/hooks/useUser';
import {
  type UserType,
  type FeatureAccess,
  type ViewModeState,
} from '@/lib/types/userTypes';
import {
  getUserTypeFromEmail,
  getFeatureAccess,
  isRouteAllowed,
  getUnauthorizedRedirect,
  loadInternalUsers,
} from '@/lib/utils/userTypeUtils';
import { isUserAdmin } from '@/lib/utils/adminUtils';
import {
  type PermissionTier,
  type TierPermissions,
} from '@/lib/types/permissionTypes';
import {
  isPlatformAdmin as checkIsPlatformAdmin,
  isOrgAdmin as checkIsOrgAdmin,
  isOrgOwner as checkIsOrgOwner,
  getPermissionTier,
  hasMinimumTier,
  buildTierPermissions,
} from '@/lib/utils/permissionUtils';

// =====================================================
// Types
// =====================================================

interface UserPermissionsContextType {
  // Loading state - true until internal users whitelist is loaded
  isLoading: boolean;

  // User type
  userType: UserType;
  isInternal: boolean;
  isExternal: boolean;

  // View mode (for "view as external" toggle)
  viewMode: ViewModeState;
  isViewingAsExternal: boolean;
  effectiveUserType: UserType;

  // Feature access
  featureAccess: FeatureAccess;

  // Admin status (legacy)
  isAdmin: boolean;

  // Org role
  orgRole: OrgRole | null;

  // 3-Tier Permission System
  permissionTier: PermissionTier;
  tierPermissions: TierPermissions;
  isPlatformAdmin: boolean;
  isOrgAdmin: boolean;
  isOrgOwner: boolean;

  // Actions
  toggleExternalView: () => void;
  exitExternalView: () => void;

  // Utilities
  canAccessRoute: (pathname: string) => boolean;
  canAccessFeature: (feature: keyof FeatureAccess) => boolean;
  getRedirectForUnauthorized: () => string;
  hasMinimumTier: (requiredTier: PermissionTier) => boolean;
}

// =====================================================
// Context
// =====================================================

const UserPermissionsContext = createContext<UserPermissionsContextType | undefined>(undefined);

// Session storage key for view mode persistence
const EXTERNAL_VIEW_STORAGE_KEY = 'sixty_external_view_mode';

// =====================================================
// Provider Component
// =====================================================

interface UserPermissionsProviderProps {
  children: React.ReactNode;
}

export function UserPermissionsProvider({ children }: UserPermissionsProviderProps) {
  const { user } = useAuth();
  const { userData, isLoading: isUserLoading } = useUser();
  const { userRole } = useOrg();

  // Track when internal users whitelist is loaded
  const [usersLoaded, setUsersLoaded] = useState(false);

  // Load internal users whitelist from database on mount
  useEffect(() => {
    loadInternalUsers()
      .then(() => setUsersLoaded(true))
      .catch(console.error);
  }, []);

  // Determine actual user type from email
  // Re-evaluate when internal users whitelist is loaded
  const actualUserType = useMemo(() => {
    return getUserTypeFromEmail(user?.email);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email, usersLoaded]);

  // View mode state - persisted in session storage
  const [isExternalViewActive, setIsExternalViewActive] = useState(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem(EXTERNAL_VIEW_STORAGE_KEY) === 'true';
  });

  // Only internal users can toggle view mode
  // Reset external view if user becomes external
  // IMPORTANT: Wait for internal users whitelist to load before resetting,
  // otherwise the user is temporarily classified as 'external' during load
  // which wipes the sessionStorage-persisted view mode on page refresh.
  useEffect(() => {
    if (usersLoaded && actualUserType === 'external') {
      setIsExternalViewActive(false);
      sessionStorage.removeItem(EXTERNAL_VIEW_STORAGE_KEY);
    }
  }, [actualUserType, usersLoaded]);

  // Persist view mode to session storage
  useEffect(() => {
    if (isExternalViewActive) {
      sessionStorage.setItem(EXTERNAL_VIEW_STORAGE_KEY, 'true');
    } else {
      sessionStorage.removeItem(EXTERNAL_VIEW_STORAGE_KEY);
    }
  }, [isExternalViewActive]);

  // Calculate effective user type (considers view toggle)
  const effectiveUserType = useMemo(() => {
    if (actualUserType === 'internal' && isExternalViewActive) {
      return 'external';
    }
    return actualUserType;
  }, [actualUserType, isExternalViewActive]);

  // Build view mode state
  const viewMode: ViewModeState = useMemo(
    () => ({
      isExternalViewActive: actualUserType === 'internal' ? isExternalViewActive : false,
      actualUserType,
      effectiveUserType,
    }),
    [actualUserType, isExternalViewActive, effectiveUserType]
  );

  // Check if user is admin (from profiles table)
  // Must use userData from useUser() which contains the profile with is_admin flag
  const isAdmin = useMemo(() => {
    return isUserAdmin(userData);
  }, [userData]);

  // =====================================================
  // 3-Tier Permission System
  // =====================================================

  // Calculate if user is internal
  const isInternalUser = actualUserType === 'internal';

  // Calculate permission tier flags
  const _isPlatformAdmin = useMemo(() => {
    return checkIsPlatformAdmin(isInternalUser, isAdmin);
  }, [isInternalUser, isAdmin]);

  const _isOrgAdmin = useMemo(() => {
    return checkIsOrgAdmin(userRole);
  }, [userRole]);

  const _isOrgOwner = useMemo(() => {
    return checkIsOrgOwner(userRole);
  }, [userRole]);

  // Calculate permission tier
  const permissionTier = useMemo(() => {
    return getPermissionTier(isInternalUser, isAdmin, userRole);
  }, [isInternalUser, isAdmin, userRole]);

  // Build tier permissions object
  const tierPermissions = useMemo(() => {
    return buildTierPermissions(isInternalUser, isAdmin, userRole);
  }, [isInternalUser, isAdmin, userRole]);

  // Helper to check minimum tier
  const checkHasMinimumTier = useCallback(
    (requiredTier: PermissionTier) => {
      return hasMinimumTier(permissionTier, requiredTier);
    },
    [permissionTier]
  );

  // =====================================================
  // End 3-Tier Permission System
  // =====================================================

  // Calculate feature access
  const featureAccess = useMemo(() => {
    return getFeatureAccess(actualUserType, viewMode, isAdmin);
  }, [actualUserType, viewMode, isAdmin]);

  // Toggle external view mode (only for platform admins)
  const toggleExternalView = useCallback(() => {
    // Only Platform Admins can use "view as external"
    if (_isPlatformAdmin) {
      setIsExternalViewActive((prev) => !prev);
    }
  }, [_isPlatformAdmin]);

  // Exit external view mode
  const exitExternalView = useCallback(() => {
    setIsExternalViewActive(false);
  }, []);

  // Check if a specific route is accessible
  const canAccessRoute = useCallback(
    (pathname: string) => {
      return isRouteAllowed(pathname, effectiveUserType, isAdmin);
    },
    [effectiveUserType, isAdmin]
  );

  // Check if a specific feature is accessible
  const canAccessFeature = useCallback(
    (feature: keyof FeatureAccess) => {
      return featureAccess[feature];
    },
    [featureAccess]
  );

  // Get redirect route for unauthorized access
  const getRedirectForUnauthorized = useCallback(() => {
    return getUnauthorizedRedirect(effectiveUserType);
  }, [effectiveUserType]);

  // Build context value
  const value: UserPermissionsContextType = useMemo(
    () => ({
      // Loading state - permissions are loading until BOTH:
      // 1. Internal users whitelist is loaded
      // 2. User profile data is loaded (needed for is_admin flag)
      isLoading: !usersLoaded || isUserLoading,

      // User type
      userType: actualUserType,
      isInternal: actualUserType === 'internal',
      isExternal: actualUserType === 'external',

      // View mode
      viewMode,
      isViewingAsExternal: viewMode.isExternalViewActive,
      effectiveUserType,

      // Feature access
      featureAccess,

      // Admin status (legacy)
      isAdmin,

      // Org role
      orgRole: userRole,

      // 3-Tier Permission System
      permissionTier,
      tierPermissions,
      isPlatformAdmin: _isPlatformAdmin,
      isOrgAdmin: _isOrgAdmin,
      isOrgOwner: _isOrgOwner,

      // Actions
      toggleExternalView,
      exitExternalView,

      // Utilities
      canAccessRoute,
      canAccessFeature,
      getRedirectForUnauthorized,
      hasMinimumTier: checkHasMinimumTier,
    }),
    [
      usersLoaded,
      isUserLoading,
      actualUserType,
      viewMode,
      effectiveUserType,
      featureAccess,
      isAdmin,
      userRole,
      permissionTier,
      tierPermissions,
      _isPlatformAdmin,
      _isOrgAdmin,
      _isOrgOwner,
      toggleExternalView,
      exitExternalView,
      canAccessRoute,
      canAccessFeature,
      getRedirectForUnauthorized,
      checkHasMinimumTier,
    ]
  );

  return (
    <UserPermissionsContext.Provider value={value}>
      {children}
    </UserPermissionsContext.Provider>
  );
}

// =====================================================
// Custom Hooks
// =====================================================

/**
 * Main hook to access user permissions context
 */
export function useUserPermissions(): UserPermissionsContextType {
  const context = useContext(UserPermissionsContext);
  if (context === undefined) {
    throw new Error('useUserPermissions must be used within UserPermissionsProvider');
  }
  return context;
}

/**
 * Get the actual user type (internal/external based on email)
 */
export function useUserType(): UserType {
  return useUserPermissions().userType;
}

/**
 * Get the effective user type (considers "view as external" toggle)
 */
export function useEffectiveUserType(): UserType {
  return useUserPermissions().effectiveUserType;
}

/**
 * Check if user is internal
 */
export function useIsInternal(): boolean {
  return useUserPermissions().isInternal;
}

/**
 * Check if user is external
 */
export function useIsExternal(): boolean {
  return useUserPermissions().isExternal;
}

/**
 * Get feature access flags
 */
export function useFeatureAccess(): FeatureAccess {
  return useUserPermissions().featureAccess;
}

/**
 * Check if a specific feature is accessible
 */
export function useCanAccessFeature(feature: keyof FeatureAccess): boolean {
  return useUserPermissions().featureAccess[feature];
}

/**
 * Check if external view mode is active (internal user viewing as external)
 */
export function useIsViewingAsExternal(): boolean {
  return useUserPermissions().isViewingAsExternal;
}

/**
 * Get toggle function for external view mode
 */
export function useToggleExternalView(): () => void {
  return useUserPermissions().toggleExternalView;
}

/**
 * Check if user can access a specific route
 */
export function useCanAccessRoute(pathname: string): boolean {
  return useUserPermissions().canAccessRoute(pathname);
}

/**
 * Check if permissions are still loading (internal users whitelist not yet loaded)
 */
export function usePermissionsLoading(): boolean {
  return useUserPermissions().isLoading;
}

// =====================================================
// 3-Tier Permission Hooks
// =====================================================

/**
 * Get the user's permission tier (user, orgAdmin, or platformAdmin)
 */
export function usePermissionTier(): PermissionTier {
  return useUserPermissions().permissionTier;
}

/**
 * Get the full tier permissions object
 */
export function useTierPermissions(): TierPermissions {
  return useUserPermissions().tierPermissions;
}

/**
 * Check if user is a Platform Admin (internal + is_admin)
 * Platform Admins have access to all system configuration
 */
export function useIsPlatformAdmin(): boolean {
  return useUserPermissions().isPlatformAdmin;
}

/**
 * Check if user is an Org Admin (owner or admin role in their org)
 * Org Admins can manage their team and org settings
 */
export function useIsOrgAdmin(): boolean {
  return useUserPermissions().isOrgAdmin;
}

/**
 * Check if user is the Org Owner
 * Owners have additional privileges like billing management
 */
export function useIsOrgOwner(): boolean {
  return useUserPermissions().isOrgOwner;
}

/**
 * Check if user has at least the required permission tier
 *
 * @example
 * const canAccess = useHasMinimumTier('orgAdmin');
 * // Returns true for orgAdmin and platformAdmin users
 */
export function useHasMinimumTier(requiredTier: PermissionTier): boolean {
  return useUserPermissions().hasMinimumTier(requiredTier);
}

/**
 * Check if user can access platform admin features
 * Alias for useIsPlatformAdmin for semantic clarity
 */
export function useCanAccessPlatformAdmin(): boolean {
  return useUserPermissions().tierPermissions.canAccessPlatformAdmin;
}

/**
 * Check if user can manage their organization's team
 */
export function useCanManageTeam(): boolean {
  return useUserPermissions().tierPermissions.canManageTeam;
}

/**
 * Check if user can manage organization branding
 */
export function useCanManageOrgBranding(): boolean {
  return useUserPermissions().tierPermissions.canManageOrgBranding;
}

/**
 * Check if user can view as external (preview customer experience)
 */
export function useCanViewAsExternal(): boolean {
  return useUserPermissions().tierPermissions.canViewAsExternal;
}
