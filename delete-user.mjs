import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://caerqjzvuerejfrdtygb.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhZXJxanp2dWVyZWpmcmR0eWdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzk0OTIyNywiZXhwIjoyMDgzNTI1MjI3fQ.vZn5nVNIllQBoRgf9_gFTKwrFoakOUJ8VNJ4nnHUnko';
const email = 'max.parish501@gmail.com';

const supabase = createClient(supabaseUrl, serviceKey);

async function deleteUserCompletely() {
  try {
    console.log(`\n🔍 Finding user: ${email}`);
    
    // 1. Find user in auth.users
    const { data: authData, error: authError } = await supabase.auth.admin.listUsers();
    if (authError) throw authError;
    
    const user = authData.users.find(u => u.email === email);
    if (!user) {
      console.log('❌ User not found in auth.users');
      return;
    }
    
    console.log(`✅ Found user: ${user.id} (${email})`);
    
    // 2. Check profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email)
      .single();
    
    if (profile) {
      console.log(`✅ Found profile: ${profile.id}`);
    }
    
    // 3. Check waitlist
    const { data: waitlist } = await supabase
      .from('meetings_waitlist')
      .select('id, email, user_id')
      .eq('email', email);
    
    if (waitlist?.length > 0) {
      console.log(`✅ Found ${waitlist.length} waitlist entry(ies)`);
    }
    
    // 4. Delete auth user
    console.log(`\n🗑️  Deleting from auth.users...`);
    const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(user.id);
    if (deleteAuthError) throw deleteAuthError;
    console.log(`✅ Deleted from auth.users`);
    
    // 5. Delete profile
    console.log(`🗑️  Deleting from profiles...`);
    const { error: deleteProfileError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', user.id);
    if (deleteProfileError) throw deleteProfileError;
    console.log(`✅ Deleted from profiles`);
    
    // 6. Verify waitlist is preserved
    console.log(`\n✅ Verifying waitlist is preserved...`);
    const { data: remainingWaitlist } = await supabase
      .from('meetings_waitlist')
      .select('id, email, user_id, referral_code')
      .eq('email', email);
    
    if (remainingWaitlist?.length > 0) {
      console.log(`✅ Waitlist entry preserved (user_id now NULL):`);
      console.log(remainingWaitlist[0]);
    } else {
      console.log('⚠️  No waitlist entry found');
    }
    
    console.log(`\n✅ Complete removal successful! Account deleted but waitlist preserved.`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

deleteUserCompletely();
