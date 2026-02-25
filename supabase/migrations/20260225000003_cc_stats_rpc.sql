-- ============================================================================
-- Migration: Command Centre Stats RPC
-- Purpose: Server-side stats computation replacing client-side row counting.
--          Returns aggregate counts in a single efficient query.
-- Story: CC-003
-- Date: 2026-02-25
-- ============================================================================

CREATE OR REPLACE FUNCTION get_cc_stats(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  today_start TIMESTAMPTZ;
BEGIN
  today_start := date_trunc('day', now() AT TIME ZONE 'UTC');

  SELECT jsonb_build_object(
    'total_active', COUNT(*) FILTER (WHERE status IN ('open', 'enriching', 'ready')),
    'needs_review', COUNT(*) FILTER (WHERE status IN ('open', 'ready') AND drafted_action IS NOT NULL),
    'needs_input', COUNT(*) FILTER (WHERE requires_human_input IS NOT NULL AND array_length(requires_human_input, 1) > 0),
    'auto_completed_today', COUNT(*) FILTER (WHERE status = 'auto_resolved' AND resolved_at >= today_start),
    'resolved_today', COUNT(*) FILTER (WHERE status IN ('completed', 'dismissed', 'auto_resolved') AND resolved_at >= today_start),
    'pending_approval', COUNT(*) FILTER (WHERE status IN ('open', 'ready') AND drafted_action IS NOT NULL)
  ) INTO result
  FROM command_centre_items
  WHERE user_id = p_user_id;

  RETURN COALESCE(result, '{}'::jsonb);
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION get_cc_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_cc_stats(UUID) TO service_role;

-- Migration summary
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260225000003_cc_stats_rpc.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Story: CC-003';
  RAISE NOTICE '';
  RAISE NOTICE 'New RPC:';
  RAISE NOTICE '  get_cc_stats(p_user_id UUID) → JSONB';
  RAISE NOTICE '  Returns: total_active, needs_review, needs_input, auto_completed_today,';
  RAISE NOTICE '           resolved_today, pending_approval';
  RAISE NOTICE '============================================================================';
END $$;
