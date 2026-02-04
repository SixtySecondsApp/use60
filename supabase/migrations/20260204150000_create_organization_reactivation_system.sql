-- Organization Reactivation System
-- Creates table for tracking organization reactivation requests
-- Adds audit fields for tracking when organizations are deactivated
-- Includes RPC functions for request workflow

-- Create reactivation requests table
create table if not exists public.organization_reactivation_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_notes text,
  processed_by uuid references auth.users(id),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add audit fields to organizations table
alter table public.organizations
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivated_by uuid references auth.users(id),
  add column if not exists deactivation_reason text;

-- Enable RLS on reactivation requests
alter table public.organization_reactivation_requests enable row level security;

-- RLS Policy: Members of the org can view their reactivation requests
create policy "Members can view org reactivation requests"
  on organization_reactivation_requests for select
  using (is_org_member(org_id));

-- RLS Policy: Members can create reactivation requests for their org
create policy "Members can create reactivation requests"
  on organization_reactivation_requests for insert
  with check (is_org_member(org_id));

-- RLS Policy: Service role can manage all requests
create policy "Service role can manage all reactivation requests"
  on organization_reactivation_requests for all
  using (is_service_role_user());

-- Indexes for performance
create index if not exists idx_org_reactivation_requests_org_id
  on organization_reactivation_requests(org_id);
create index if not exists idx_org_reactivation_requests_status
  on organization_reactivation_requests(status);

-- RPC function to request reactivation
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
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;

  -- Check if user is member of the org
  if not is_org_member(p_org_id) then
    return jsonb_build_object('success', false, 'error', 'Not a member of this organization');
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

  -- TODO: BILLING - Add logic to check if billing issues are resolved before allowing reactivation
  -- TODO: BILLING - Validate payment method exists and is valid
  -- TODO: BILLING - Check for outstanding invoices

  return jsonb_build_object(
    'success', true,
    'message', 'Reactivation request submitted',
    'request_id', v_request_id
  );
end;
$$;

-- RPC function to approve reactivation (admin only)
create or replace function approve_organization_reactivation(
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
  v_org_id uuid;
  v_request_status text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;

  -- Get request details
  select org_id, status into v_org_id, v_request_status
  from organization_reactivation_requests
  where id = p_request_id;

  if v_org_id is null then
    return jsonb_build_object('success', false, 'error', 'Request not found');
  end if;

  if v_request_status != 'pending' then
    return jsonb_build_object('success', false, 'error', 'Request already processed');
  end if;

  -- TODO: PLATFORM_ADMIN - Add check that user is platform admin
  -- For now, allow any authenticated user (will be restricted by RLS and UI)

  -- Update request
  update organization_reactivation_requests
  set status = 'approved',
      processed_by = v_user_id,
      processed_at = now()
  where id = p_request_id;

  -- Reactivate the organization
  update organizations
  set is_active = true,
      deactivated_at = null,
      deactivated_by = null
  where id = v_org_id;

  return jsonb_build_object('success', true, 'message', 'Organization reactivated');
end;
$$;

-- RPC function to reject reactivation (admin only)
create or replace function reject_organization_reactivation(
  p_request_id uuid,
  p_admin_notes text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
  v_org_id uuid;
  v_request_status text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;

  -- Get request details
  select org_id, status into v_org_id, v_request_status
  from organization_reactivation_requests
  where id = p_request_id;

  if v_org_id is null then
    return jsonb_build_object('success', false, 'error', 'Request not found');
  end if;

  if v_request_status != 'pending' then
    return jsonb_build_object('success', false, 'error', 'Request already processed');
  end if;

  -- TODO: PLATFORM_ADMIN - Add check that user is platform admin

  -- Update request
  update organization_reactivation_requests
  set status = 'rejected',
      admin_notes = p_admin_notes,
      processed_by = v_user_id,
      processed_at = now()
  where id = p_request_id;

  -- TODO: BILLING - If rejected due to billing, include specific billing error message

  return jsonb_build_object('success', true, 'message', 'Reactivation request rejected');
end;
$$;

-- TODO: BILLING - Add these columns for future billing integration
-- alter table public.organizations add column if not exists:
--   stripe_customer_id text,
--   stripe_subscription_id text,
--   subscription_status text check (subscription_status in ('active', 'past_due', 'cancelled', 'trialing')),
--   trial_ends_at timestamptz,
--   grace_period_expires_at timestamptz,
--   next_billing_date timestamptz,
--   billing_email text;
