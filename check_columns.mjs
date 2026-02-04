import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://caerqjzvuerejfrdtygb.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhZXJxanp2dWVyZWpmcmR0eWdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzk0OTIyNywiZXhwIjoyMDgzNTI1MjI3fQ.vZn5nVNIllQBoRgf9_gFTKwrFoakOUJ8VNJ4nnHUnko';

const supabase = createClient(supabaseUrl, serviceRoleKey);

(async () => {
  try {
    const { data, error } = await supabase.from('organizations').select('*').limit(1);
    if (data && data.length > 0) {
      const cols = Object.keys(data[0]);
      const approvalCols = cols.filter(c => c.includes('approval') || c.includes('similar') || c.includes('approved'));
      console.log('Approval-related columns found:', approvalCols);
      if (approvalCols.length === 0) {
        console.log('WARNING: No approval columns found!');
      }
    }
    if (error) {
      console.log('Error:', error);
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
