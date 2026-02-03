import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env.staging') });

const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const projectId = process.env.SUPABASE_PROJECT_ID;

console.log('🔍 Debugging RLS policies...\n');

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
    // Check ALL policies on storage.objects (not just org logos)
    console.log('📋 ALL policies on storage.objects:');
    const allSQL = `
      SELECT schemaname, tablename, policyname, cmd, roles
      FROM pg_policies
      WHERE tablename = 'objects'
      ORDER BY policyname;
    `;
    const all = await runSQL(allSQL);
    console.log(`Found ${all.length} total:\n`);
    all.forEach(p => {
      const isOrgLogo = p.policyname.toLowerCase().includes('org') && p.policyname.toLowerCase().includes('logo');
      const marker = isOrgLogo ? '🟢' : '⚪';
      console.log(`${marker} ${p.policyname} (${p.cmd}) - roles: ${p.roles}`);
    });

    // Try creating just INSERT policy with error details
    console.log('\n🔧 Attempting to create INSERT policy only...\n');
    try {
      const insertSQL = `
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
      `;
      await runSQL(insertSQL);
      console.log('   ✅ INSERT policy created');
    } catch (e) {
      console.log('   ❌ INSERT policy error:', e.message);
    }

    // Try creating just DELETE policy
    console.log('\n🔧 Attempting to create DELETE policy only...\n');
    try {
      const deleteSQL = `
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
      await runSQL(deleteSQL);
      console.log('   ✅ DELETE policy created');
    } catch (e) {
      console.log('   ❌ DELETE policy error:', e.message);
    }

    // Check again
    console.log('\n📋 Final check - org logo policies:');
    const finalSQL = `
      SELECT policyname, cmd, roles
      FROM pg_policies
      WHERE tablename = 'objects'
      AND (policyname ILIKE '%org%' AND policyname ILIKE '%logo%')
      ORDER BY policyname;
    `;
    const final = await runSQL(finalSQL);
    console.log(`Found ${final.length} org logo policies:\n`);
    final.forEach(p => {
      console.log(`   ✓ ${p.policyname} (${p.cmd})`);
    });

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

main();
