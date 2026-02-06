# Bug Report: Platform Customers Page - Members Fail to Load

**Generated:** 2026-02-06
**Reported Symptom:** "On /platform/customers page, clicking on an organization fails to load members"
**Location:** `src/lib/services/saasAdminService.ts:315`

## Root Cause Analysis

**PRIMARY BUG: RLS Policy Blocking Member Query**

The `getCustomerMembers` function in `saasAdminService.ts` queries the `organization_memberships` table with a join to `profiles`. This query is likely being blocked by Row Level Security (RLS) policies because:

1. The query joins `profiles` table which has strict RLS
2. Platform admins need service-level access to view any organization's members
3. The function uses the regular Supabase client instead of an admin client

### Code Location

**File:** `src/lib/services/saasAdminService.ts`
**Line:** 315-337

```typescript
export async function getCustomerMembers(orgId: string): Promise<OrganizationMembership[]> {
  const { data, error } = await supabase
    .from('organization_memberships')
    .select(`
      *,
      user:profiles (
        id,
        email,
        first_name,
        last_name,
        avatar_url
      )
    `)
    .eq('org_id', orgId)
    .order('created_at', { ascending: true });

  if (error) {
    logger.error('[SaaS Admin] Error fetching customer members:', error);
    throw error;
  }

  return data || [];
}
```

## Bug Symptoms

1. Click on organization in /platform/customers
2. Modal opens showing organization details
3. Click "Members" tab
4. Members list fails to load
5. Console shows RLS policy error or returns empty array
6. Toast error: "Failed to load members"

## Technical Details

### Why It Fails

The `profiles` table has RLS policies that restrict:
- Users can only see their own profile
- Organization members can see profiles of users in their org
- **Platform admins are NOT granted bypass permissions**

When a platform admin queries `profiles` for another organization's members, RLS blocks the query.

### Expected Behavior

Platform admins should be able to view all organization members for customer management purposes.

## Recommended Fixes

### Option 1: Use Edge Function (Recommended)

Create a dedicated edge function that uses service role key to bypass RLS:

**New File:** `supabase/functions/admin-get-org-members/index.ts`

```typescript
import { createClient } from '@supabase/supabase-js'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { orgId } = await req.json()
    
    // Use service role to bypass RLS
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data, error } = await supabaseAdmin
      .from('organization_memberships')
      .select(`
        *,
        user:profiles (
          id,
          email,
          first_name,
          last_name,
          avatar_url
        )
      `)
      .eq('org_id', orgId)
      .order('created_at', { ascending: true })

    if (error) throw error

    return new Response(
      JSON.stringify({ members: data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
```

**Update:** `src/lib/services/saasAdminService.ts`

```typescript
export async function getCustomerMembers(orgId: string): Promise<OrganizationMembership[]> {
  // Call edge function which uses service role
  const { data, error } = await supabase.functions.invoke('admin-get-org-members', {
    body: { orgId }
  })

  if (error) {
    logger.error('[SaaS Admin] Error fetching customer members:', error);
    throw error;
  }

  return data?.members || [];
}
```

### Option 2: Add RLS Policy for Platform Admins

Add an RLS policy to `profiles` table allowing platform admins to view all profiles:

**Migration:** `supabase/migrations/[timestamp]_allow_admin_view_profiles.sql`

```sql
-- Allow platform admins to view all profiles
CREATE POLICY "Platform admins can view all profiles"
ON profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_admin = true
  )
);
```

**Note:** Option 1 (Edge Function) is more secure as it doesn't expand RLS permissions.

## Priority

**Severity:** HIGH
**Impact:** Platform admins cannot view customer organization members
**Users Affected:** All platform admins using /platform/customers

## Testing Plan

After fix:

- [ ] Platform admin can click organization in /platform/customers
- [ ] Members tab loads successfully
- [ ] All member details display correctly (name, email, role, avatar)
- [ ] No RLS errors in console
- [ ] Non-admin users still cannot access this endpoint
- [ ] Service role key is NOT exposed to frontend

## Related Files

- `src/lib/services/saasAdminService.ts` - Service function
- `src/components/saas-admin/CustomerDetailModal.tsx` - UI component
- `supabase/functions/admin-get-org-members/index.ts` - New edge function (recommended)

## Error Logs

Check browser console for:
```
[SaaS Admin] Error fetching customer members: {...}
```

Likely shows RLS policy violation or empty result.
