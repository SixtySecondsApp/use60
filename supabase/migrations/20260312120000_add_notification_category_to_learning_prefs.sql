-- Migration: add_notification_category_to_learning_prefs
-- Date: 20260312120000
--
-- What this migration does:
--   Adds 'notification' category to learning_preferences check constraint
--   so meeting classification feedback can be stored.
--
-- Rollback strategy:
--   ALTER TABLE learning_preferences DROP CONSTRAINT IF EXISTS learning_preferences_category_check;
--   ALTER TABLE learning_preferences ADD CONSTRAINT learning_preferences_category_check
--     CHECK (category IN ('tone','length','greeting','sign_off','structure','content','general'));

ALTER TABLE learning_preferences DROP CONSTRAINT IF EXISTS learning_preferences_category_check;
ALTER TABLE learning_preferences ADD CONSTRAINT learning_preferences_category_check
  CHECK (category IN ('tone','length','greeting','sign_off','structure','content','general','notification'));
