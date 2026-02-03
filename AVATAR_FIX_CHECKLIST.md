# Avatar Fix Implementation Checklist

## Pre-Execution Verification

- [ ] Branch is `fix/go-live-bug-fixes`
- [ ] No uncommitted changes blocking work
- [ ] All required files exist:
  - [ ] `src/lib/services/organizationAdminService.ts`
  - [ ] `src/lib/hooks/useOrgMembers.ts`
  - [ ] `src/pages/settings/TeamMembersPage.tsx`
  - [ ] `src/pages/platform/Organizations.tsx`
  - [ ] `src/pages/settings/OrganizationSettingsPage.tsx`

---

## AVATAR-001: organizationAdminService.ts

### Pre-Edit Verification
- [ ] File exists and is readable
- [ ] Current avatar_url status: MISSING from queries
- [ ] Backup created (if needed)

### Edit 1: Update OrganizationWithMemberCount Interface (line 18-26)

**Location**: Lines 18-26

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

- [ ] Edit completed
- [ ] No syntax errors

### Edit 2: Update getAllOrganizations() - Profile Select (line 69)

**Location**: Line 69 in `getAllOrganizations()` function

**Find**: `.select('user_id, profiles!user_id(id, email, first_name, last_name)')`

**Replace with**: `.select('user_id, profiles!user_id(id, email, first_name, last_name, avatar_url)')`

- [ ] Edit completed
- [ ] Correct line updated
- [ ] No syntax errors

### Edit 3: Update getOrganization() - Profile Select (line 139)

**Location**: Line 139 in `getOrganization()` function

**Find**: `.select('user_id, profiles!user_id(id, email, first_name, last_name)')`

**Replace with**: `.select('user_id, profiles!user_id(id, email, first_name, last_name, avatar_url)')`

- [ ] Edit completed
- [ ] Correct line updated
- [ ] No syntax errors

### Edit 4: Update getOrganizationMembers() - Member Select (lines 240-250)

**Location**: Lines 240-250 in `getOrganizationMembers()` function

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

- [ ] Edit completed
- [ ] All fields properly formatted
- [ ] No syntax errors

### Post-Edit Verification
- [ ] TypeScript compilation: `npm run build` passes
- [ ] No linting errors: `npm run lint` passes
- [ ] All 4 edits properly applied
- [ ] File is valid TypeScript

---

## AVATAR-002: useOrgMembers.ts

### Pre-Edit Verification
- [ ] File exists and is readable
- [ ] Current avatar_url status: MISSING from hook
- [ ] Backup created (if needed)

### Edit 1: Update OrgMember Interface (lines 12-17)

**Location**: Lines 12-17

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

- [ ] Edit completed
- [ ] Interface properly updated

### Edit 2: Update Profile Select Query (line 43)

**Location**: Line 43

**Find**: `.select('id, email, first_name, last_name')`

**Replace with**: `.select('id, email, first_name, last_name, avatar_url')`

- [ ] Edit completed
- [ ] Correct line updated

### Edit 3: Update ProfileData Type (line 49)

**Location**: Line 49

**Before**: `type ProfileData = { id: string; email: string; first_name: string | null; last_name: string | null };`

**After**: `type ProfileData = { id: string; email: string; first_name: string | null; last_name: string | null; avatar_url?: string };`

- [ ] Edit completed
- [ ] Type properly extended

### Edit 4: Update Member Transformation (lines 73-79)

**Location**: Lines 73-79

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

- [ ] Edit completed
- [ ] All 4 fields in return object

### Post-Edit Verification
- [ ] TypeScript compilation: `npm run build` passes
- [ ] No linting errors: `npm run lint` passes
- [ ] All 4 edits properly applied
- [ ] File is valid TypeScript

---

## AVATAR-003: TeamMembersPage.tsx

### Pre-Edit Verification
- [ ] File exists and is readable
- [ ] Current avatar_url status: MISSING from queries
- [ ] Backup created (if needed)

### Edit 1: Update TeamMember Interface (lines 26-38)

**Location**: Lines 26-38

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

- [ ] Edit completed
- [ ] Interface properly updated

### Edit 2: Update Profile Select Query (line 381)

**Location**: Line 381

**Find**: `.select('id, email, first_name, last_name')`

**Replace with**: `.select('id, email, first_name, last_name, avatar_url')`

- [ ] Edit completed
- [ ] Correct line updated

### Edit 3: Update ProfileMap Construction (lines 391-400)

**Location**: Lines 391-400

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

- [ ] Edit completed
- [ ] ProfileMap includes avatar_url

### Post-Edit Verification
- [ ] TypeScript compilation: `npm run build` passes
- [ ] No linting errors: `npm run lint` passes
- [ ] All 3 edits properly applied
- [ ] File is valid TypeScript

