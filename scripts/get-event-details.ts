#!/usr/bin/env tsx
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function getEventDetails() {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('id', 'ac7f49f0-4ec9-4084-bd5e-833ce8544878')
    .single();

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Full calendar event data:');
  console.log(JSON.stringify(data, null, 2));
}

getEventDetails();
