-- ============================================================================
-- Migration: Backfill user_time_preferences + fix Phil's org membership
-- Purpose: The user_time_preferences table was empty, preventing the EOD
--          and morning briefing agents from finding eligible users.
--          Also adds Phil's missing organization_membership record so he
--          can receive org-scoped agent deliveries.
-- Date: 2026-02-23
-- ============================================================================

-- ============================================================================
-- 1. Fix Phil's missing org membership
--    Phil (e783d627) has a profile and Slack mapping but no org membership.
--    He last logged in 2026-01-05 — clearly an active user.
-- ============================================================================

INSERT INTO organization_memberships (user_id, org_id, role)
VALUES (
  'e783d627-bbc6-4fac-b7d0-3913cb45b4b8',  -- Phil (phil@sixtyseconds.video)
  '1d1b4274-c9c4-4cb7-9efc-243c90c86f4c',  -- Sixty Seconds org
  'member'
)
ON CONFLICT (user_id, org_id) DO NOTHING;

-- ============================================================================
-- 2. Backfill user_time_preferences for all org members
--    Default: Europe/London timezone (UK-based team), standard 08:00/17:00
--    Users can update their own preferences later via the settings UI.
-- ============================================================================

INSERT INTO user_time_preferences (user_id, org_id, timezone, eod_time, morning_time, working_days)
VALUES
  -- Andrew Bryce (org owner) — andrew.bryce@sixtyseconds.video
  (
    'ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459',
    '1d1b4274-c9c4-4cb7-9efc-243c90c86f4c',
    'Europe/London',
    '17:00',
    '08:00',
    '["Mon","Tue","Wed","Thu","Fri"]'::jsonb
  ),
  -- Rishi Rais (org admin) — rishirais24@gmail.com
  (
    'd07ae8b1-f711-4f5c-bef7-ed562987d38d',
    '1d1b4274-c9c4-4cb7-9efc-243c90c86f4c',
    'Europe/London',
    '17:00',
    '08:00',
    '["Mon","Tue","Wed","Thu","Fri"]'::jsonb
  ),
  -- Max Parish (org owner) — max.parish@sixtyseconds.video
  (
    'acf9cc34-ccad-4363-be67-8e381a912669',
    '1d1b4274-c9c4-4cb7-9efc-243c90c86f4c',
    'Europe/London',
    '17:00',
    '08:00',
    '["Mon","Tue","Wed","Thu","Fri"]'::jsonb
  ),
  -- Phil (member) — phil@sixtyseconds.video
  (
    'e783d627-bbc6-4fac-b7d0-3913cb45b4b8',
    '1d1b4274-c9c4-4cb7-9efc-243c90c86f4c',
    'Europe/London',
    '17:00',
    '08:00',
    '["Mon","Tue","Wed","Thu","Fri"]'::jsonb
  ),
  -- Angelo (org admin) — aandrianantenaina@nextaura.com
  (
    '2b5c8ec1-3b51-4f10-9b53-26fe8dc0da0a',
    '1d1b4274-c9c4-4cb7-9efc-243c90c86f4c',
    'Europe/London',
    '17:00',
    '08:00',
    '["Mon","Tue","Wed","Thu","Fri"]'::jsonb
  )
ON CONFLICT (user_id, org_id) DO NOTHING;

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM user_time_preferences;
  RAISE NOTICE 'user_time_preferences now has % rows', v_count;

  SELECT count(*) INTO v_count
  FROM organization_memberships
  WHERE user_id = 'e783d627-bbc6-4fac-b7d0-3913cb45b4b8';
  RAISE NOTICE 'Phil org memberships: %', v_count;
END $$;
