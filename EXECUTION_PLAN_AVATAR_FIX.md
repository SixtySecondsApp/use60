# Avatar Visibility Fix - Execution Plan

## Overview

This plan addresses the missing `avatar_url` column in queries across 3 key services, causing avatars to not display in member lists throughout the application. The fix is isolated, low-risk, and requires minimal code changes.

**Feature**: profile-pictures-visibility
**Investigation Finding**: avatar_url column missing from queries in organizationAdminService, useOrgMembers hook, and TeamMembersPage
**Risk Level**: LOW
**Total Estimated Time**: 70 minutes (1 hour 10 minutes)

---

## Architecture Context

The application has a Service Locator pattern with multiple layers:

```
React Components (UI Layer)
    ↓
Services (organizationAdminService, useOrgMembers)
    ↓
Supabase Queries (PostgreSQL with RLS)
    ↓
Profiles Table (contains avatar_url column)
```

The avatar_url column already exists in the `profiles` table (baseline schema), but is not being selected in three critical query locations.

---

## Stories

### AVATAR-001: Add avatar_url to organizationAdminService queries

**Type**: Bugfix
**Priority**: HIGH
**Estimated Time**: 15 minutes

**Files to Modify**:
- `C:\Users\Media 3\Desktop\Max-Projects\sixty-sales-dashboard\src\lib\services\organizationAdminService.ts`

**Changes Required**:

#### 1. Update `OrganizationWithMemberCount` interface (line 18-26)

**Before**:
```typescript
export interface OrganizationWithMemberCount extends Organization {
  member_count: number;
  owner?: {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
  };
}
```

**After**:
```typescript
export interface OrganizationWithMemberCount extends Organization {
  member_count: number;
  owner?: {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
    avatar_url?: string;
  };
}
```

#### 2. Update `getAllOrganizations()` function (line 69)

**Before**:
```typescript
.select('user_id, profiles!user_id(id, email, first_name, last_name)')
```

**After**:
```typescript
.select('user_id, profiles!user_id(id, email, first_name, last_name, avatar_url)')
```

#### 3. Update `getOrganization()` function (line 139)

**Before**:
```typescript
.select('user_id, profiles!user_id(id, email, first_name, last_name)')
```

**After**:
```typescript
.select('user_id, profiles!user_id(id, email, first_name, last_name, avatar_url)')
```

#### 4. Update `getOrganizationMembers()` function (line 240-250)

**Before**:
```typescript
.select(`
  user_id,
  role,
  member_status,
  created_at,
  profiles!user_id (
    id,
    email,
    first_name,
    last_name
  )
`)
```

**After**:
```typescript
.select(`
  user_id,
  role,
  member_status,
  created_at,
  profiles!user_id (
    id,
    email,
    first_name,
    last_name,
    avatar_url
  )
`)
```

**Impact**:
- Fixes organization members display in Organizations admin page
- Enables owner avatar display in organization list
- Affects functions: `getAllOrganizations()`, `getOrganization()`, `getOrganizationMembers()`

**Verification**:
- [ ] TypeScript compilation passes with no errors
- [ ] No linting errors in modified file
- [ ] Existing tests still pass
- [ ] Manual test: Navigate to Organizations admin page, verify avatars visible in member expansions

**Dependencies**: None (isolated fix)

**Blocks**: AVATAR-004

---

### AVATAR-002: Add avatar_url to useOrgMembers hook

**Type**: Bugfix
**Priority**: HIGH
**Estimated Time**: 10 minutes

**Files to Modify**:
- `C:\Users\Media 3\Desktop\Max-Projects\sixty-sales-dashboard\src\lib\hooks\useOrgMembers.ts`

**Changes Required**:

#### 1. Update `OrgMember` interface (line 12-17)

**Before**:
```typescript
export interface OrgMember {
  user_id: string;
  email: string;
  name: string | null;
  role: string;
}
```

**After**:
```typescript
export interface OrgMember {
  user_id: string;
  email: string;
  name: string | null;
  role: string;
  avatar_url?: string;
}
```

#### 2. Update ProfileData type (line 49)

**Before**:
```typescript
type ProfileData = { id: string; email: string; first_name: string | null; last_name: string | null };
```

**After**:
```typescript
type ProfileData = { id: string; email: string; first_name: string | null; last_name: string | null; avatar_url?: string };
```

#### 3. Update profiles select query (line 43)

**Before**:
```typescript
.select('id, email, first_name, last_name')
```

**After**:
```typescript
.select('id, email, first_name, last_name, avatar_url')
```

#### 4. Update member transformation (line 73-79)

**Before**:
```typescript
return {
  user_id: member.user_id,
  email: profile?.email || '',
  name,
  role: member.role,
};
```

