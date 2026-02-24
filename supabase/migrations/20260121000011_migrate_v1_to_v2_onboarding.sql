-- Migration: Mark all V1 onboarding records as complete to force V2 flow
-- Purpose: Reset V1 onboarding progress to ensure users get fresh V2 experience
--
-- V1 Steps (old): welcome, org_setup, team_invite, fathom_connect, sync, complete
-- V2 Steps (new): website_input, manual_enrichment, enrichment_loading, enrichment_result, skills_config, complete
--
-- This migration marks all incomplete V1 records as complete, which will trigger
-- needsOnboarding = false in useOnboardingProgress hook, allowing users to start V2

-- Update any V1 onboarding records that are incomplete
UPDATE user_onboarding_progress
SET
  onboarding_step = 'complete',
  onboarding_completed_at = NOW(),
  updated_at = NOW()
WHERE onboarding_step IN ('welcome', 'org_setup', 'team_invite', 'fathom_connect', 'sync')
  AND onboarding_completed_at IS NULL;

-- Update table comment to document version history
COMMENT ON TABLE user_onboarding_progress IS
'Tracks user onboarding progress.
V1 steps (deprecated): welcome, org_setup, team_invite, fathom_connect, sync, complete
V2 steps (current): website_input, manual_enrichment, pending_approval, enrichment_loading, enrichment_result, skills_config, complete
Migration 20260121000011 transitioned all V1 incomplete records to complete status to force V2 flow.';
