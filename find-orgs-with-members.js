import fetch from 'node-fetch';

const SUPABASE_URL = 'https://caerqjzvuerejfrdtygb.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhZXJxanp2dWVyZWpmcmR0eWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NDkyMjcsImV4cCI6MjA4MzUyNTIyN30.a_6b9Ojfm32MAprq_spkN7kQkdy1XCcPsv19psYMahg';

async function findOrgsWithMembers() {
  try {
    const headers = {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
    };

    // Get all memberships (grouped by org_id to see member counts)
    const url = `${SUPABASE_URL}/rest/v1/organization_memberships?select=org_id`;

    console.log('Fetching all organization memberships...\n');
    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const memberships = await response.json();

    // Group by org_id
    const byOrg = {};
    memberships.forEach(m => {
      byOrg[m.org_id] = (byOrg[m.org_id] || 0) + 1;
    });

    const orgIds = Object.keys(byOrg);
    console.log(`Total organizations with members: ${orgIds.length}\n`);

    // Now get org names
    for (const orgId of orgIds) {
      const memberCount = byOrg[orgId];
      console.log(`Organization ID: ${orgId}`);
      console.log(`Members: ${memberCount}`);

      try {
        const orgUrl = `${SUPABASE_URL}/rest/v1/organizations?id=eq.${orgId}&select=name`;
        const orgResponse = await fetch(orgUrl, { headers });
        if (orgResponse.ok) {
          const orgs = await orgResponse.json();
          if (orgs.length > 0) {
            console.log(`Name: ${orgs[0].name}`);
          }
        }
      } catch (e) {
        // ignore
      }
      console.log('');
    }

  } catch (err) {
    console.error('Error:', err.message);
  }
}

findOrgsWithMembers();