**After**:
```typescript
return {
  user_id: member.user_id,
  email: profile?.email || '',
  name,
  role: member.role,
  avatar_url: profile?.avatar_url,
};
```

**Impact**:
- Fixes dropdown selectors and member lists using this hook
- Used across multiple pages for member selection
- Affects user facing dropdowns and autocomplete fields

**Verification**:
- [ ] TypeScript compilation passes
- [ ] OrgMember interface properly typed
- [ ] Hook returns complete member data with avatars
- [ ] Manual test: Check dropdown member selectors display avatars

**Dependencies**: AVATAR-001 (conceptually, but isolated fix)

**Blocks**: AVATAR-004

---

### AVATAR-003: Add avatar_url to TeamMembersPage queries

**Type**: Bugfix
**Priority**: HIGH
**Estimated Time**: 10 minutes

**Files to Modify**:
- `C:\Users\Media 3\Desktop\Max-Projects\sixty-sales-dashboard\src\pages\settings\TeamMembersPage.tsx`

**Changes Required**:

#### 1. Update `TeamMember` interface (line 26-38)

**Before**:
```typescript
interface TeamMember {
  user_id: string;
  role: 'owner' | 'admin' | 'member' | 'readonly';
  created_at: string;
  member_status?: 'active' | 'removed';
  removed_at?: string | null;
  removed_by?: string | null;
  user: {
    id: string;
    email: string;
    full_name: string | null;
  } | null;
}
```

**After**:
```typescript
interface TeamMember {
  user_id: string;
  role: 'owner' | 'admin' | 'member' | 'readonly';
  created_at: string;
  member_status?: 'active' | 'removed';
  removed_at?: string | null;
  removed_by?: string | null;
  user: {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url?: string;
  } | null;
}
```

#### 2. Update profile select query (line 381)

**Before**:
```typescript
.select('id, email, first_name, last_name')
```

**After**:
```typescript
.select('id, email, first_name, last_name, avatar_url')
```

#### 3. Update profileMap construction (line 391-400)

**Before**:
```typescript
const profileMap = new Map(
  profiles?.map((p) => [
    p.id,
    {
      id: p.id,
      email: p.email,
      full_name: [p.first_name, p.last_name].filter(Boolean).join(' ') || null,
    },
  ]) || []
);
```

**After**:
```typescript
const profileMap = new Map(
  profiles?.map((p) => [
    p.id,
    {
      id: p.id,
      email: p.email,
      full_name: [p.first_name, p.last_name].filter(Boolean).join(' ') || null,
      avatar_url: p.avatar_url,
    },
  ]) || []
);
```

**Impact**:
- Fixes team members settings page display
- Users can see avatars when managing team members
- Core settings page for organization management

**Verification**:
- [ ] TypeScript compilation passes
- [ ] TeamMember type includes avatar_url
- [ ] Profile transformation includes avatar
- [ ] Manual test: Settings → Team Members page shows avatars

**Dependencies**: None (isolated fix)

**Blocks**: AVATAR-004

---

### AVATAR-004: Verify avatar display in UI components

**Type**: Feature (UI Integration)
**Priority**: HIGH
**Estimated Time**: 15 minutes
**Dependencies**: AVATAR-001, AVATAR-002, AVATAR-003

**Files to Verify/Modify**:
- `C:\Users\Media 3\Desktop\Max-Projects\sixty-sales-dashboard\src\pages\platform\Organizations.tsx`
- `C:\Users\Media 3\Desktop\Max-Projects\sixty-sales-dashboard\src\pages\settings\TeamMembersPage.tsx`
- `C:\Users\Media 3\Desktop\Max-Projects\sixty-sales-dashboard\src\pages\settings\OrganizationSettingsPage.tsx`

**Changes Required**:

This task verifies that UI components properly render avatars using the now-available `avatar_url` data:

1. **Organizations.tsx** - Member avatar display in expansion
   - Verify avatar component uses `avatar_url` when available
   - Ensure fallback to initials when `avatar_url` is null
   - Check responsive styling

2. **TeamMembersPage.tsx** - Member list avatar display (line 806-814)
   - Current: Uses initials only
   - Update: Render image if avatar_url available, else initials
   - Keep fallback chain: avatar_url → first_name initial → email initial → "?"

3. **OrganizationSettingsPage.tsx** - Owner/member avatars
   - Verify owner avatar displays with avatar_url
   - Check all member displays for avatar rendering
   - Ensure proper styling

**Example Pattern** (for avatar rendering):
```typescript
<div className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden bg-gray-200 dark:bg-gray-700">
  {member.user?.avatar_url ? (
    <img
      src={member.user.avatar_url}
      alt={member.user.full_name || 'User'}
      className="w-full h-full object-cover"
    />
  ) : (
    <span className="text-gray-900 dark:text-white font-medium">
      {member.user?.full_name?.[0] || member.user?.email?.[0] || '?'}
    </span>
  )}
</div>
```

