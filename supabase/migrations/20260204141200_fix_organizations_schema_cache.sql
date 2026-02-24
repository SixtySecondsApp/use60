-- Fix schema cache for organizations table
-- This ensures the approval fields are recognized by Supabase REST API

COMMENT ON TABLE public.organizations IS 'Organizations and companies - schema cache refresh for approval fields at 2026-02-04 14:12:00 UTC';
