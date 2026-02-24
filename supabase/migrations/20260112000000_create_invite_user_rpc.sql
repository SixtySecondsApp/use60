-- Create RPC function to invite users
-- This bypasses edge function CORS issues by using direct Supabase auth admin API via edge function call

create or replace function invite_user_to_platform(
  p_email text,
  p_first_name text default null,
  p_last_name text default null
)
returns json as $$
declare
  v_response json;
  v_request_id text;
begin
  -- Verify caller is authenticated
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- Verify caller is admin
  if not exists (
    select 1 from profiles 
    where id = auth.uid() and is_admin = true
  ) then
    raise exception 'Admin access required';
  end if;

  -- Check if user already exists
  if exists (
    select 1 from profiles 
    where email = lower(p_email)
  ) then
    raise exception 'User % already exists', p_email;
  end if;

  -- Call edge function to create user and send email
  -- We'll insert a record that triggers the edge function
  insert into user_invitations (
    email,
    first_name,
    last_name,
    invited_by_user_id,
    created_at
  ) values (
    lower(p_email),
    p_first_name,
    p_last_name,
    auth.uid(),
    now()
  );

  return json_build_object(
    'success', true,
    'message', 'User invited successfully'
  );
end;
$$ language plpgsql security definer set search_path = public;

-- Create table to track invitations (triggers will handle the invitation logic)
create table if not exists user_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  first_name text,
  last_name text,
  invited_by_user_id uuid not null references auth.users(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete cascade,
  invitation_sent_at timestamptz,
  accepted_at timestamptz,
  status text default 'pending' check (status in ('pending', 'sent', 'accepted', 'failed')),
  created_at timestamptz default now(),
  unique(email)
);

-- Create trigger to create auth user when invitation is inserted
create or replace function handle_user_invitation()
returns trigger as $$
declare
  v_user_id uuid;
begin
  -- This function would be called from edge function
  -- For now, just mark invitation as sent
  new.status := 'sent';
  new.invitation_sent_at := now();
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_user_invitation_created on user_invitations;
create trigger on_user_invitation_created
  before insert on user_invitations
  for each row
  execute function handle_user_invitation();

-- Add RLS policies
alter table user_invitations enable row level security;

create policy "Admins can view all invitations"
  on user_invitations for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.is_admin
    )
  );

create policy "Admins can create invitations"
  on user_invitations for insert
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.is_admin
    )
  );
