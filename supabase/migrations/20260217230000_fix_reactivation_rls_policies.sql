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
