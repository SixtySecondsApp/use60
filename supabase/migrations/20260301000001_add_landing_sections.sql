-- =============================================================================
-- Add sections JSONB column to landing_builder_sessions
--
-- Stores structured section data for progressive assembly.
-- Each section has type, copy, layout_variant, asset URLs, and status.
-- =============================================================================

ALTER TABLE public.landing_builder_sessions
  ADD COLUMN IF NOT EXISTS sections jsonb DEFAULT '[]'::jsonb;
