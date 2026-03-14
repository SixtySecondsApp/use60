-- Migration: skills_brain_context
-- Date: 20260314200945
--
-- What this migration does:
--   SBI-003: Adds `brain_context` array to platform_skills.frontmatter JSONB
--   for the 10 most impactful skills, declaring which Brain tables each skill
--   needs so the copilot auto-injects relevant memory context before execution.
--
-- Rollback strategy:
--   UPDATE platform_skills SET frontmatter = frontmatter - 'brain_context', updated_at = now()
--   WHERE skill_key IN ('followup-reply-drafter', 'copilot-followup', 'copilot-chase',
--     'warm-intro-drafter', 'deal-next-best-actions', 'deal-rescue-plan',
--     'deal-slippage-diagnosis', 'deal-intelligence-summary', 'meeting-prep-brief',
--     'coaching-analysis');
--
-- The `||` JSONB operator merges keys, so running this migration twice is safe
-- (idempotent). If a skill_key doesn't exist, the UPDATE affects 0 rows (no error).
--
-- Skills found in platform_skills (have seed migrations):
--   - followup-reply-drafter       (contact-focused)  — seed 20260114000018
--   - deal-next-best-actions       (deal-focused)     — seed 20260114000001
--   - deal-rescue-plan             (deal-focused)     — seed 20260114000010
--   - deal-slippage-diagnosis      (deal-focused)     — seed 20260114000019
--   - meeting-prep-brief           (both)             — seed 20260114000001
--
-- Skills that may not exist yet (UPDATE is safe — 0 rows affected):
--   - copilot-followup             (contact-focused)
--   - copilot-chase                (contact-focused)
--   - warm-intro-drafter           (contact-focused)
--   - deal-intelligence-summary    (deal-focused)
--   - coaching-analysis            (both)

-- =============================================================================
-- Contact-focused skills → ['contact_memory', 'copilot_memories']
-- =============================================================================

-- followup-reply-drafter (FOUND in seed migration 20260114000018)
UPDATE platform_skills
SET frontmatter = frontmatter || '{"brain_context": ["contact_memory", "copilot_memories"]}'::jsonb,
    updated_at = now()
WHERE skill_key = 'followup-reply-drafter' AND is_current = true;

-- copilot-followup (may not exist — 0 rows is OK)
UPDATE platform_skills
SET frontmatter = frontmatter || '{"brain_context": ["contact_memory", "copilot_memories"]}'::jsonb,
    updated_at = now()
WHERE skill_key = 'copilot-followup' AND is_current = true;

-- copilot-chase (may not exist — 0 rows is OK)
UPDATE platform_skills
SET frontmatter = frontmatter || '{"brain_context": ["contact_memory", "copilot_memories"]}'::jsonb,
    updated_at = now()
WHERE skill_key = 'copilot-chase' AND is_current = true;

-- warm-intro-drafter (may not exist — 0 rows is OK)
UPDATE platform_skills
SET frontmatter = frontmatter || '{"brain_context": ["contact_memory", "copilot_memories"]}'::jsonb,
    updated_at = now()
WHERE skill_key = 'warm-intro-drafter' AND is_current = true;

-- =============================================================================
-- Deal-focused skills → ['deal_memory_events', 'commitments']
-- =============================================================================

-- deal-next-best-actions (FOUND in seed migration 20260114000001)
UPDATE platform_skills
SET frontmatter = frontmatter || '{"brain_context": ["deal_memory_events", "commitments"]}'::jsonb,
    updated_at = now()
WHERE skill_key = 'deal-next-best-actions' AND is_current = true;

-- deal-rescue-plan (FOUND in seed migration 20260114000010)
UPDATE platform_skills
SET frontmatter = frontmatter || '{"brain_context": ["deal_memory_events", "commitments"]}'::jsonb,
    updated_at = now()
WHERE skill_key = 'deal-rescue-plan' AND is_current = true;

-- deal-slippage-diagnosis (FOUND in seed migration 20260114000019)
UPDATE platform_skills
SET frontmatter = frontmatter || '{"brain_context": ["deal_memory_events", "commitments"]}'::jsonb,
    updated_at = now()
WHERE skill_key = 'deal-slippage-diagnosis' AND is_current = true;

-- deal-intelligence-summary (may not exist — 0 rows is OK)
UPDATE platform_skills
SET frontmatter = frontmatter || '{"brain_context": ["deal_memory_events", "commitments"]}'::jsonb,
    updated_at = now()
WHERE skill_key = 'deal-intelligence-summary' AND is_current = true;

-- =============================================================================
-- Both (contact + deal) → ['contact_memory', 'deal_memory_events', 'copilot_memories', 'commitments']
-- =============================================================================

-- meeting-prep-brief (FOUND in seed migration 20260114000001)
UPDATE platform_skills
SET frontmatter = frontmatter || '{"brain_context": ["contact_memory", "deal_memory_events", "copilot_memories", "commitments"]}'::jsonb,
    updated_at = now()
WHERE skill_key = 'meeting-prep-brief' AND is_current = true;

-- coaching-analysis (may not exist as platform_skills row — 0 rows is OK)
UPDATE platform_skills
SET frontmatter = frontmatter || '{"brain_context": ["contact_memory", "deal_memory_events", "copilot_memories", "commitments"]}'::jsonb,
    updated_at = now()
WHERE skill_key = 'coaching-analysis' AND is_current = true;
