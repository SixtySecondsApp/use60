-- Enable realtime for proposals table so the progress overlay
-- receives generation_status transitions via postgres_changes.
ALTER PUBLICATION supabase_realtime ADD TABLE public.proposals;
