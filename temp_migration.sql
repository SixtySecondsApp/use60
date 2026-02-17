-- Disable Realtime on background tables
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.ai_search_index_queue;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.email_sync_queue;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.workflow_execution_logs;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.cost_tracking;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.communication_events;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.meeting_transcripts;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.email_messages;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.meeting_attendees;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.meeting_action_items;

-- Record in migration history
INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES (
  '20260217220000',
  ARRAY['ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.ai_search_index_queue', 'ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.email_sync_queue', 'ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.workflow_execution_logs', 'ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.cost_tracking', 'ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.communication_events', 'ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.meeting_transcripts', 'ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.email_messages', 'ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.meeting_attendees', 'ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.meeting_action_items'],
  'optimize_realtime_subscriptions'
)
ON CONFLICT (version) DO NOTHING;
