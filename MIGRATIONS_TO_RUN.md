# 🚀 Organization Profile Photos - Migrations to Run

Run these migrations in your Supabase Dashboard SQL Editor for the **staging** database.

**Dashboard Link:** https://supabase.com/dashboard/project/caerqjzvuerejfrdtygb/sql/new

---

## Migration 1: Add Organization Logo Columns

**File:** `supabase/migrations/20260203160000_add_org_logo_columns.sql`

```sql
-- ORG-LOGO: Add logo_url and remove_logo columns to organizations
-- This migration supports organization profile photo functionality
-- Follows the same pattern as profiles.avatar_url and profiles.remove_avatar

-- ============================================================================
-- ORG-LOGO: Add logo_url and remove_logo columns to organizations table
-- ============================================================================

ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS logo_url text;

ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS remove_logo boolean DEFAULT false;

-- Comments for clarity
COMMENT ON COLUMN public.organizations.logo_url IS 'Public URL to organization logo stored in org-logos storage bucket. NULL if no logo uploaded.';
COMMENT ON COLUMN public.organizations.remove_logo IS 'When true, organization profile reverts to initials instead of displaying logo_url';

-- Update updated_at trigger to track logo changes (if not already present)
-- The organizations table should already have an updated_at trigger from baseline migration
-- This is just a safety check to ensure it exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'handle_updated_at'
    AND tgrelid = 'public.organizations'::regclass
  ) THEN
    CREATE TRIGGER handle_updated_at
      BEFORE UPDATE ON public.organizations
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END$$;
```

✅ **Expected Result:** Columns `logo_url` and `remove_logo` added to organizations table

---

## Migration 2: Create org-logos Storage Bucket with RLS

**File:** `supabase/migrations/20260203160100_setup_org_logos_bucket_rls.sql`

```sql
-- ORG-LOGOS: Setup org-logos bucket and RLS policies
-- This migration creates the storage bucket for organization profile photos
-- and sets up RLS policies for org owners/admins to upload

-- ============================================================================
-- Part 1: Create org-logos bucket
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types, created_at, updated_at)
VALUES (
  'org-logos',
  'org-logos',
  true,  -- Public read access (anyone can view org logos)
  5242880,  -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']::text[],
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']::text[],
  updated_at = now();

-- ============================================================================
-- Part 2: RLS Policies for org-logos bucket
-- ============================================================================

-- Policy 1: Public read access for all org logos
-- Anyone can view organization logos (they are non-sensitive)
CREATE POLICY "Public read access for org logos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'org-logos');

-- Policy 2: Org owners/admins can upload logos
-- Files must be named as {orgId}-{timestamp}.{ext}
-- We check if the user has owner or admin role in the organization
CREATE POLICY "Org owners and admins can upload logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'org-logos'
    AND (
      -- Extract orgId from filename (format: {orgId}-{timestamp}.{ext})
      -- Check if user is owner or admin of that org
      EXISTS (
        SELECT 1
        FROM public.organization_memberships om
        WHERE om.user_id = auth.uid()
          AND om.org_id = (split_part(name, '-', 1))::uuid
          AND om.role IN ('owner', 'admin')
          AND (om.member_status IS NULL OR om.member_status = 'active')
      )
    )
  );

-- Policy 3: Org owners/admins can update their org's logos
CREATE POLICY "Org owners and admins can update their org logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'org-logos'
    AND EXISTS (
      SELECT 1
      FROM public.organization_memberships om
      WHERE om.user_id = auth.uid()
        AND om.org_id = (split_part(name, '-', 1))::uuid
        AND om.role IN ('owner', 'admin')
        AND (om.member_status IS NULL OR om.member_status = 'active')
    )
  )
  WITH CHECK (
    bucket_id = 'org-logos'
    AND EXISTS (
      SELECT 1
      FROM public.organization_memberships om
      WHERE om.user_id = auth.uid()
        AND om.org_id = (split_part(name, '-', 1))::uuid
        AND om.role IN ('owner', 'admin')
        AND (om.member_status IS NULL OR om.member_status = 'active')
    )
  );

-- Policy 4: Org owners/admins can delete their org's logos
CREATE POLICY "Org owners and admins can delete their org logos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'org-logos'
    AND EXISTS (
      SELECT 1
      FROM public.organization_memberships om
      WHERE om.user_id = auth.uid()
        AND om.org_id = (split_part(name, '-', 1))::uuid
        AND om.role IN ('owner', 'admin')
        AND (om.member_status IS NULL OR om.member_status = 'active')
    )
  );

-- ============================================================================
-- Comments for documentation
-- ============================================================================

COMMENT ON POLICY "Public read access for org logos" ON storage.objects IS 'Anyone can view organization logos';
COMMENT ON POLICY "Org owners and admins can upload logos" ON storage.objects IS 'Only org owners and admins can upload logos. Filename must start with orgId.';
COMMENT ON POLICY "Org owners and admins can update their org logos" ON storage.objects IS 'Only org owners and admins can update their org logos';
COMMENT ON POLICY "Org owners and admins can delete their org logos" ON storage.objects IS 'Only org owners and admins can delete their org logos';
```

✅ **Expected Result:**
- `org-logos` bucket created in Storage
- 4 RLS policies created for org logo access control

---

## 📋 Step-by-Step Instructions

### 1. Open Supabase Dashboard
Visit: https://supabase.com/dashboard/project/caerqjzvuerejfrdtygb/sql/new

### 2. Run Migration 1
- Copy the SQL from "Migration 1" above
- Paste into the SQL editor
- Click "Run" button
- Wait for "Success" message

### 3. Run Migration 2
- Copy the SQL from "Migration 2" above
- Paste into the SQL editor (clear previous query first)
- Click "Run" button
- Wait for "Success" message

### 4. Verify Migrations
Run this verification query:
```sql
-- Check if columns exist
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'organizations'
AND column_name IN ('logo_url', 'remove_logo');

-- Check if bucket exists
SELECT id, name, public, file_size_limit
FROM storage.buckets
WHERE id = 'org-logos';
```

**Expected verification output:**
- 2 rows showing logo_url (text, YES) and remove_logo (boolean, YES)
- 1 row showing org-logos bucket with 5MB limit

---

## ✅ After Migrations Complete

Once both migrations run successfully:

1. **Test the feature:**
   - Go to Settings → Organization Management → Settings tab
   - Upload a test logo as an owner/admin
   - Verify it appears with green initials fallback

2. **Commit your code:**
   ```bash
   git add .
   git commit -m "feat: Add organization profile photos

   Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
   git push
   ```

---

**Status:** Ready to run migrations 🚀
**Database:** Staging (caerqjzvuerejfrdtygb.supabase.co)
