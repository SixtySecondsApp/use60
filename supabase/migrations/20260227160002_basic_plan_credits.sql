-- CREDIT-004: Update Basic plan to 100 credits/month
-- Previously bundled_credits was 0 for Basic; Pro remains at 250.

UPDATE subscription_plans
SET features = jsonb_set(features, '{bundled_credits}', '100')
WHERE slug = 'basic';

-- Sanity check: verify Pro plan bundled_credits is still 250 (no-op assertion)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM subscription_plans
    WHERE slug = 'pro'
      AND (features->>'bundled_credits')::int = 250
  ) THEN
    RAISE EXCEPTION 'Pro plan bundled_credits sanity check failed — expected 250';
  END IF;
END;
$$;
