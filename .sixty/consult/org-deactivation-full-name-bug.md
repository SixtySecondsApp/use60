# Consult Report: Organization Deactivation "full_name" Bug
**Generated:** 2026-02-06
**Status:** Root cause identified, solution designed

---

## User Request
"When I am trying to leave and deactivate my organization, I get the following errors:
```json
{
    "code": "42703",
    "details": null,
    "hint": null,
    "message": "column profiles_1.full_name does not exist"
}
```

---

## Problem Summary

The `organizationDeactivationService.ts` attempts to join `organization_memberships` with `profiles` and select a `full_name` column that **does not exist** in the `profiles` table.

### Error Location
**File:** `src/lib/services/organizationDeactivationService.ts:125-146`

```typescript
export async function getAllOrgMembers(orgId: string): Promise<OrgMember[]> {
  const { data: memberships, error: membershipsError } = await supabase
    .from('organization_memberships')
    .select(`
      user_id,
      role,
      profiles!organization_memberships_profiles_fk(id, email, full_name)  // ❌ ERROR
    `)
    .eq('org_id', orgId)
    .neq('member_status', 'removed');
```

### Why This Fails

1. **Profiles table schema** (from `supabase/migrations/00000000000000_baseline.sql`):
   ```sql
   CREATE TABLE "public"."profiles" (
       "id" uuid NOT NULL,
       "first_name" text,      -- ✓ EXISTS
       "last_name" text,       -- ✓ EXISTS
       "email" text NOT NULL,
       ...
   )
   ```

   → **No `full_name` column exists**

2. **PostgreSQL error 42703** = "column does not exist"

3. **The foreign key join is correct**, but the selected column is wrong:
   ```sql
   -- From migration 20260202213000
   ALTER TABLE organization_memberships
   ADD CONSTRAINT organization_memberships_profiles_fk
   FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
   ```

---

## Correct Pattern (Used Elsewhere in Codebase)

### Example: OrganizationManagementPage.tsx (lines 389-457)

This component **correctly** handles the same query:

```typescript
// STEP 1: Query memberships separately
const { data: memberships } = await supabase
  .from('organization_memberships')
  .select('user_id, role, created_at, member_status, removed_at, removed_by')
  .eq('org_id', activeOrgId)
  .order('created_at', { ascending: true });

const userIds = memberships.map(m => m.user_id);

// STEP 2: Query profiles with first_name and last_name
const { data: profiles } = await supabase
  .from('profiles')
  .select('id, email, first_name, last_name, avatar_url')  // ✓ CORRECT
  .in('id', userIds);

// STEP 3: Join in JavaScript and create full_name
const profileMap = new Map(
  profiles?.map(p => [
    p.id,
    {
      id: p.id,
      email: p.email,
      full_name: [p.first_name, p.last_name].filter(Boolean).join(' ') || null,  // ✓ CORRECT
      avatar_url: p.avatar_url || null,
    }
  ]) || []
);

const membersWithProfiles = memberships.map(m => ({
  user_id: m.user_id,
  role: m.role,
  created_at: m.created_at,
  member_status: m.member_status || 'active',
  removed_at: m.removed_at || null,
  removed_by: m.removed_by || null,
  user: profileMap.get(m.user_id) || null,
}));
```

### Example: Rejoin Requests Query (OrganizationManagementPage.tsx:215-233)

```typescript
const { data } = await supabase
  .from('rejoin_requests')
  .select(`
    id,
    user_id,
    org_id,
    status,
    created_at,
    profiles:user_id (
      id,
      email,
      first_name,       // ✓ CORRECT
      last_name,        // ✓ CORRECT
      avatar_url
    )
  `)
  .eq('org_id', activeOrgId)
  .eq('status', 'pending');
```

---

## Solution Design

### Option 1: Two-Step Query (Recommended - Follows Existing Pattern)

**Pros:**
- Matches existing pattern in `OrganizationManagementPage.tsx`
- No database migration needed
- Easy to maintain
- Consistent with rest of codebase

**Cons:**
- Slightly more code
- Two round-trips to database (but both are fast)

**Implementation:**

```typescript
export async function getAllOrgMembers(orgId: string): Promise<OrgMember[]> {
  try {
    // Step 1: Get memberships
    const { data: memberships, error: membershipsError } = await supabase
      .from('organization_memberships')
      .select('user_id, role')
      .eq('org_id', orgId)
      .neq('member_status', 'removed');

    if (membershipsError) throw membershipsError;
    if (!memberships?.length) return [];

    const userIds = memberships.map(m => m.user_id);

    // Step 2: Get profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name')
      .in('id', userIds);

    if (profilesError) throw profilesError;

    // Step 3: Join and create full_name
    const profileMap = new Map(
      profiles?.map(p => [
        p.id,
        {
          id: p.id,
          email: p.email,
          full_name: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email,
        }
      ]) || []
    );

    return memberships.map(m => {
      const profile = profileMap.get(m.user_id);
      return {
        id: m.user_id,
        email: profile?.email || '',
        full_name: profile?.full_name || 'Unknown User',
        role: m.role as 'owner' | 'admin' | 'member' | 'readonly',
      };
    });
  } catch (err) {
    logger.error('[OrganizationDeactivationService] Error fetching org members:', err);
    throw err;
  }
}
```

### Option 2: PostgreSQL Computed Column

Add a virtual `full_name` column to the profiles table:

