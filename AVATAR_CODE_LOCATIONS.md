# Avatar Fix - Code Locations Quick Reference

## File-by-File Code Changes

### 1. organizationAdminService.ts
**Path**: `C:\Users\Media 3\Desktop\Max-Projects\sixty-sales-dashboard\src\lib\services\organizationAdminService.ts`

#### Change 1.1: Interface Update (lines 18-26)
**Exact Location**: Export interface `OrganizationWithMemberCount`

```typescript
// ADD avatar_url?: string to the owner object
export interface OrganizationWithMemberCount extends Organization {
  member_count: number;
  owner?: {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
    avatar_url?: string;  // <-- ADD THIS LINE
  };
}
```

#### Change 1.2: getAllOrganizations() (line 69)
**Exact Location**: Inside `getAllOrganizations()` function

**Search for**: `.select('user_id, profiles!user_id(id, email, first_name, last_name)')`

**Replace with**: `.select('user_id, profiles!user_id(id, email, first_name, last_name, avatar_url)')`

**Context**:
```typescript
let { data: owner, error: ownerError } = await supabase
  .from('organization_memberships')
  .select('user_id, profiles!user_id(id, email, first_name, last_name, avatar_url)')  // <-- MODIFIED
  .eq('org_id', org.id)
  .eq('role', 'owner')
  .neq('member_status', 'removed')
  .maybeSingle();
```

#### Change 1.3: getOrganization() (line 139)
**Exact Location**: Inside `getOrganization()` function

**Search for**: `.select('user_id, profiles!user_id(id, email, first_name, last_name)')`

**Replace with**: `.select('user_id, profiles!user_id(id, email, first_name, last_name, avatar_url)')`

**Context**:
```typescript
let { data: owner, error: ownerError } = await supabase
  .from('organization_memberships')
  .select('user_id, profiles!user_id(id, email, first_name, last_name, avatar_url)')  // <-- MODIFIED
  .eq('org_id', orgId)
  .eq('role', 'owner')
  .neq('member_status', 'removed')
  .maybeSingle();
```

#### Change 1.4: getOrganizationMembers() (lines 240-250)
**Exact Location**: Inside `getOrganizationMembers()` function

**Multi-line Change**:
```typescript
const { data, error } = await supabase
  .from('organization_memberships')
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
      avatar_url    // <-- ADD THIS LINE
    )
  `)
  .eq('org_id', orgId)
  .neq('member_status', 'removed')
  .order('created_at', { ascending: true });
```

---

### 2. useOrgMembers.ts
**Path**: `C:\Users\Media 3\Desktop\Max-Projects\sixty-sales-dashboard\src\lib\hooks\useOrgMembers.ts`

#### Change 2.1: Interface Update (lines 12-17)
**Exact Location**: Export interface `OrgMember`

```typescript
export interface OrgMember {
  user_id: string;
  email: string;
  name: string | null;
  role: string;
  avatar_url?: string;  // <-- ADD THIS LINE
}
```

#### Change 2.2: ProfileData Type (line 49)
**Exact Location**: Type definition in queryFn

**Before**:
```typescript
type ProfileData = { id: string; email: string; first_name: string | null; last_name: string | null };
```

**After**:
```typescript
type ProfileData = { id: string; email: string; first_name: string | null; last_name: string | null; avatar_url?: string };
```

#### Change 2.3: Profile Select Query (line 43)
**Exact Location**: Inside useQuery's queryFn

**Before**:
```typescript
const { data: profiles, error: profileError } = await supabase
  .from('profiles')
  .select('id, email, first_name, last_name')
```

**After**:
```typescript
const { data: profiles, error: profileError } = await supabase
  .from('profiles')
  .select('id, email, first_name, last_name, avatar_url')
```

#### Change 2.4: Member Transformation (lines 73-79)
**Exact Location**: Inside the map function that returns OrgMember

**Before**:
```typescript
return {
  user_id: member.user_id,
  email: profile?.email || '',
  name,
  role: member.role,
} as OrgMember[];
```

**After**:
```typescript
return {
  user_id: member.user_id,
  email: profile?.email || '',
  name,
  role: member.role,
  avatar_url: profile?.avatar_url,  // <-- ADD THIS LINE
} as OrgMember[];
```

---

### 3. TeamMembersPage.tsx
**Path**: `C:\Users\Media 3\Desktop\Max-Projects\sixty-sales-dashboard\src\pages\settings\TeamMembersPage.tsx`

#### Change 3.1: Interface Update (lines 26-38)
**Exact Location**: Interface `TeamMember`

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
    avatar_url?: string;  // <-- ADD THIS LINE
  } | null;
}
```

#### Change 3.2: Profile Select Query (line 381)
**Exact Location**: Inside loadMembers() useEffect

**Before**:
```typescript
const { data: profiles, error: profileError } = await supabase
  .from('profiles')
  .select('id, email, first_name, last_name')
```

**After**:
```typescript
const { data: profiles, error: profileError } = await supabase
  .from('profiles')
  .select('id, email, first_name, last_name, avatar_url')
```

