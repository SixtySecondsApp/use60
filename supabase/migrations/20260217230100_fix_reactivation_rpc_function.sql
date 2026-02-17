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
