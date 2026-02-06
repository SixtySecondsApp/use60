-- Force Supabase schema cache refresh for organizations table
-- This ensures the approval_status, requires_admin_approval, similar_to_org_id, and approved_by columns
-- added in migration 20260130110400 are recognized by the REST API

-- Modify the table comment to force cache invalidation
COMMENT ON TABLE public.organizations IS 'Organizations and companies - schema cache refresh triggered for approval fields at 2026-02-04 14:11:00';
