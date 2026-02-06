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

console.log('✅ .env.staging loaded successfully');
console.log('📍 SUPABASE_DATABASE_PASSWORD:', envVars.SUPABASE_DATABASE_PASSWORD);
console.log('📍 Password length:', envVars.SUPABASE_DATABASE_PASSWORD?.length);
