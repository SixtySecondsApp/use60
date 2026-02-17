-- ============================================================================
-- MANUAL MIGRATION APPLICATION FOR STAGING
-- ============================================================================
-- Run this in Supabase Dashboard > SQL Editor
-- Project: caerqjzvuerejfrdtygb (Staging)
-- URL: https://supabase.com/dashboard/project/caerqjzvuerejfrdtygb/sql
-- ============================================================================
--
-- ⚠️ IMPORTANT: meeting_action_items is NOT disabled - it has active Realtime
-- subscriptions in meetingActionItemsSyncService.ts for task sync on meeting pages

-- Disable Realtime on background/queue tables (Zero UX Impact)
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.ai_search_index_queue;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.email_sync_queue;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.workflow_execution_logs;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.cost_tracking;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.communication_events;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.meeting_transcripts;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.email_messages;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.meeting_attendees;
-- NOTE: meeting_action_items intentionally NOT disabled (has active subscriptions)

-- Record this migration as applied (prevents re-running)
INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES (
  '20260217220000',
  ARRAY[
    'ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.ai_search_index_queue',
    'ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.email_sync_queue',
    'ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.workflow_execution_logs',
    'ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.cost_tracking',
    'ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.communication_events',
    'ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.meeting_transcripts',
    'ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.email_messages',
    'ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.meeting_attendees'
  ],
  'optimize_realtime_subscriptions'
)
ON CONFLICT (version) DO NOTHING;

-- Verify which tables are still enabled for Realtime
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- Expected result: These 8 tables should NO LONGER appear in the list
-- ✅ Removed: ai_search_index_queue
-- ✅ Removed: communication_events
-- ✅ Removed: cost_tracking
-- ✅ Removed: email_messages
-- ✅ Removed: email_sync_queue
-- ✅ Removed: meeting_attendees
-- ✅ Removed: meeting_transcripts
-- ✅ Removed: workflow_execution_logs
--
-- These should STILL APPEAR (Active Realtime Subscriptions):
-- ✅ Kept: meeting_action_items (meetingActionItemsSyncService.ts)
-- ✅ Kept: agent_runs (useAgentRunsRealtime.ts - Ops feature)
-- ✅ Kept: All tables in useRealtimeHub.ts
