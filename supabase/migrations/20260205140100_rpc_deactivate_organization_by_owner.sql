-- Organization Deactivation by Owner
-- RPC function for owners to initiate organization deactivation
-- Validates ownership, sets deactivation flags, and creates reactivation request

create or replace function deactivate_organization_by_owner(
  p_org_id uuid,
  p_reason text default 'Owner requested deactivation'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_org_record organizations%rowtype;
  v_user_role text;
  v_other_active_orgs integer;
  v_request_id uuid;
begin
  -- Get current user
  v_user_id := auth.uid();

  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;

  -- Validate organization exists and is active
  select * into v_org_record
  from organizations
  where id = p_org_id;

  if v_org_record.id is null then
    return jsonb_build_object('success', false, 'error', 'Organization not found');
  end if;

  if v_org_record.is_active = false then
    return jsonb_build_object('success', false, 'error', 'Organization is already deactivated');
  end if;

  -- Check if user is owner of this organization
  select role into v_user_role
  from organization_memberships
  where org_id = p_org_id and user_id = v_user_id;

  if v_user_role is null then
    return jsonb_build_object('success', false, 'error', 'Not a member of this organization');
  end if;

  if v_user_role != 'owner' then
    return jsonb_build_object('success', false, 'error', 'Only organization owners can deactivate');
  end if;

  -- Check if user has at least one other active organization
  select count(*) into v_other_active_orgs
  from organization_memberships om
  join organizations o on om.org_id = o.id
  where om.user_id = v_user_id
    and o.is_active = true
    and om.role = 'owner'
    and o.id != p_org_id;

  if v_other_active_orgs = 0 then
    return jsonb_build_object(
      'success', false,
      'error', 'You must maintain at least one active organization'
    );
  end if;

  -- Deactivate the organization
  update organizations
  set is_active = false,
      deactivated_at = now(),
      deactivated_by = v_user_id,
      deactivation_reason = p_reason
  where id = p_org_id;

  -- Create a reactivation request entry (for tracking)
  insert into organization_reactivation_requests (
    org_id,
    requested_by,
    status,
    created_at,
    updated_at
  )
  values (
    p_org_id,
    v_user_id,
    'pending',
    now(),
    now()
  )
  returning id into v_request_id;

  return jsonb_build_object(
    'success', true,
    'message', 'Organization deactivated successfully',
    'org_id', p_org_id,
    'request_id', v_request_id,
    'deactivation_id', p_org_id,
    'deadline_date', (now() + interval '30 days')::date,
    'deactivated_at', now()
  );
end;
$$;

-- Grant execute permission to authenticated users
grant execute on function deactivate_organization_by_owner(uuid, text) to authenticated;
