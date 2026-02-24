-- Migration: Backfill missing first_name and last_name in existing profiles
-- Problem: Existing profiles created before the fix might have empty first_name/last_name
-- Solution: Update profiles with names from their corresponding auth.users records

UPDATE public.profiles p
SET
  first_name = COALESCE(
    NULLIF(p.first_name, ''),
    au.raw_user_meta_data->>'first_name',
    ''
  ),
  last_name = COALESCE(
    NULLIF(p.last_name, ''),
    au.raw_user_meta_data->>'last_name',
    ''
  ),
  updated_at = NOW()
FROM auth.users au
WHERE p.id = au.id
  AND (
    p.first_name = '' OR p.first_name IS NULL
    OR p.last_name = '' OR p.last_name IS NULL
  )
  AND (
    au.raw_user_meta_data->>'first_name' IS NOT NULL
    OR au.raw_user_meta_data->>'last_name' IS NOT NULL
  );

-- Log the results
DO $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % profile records with names from auth metadata', v_updated_count;
END $$;
