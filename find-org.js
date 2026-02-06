import fetch from 'node-fetch';

const SUPABASE_URL = 'https://caerqjzvuerejfrdtygb.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhZXJxanp2dWVyZWpmcmR0eWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NDkyMjcsImV4cCI6MjA4MzUyNTIyN30.a_6b9Ojfm32MAprq_spkN7kQkdy1XCcPsv19psYMahg';

async function findOrg() {
  try {
    const headers = {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
    };

    // Search for Sixty Seconds org
    const url = `${SUPABASE_URL}/rest/v1/organizations?name=ilike.%Sixty%&select=id,name`;

    console.log('Searching for "Sixty Seconds" organization...\n');
    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.length === 0) {
      console.log('No organizations found with "Sixty" in the name.');
      console.log('Let me fetch all organizations...\n');

      // Get all orgs
      const allUrl = `${SUPABASE_URL}/rest/v1/organizations?select=id,name&limit=50`;
      const allResponse = await fetch(allUrl, { headers });
      const allOrgs = await allResponse.json();

      console.log(`Total organizations: ${allOrgs.length}\n`);
      allOrgs.forEach((org, i) => {
        console.log(`${i + 1}. ${org.name}`);
        console.log(`   ID: ${org.id}`);
      });
    } else {
      console.log(`Found ${data.length} organization(s):\n`);
      data.forEach((org, i) => {
        console.log(`${i + 1}. ${org.name}`);
        console.log(`   ID: ${org.id}\n`);

        // Get member count
        checkMembers(org.id, org.name, headers);
      });
    }

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

async function checkMembers(orgId, orgName, headers) {
  try {
    const url = `${SUPABASE_URL}/rest/v1/organization_memberships?org_id=eq.${orgId}&select=user_id`;
    const response = await fetch(url, { headers });
    const members = await response.json();
    console.log(`   Members: ${members.length}`);
  } catch (err) {
    console.error(`   Error checking members: ${err.message}`);
  }
}

findOrg();