**Impact**:
- Organizations admin page displays member avatars
- Team members settings page displays member avatars
- Organization settings page displays member avatars
- Improved UI/UX with visual identification

**Verification**:
- [ ] Organizations page loads without console errors
- [ ] Member list in expanded rows shows avatars
- [ ] TeamMembersPage displays member avatars
- [ ] OrganizationSettingsPage displays avatars
- [ ] Fallback avatars (initials) work when avatar_url is null
- [ ] Avatar images load properly with no 404 errors
- [ ] Manual test: All three pages show avatars for members

**Blocks**: AVATAR-005

---

### AVATAR-005: Create test coverage for avatar data

**Type**: Test
**Priority**: MEDIUM
**Estimated Time**: 20 minutes
**Dependencies**: AVATAR-001, AVATAR-002, AVATAR-003, AVATAR-004

**Files to Create**:
- `C:\Users\Media 3\Desktop\Max-Projects\sixty-sales-dashboard\src\lib\services\organizationAdminService.test.ts`
- `C:\Users\Media 3\Desktop\Max-Projects\sixty-sales-dashboard\src\lib\hooks\useOrgMembers.test.ts`

**Test Coverage**:

#### organizationAdminService.test.ts

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  getOrganizationMembers,
  getAllOrganizations,
  getOrganization,
} from './organizationAdminService';

describe('organizationAdminService', () => {
  describe('getOrganizationMembers', () => {
    it('should include avatar_url in member profiles', async () => {
      // Note: Requires test org setup
      const members = await getOrganizationMembers('test-org-id');
      expect(members).toBeDefined();
      expect(Array.isArray(members)).toBe(true);

      members.forEach(member => {
        if (member.profiles) {
          expect(member.profiles).toHaveProperty('avatar_url');
          // avatar_url can be string or null
          if (member.profiles.avatar_url) {
            expect(typeof member.profiles.avatar_url).toBe('string');
          }
        }
      });
    });

    it('should return members with profile data', async () => {
      const members = await getOrganizationMembers('test-org-id');

      members.forEach(member => {
        expect(member).toHaveProperty('user_id');
        expect(member).toHaveProperty('role');
        expect(member).toHaveProperty('member_status');
        expect(member).toHaveProperty('profiles');
      });
    });
  });

  describe('getAllOrganizations', () => {
    it('should include avatar_url in owner profile', async () => {
      const orgs = await getAllOrganizations();
      expect(Array.isArray(orgs)).toBe(true);

      orgs.forEach(org => {
        if (org.owner) {
          expect(org.owner).toHaveProperty('id');
          expect(org.owner).toHaveProperty('email');
          expect(org.owner).toHaveProperty('avatar_url');
        }
      });
    });
  });

  describe('getOrganization', () => {
    it('should include avatar_url in owner profile', async () => {
      // Note: Requires valid org ID
      const org = await getOrganization('test-org-id');

      if (org) {
        expect(org).toHaveProperty('id');
        expect(org).toHaveProperty('name');

        if (org.owner) {
          expect(org.owner).toHaveProperty('avatar_url');
        }
      }
    });
  });
});
```

#### useOrgMembers.test.ts

```typescript
import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useOrgMembers } from './useOrgMembers';

describe('useOrgMembers hook', () => {
  it('should return members with avatar_url field', async () => {
    const { result } = renderHook(() => useOrgMembers());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    if (result.current.data && result.current.data.length > 0) {
      result.current.data.forEach(member => {
        expect(member).toHaveProperty('user_id');
        expect(member).toHaveProperty('email');
        expect(member).toHaveProperty('name');
        expect(member).toHaveProperty('role');
        expect(member).toHaveProperty('avatar_url');
      });
    }
  });

  it('should handle null avatar_url gracefully', async () => {
    const { result } = renderHook(() => useOrgMembers());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should not error even if avatar_url is null
    expect(result.current.error).toBeUndefined();
    expect(result.current.data).toBeDefined();
  });

  it('should have proper OrgMember typing', async () => {
    const { result } = renderHook(() => useOrgMembers());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Type check: ensure all required fields present
    if (result.current.data && result.current.data.length > 0) {
      const member = result.current.data[0];
      expect(member.user_id).toBeDefined();
      expect(member.email).toBeDefined();
      expect(member.name !== undefined).toBe(true);
      expect(member.role).toBeDefined();
    }
  });
});
```

**Quality Gates**:
- [ ] Test file for organizationAdminService created
- [ ] Test file for useOrgMembers hook created
- [ ] All tests pass
- [ ] Tests verify avatar_url is selected in queries
- [ ] Tests verify avatar_url is included in returned data
- [ ] Tests handle null avatar_url gracefully
- [ ] Coverage for modified functions >90%
- [ ] CI/CD pipeline passes all tests

**Blocks**: None (final verification)

---

## Execution Timeline

### Phase 1: Data Layer Fixes (30 minutes) - Can run in parallel
- **AVATAR-001**: organizationAdminService (15 min)
- **AVATAR-002**: useOrgMembers hook (10 min)
- **AVATAR-003**: TeamMembersPage (10 min)

These three tasks are independent and can be completed simultaneously.

### Phase 2: UI Integration (15 minutes) - Depends on Phase 1
- **AVATAR-004**: UI component verification (15 min)

Waits for data layer fixes to be complete before verifying UI rendering.

### Phase 3: Quality Assurance (20 minutes) - Depends on Phase 2
- **AVATAR-005**: Test coverage (20 min)

Final verification with comprehensive test coverage.

**Total Timeline**: 70 minutes (1 hour 10 minutes)

---

## Dependency Graph

```
AVATAR-001 ──┐
             ├──> AVATAR-004 ──> AVATAR-005
