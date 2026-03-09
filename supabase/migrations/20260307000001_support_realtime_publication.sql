-- Enable Realtime for support_tickets so agents and admins
-- receive live ticket status changes via postgres_changes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'support_tickets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
  END IF;
END $$;

-- Full replica identity ensures UPDATE/DELETE payloads include all columns
ALTER TABLE public.support_tickets REPLICA IDENTITY FULL;

-- Enable Realtime for support_messages so chat UIs
-- receive new messages and edits in real time.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'support_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
  END IF;
END $$;

-- Full replica identity ensures UPDATE/DELETE payloads include all columns
ALTER TABLE public.support_messages REPLICA IDENTITY FULL;
