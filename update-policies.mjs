import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env.staging') });

const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const projectId = process.env.SUPABASE_PROJECT_ID;

console.log('🔒 Updating RLS policies to use underscore delimiter...\n');

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
    // Drop old policies
    console.log('🗑️  Dropping old policies...');
    const dropSQL = `
      DROP POLICY IF EXISTS "Org owners and admins can upload logos" ON storage.objects;
      DROP POLICY IF EXISTS "Org owners and admins can delete logos" ON storage.objects;
      DROP POLICY IF EXISTS "Everyone can view org logos" ON storage.objects;
    `;
    await runSQL(dropSQL);
    console.log('   ✅ Old policies dropped\n');

    // Create new policies with underscore
    console.log('📝 Creating new policies with underscore delimiter...');
    const createSQL = `
      CREATE POLICY "Org owners and admins can upload logos"
        ON storage.objects FOR INSERT
        TO authenticated
        WITH CHECK (
          bucket_id = 'org-logos'
          AND EXISTS (
            SELECT 1
            FROM public.organization_memberships om
            WHERE om.user_id = auth.uid()
              AND om.org_id = (split_part(name, '_', 1))::uuid
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
              AND om.org_id = (split_part(name, '_', 1))::uuid
              AND om.role IN ('owner', 'admin')
              AND (om.member_status IS NULL OR om.member_status = 'active')
          )
        );

      CREATE POLICY "Everyone can view org logos"
        ON storage.objects FOR SELECT
        USING (bucket_id = 'org-logos');
    `;

    await runSQL(createSQL);
    console.log('   ✅ New policies created\n');

    // Verify
    console.log('🔍 Verifying policies...');
    const verifySQL = `
      SELECT policyname, cmd
      FROM pg_policies
      WHERE tablename = 'objects'
      AND policyname LIKE '%org%logo%'
      ORDER BY policyname;
    `;

    const policies = await runSQL(verifySQL);
    console.log(`   ✅ Found ${policies.length} policies:`);
    policies.forEach(p => {
      console.log(`      - ${p.policyname} (${p.cmd})`);
    });

    console.log('\n✨ Policies updated successfully!');
    console.log('🎉 Organization logo upload should now work!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n📋 Please run this SQL manually in the Supabase Dashboard:');
    console.log('https://supabase.com/dashboard/project/' + projectId + '/sql/new\n');
    console.log(`
-- Drop old policies
DROP POLICY IF EXISTS "Org owners and admins can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Org owners and admins can delete logos" ON storage.objects;
DROP POLICY IF EXISTS "Everyone can view org logos" ON storage.objects;

-- Create new policies with underscore delimiter
CREATE POLICY "Org owners and admins can upload logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'org-logos'
    AND EXISTS (
      SELECT 1
      FROM public.organization_memberships om
      WHERE om.user_id = auth.uid()
        AND om.org_id = (split_part(name, '_', 1))::uuid
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
        AND om.org_id = (split_part(name, '_', 1))::uuid
        AND om.role IN ('owner', 'admin')
        AND (om.member_status IS NULL OR om.member_status = 'active')
    )
  );

CREATE POLICY "Everyone can view org logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'org-logos');
    `);
    process.exit(1);
  }
}

main();
