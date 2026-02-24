-- Set tested seeded skills/sequences active; mark untested seeded items inactive
-- Date: 2026-01-14
--
-- IMPORTANT: We don't edit old migrations in place for environments that already applied them.
-- This migration updates is_active flags idempotently.

BEGIN;

-- Keep the tested skills active
UPDATE platform_skills
SET is_active = true, updated_at = now()
WHERE skill_key IN (
  'meeting-prep-brief',
  'meeting-digest-truth-extractor',
  'post-meeting-followup-drafter'
);

-- Keep the tested sequences active
UPDATE platform_skills
SET is_active = true, updated_at = now()
WHERE skill_key IN (
  'seq-meeting-prep',
  'seq-meeting-digest'
);

-- Mark untested seeded items inactive (until tested)
UPDATE platform_skills
SET is_active = false, updated_at = now()
WHERE skill_key IN (
  'deal-next-best-actions',
  'objection-to-playbook',
  'seq-deal-rescue-pack'
);

COMMIT;

