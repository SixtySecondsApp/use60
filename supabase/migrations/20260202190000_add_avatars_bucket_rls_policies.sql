-- Add RLS policies for avatars bucket
-- This migration creates policies to allow authenticated users to upload and update their own avatars

-- Policy 1: Public read access for all objects in avatars bucket
CREATE POLICY "Public read access for avatars"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'avatars');

-- Policy 2: Authenticated users can upload to avatars bucket
-- Files are named as {userId}-{timestamp}.{ext}
CREATE POLICY "Authenticated users can upload avatars"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND name ILIKE auth.uid()::text || '-%'
  );

-- Policy 3: Authenticated users can update their own avatars
CREATE POLICY "Authenticated users can update their own avatars"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND name ILIKE auth.uid()::text || '-%'
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND name ILIKE auth.uid()::text || '-%'
  );

-- Policy 4: Authenticated users can delete their own avatars
CREATE POLICY "Authenticated users can delete their own avatars"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND name ILIKE auth.uid()::text || '-%'
  );
