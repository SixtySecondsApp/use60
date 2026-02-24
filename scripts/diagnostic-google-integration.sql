-- Check if google_integrations table exists and has data
SELECT 'Google Integrations Table Status' as check_name;
SELECT 
  EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'google_integrations'
  ) as table_exists;

-- If table exists, check the schema
SELECT 
  column_name, 
  data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'google_integrations'
ORDER BY ordinal_position;

-- Check for any google integrations
SELECT 
  user_id, 
  email, 
  is_active, 
  created_at,
  CASE WHEN refresh_token IS NOT NULL THEN 'Yes' ELSE 'No' END as has_refresh_token
FROM public.google_integrations
LIMIT 10;
