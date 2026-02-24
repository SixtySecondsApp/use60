-- AVATAR-2: Setup avatars bucket
-- This migration ensures the avatars bucket exists for user profile pictures
-- The bucket is configured as public (readable by all, writable by authenticated users)

-- Ensure avatars bucket exists with proper configuration
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types, created_at, updated_at)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']::text[],
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']::text[],
  updated_at = now();
