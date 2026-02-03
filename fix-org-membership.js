import pg from 'pg';

const { Client } = pg;

const client = new Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.caerqjzvuerejfrdtygb',
  password: 'Gi7JO1tz2NupAzHt',
});

const ORG_ID = '1d1b4274-c9c4-4cb7-9efc-243c90c86f4c';
const USER_ID = 'acf9cc34-ccad-4363-be67-8e381a912669';

(async () => {
  try {
    await client.connect();
    console.log('Connected to database\n');

    // Check org exists
    const orgRes = await client.query(
      'SELECT id, name FROM organizations WHERE id = $1',
      [ORG_ID]
    );

    if (orgRes.rows.length === 0) {
      console.error('Organization not found!');
      process.exit(1);
    }

    const org = orgRes.rows[0];
    console.log(`Organization: ${org.name}\n`);

    // Check if user is already a member
    const memberRes = await client.query(
      'SELECT user_id, role FROM organization_memberships WHERE org_id = $1 AND user_id = $2',
      [ORG_ID, USER_ID]
    );

    if (memberRes.rows.length > 0) {
      console.log(`✓ You are already a member with role: ${memberRes.rows[0].role}`);
    } else {
      // Add user as owner
      console.log('Adding you as organization owner...');
      await client.query(
        'INSERT INTO organization_memberships (org_id, user_id, role) VALUES ($1, $2, $3)',
        [ORG_ID, USER_ID, 'owner']
      );
      console.log('✓ Added you as organization owner\n');

      // Verify
      const verifyRes = await client.query(
        'SELECT user_id, role FROM organization_memberships WHERE org_id = $1',
        [ORG_ID]
      );
      console.log(`Organization now has ${verifyRes.rows.length} member(s):`);
      verifyRes.rows.forEach(m => {
        console.log(`  - ${m.user_id}: ${m.role}`);
      });
    }

    console.log('\n✅ Fixed! You should now be able to invite users.');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
