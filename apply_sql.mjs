import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.staging' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const sql = `
DROP POLICY IF EXISTS "organization_invitations_select" ON "public"."organization_invitations";
DROP POLICY IF EXISTS "Allow public token lookup for invitation acceptance" ON "public"."organization_invitations";
DROP POLICY IF EXISTS "Allow public invitation view by token" ON "public"."organization_invitations";

CREATE POLICY "organization_invitations_public_select" ON "public"."organization_invitations"
  FOR SELECT
  USING (true);
`;

async function apply() {
  console.log('Applying RLS fix...');
  
  const { data, error } = await supabase.rpc('exec_sql', { sql });
  
  if (error) {
    console.log('Error:', error);
  } else {
    console.log('SUCCESS!');
  }
}

apply();
