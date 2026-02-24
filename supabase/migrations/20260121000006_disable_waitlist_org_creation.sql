-- Migration: Disable automatic organization creation from waitlist
--
-- Purpose: Stop automatically creating organizations when users sign up
-- This allows onboarding to be the sole source of org creation/assignment
--
-- Impact:
-- - Existing organizations created by this trigger remain in database
-- - Waitlist entries still have company_name (preserved for history/reporting)
-- - New users will have no organization after signup (forces onboarding)

-- Drop the trigger first
DROP TRIGGER IF EXISTS "trigger_auto_org_for_new_user" ON "public"."profiles";

-- Drop the function
DROP FUNCTION IF EXISTS "public"."auto_create_org_for_new_user"();
