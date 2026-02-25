-- Migration: Update RLS policies for removed members
-- Purpose: Allow removed users to view but not edit their data
-- Story: ORGREM-007

-- Note: Existing RLS policies use organization_memberships for access control
-- We need to update them to allow SELECT for removed members but block UPDATE/DELETE

-- Drop and recreate policies for deals table
DROP POLICY IF EXISTS "Users can view their organization's deals" ON public.deals;
DO $$ BEGIN
  CREATE POLICY "Users can view their organization's deals"
ON public.deals
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_memberships.org_id = deals.org_id
      AND organization_memberships.user_id = auth.uid()
      -- Allow both active and removed members to view
      AND organization_memberships.member_status IN ('active', 'removed')
  )
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "Users can update their organization's deals" ON public.deals;
DO $$ BEGIN
  CREATE POLICY "Users can update their organization's deals"
ON public.deals
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_memberships.org_id = deals.org_id
      AND organization_memberships.user_id = auth.uid()
      -- Only active members can update
      AND organization_memberships.member_status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_memberships.org_id = deals.org_id
      AND organization_memberships.user_id = auth.uid()
      AND organization_memberships.member_status = 'active'
  )
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "Users can delete their organization's deals" ON public.deals;
DO $$ BEGIN
  CREATE POLICY "Users can delete their organization's deals"
ON public.deals
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_memberships.org_id = deals.org_id
      AND organization_memberships.user_id = auth.uid()
      -- Only active members can delete
      AND organization_memberships.member_status = 'active'
  )
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Update policies for contacts table
DROP POLICY IF EXISTS "Users can view their organization's contacts" ON public.contacts;
DO $$ BEGIN
  CREATE POLICY "Users can view their organization's contacts"
ON public.contacts
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_memberships.org_id = contacts.org_id
      AND organization_memberships.user_id = auth.uid()
      AND organization_memberships.member_status IN ('active', 'removed')
  )
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "Users can update their organization's contacts" ON public.contacts;
DO $$ BEGIN
  CREATE POLICY "Users can update their organization's contacts"
ON public.contacts
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_memberships.org_id = contacts.org_id
      AND organization_memberships.user_id = auth.uid()
      AND organization_memberships.member_status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_memberships.org_id = contacts.org_id
      AND organization_memberships.user_id = auth.uid()
      AND organization_memberships.member_status = 'active'
  )
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "Users can delete their organization's contacts" ON public.contacts;
DO $$ BEGIN
  CREATE POLICY "Users can delete their organization's contacts"
ON public.contacts
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_memberships.org_id = contacts.org_id
      AND organization_memberships.user_id = auth.uid()
      AND organization_memberships.member_status = 'active'
  )
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Update policies for activities table
DROP POLICY IF EXISTS "Users can view their organization's activities" ON public.activities;
DO $$ BEGIN
  CREATE POLICY "Users can view their organization's activities"
ON public.activities
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_memberships.org_id = activities.org_id
      AND organization_memberships.user_id = auth.uid()
      AND organization_memberships.member_status IN ('active', 'removed')
  )
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "Users can update their organization's activities" ON public.activities;
DO $$ BEGIN
  CREATE POLICY "Users can update their organization's activities"
ON public.activities
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_memberships.org_id = activities.org_id
      AND organization_memberships.user_id = auth.uid()
      AND organization_memberships.member_status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_memberships.org_id = activities.org_id
      AND organization_memberships.user_id = auth.uid()
      AND organization_memberships.member_status = 'active'
  )
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "Users can delete their organization's activities" ON public.activities;
DO $$ BEGIN
  CREATE POLICY "Users can delete their organization's activities"
ON public.activities
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_memberships.org_id = activities.org_id
      AND organization_memberships.user_id = auth.uid()
      AND organization_memberships.member_status = 'active'
  )
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Update policies for meetings table
DROP POLICY IF EXISTS "Users can view their organization's meetings" ON public.meetings;
DO $$ BEGIN
  CREATE POLICY "Users can view their organization's meetings"
ON public.meetings
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_memberships.org_id = meetings.org_id
      AND organization_memberships.user_id = auth.uid()
      AND organization_memberships.member_status IN ('active', 'removed')
  )
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "Users can update their organization's meetings" ON public.meetings;
DO $$ BEGIN
  CREATE POLICY "Users can update their organization's meetings"
ON public.meetings
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_memberships.org_id = meetings.org_id
      AND organization_memberships.user_id = auth.uid()
      AND organization_memberships.member_status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_memberships.org_id = meetings.org_id
      AND organization_memberships.user_id = auth.uid()
      AND organization_memberships.member_status = 'active'
  )
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "Users can delete their organization's meetings" ON public.meetings;
DO $$ BEGIN
  CREATE POLICY "Users can delete their organization's meetings"
ON public.meetings
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_memberships.org_id = meetings.org_id
      AND organization_memberships.user_id = auth.uid()
      AND organization_memberships.member_status = 'active'
  )
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Update policies for tasks table
DROP POLICY IF EXISTS "Users can view their organization's tasks" ON public.tasks;
DO $$ BEGIN
  CREATE POLICY "Users can view their organization's tasks"
ON public.tasks
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_memberships.org_id = tasks.org_id
      AND organization_memberships.user_id = auth.uid()
      AND organization_memberships.member_status IN ('active', 'removed')
  )
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "Users can update their organization's tasks" ON public.tasks;
DO $$ BEGIN
  CREATE POLICY "Users can update their organization's tasks"
ON public.tasks
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_memberships.org_id = tasks.org_id
      AND organization_memberships.user_id = auth.uid()
      AND organization_memberships.member_status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_memberships.org_id = tasks.org_id
      AND organization_memberships.user_id = auth.uid()
      AND organization_memberships.member_status = 'active'
  )
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "Users can delete their organization's tasks" ON public.tasks;
DO $$ BEGIN
  CREATE POLICY "Users can delete their organization's tasks"
ON public.tasks
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_memberships.org_id = tasks.org_id
      AND organization_memberships.user_id = auth.uid()
      AND organization_memberships.member_status = 'active'
  )
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add comments
COMMENT ON POLICY "Users can view their organization's deals" ON public.deals IS 'Allows active and removed members to view deals';
COMMENT ON POLICY "Users can update their organization's deals" ON public.deals IS 'Only active members can update deals';
COMMENT ON POLICY "Users can delete their organization's deals" ON public.deals IS 'Only active members can delete deals';
