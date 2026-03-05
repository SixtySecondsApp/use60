-- Recreate RPCs that are returning 404 on production.
-- Both functions exist in baseline + fix_rpc_function_search_paths migrations,
-- but appear missing on production (likely silent failure during original apply).
-- Safe to re-run: both use CREATE OR REPLACE.

-- =============================================================================
-- get_team_members_with_connected_accounts
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_team_members_with_connected_accounts()
RETURNS TABLE(
  user_id uuid,
  email text,
  full_name text,
  meeting_count bigint,
  indexed_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fi.user_id,
    COALESCE(fi.fathom_user_email, u.email)::text,
    COALESCE(
      u.raw_user_meta_data->>'full_name',
      u.raw_user_meta_data->>'name',
      split_part(COALESCE(fi.fathom_user_email, u.email), '@', 1)
    )::text,
    COUNT(DISTINCT m.id) FILTER (
      WHERE m.transcript_text IS NOT NULL
      AND m.transcript_text != ''
    ),
    COUNT(DISTINCT mfi.meeting_id) FILTER (
      WHERE mfi.status = 'indexed'
    )
  FROM public.fathom_integrations fi
  INNER JOIN auth.users u ON fi.user_id = u.id
  LEFT JOIN public.meetings m ON m.owner_user_id = fi.user_id
  LEFT JOIN public.meeting_file_search_index mfi ON m.id = mfi.meeting_id
  WHERE fi.is_active = true
  GROUP BY fi.user_id, fi.fathom_user_email, u.email, u.raw_user_meta_data
  HAVING COUNT(DISTINCT m.id) FILTER (
    WHERE m.transcript_text IS NOT NULL
    AND m.transcript_text != ''
  ) > 0
  ORDER BY full_name;
END;
$$;

COMMENT ON FUNCTION public.get_team_members_with_connected_accounts()
  IS 'Returns team members with active Fathom integrations who have meetings with transcripts';

GRANT EXECUTE ON FUNCTION public.get_team_members_with_connected_accounts() TO anon;
GRANT EXECUTE ON FUNCTION public.get_team_members_with_connected_accounts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_members_with_connected_accounts() TO service_role;

-- =============================================================================
-- get_org_meeting_index_status
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_org_meeting_index_status(
  p_org_id uuid,
  p_target_user_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  indexed_count bigint,
  total_meetings bigint,
  pending_count bigint,
  failed_count bigint,
  last_indexed_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(mfi.id) FILTER (WHERE mfi.status = 'indexed') as indexed_count,
    COUNT(DISTINCT m.id) as total_meetings,
    COUNT(miq.id) as pending_count,
    COUNT(mfi.id) FILTER (WHERE mfi.status = 'failed') as failed_count,
    MAX(mfi.indexed_at) as last_indexed_at
  FROM public.meetings m
  INNER JOIN public.organization_memberships om
    ON m.owner_user_id = om.user_id
    AND om.org_id = p_org_id
  LEFT JOIN public.meeting_file_search_index mfi ON m.id = mfi.meeting_id
  LEFT JOIN public.meeting_index_queue miq ON m.id = miq.meeting_id
  WHERE (p_target_user_id IS NULL OR m.owner_user_id = p_target_user_id)
    AND m.transcript_text IS NOT NULL
    AND m.transcript_text != '';
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_meeting_index_status(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_org_meeting_index_status(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_meeting_index_status(uuid, uuid) TO service_role;
