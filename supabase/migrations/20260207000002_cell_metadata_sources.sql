-- Add metadata JSONB column to dynamic_table_cells
-- Used for storing sources/citations from enrichments without polluting the value field.
-- Value stays clean for formulas and messaging; metadata is display-only.

ALTER TABLE public.dynamic_table_cells
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

COMMENT ON COLUMN public.dynamic_table_cells.metadata IS
  'Optional metadata (e.g. { "sources": [{ "title": "...", "url": "..." }] }). Not used in formulas or messaging.';

NOTIFY pgrst, 'reload schema';
