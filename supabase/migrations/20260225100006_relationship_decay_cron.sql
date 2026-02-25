-- ============================================================================
-- DM-012: Relationship Decay Cron + RPC (PRD-DM-001)
-- Weekly decay of contact_memory.relationship_strength
-- ============================================================================

-- RPC for efficient batch decay (avoids N+1 from application code)
CREATE OR REPLACE FUNCTION run_contact_relationship_decay(p_org_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE contact_memory
  SET
    relationship_strength = GREATEST(
      0.1,
      relationship_strength * CASE
        WHEN last_interaction_at > NOW() - INTERVAL '7 days' THEN 1.0
        WHEN last_interaction_at > NOW() - INTERVAL '14 days' THEN 0.98
        WHEN last_interaction_at > NOW() - INTERVAL '30 days' THEN 0.95
        WHEN last_interaction_at > NOW() - INTERVAL '60 days' THEN 0.90
        ELSE 0.85
      END
    ),
    updated_at = NOW()
  WHERE org_id = p_org_id
    AND last_interaction_at IS NOT NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION run_contact_relationship_decay(UUID) TO service_role;

-- Schedule: weekly Sunday 3am UTC
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('contact-relationship-decay')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'contact-relationship-decay');

    -- Note: The cron job would need to iterate orgs or we need an all-orgs version
    -- For now, the edge function handles org iteration
    RAISE NOTICE 'contact-relationship-decay — scheduled via fleet orchestrator (weekly Sunday 3am UTC)';
  END IF;
END $$;
