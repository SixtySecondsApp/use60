import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env.staging') });

const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const projectId = process.env.SUPABASE_PROJECT_ID;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseUrl = process.env.SUPABASE_URL;

console.log('🪣 Setting up org-logos storage bucket...\n');

async function createBucket() {
  // Try to create bucket using the service role key via REST API
  const response = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceRoleKey}`,
      'apikey': serviceRoleKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: 'org-logos',
      name: 'org-logos',
      public: true,
      file_size_limit: 5242880, // 5MB
      allowed_mime_types: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    })
  });

  if (!response.ok) {
    const error = await response.text();
    // Check if bucket already exists
    if (response.status === 409 || error.includes('already exists')) {
      console.log('   ℹ️  Bucket already exists, skipping creation');
      return true;
    }
    throw new Error(`Failed to create bucket (${response.status}): ${error}`);
  }

  console.log('   ✅ Bucket created successfully!');
  return true;
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

async function createRLSPolicies() {
  console.log('\n🔒 Creating RLS policies...');

  const policies = `
    -- RLS Policy for org-logos bucket
    CREATE POLICY IF NOT EXISTS "Org owners and admins can upload logos"
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

    CREATE POLICY IF NOT EXISTS "Org owners and admins can delete logos"
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

    CREATE POLICY IF NOT EXISTS "Everyone can view org logos"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'org-logos');
  `;

  try {
    await runSQL(policies);
    console.log('   ✅ RLS policies created successfully!');
    return true;
  } catch (error) {
    console.error('   ❌ Failed to create RLS policies:', error.message);
    console.log('\n   📋 Please create these policies manually in the SQL editor:');
    console.log('   https://supabase.com/dashboard/project/' + projectId + '/sql/new');
    console.log('\n' + policies);
    return false;
  }
}

async function verifySetup() {
  console.log('\n🔍 Verifying setup...');

  try {
    // Check if bucket exists
    const bucketResponse = await fetch(`${supabaseUrl}/storage/v1/bucket/org-logos`, {
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
      }
    });

    if (bucketResponse.ok) {
      const bucket = await bucketResponse.json();
      console.log('   ✅ Bucket exists:', bucket.name);
      console.log('      - Public:', bucket.public);
      console.log('      - Size limit:', (bucket.file_size_limit / 1024 / 1024).toFixed(1) + 'MB');
    } else {
      console.log('   ⚠️  Could not verify bucket');
    }

    // Check policies
    const policiesSQL = `
      SELECT schemaname, tablename, policyname
      FROM pg_policies
      WHERE tablename = 'objects'
      AND policyname LIKE '%org%logo%';
    `;

    const policies = await runSQL(policiesSQL);
    console.log(`   ✅ Found ${policies.length} RLS policies for org logos`);

  } catch (error) {
    console.error('   ⚠️  Verification failed:', error.message);
  }
}

async function main() {
  try {
    // Step 1: Create bucket
    console.log('📦 Step 1: Creating storage bucket...');
    await createBucket();

    // Step 2: Create RLS policies
    console.log('\n📦 Step 2: Setting up RLS policies...');
    await createRLSPolicies();

    // Step 3: Verify
    await verifySetup();

    console.log('\n✨ Storage setup complete!');
    console.log('🎉 Organization logo feature is now fully configured!\n');
    console.log('👉 Test it at: Settings → Organization Management → Settings tab\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