```sql
-- Migration: add_profiles_full_name_computed_column.sql
ALTER TABLE profiles
ADD COLUMN full_name TEXT GENERATED ALWAYS AS (
  COALESCE(
    NULLIF(trim(first_name || ' ' || last_name), ''),
    email
  )
) STORED;
```

**Pros:**
- Single query with join (cleaner code)
- Computed once per row update (efficient)
- Available everywhere profiles are queried

**Cons:**
- Requires database migration
- Adds storage overhead (STORED column)
- May impact existing queries if not careful

### Option 3: PostgreSQL Function (Least Recommended)

Create a function that returns full name:

```sql
CREATE OR REPLACE FUNCTION get_full_name(first_name TEXT, last_name TEXT, email TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN COALESCE(
    NULLIF(trim(first_name || ' ' || last_name), ''),
    email
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

Then use in queries:
```typescript
.select(`
  user_id,
  role,
  profiles!organization_memberships_profiles_fk(
    id,
    email,
    get_full_name(first_name, last_name, email) as full_name
  )
`)
```

**Cons:**
- More complex than Option 1
- Still requires migration
- Adds maintenance burden

---

## Recommended Solution

**Use Option 1: Two-Step Query**

### Reasoning
1. **Consistency:** Matches the existing pattern in `OrganizationManagementPage.tsx`
2. **No migration needed:** Can be deployed immediately
3. **Maintainable:** Other developers will recognize this pattern
4. **Safe:** No schema changes that could affect other parts of the app

### Implementation Steps

1. **Update `organizationDeactivationService.ts`** (lines 125-150)
   - Replace the join query with two separate queries
   - Join results in JavaScript
   - Create `full_name` from `first_name` and `last_name`

2. **Keep the `OrgMember` interface unchanged** (lines 15-20)
   - No type changes needed
   - Consumers of this function don't need updates

3. **Test the fix**
   - Navigate to Settings > Organization Management
   - Click "Deactivate Organization"
   - Verify members list loads correctly
   - Verify can proceed through deactivation flow

---

## Additional Findings: Other Affected Code

### 1. Database Triggers (Need Fixing)

**File:** `supabase/migrations/20260205000006_org_settings_notifications.sql:26`

```sql
SELECT full_name INTO v_actioned_by_name
FROM profiles
WHERE id = auth.uid();  -- ❌ WRONG
```

Should be:
```sql
SELECT COALESCE(
  NULLIF(trim(first_name || ' ' || last_name), ''),
  email
) INTO v_actioned_by_name
FROM profiles
WHERE id = auth.uid();
```

**Affected migrations that reference `full_name`:**
- ❌ `20260205000006_org_settings_notifications.sql` (line 26)
- ❌ Any other triggers/functions that select `full_name` from profiles

### 2. Frontend Components

**File:** `src/components/dialogs/DeactivateOrganizationDialog.tsx:265, 269`

These lines correctly reference `member.full_name` and will continue to work once the service is fixed:

```tsx
<p className="font-medium text-foreground">{member.full_name}</p>
{member.full_name !== 'You' && (
```

---

## Risk Assessment

| Severity | Risk | Mitigation |
|----------|------|------------|
| 🔴 **High** | Deactivation flow is completely broken | Fix immediately (blocks critical user action) |
| 🟡 **Medium** | Database triggers may fail silently | Audit all migrations for `full_name` references |
| 🟢 **Low** | Other areas of app may have same bug | Search codebase for `profiles.*full_name` patterns |

---

## Testing Plan

### Manual Testing
1. ✓ Navigate to `/settings/organization-management`
2. ✓ Verify members list loads without errors
3. ✓ Click "Deactivate Organization" button
4. ✓ Verify "Review Members" step shows all members correctly
5. ✓ Verify member names display as "First Last" format
6. ✓ Complete deactivation flow (or cancel)

### Regression Testing
1. ✓ Check that `OrganizationManagementPage` still works (it uses correct pattern)
2. ✓ Check rejoin requests still display correctly
3. ✓ Check member invitations still work

### Database Testing
1. ✓ Run the updated query manually in Supabase SQL editor
2. ✓ Verify no performance degradation (two queries vs one join)
3. ✓ Test with organizations that have 0, 1, 5, 50+ members

---

## Implementation Estimate

| Task | Estimate |
|------|----------|
| Update `organizationDeactivationService.ts` | 10 min |
| Manual testing | 5 min |
| Fix database triggers (if needed) | 15 min |
| Regression testing | 10 min |
| **Total** | **40 minutes** |

---

## Dependencies

- None (this is a standalone fix)
- Optional: After fixing, audit entire codebase for similar issues

---

## Next Steps

1. **Immediate:** Fix `getAllOrgMembers()` in `organizationDeactivationService.ts`
2. **Follow-up:** Search for all `full_name` references in database migrations
3. **Long-term:** Consider adding a computed `full_name` column for consistency

---

## References

### Files to Modify
- ✅ `src/lib/services/organizationDeactivationService.ts` (lines 125-150)

### Files That Use Correct Pattern (Copy This)
- ✅ `src/pages/settings/OrganizationManagementPage.tsx` (lines 389-457)
- ✅ `src/pages/settings/OrganizationManagementPage.tsx` (lines 215-233)

### Database Schema Reference
- ✅ `supabase/migrations/00000000000000_baseline.sql` (profiles table)
- ✅ `supabase/migrations/20260202213000_add_organization_memberships_profiles_fk.sql` (FK constraint)
