import('dotenv').then(({ config }) => {
  config({ path: '.env.staging' });
  
  const url = process.env.SUPABASE_URL;
  const srvKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const token = '0d1da847168ce64798b6a68a0bb73abf3b00f6c3a0eb27abaf870642ab3e9528';
  
  async function test() {
    console.log('\n=== INVITATION LOOKUP DIAGNOSTIC ===\n');
    
    // Service role query
    console.log('1. Query with SERVICE ROLE:');
    const r1 = await fetch(url + '/rest/v1/organization_invitations?token=eq.' + token, {
      headers: { 'apikey': srvKey, 'Authorization': 'Bearer ' + srvKey }
    }).then(r => r.json());
    console.log(r1.length > 0 ? '   FOUND: ' + r1.length + ' record' : '   NOT FOUND');
    if (r1.length > 0) {
      console.log('   Email: ' + r1[0].email);
      console.log('   Expires: ' + r1[0].expires_at);
      console.log('   Accepted: ' + r1[0].accepted_at);
    }
    
    // Anon query
    console.log('\n2. Query with ANON KEY (unauthenticated):');
    const r2 = await fetch(url + '/rest/v1/organization_invitations?token=eq.' + token, {
      headers: { 'apikey': anonKey }
    }).then(r => r.json());
    console.log(r2.length > 0 ? '   FOUND: ' + r2.length + ' record' : '   NOT FOUND');
    if (r2.error) console.log('   ERROR: ' + r2.message);
    
    console.log('\n');
  }
  
  test().catch(console.error);
}).catch(console.error);
