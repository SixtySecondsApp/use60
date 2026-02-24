import { Pool } from 'pg';
import fs from 'fs';

const envContent = fs.readFileSync('.env.staging', 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const trimmedLine = line.trim();
  if (trimmedLine && !trimmedLine.startsWith('#')) {
    const [key, ...valueParts] = trimmedLine.split('=');
    if (key) envVars[key.trim()] = valueParts.join('=').trim();
  }
});

const config = {
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.caerqjzvuerejfrdtygb',
  password: envVars.SUPABASE_DATABASE_PASSWORD,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  connect_timeout: 5000,
};

console.log('🔍 Attempting connection to pooler...\n');

const pool = new Pool(config);

const client = await pool.connect();
console.log('✅ Connected successfully!');

const result = await client.query('SELECT version()');
console.log('✅ Query successful!');
console.log('PostgreSQL version:', result.rows[0].version.split(',')[0]);

client.release();
await pool.end();
