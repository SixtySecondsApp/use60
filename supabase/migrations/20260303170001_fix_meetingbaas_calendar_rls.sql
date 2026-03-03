-- Migration: Fix meetingbaas_calendars RLS — enforce org-level isolation
-- US-001: Calendar Access Leak Security Fix
-- Previously only filtered by user_id; now also filters by org_id

-- Enable RLS on the table if not already enabled
ALTER TABLE public.meetingbaas_calendars ENABLE ROW LEVEL SECURITY;

-- Drop any existing permissive policies that may not enforce org isolation
DROP POLICY IF EXISTS "Users can view their own calendars" ON public.meetingbaas_calendars;
DROP POLICY IF EXISTS "Users can insert their own calendars" ON public.meetingbaas_calendars;
DROP POLICY IF EXISTS "Users can update their own calendars" ON public.meetingbaas_calendars;
DROP POLICY IF EXISTS "Users can delete their own calendars" ON public.meetingbaas_calendars;
DROP POLICY IF EXISTS "meetingbaas_calendars_select_policy" ON public.meetingbaas_calendars;
DROP POLICY IF EXISTS "meetingbaas_calendars_insert_policy" ON public.meetingbaas_calendars;
DROP POLICY IF EXISTS "meetingbaas_calendars_update_policy" ON public.meetingbaas_calendars;
DROP POLICY IF EXISTS "meetingbaas_calendars_delete_policy" ON public.meetingbaas_calendars;

-- SELECT: User can only see calendars belonging to BOTH their user_id AND their org
-- This prevents cross-org calendar leakage (the bug: wu7sijusiq@wnbaldwy.com saw Sixty Seconds calendars)
CREATE POLICY "meetingbaas_calendars_select_policy"
  ON public.meetingbaas_calendars
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND (
      org_id IS NULL
      OR org_id IN (
        SELECT organization_id
        FROM public.organization_memberships
        WHERE user_id = auth.uid()
          AND status = 'active'
      )
    )
  );

-- INSERT: User can only insert calendars for themselves in their own org
CREATE POLICY "meetingbaas_calendars_insert_policy"
  ON public.meetingbaas_calendars
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      org_id IS NULL
      OR org_id IN (
        SELECT organization_id
        FROM public.organization_memberships
        WHERE user_id = auth.uid()
          AND status = 'active'
      )
    )
  );

-- UPDATE: User can only update their own calendars in their org
CREATE POLICY "meetingbaas_calendars_update_policy"
  ON public.meetingbaas_calendars
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND (
      org_id IS NULL
      OR org_id IN (
        SELECT organization_id
        FROM public.organization_memberships
        WHERE user_id = auth.uid()
          AND status = 'active'
      )
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND (
      org_id IS NULL
      OR org_id IN (
        SELECT organization_id
        FROM public.organization_memberships
        WHERE user_id = auth.uid()
          AND status = 'active'
      )
    )
  );

-- DELETE: User can only delete their own calendars
CREATE POLICY "meetingbaas_calendars_delete_policy"
  ON public.meetingbaas_calendars
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND (
      org_id IS NULL
      OR org_id IN (
        SELECT organization_id
        FROM public.organization_memberships
        WHERE user_id = auth.uid()
          AND status = 'active'
      )
    )
  );

-- Add an index to speed up the org_id lookups
CREATE INDEX IF NOT EXISTS idx_meetingbaas_calendars_user_org
  ON public.meetingbaas_calendars (user_id, org_id, is_active);
