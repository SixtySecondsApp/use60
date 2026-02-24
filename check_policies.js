import('dotenv').then(({ config }) => {
  config({ path: '.env.staging' });
  
  const url = process.env.SUPABASE_URL;
  const srvKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  async function checkPolicies() {
    console.log('\n=== CURRENT RLS POLICIES ===\n');
    
    const sql = 'SELECT policyname, permissive, roles FROM pg_policies WHERE tablename = \'organization_invitations\' ORDER BY policyname;';
    
    const res = await fetch(url + '/rest/v1/rpc/exec_sql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': srvKey,
        'Authorization': 'Bearer ' + srvKey,
      },
      body: JSON.stringify({ sql: sql })
    }).then(r => r.json());
    
    if (Array.isArray(res)) {
      res.forEach((p, i) => {
        console.log((i+1) + '. ' + p.policyname);
        console.log('   Permissive: ' + p.permissive);
        console.log('   Roles: ' + (p.roles || 'all'));
      });
    } else {
      console.log('Response:', JSON.stringify(res, null, 2));
    }
  }
  
  checkPolicies().catch(console.error);
}).catch(console.error);