---

## AVATAR-004: UI Component Verification

### Pre-Verification
- [ ] All three data layer files (AVATAR-001, 002, 003) edits completed
- [ ] TypeScript compilation passes
- [ ] No syntax errors in any modified file

### Organizations.tsx Verification

**Check Points**:
1. [ ] Member list exists with member expansion functionality
2. [ ] Avatar display in expanded members:
   - [ ] Check if avatar component used
   - [ ] Verify avatar_url data flows to component
   - [ ] Confirm fallback to initials works
3. [ ] No console errors when expanding members
4. [ ] Avatar images load properly (no 404s)

**Manual Test**:
- [ ] Navigate to Organizations admin page
- [ ] Expand first organization
- [ ] Verify avatars or initials show for members
- [ ] Check browser console for errors
- [ ] Verify owner avatar displays

### TeamMembersPage.tsx Verification

**Check Points**:
1. [ ] Team Members page at Settings → Team Members
2. [ ] Member list displays with avatars:
   - [ ] Verify avatar rendering logic (current uses initials only)
   - [ ] Check if avatar_url data available
   - [ ] Confirm fallback works
3. [ ] No console errors loading members
4. [ ] Avatar images display properly

**Current Avatar Code** (line 806-814):
```typescript
<div className={`w-10 h-10 rounded-full flex items-center justify-center ${
  member.member_status === 'removed'
    ? 'bg-gray-300 dark:bg-gray-600'
    : 'bg-gray-200 dark:bg-gray-700'
}`}>
  <span className="text-gray-900 dark:text-white font-medium">
    {member.user?.full_name?.[0] || member.user?.email?.[0] || '?'}
  </span>
</div>
```

**Update to**:
```typescript
<div className={`w-10 h-10 rounded-full flex items-center justify-center overflow-hidden ${
  member.member_status === 'removed'
    ? 'bg-gray-300 dark:bg-gray-600'
    : 'bg-gray-200 dark:bg-gray-700'
}`}>
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

- [ ] Avatar rendering updated (if avatar_url available)
- [ ] Manual test: Settings → Team Members
- [ ] Avatars visible for members with avatar_url
- [ ] Initials fallback works

### OrganizationSettingsPage.tsx Verification

**Check Points**:
1. [ ] File exists and is accessible
2. [ ] Owner avatar display location identified
3. [ ] Member list avatar display identified
4. [ ] Verify avatar_url data flows to components
5. [ ] No console errors

**Manual Test**:
- [ ] Navigate to Settings → Organization Settings
- [ ] Verify owner avatar displays
- [ ] Check member list avatars
- [ ] Confirm fallback to initials works

### Post-Verification
- [ ] All three pages load without errors
- [ ] Avatar data properly flows from services to UI
- [ ] Avatars display correctly in all locations
- [ ] Fallback avatars work when avatar_url is null
- [ ] No TypeScript errors in any component

---

## AVATAR-005: Test Coverage

### Pre-Test Creation
- [ ] All code changes from AVATAR-001, 002, 003, 004 complete
- [ ] Code compiles without errors
- [ ] Manual verification in AVATAR-004 passed

### Create organizationAdminService.test.ts

**File Location**: `C:\Users\Media 3\Desktop\Max-Projects\sixty-sales-dashboard\src\lib\services\organizationAdminService.test.ts`

**Contents**: (as per EXECUTION_PLAN_AVATAR_FIX.md)

- [ ] File created
- [ ] Test structure matches project conventions
- [ ] Tests cover:
  - [ ] getOrganizationMembers returns avatar_url
  - [ ] getAllOrganizations includes owner avatar_url
  - [ ] getOrganization includes owner avatar_url
  - [ ] Null avatar_url handled gracefully

### Create useOrgMembers.test.ts

**File Location**: `C:\Users\Media 3\Desktop\Max-Projects\sixty-sales-dashboard\src\lib\hooks\useOrgMembers.test.ts`

**Contents**: (as per EXECUTION_PLAN_AVATAR_FIX.md)

- [ ] File created
- [ ] Test structure matches project conventions
- [ ] Tests cover:
  - [ ] Hook returns members with avatar_url field
  - [ ] Null avatar_url handled gracefully
  - [ ] Proper OrgMember typing

### Run Tests

- [ ] `npm run test` passes all tests
- [ ] No test failures or skipped tests
- [ ] Test coverage >90% for modified code
- [ ] All assertions pass

### Post-Test Verification
- [ ] organizationAdminService tests: PASSING
- [ ] useOrgMembers tests: PASSING
- [ ] Coverage report acceptable
- [ ] CI/CD pipeline ready

---

## Final Verification Checklist

### Code Quality
- [ ] TypeScript strict mode: `npm run build` ✓
- [ ] Linting: `npm run lint` ✓
- [ ] Tests: `npm run test` ✓
- [ ] No deprecated patterns used
- [ ] Code follows project conventions
- [ ] All comments updated or added

### Functional Testing
- [ ] Organizations page loads without errors
- [ ] Team Members page loads without errors
- [ ] Organization Settings page loads without errors
- [ ] Member avatars display correctly
- [ ] Fallback initials work when avatar_url is null
- [ ] No console errors in any scenario

### Data Integrity
- [ ] No unintended data modifications
- [ ] Backward compatible (optional avatar_url field)
- [ ] Existing queries still work
- [ ] No breaking changes to interfaces
- [ ] Database unchanged (no migrations needed)

### Documentation
- [ ] EXECUTION_PLAN_AVATAR_FIX.md created: ✓
- [ ] AVATAR_FIX_CHECKLIST.md created: ✓
- [ ] Code comments added where needed
- [ ] Changes documented in commit message

---

## Git Commit Checklist

### Pre-Commit
- [ ] All files modified as per plan
- [ ] All tests passing
- [ ] No unintended files changed
- [ ] No sensitive data committed

### Commit Files

**Files to Commit**:
```
M  src/lib/services/organizationAdminService.ts
M  src/lib/hooks/useOrgMembers.ts
M  src/pages/settings/TeamMembersPage.tsx
M  src/pages/platform/Organizations.tsx (if updated for avatar rendering)
A  src/lib/services/organizationAdminService.test.ts
A  src/lib/hooks/useOrgMembers.test.ts
A  EXECUTION_PLAN_AVATAR_FIX.md
A  AVATAR_FIX_CHECKLIST.md
```

### Commit Message Template

```
fix: Add avatar_url to member queries for profile picture visibility