#### Change 3.3: ProfileMap Construction (lines 391-400)
**Exact Location**: Inside loadMembers() useEffect

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
      avatar_url: p.avatar_url,  // <-- ADD THIS LINE
    },
  ]) || []
);
```

---

### 4. Organizations.tsx (Optional - UI Verification)
**Path**: `C:\Users\Media 3\Desktop\Max-Projects\sixty-sales-dashboard\src\pages\platform\Organizations.tsx`

**Action**: Verify avatar rendering in member expansion section
**No code changes required if avatars already render properly**

**Search for**: Member list display code in component
**Verify**: Avatar_url data flows to avatar component

---

### 5. OrganizationSettingsPage.tsx (Optional - UI Verification)
**Path**: `C:\Users\Media 3\Desktop\Max-Projects\sixty-sales-dashboard\src\pages\settings\OrganizationSettingsPage.tsx`

**Action**: Verify owner and member avatars display
**No code changes required if avatars already render properly**

**Search for**: Member/owner display sections
**Verify**: Avatar_url data available and displayed

---

## Test Files (New Files)

### organizationAdminService.test.ts
**Path**: `C:\Users\Media 3\Desktop\Max-Projects\sixty-sales-dashboard\src\lib\services\organizationAdminService.test.ts`

**Create New File**: Yes
**Tests**:
- getOrganizationMembers includes avatar_url
- getAllOrganizations includes avatar_url in owner
- getOrganization includes avatar_url in owner
- Null avatar_url handled gracefully

### useOrgMembers.test.ts
**Path**: `C:\Users\Media 3\Desktop\Max-Projects\sixty-sales-dashboard\src\lib\hooks\useOrgMembers.test.ts`

**Create New File**: Yes
**Tests**:
- Hook returns members with avatar_url field
- Null avatar_url handled gracefully
- Proper OrgMember interface typing

---

## Quick Copy-Paste Changes

### organizationAdminService.ts - 4 Changes

**Change 1** (Line 25, add one line):
```typescript
avatar_url?: string;
```

**Change 2** (Line 69, modify):
FROM: `'user_id, profiles!user_id(id, email, first_name, last_name)'`
TO: `'user_id, profiles!user_id(id, email, first_name, last_name, avatar_url)'`

**Change 3** (Line 139, modify):
FROM: `'user_id, profiles!user_id(id, email, first_name, last_name)'`
TO: `'user_id, profiles!user_id(id, email, first_name, last_name, avatar_url)'`

**Change 4** (Line 249, add one line):
```typescript
avatar_url
```

---

### useOrgMembers.ts - 4 Changes

**Change 1** (Line 17, add one line):
```typescript
avatar_url?: string;
```

**Change 2** (Line 43, modify):
FROM: `'id, email, first_name, last_name'`
TO: `'id, email, first_name, last_name, avatar_url'`

**Change 3** (Line 49, extend type):
FROM: `type ProfileData = { id: string; email: string; first_name: string | null; last_name: string | null };`
TO: `type ProfileData = { id: string; email: string; first_name: string | null; last_name: string | null; avatar_url?: string };`

**Change 4** (Line 78, add one line):
```typescript
avatar_url: profile?.avatar_url,
```

---

### TeamMembersPage.tsx - 3 Changes

**Change 1** (Line 37, add one line):
```typescript
avatar_url?: string;
```

**Change 2** (Line 381, modify):
FROM: `'id, email, first_name, last_name'`
TO: `'id, email, first_name, last_name, avatar_url'`

**Change 3** (Line 399, add one line):
```typescript
avatar_url: p.avatar_url,
```

---

## Verification Commands

```bash
# Compile TypeScript
npm run build

# Check for linting errors
npm run lint

# Run tests
npm run test

# Dev server (manual testing)
npm run dev
```

## File Statistics

| File | Type | Lines Modified | Complexity | Risk |
|------|------|----------------|------------|------|
| organizationAdminService.ts | Service | 4 locations | Low | Low |
| useOrgMembers.ts | Hook | 4 locations | Low | Low |
| TeamMembersPage.tsx | Page | 3 locations | Low | Low |
| Organizations.tsx | Component | TBD | Low | Low |
| OrganizationSettingsPage.tsx | Component | TBD | Low | Low |
| *.test.ts (2 files) | Tests | New files | Low | Low |

---

## Search Patterns for Verification

Use these patterns to find exact locations in your editor:

```
organizationAdminService.ts:
  - Search: "profiles!user_id(id, email"
  - Search: "export interface OrganizationWithMemberCount"

useOrgMembers.ts:
  - Search: "export interface OrgMember"
  - Search: ".select('id, email, first_name, last_name')"

TeamMembersPage.tsx:
  - Search: "interface TeamMember"
  - Search: ".select('id, email, first_name, last_name')"
  - Search: "profileMap = new Map"
```

---

**Last Updated**: February 3, 2025
**Version**: 1.0
**Status**: Ready for Implementation
