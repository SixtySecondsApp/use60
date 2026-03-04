-- Enable Realtime for command_centre_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'command_centre_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.command_centre_items;
  END IF;
END $$;

-- Full replica identity ensures UPDATE payloads include all columns
ALTER TABLE public.command_centre_items REPLICA IDENTITY FULL;
