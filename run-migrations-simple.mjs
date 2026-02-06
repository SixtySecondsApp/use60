import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env.staging') });

const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const projectId = process.env.SUPABASE_PROJECT_ID;

console.log('🔧 Running simplified migrations via Supabase Management API...\n');

if (!accessToken || !projectId) {
  console.error('❌ Missing credentials in .env.staging');
  process.exit(1);
}

async function runSQL(sql) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectId}/database/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql })
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`${response.status}: ${error}`);
  }

  return await response.json();
}

async function main() {
  try {
    // Migration 1: Add columns (simplified - no trigger)
    console.log('📄 Migration 1: Adding logo_url and remove_logo columns...');

    const migration1 = `
      -- Add logo columns to organizations
      ALTER TABLE public.organizations
      ADD COLUMN IF NOT EXISTS logo_url text;

      ALTER TABLE public.organizations
      ADD COLUMN IF NOT EXISTS remove_logo boolean DEFAULT false;

      -- Add comments
      COMMENT ON COLUMN public.organizations.logo_url IS 'Public URL to organization logo';
      COMMENT ON COLUMN public.organizations.remove_logo IS 'When true, show initials instead of logo';
    `;

    await runSQL(migration1);
    console.log('   ✅ Columns added successfully!\n');

    // Verify columns
    console.log('🔍 Verifying columns...');
    const verifyColumns = `
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'organizations'
      AND column_name IN ('logo_url', 'remove_logo')
      ORDER BY column_name;
    `;

    const columns = await runSQL(verifyColumns);
    console.log(`   ✅ Found ${columns.length} new columns:`);
    columns.forEach(col => {
      console.log(`      - ${col.column_name} (${col.data_type}, default: ${col.column_default || 'NULL'})`);
    });

    // Note about storage bucket
    console.log('\n📦 Storage Bucket Setup:');
    console.log('   ⚠️  Storage bucket policies cannot be created via Management API');
    console.log('   👉 Please create the storage bucket manually:');
    console.log('   1. Go to: https://supabase.com/dashboard/project/caerqjzvuerejfrdtygb/storage/buckets');
    console.log('   2. Create a new bucket named: org-logos');
    console.log('   3. Set it as Public');
    console.log('   4. Set file size limit: 5MB');
    console.log('   5. Allowed MIME types: image/jpeg, image/png, image/gif, image/webp');
    console.log('\n   📋 RLS Policy (copy this into SQL editor):');
    console.log('   https://supabase.com/dashboard/project/caerqjzvuerejfrdtygb/sql/new\n');

    const rlsPolicy = `
-- RLS Policy for org-logos bucket
CREATE POLICY "Org owners and admins can upload logos"
  ON storage.objects FOR INSERT
  TO authenticated
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

CREATE POLICY "Org owners and admins can delete logos"
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

CREATE POLICY "Everyone can view org logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'org-logos');
`;

    console.log(rlsPolicy);

    console.log('\n✨ Database columns created successfully!');
    console.log('📝 Next steps: Create storage bucket and policies manually as shown above\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
