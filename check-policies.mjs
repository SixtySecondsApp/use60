import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env.staging') });

const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const projectId = process.env.SUPABASE_PROJECT_ID;

console.log('🔍 Checking all RLS policies on storage.objects...\n');

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
    // Check all policies
    const allPoliciesSQL = `
      SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
      FROM pg_policies
      WHERE tablename = 'objects'
      ORDER BY policyname;
    `;

    const policies = await runSQL(allPoliciesSQL);
    console.log(`Found ${policies.length} total policies on storage.objects:\n`);

    policies.forEach(p => {
      console.log(`📋 ${p.policyname}`);
      console.log(`   Command: ${p.cmd}`);
      console.log(`   Roles: ${p.roles}`);
      if (p.qual) console.log(`   Using: ${p.qual.substring(0, 100)}...`);
      if (p.with_check) console.log(`   Check: ${p.with_check.substring(0, 100)}...`);
      console.log('');
    });

    // Now try to create the missing policies with explicit schema
    console.log('🔧 Attempting to create INSERT and DELETE policies...\n');

    const createPoliciesSQL = `
      -- Insert policy
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

      -- Delete policy
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
    `;

    await runSQL(createPoliciesSQL);
    console.log('✅ Policies created!\n');

    // Verify again
    const updatedPolicies = await runSQL(allPoliciesSQL);
    console.log(`Now there are ${updatedPolicies.length} policies on storage.objects\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n💡 The Management API may not have permission to create storage policies.');
    console.log('Please run this SQL in the Supabase Dashboard:');
    console.log('https://supabase.com/dashboard/project/' + projectId + '/sql/new\n');
    console.log(`
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
    `);
  }
}

main();
