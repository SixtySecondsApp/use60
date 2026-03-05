-- ============================================================================
-- Add bundled_credits to Basic plan
-- ============================================================================
-- Business rule: subscription credits are use-or-lose (expire at cycle end).
-- Credit packs never expire.
-- Deduction order: subscription credits → onboarding credits → packs (FIFO).
--
-- Pro already has bundled_credits: 250 in its features JSONB.
-- This migration adds bundled_credits: 50 to Basic plan.

UPDATE subscription_plans
SET features = features || '{"bundled_credits": 50}'::jsonb
WHERE slug = 'basic'
  AND (features->>'bundled_credits' IS NULL OR (features->>'bundled_credits')::int = 0);

-- Verify both plans have bundled_credits set
DO $$
DECLARE
  v_basic_credits INT;
  v_pro_credits INT;
BEGIN
  SELECT (features->>'bundled_credits')::int INTO v_basic_credits
  FROM subscription_plans WHERE slug = 'basic';

  SELECT (features->>'bundled_credits')::int INTO v_pro_credits
  FROM subscription_plans WHERE slug = 'pro';

  RAISE NOTICE 'Basic plan bundled_credits: %, Pro plan bundled_credits: %', v_basic_credits, v_pro_credits;

  IF v_basic_credits IS NULL OR v_basic_credits <= 0 THEN
    RAISE WARNING 'Basic plan bundled_credits not set correctly';
  END IF;
END $$;
