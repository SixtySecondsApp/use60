import('dotenv').then(({ config }) => {
  config({ path: '.env.staging' });
  
  const url = process.env.SUPABASE_URL;
  const srvKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  const sql = `
-- Remove ALL policies on organization_invitations
DROP POLICY IF EXISTS "organization_invitations_select" ON "public"."organization_invitations";
DROP POLICY IF EXISTS "Allow public token lookup for invitation acceptance" ON "public"."organization_invitations";
DROP POLICY IF EXISTS "Allow public invitation view by token" ON "public"."organization_invitations";
DROP POLICY IF EXISTS "Users can view invitations in their organizations" ON "public"."organization_invitations";
DROP POLICY IF EXISTS "Users can view their own pending invitations" ON "public"."organization_invitations";

-- Create single simple policy: Allow SELECT to everyone (public)
CREATE POLICY "allow_select_all" ON "public"."organization_invitations"
  FOR SELECT
  USING (true);

-- Create policy for INSERT (requires service role or authenticated user)
CREATE POLICY "allow_insert_authenticated" ON "public"."organization_invitations"
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL OR "public"."is_service_role"());
`;

  async function fix() {
    console.log('Fixing RLS policies...');
    
    // Execute using POST with SQL body
    const res = await fetch(url + '/rest/v1/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sql',
        'apikey': srvKey,
        'Authorization': 'Bearer ' + srvKey,
      },
      body: sql
    }).then(r => ({status: r.status, body: r.text()}));
    
    const body = await res.body;
    console.log('Status:', res.status);
    if (res.status !== 200 && res.status !== 201) {
      console.log('Response:', body);
    } else {
      console.log('SUCCESS: RLS policies fixed!');
    }
  }
  
  fix().catch(console.error);
}).catch(console.error);
