import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load from .env.local
const envPath = path.join(process.cwd(), '.env.local');
let supabaseUrl, supabaseServiceKey;

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    if (line.startsWith('VITE_SUPABASE_URL=')) {
      supabaseUrl = line.split('=')[1];
    }
    if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) {
      supabaseServiceKey = line.split('=')[1];
    }
  });
}

supabaseUrl = supabaseUrl || process.env.VITE_SUPABASE_URL;
supabaseServiceKey = supabaseServiceKey || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error('Missing VITE_SUPABASE_URL');
  process.exit(1);
}

if (!supabaseServiceKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY - set it in environment or .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('Deleting parishmm04@gmail.com from waitlist...');
const { data, error, count } = await supabase
  .from('waitlist')
  .delete()
  .eq('email', 'parishmm04@gmail.com');

if (error) {
  console.error('Error deleting user:', error);
  process.exit(1);
}

console.log('✅ User parishmm04@gmail.com removed from waitlist');
