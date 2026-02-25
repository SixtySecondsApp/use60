-- Enable Realtime for command_centre_items
ALTER PUBLICATION supabase_realtime ADD TABLE public.command_centre_items;

-- Full replica identity ensures UPDATE payloads include all columns
ALTER TABLE public.command_centre_items REPLICA IDENTITY FULL;
