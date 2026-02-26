-- =============================================================================
-- Add missing indexes identified from query performance analysis
-- =============================================================================
-- Fixes 3 slow queries:
-- 1. contacts ORDER BY created_at DESC  (177ms avg, 12K calls)
-- 2. contacts RLS filtering by org_id   (no index, sequential scan)
-- 3. meetings WHERE owner_email = X     (179ms avg, max 2.1s, OR scan)
-- =============================================================================

-- 1. contacts: ORDER BY created_at DESC (used by PostgREST pagination)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_created_at
  ON public.contacts(created_at DESC);

-- 2. contacts: org_id (used by RLS policies on every query)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_org_id
  ON public.contacts(org_id);

-- 3. meetings: owner_email (used in OR filter alongside owner_user_id)
--    Allows PostgreSQL to bitmap-OR scan instead of seq scan
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_meetings_owner_email
  ON public.meetings(owner_email)
  WHERE owner_email IS NOT NULL;
