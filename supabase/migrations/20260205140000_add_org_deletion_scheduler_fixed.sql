-- Organization Deletion Scheduler (Fixed)
-- Adds column to track when organizations are scheduled for deletion (30 days after deactivation)
-- Creates trigger to automatically set deletion_scheduled_at when organization is deactivated

-- Add deletion_scheduled_at column to organizations table
alter table public.organizations
add column if not exists deletion_scheduled_at timestamptz;

-- Create trigger function to set deletion schedule when org is deactivated
create or replace function set_org_deletion_schedule()
returns trigger as $$
begin
  -- If organization is being deactivated (is_active transitioning from true to false)
  if new.is_active = false and old.is_active = true then
    new.deletion_scheduled_at := now() + interval '30 days';
  end if;

  -- If organization is being reactivated, clear the deletion schedule
  if new.is_active = true and old.is_active = false then
    new.deletion_scheduled_at := null;
  end if;

  return new;
end;
$$ language plpgsql;

-- Drop trigger if it already exists
drop trigger if exists org_set_deletion_on_deactivate on public.organizations;

-- Create trigger
create trigger org_set_deletion_on_deactivate
before update on public.organizations
for each row
execute function set_org_deletion_schedule();

-- Create index for efficient querying of orgs scheduled for deletion
-- Simple partial index (removed now() comparison as it's not immutable)
create index if not exists idx_organizations_deletion_scheduled_at
on organizations(deletion_scheduled_at)
where deletion_scheduled_at is not null;

-- Note: To find orgs ready for deletion, use this query:
-- SELECT * FROM organizations WHERE deletion_scheduled_at IS NOT NULL AND deletion_scheduled_at <= now();
-- The index above will still be used efficiently for this query.

-- Verification
DO $$
BEGIN
  RAISE NOTICE '✅ Added organization deletion scheduler';
END $$;
