-- Enable Realtime for command_centre_items
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.command_centre_items;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Full replica identity ensures UPDATE payloads include all columns
ALTER TABLE public.command_centre_items REPLICA IDENTITY FULL;
