-- Fix meeting_index_queue RLS to allow team-wide meeting indexing
--
-- Bug: When a user triggers "index all team meetings", the code queues items with
-- user_id = meeting.owner_user_id (the meeting's actual owner). The old INSERT policy
-- only allowed user_id = auth.uid(), so any queue item whose owner differs from the
-- calling user (i.e. a teammate's meeting) was rejected with a 403.
--
-- Fix: The INSERT policy now also allows inserting when the meeting belongs to the
-- caller's organization. SELECT/UPDATE/DELETE policies are updated consistently to
-- allow org-member access, matching the same principle.

-- ─── INSERT ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "meeting_index_queue_insert" ON meeting_index_queue;

DO $$ BEGIN
  CREATE POLICY "meeting_index_queue_insert" ON meeting_index_queue
FOR INSERT WITH CHECK (
  "public"."is_service_role"()
  OR EXISTS (
    SELECT 1 FROM meetings m
    WHERE m.id = meeting_id
    AND (
      -- User is inserting for their own meeting
      m.owner_user_id = (SELECT auth.uid())
      -- OR user is a member of the org that owns the meeting (team-wide indexing)
      OR m.org_id IN (
        SELECT org_id FROM organization_memberships
        WHERE user_id = (SELECT auth.uid())
      )
    )
  )
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── SELECT ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "meeting_index_queue_select" ON meeting_index_queue;

DO $$ BEGIN
  CREATE POLICY "meeting_index_queue_select" ON meeting_index_queue
FOR SELECT USING (
  "public"."is_service_role"()
  OR "public"."is_admin_optimized"()
  OR (user_id = (SELECT auth.uid()))
  OR EXISTS (
    SELECT 1 FROM meetings m
    WHERE m.id = meeting_id
    AND m.org_id IN (
      SELECT org_id FROM organization_memberships
      WHERE user_id = (SELECT auth.uid())
    )
  )
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── UPDATE ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "meeting_index_queue_update" ON meeting_index_queue;

DO $$ BEGIN
  CREATE POLICY "meeting_index_queue_update" ON meeting_index_queue
FOR UPDATE USING (
  "public"."is_service_role"()
  OR "public"."is_admin_optimized"()
  OR (user_id = (SELECT auth.uid()))
  OR EXISTS (
    SELECT 1 FROM meetings m
    WHERE m.id = meeting_id
    AND m.org_id IN (
      SELECT org_id FROM organization_memberships
      WHERE user_id = (SELECT auth.uid())
    )
  )
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── DELETE ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "meeting_index_queue_delete" ON meeting_index_queue;

DO $$ BEGIN
  CREATE POLICY "meeting_index_queue_delete" ON meeting_index_queue
FOR DELETE USING (
  "public"."is_service_role"()
  OR "public"."is_admin_optimized"()
  OR (user_id = (SELECT auth.uid()))
  OR EXISTS (
    SELECT 1 FROM meetings m
    WHERE m.id = meeting_id
    AND m.org_id IN (
      SELECT org_id FROM organization_memberships
      WHERE user_id = (SELECT auth.uid())
    )
  )
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
