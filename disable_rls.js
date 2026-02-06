import('dotenv').then(({ config }) => {
  config({ path: '.env.staging' });
  
  const url = process.env.SUPABASE_URL;
  const srvKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  async function disableRLS() {
    console.log('Attempting to disable RLS on organization_invitations...\n');
    
    // Try to update the table to disable RLS
    const queries = [
      'ALTER TABLE "public"."organization_invitations" DISABLE ROW LEVEL SECURITY;',
      'ALTER TABLE "public"."organization_invitations" ENABLE ROW LEVEL SECURITY;'
    ];
    
    for (const sql of queries) {
      console.log('Running:', sql);
      const res = await fetch(url + '/rest/v1/rpc/setup_test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': srvKey,
          'Authorization': 'Bearer ' + srvKey,
        },
        body: JSON.stringify({ sql })
      }).then(r => r.json());
      
      console.log('Result:', res);
      console.log();
    }
  }
  
  disableRLS().catch(console.error);
}).catch(console.error);
