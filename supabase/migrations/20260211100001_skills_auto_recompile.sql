-- Migration: Skills Auto-Recompile on Organization Context Change
-- When organization_context rows are inserted, updated, or deleted,
-- all active organization_skills for that org are flagged for recompilation.
-- The get_skills_needing_recompile function is updated to include these flagged rows.

-- =============================================================================
-- 1. Add columns to organization_skills
-- =============================================================================

-- needs_recompile: set to true when org context changes, cleared after recompilation
ALTER TABLE public.organization_skills
  ADD COLUMN IF NOT EXISTS needs_recompile boolean DEFAULT false NOT NULL;

COMMENT ON COLUMN public.organization_skills.needs_recompile
  IS 'Flag set by trigger when organization_context changes; cleared after recompilation';

-- context_hash: stores a hash of the org context at compile time for change detection
ALTER TABLE public.organization_skills
  ADD COLUMN IF NOT EXISTS context_hash text;

COMMENT ON COLUMN public.organization_skills.context_hash
  IS 'Hash of organization context values used during last compilation; enables change detection';

-- =============================================================================
-- 2. Trigger function: mark all active org skills for recompile
-- =============================================================================

CREATE OR REPLACE FUNCTION public.mark_org_skills_for_recompile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  -- Handle INSERT, UPDATE, and DELETE: use NEW for insert/update, OLD for delete
  v_org_id := COALESCE(NEW.organization_id, OLD.organization_id);

  UPDATE public.organization_skills
  SET needs_recompile = true,
      updated_at = now()
  WHERE organization_id = v_org_id
    AND is_active = true;

  -- Return appropriate row for trigger type
  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.mark_org_skills_for_recompile()
  IS 'Trigger function: flags all active organization skills for recompilation when organization_context changes';

-- =============================================================================
-- 3. Trigger on organization_context table
-- =============================================================================

-- Drop existing trigger if present (idempotent)
DROP TRIGGER IF EXISTS trg_org_context_changed ON public.organization_context;

CREATE TRIGGER trg_org_context_changed
  AFTER INSERT OR UPDATE OR DELETE
  ON public.organization_context
  FOR EACH ROW
  EXECUTE FUNCTION public.mark_org_skills_for_recompile();

COMMENT ON TRIGGER trg_org_context_changed ON public.organization_context
  IS 'Fires after any change to organization_context rows, marking org skills for recompilation';

-- =============================================================================
-- 4. Updated get_skills_needing_recompile function
--    Now also returns rows where needs_recompile = true
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_skills_needing_recompile(p_org_id uuid DEFAULT NULL)
RETURNS TABLE(organization_id uuid, skill_key text, platform_skill_id uuid, platform_version integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    os.organization_id,
    os.skill_id as skill_key,
    ps.id as platform_skill_id,
    ps.version as platform_version
  FROM public.organization_skills os
  JOIN public.platform_skills ps ON ps.skill_key = os.skill_id
  WHERE os.is_active = true
    AND ps.is_active = true
    AND (p_org_id IS NULL OR os.organization_id = p_org_id)
    AND (
      os.last_compiled_at IS NULL
      OR os.platform_skill_version IS NULL
      OR os.platform_skill_version < ps.version
      OR os.needs_recompile = true
    )
  ORDER BY os.organization_id, os.skill_id;
END;
$$;

COMMENT ON FUNCTION public.get_skills_needing_recompile(uuid)
  IS 'Returns organization skills that need compilation or recompilation, including those flagged by context changes';
