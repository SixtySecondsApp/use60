-- Migration: Ensure parishmax44@gmail.com profile has first_name and last_name
-- Problem: The user parishmax44@gmail.com is showing as "Unknown User" in team members
-- because their profile record exists but first_name/last_name are empty/NULL
--
-- Solution: Update the profile to have proper names

-- Update any profile with email 'parishmax44@gmail.com' to have first_name and last_name
UPDATE public.profiles
SET
  first_name = CASE
    WHEN first_name IS NULL OR first_name = '' THEN 'Max'
    ELSE first_name
  END,
  last_name = CASE
    WHEN last_name IS NULL OR last_name = '' THEN 'Parish'
    ELSE last_name
  END,
  updated_at = NOW()
WHERE email = 'parishmax44@gmail.com'
  AND (first_name IS NULL OR first_name = '' OR last_name IS NULL OR last_name = '');

-- Log result
DO $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count > 0 THEN
    RAISE NOTICE 'Updated profile for parishmax44@gmail.com with names (Max Parish)';
  ELSE
    RAISE NOTICE 'No profile found for parishmax44@gmail.com or already has names populated';
  END IF;
END $$;
