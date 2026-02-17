# Apply Reactivation Fix to Staging

## Issue
The `organization_reactivation_requests` RLS policies and RPC function have a bug where they call `is_org_member(org_id)` with only one parameter, but the function requires two: `is_org_member(user_id, org_id)`.

This causes the reactivation request and leave organization buttons to fail silently.

## Solution
Apply these two SQL scripts in your Supabase SQL Editor:

**Staging URL**: https://supabase.com/dashboard/project/caerqjzvuerejfrdtygb/sql/new

---

### Script 1: Fix RLS Policies

```sql
-- Fix RLS policies for organization_reactivation_requests
-- The is_org_member function requires two parameters: (user_id, org_id)
-- but the original policies were calling it with only one parameter

-- Drop existing policies
drop policy if exists "Members can view org reactivation requests" on organization_reactivation_requests;
drop policy if exists "Members can create reactivation requests" on organization_reactivation_requests;
drop policy if exists "Service role can manage all reactivation requests" on organization_reactivation_requests;

-- Recreate policies with correct function signature
create policy "Members can view org reactivation requests"
  on organization_reactivation_requests for select
  using (is_org_member(auth.uid(), org_id));

create policy "Members can create reactivation requests"
  on organization_reactivation_requests for insert
  with check (is_org_member(auth.uid(), org_id));

create policy "Service role can manage all reactivation requests"
  on organization_reactivation_requests for all
  using (is_service_role_user());
```

---

### Script 2: Fix RPC Function

```sql
-- Fix request_organization_reactivation RPC function
-- The is_org_member function requires two parameters: (user_id, org_id)
-- but the original RPC was calling it with only one parameter

create or replace function request_organization_reactivation(
  p_org_id uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
  v_org_name text;
  v_existing_request uuid;
  v_request_id uuid;
begin
  -- Get current user
  v_user_id := auth.uid();

  if v_user_id is null then
    return jsonb_build_object('success', false, 'message', 'Not authenticated');
  end if;

  -- Check if user is member of the org (with correct parameter count)
  if not is_org_member(v_user_id, p_org_id) then
    return jsonb_build_object('success', false, 'message', 'Not a member of this organization');
  end if;

  -- Get org name
  select name into v_org_name from organizations where id = p_org_id;

  -- Check if there's already a pending request
  select id into v_existing_request
  from organization_reactivation_requests
  where org_id = p_org_id and status = 'pending';

  if v_existing_request is not null then
    return jsonb_build_object(
      'success', true,
      'message', 'Reactivation request already pending',
      'request_id', v_existing_request
    );
  end if;

  -- Create new reactivation request
  insert into organization_reactivation_requests (org_id, requested_by, status)
  values (p_org_id, v_user_id, 'pending')
  returning id into v_request_id;

  return jsonb_build_object(
    'success', true,
    'message', 'Reactivation request submitted successfully',
    'request_id', v_request_id
  );
end;
$$;
```

---

## After Applying

1. Refresh your app
2. Try clicking the "Request Reactivation" or "Leave Organization" buttons
3. Check the browser console for the debug logs I added
4. The buttons should now work correctly!

## Files Created

The migrations are saved in:
- `supabase/migrations/20260217230000_fix_reactivation_rls_policies.sql`
- `supabase/migrations/20260217230100_fix_reactivation_rpc_function.sql`
