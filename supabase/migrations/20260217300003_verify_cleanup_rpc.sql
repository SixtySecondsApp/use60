-- Migration: Add verify_organization_cleanup RPC
-- Purpose: Server-side verification that organization cleanup completed successfully
-- Author: Sonnet-Backend
-- Date: 2026-02-17
-- Related: ONBOARD-010 - Verify reset flow deletes all related records

-- RPC function to verify organization cleanup after reset
CREATE OR REPLACE FUNCTION public.verify_organization_cleanup(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_exists boolean;
  v_enrichment_count int;
  v_join_requests_count int;
  v_skills_count int;
  v_context_count int;
  v_memberships_count int;
  v_reengagement_count int;
  v_cleanup_complete boolean;
  v_remaining_records jsonb;
BEGIN
  -- Authorization: Verify user has access to this organization
  -- User must be creator, member, or admin to verify cleanup
  IF NOT (
    EXISTS(SELECT 1 FROM organizations WHERE id = p_org_id AND created_by = auth.uid())
    OR EXISTS(SELECT 1 FROM organization_memberships WHERE org_id = p_org_id AND user_id = auth.uid())
    OR is_admin_optimized()
  ) THEN
    RAISE EXCEPTION 'Unauthorized: User does not have access to this organization' USING ERRCODE = '42501';
  END IF;

  -- Check if organization still exists
  SELECT EXISTS(
    SELECT 1 FROM organizations WHERE id = p_org_id
  ) INTO v_org_exists;

  -- Count remaining child records
  SELECT COUNT(*) INTO v_enrichment_count
  FROM organization_enrichment
  WHERE organization_id = p_org_id;

  SELECT COUNT(*) INTO v_join_requests_count
  FROM organization_join_requests
  WHERE org_id = p_org_id;

  SELECT COUNT(*) INTO v_skills_count
  FROM organization_skills
  WHERE organization_id = p_org_id;

  SELECT COUNT(*) INTO v_context_count
  FROM organization_context
  WHERE organization_id = p_org_id;

  SELECT COUNT(*) INTO v_memberships_count
  FROM organization_memberships
  WHERE org_id = p_org_id;

  SELECT COUNT(*) INTO v_reengagement_count
  FROM reengagement_log
  WHERE org_id = p_org_id;

  -- Cleanup is complete if org and all child records are gone
  v_cleanup_complete := NOT v_org_exists
    AND v_enrichment_count = 0
    AND v_join_requests_count = 0
    AND v_skills_count = 0
    AND v_context_count = 0
    AND v_memberships_count = 0
    AND v_reengagement_count = 0;

  -- Build detailed result showing what remains (for debugging)
  v_remaining_records := jsonb_build_object(
    'organizations', CASE WHEN v_org_exists THEN 1 ELSE 0 END,
    'organization_enrichment', v_enrichment_count,
    'organization_join_requests', v_join_requests_count,
    'organization_skills', v_skills_count,
    'organization_context', v_context_count,
    'organization_memberships', v_memberships_count,
    'reengagement_log', v_reengagement_count
  );

  RETURN jsonb_build_object(
    'cleanup_complete', v_cleanup_complete,
    'organization_id', p_org_id,
    'remaining_records', v_remaining_records,
    'verified_at', NOW()
  );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.verify_organization_cleanup(uuid) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.verify_organization_cleanup(uuid) IS
'Verifies that organization cleanup completed successfully after resetAndCleanup(). Returns detailed breakdown of any remaining records for debugging. Authorization: User must be org creator, member, or admin. Part of ONBOARD-010 bugfix.';