## Summary
Fixed missing avatar_url column in member and owner profile queries across three key services, enabling avatar display in:
- Organizations admin page (member lists, owner display)
- Team Members settings page (member list with avatars)
- Organization Settings page (member list with avatars)

## Changes
- organizationAdminService.ts: Added avatar_url to 4 query locations
- useOrgMembers.ts: Extended OrgMember interface with avatar_url
- TeamMembersPage.tsx: Added avatar_url to member queries
- Organizations.tsx: Updated avatar rendering logic
- Added comprehensive test coverage for avatar data fetching

## Impact
- Users can now see member avatars in admin and settings pages
- Fallback to initials when avatar_url is null (backward compatible)
- No database schema changes required
- Backward compatible with existing data
- Addresses investigation findings for profile-pictures-visibility feature

## Testing
- All existing tests pass
- New test coverage for avatar_url in queries
- Manual verification on all affected pages
- No breaking changes

Closes: #<issue-number>
Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
```

- [ ] Commit message written
- [ ] All files staged
- [ ] Ready for commit

### Post-Commit
- [ ] Commit created successfully
- [ ] Branch ready for PR
- [ ] No uncommitted changes

---

## Sign-Off and Review

### Implementation Completion
- [ ] All 5 stories completed
- [ ] All edits applied
- [ ] All tests passing
- [ ] All documentation complete
- [ ] Ready for review

### Code Review Checklist (for reviewer)
- [ ] All avatar_url additions are present
- [ ] TypeScript types properly updated
- [ ] No syntax errors
- [ ] Follows project conventions
- [ ] Tests cover avatar_url properly
- [ ] No breaking changes
- [ ] Avatar display logic correct in UI

### Sign-Off
- **Implementation Start**: [DATE/TIME]
- **Implementation End**: [DATE/TIME]
- **Total Time**: [DURATION]
- **Completed By**: [NAME]
- **Reviewed By**: [REVIEWER NAME]
- **Status**: [ ] APPROVED [ ] NEEDS CHANGES [ ] BLOCKED

---

## Quick Reference: Before/After Summary

| Component | Before | After | Impact |
|-----------|--------|-------|--------|
| organizationAdminService | avatar_url missing from 4 queries | avatar_url included in all profile selects | Owners and members can display avatars |
| useOrgMembers hook | OrgMember interface has no avatar_url | Avatar_url field added and populated | Member selectors can display avatars |
| TeamMembersPage | Member interface lacks avatar_url | Avatar_url in user object | Team members page shows avatars |
| Organizations page | Avatar rendering not optimized | Proper avatar image rendering added | User can see profile pictures |
| TeamMembers page | Avatars not available | Avatar rendering implemented | User can see profile pictures |
| Tests | No avatar_url tests | Comprehensive test coverage added | Prevents future regressions |

---

**Last Updated**: 2025-02-03
**Plan Version**: 1.0
**Status**: Ready for Execution
