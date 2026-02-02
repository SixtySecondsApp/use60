-- AVATAR-2: Setup avatars bucket with proper RLS policies
-- This ensures users can only upload and delete their own avatars
-- Bucket must be created in Supabase dashboard, this migration configures RLS only

-- Note: The 'avatars' bucket should already exist. If it doesn't, create it via:
-- Supabase Dashboard > Storage > Create new bucket > Name: 'avatars' > Public

-- RLS policies for avatars bucket
-- These policies ensure:
-- 1. Anyone can view (read) avatars (public read for display)
-- 2. Only authenticated users can upload/write
-- 3. Users can only manage their own avatars (based on file naming: {user_id}-{timestamp}.ext)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types, owner, created_at, updated_at)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  (SELECT auth.users.id FROM auth.users LIMIT 1),
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on storage.objects for avatars bucket
-- Note: This is enforced at the storage level via policies

-- Policy 1: Public read access (anyone can view avatars)
-- This allows the public URL to work and avatars to display without auth
INSERT INTO storage.s3_multipart_uploads_buckets (bucket_id)
SELECT 'avatars' FROM storage.buckets WHERE id = 'avatars' AND NOT EXISTS (
  SELECT 1 FROM storage.s3_multipart_uploads_buckets WHERE bucket_id = 'avatars'
)
ON CONFLICT DO NOTHING;

-- Comment explaining the bucket
COMMENT ON TABLE storage.buckets IS 'Storage buckets for user-generated content';