AVATAR-002 ──┤
             │
AVATAR-003 ──┘
```

- **AVATAR-001, 002, 003**: Can start immediately (no dependencies)
- **AVATAR-004**: Starts after all data layer fixes are complete
- **AVATAR-005**: Starts after UI integration verification

---

## Files Summary

### Modification Summary

| Story | File | Lines | Changes |
|-------|------|-------|---------|
| AVATAR-001 | organizationAdminService.ts | 18-26, 69, 139, 240-250 | Add avatar_url to 4 query locations |
| AVATAR-002 | useOrgMembers.ts | 12-17, 43, 49, 73-79 | Add avatar_url to hook and types |
| AVATAR-003 | TeamMembersPage.tsx | 26-38, 381, 391-400 | Add avatar_url to page queries |
| AVATAR-004 | Organizations.tsx, TeamMembersPage.tsx, OrganizationSettingsPage.tsx | Various | Verify/update avatar rendering |
| AVATAR-005 | New test files | N/A | Create test suites |

### Database
No schema changes required. The `avatar_url` column already exists in the `profiles` table (baseline schema from `00000000000000_baseline.sql`).

---

## Risk Assessment

**Risk Level**: LOW

### Mitigations
- No schema changes (avatar_url column already exists)
- No API contract changes
- Backward compatible (avatar_url is optional in interfaces)
- No breaking migrations
- Existing data untouched
- Fallback to initials when avatar_url is null
- Isolated column additions

### Testing Strategy
1. Manual verification on all three affected pages
2. Unit tests for service functions
3. Hook tests for React Query integration
4. UI visual regression testing (manual)
5. Accessibility testing (alt text on images)

### Rollback Plan
If issues occur:
1. Revert the four modified files to previous state
2. Clear React Query cache if needed
3. No database cleanup required (no migrations)
4. Users will see initials fallback (already working)

---

## Quality Checklist

- [ ] All TypeScript compilation passes (no errors/warnings)
- [ ] No ESLint/code style violations
- [ ] All three data layer fixes applied
- [ ] UI components verify avatar display
- [ ] Avatar images load without 404 errors
- [ ] Fallback avatars work correctly
- [ ] Manual test on Organizations admin page
- [ ] Manual test on Team Members settings page
- [ ] Manual test on Organization Settings page
- [ ] Test files created and passing
- [ ] Code review completed
- [ ] No breaking changes to existing queries
- [ ] Documentation updated (if needed)

---

## Success Criteria

1. **Avatar_url Selection**: All three services select avatar_url from profiles table
2. **Data Flow**: Avatar data flows from database → services → components
3. **UI Display**: All member lists display avatars (or fallback to initials)
4. **Type Safety**: TypeScript interfaces properly typed with avatar_url
5. **Test Coverage**: Unit tests verify avatar_url in queries and components
6. **Zero Breaking Changes**: Existing functionality preserved, backward compatible
7. **User Visible**: Users see avatars in Organizations admin, Team Members, and Settings pages

---

## Notes

- The avatar_url column was added in migration `20260202140000_add_avatar_and_email_change_features.sql`
- This fix is part of the "profile-pictures-visibility" feature
- Investigation confirmed avatar_url missing from 3 critical query locations
- All changes follow existing code patterns and conventions
- No edge cases identified (avatar_url can be null/string, both handled)

---

## Sign-Off

**Plan Created**: 2025-02-03
**Branch**: fix/go-live-bug-fixes
**Target**: main branch (PR)
**Estimated Completion**: ~75 minutes from start
