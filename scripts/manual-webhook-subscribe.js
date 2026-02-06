// Manual Webhook Subscription Helper
// Run this in browser console after creating organization

import { supabase } from './src/lib/supabase/clientV2';

async function subscribeToWebhook() {
  try {
    // Get current user
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      console.error('❌ Not authenticated');
      return;
    }

    // Get organization
    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', userData.user.id)
      .maybeSingle();

    if (!membership?.org_id) {
      console.error('❌ No organization found. Create one first!');
      return;
    }

    console.log('✅ Found organization:', membership.org_id);

    // Generate unique channel ID
    const channelId = `calendar-${userData.user.id}-${Date.now()}`;

    // Get webhook URL
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const webhookUrl = `${supabaseUrl}/functions/v1/google-calendar-webhook`;

    console.log('📡 Creating webhook subscription...');

    // Call edge function to create the channel with Google
    const { data, error } = await supabase.functions.invoke('google-calendar', {
      body: {
        action: 'watch',
        calendarId: 'primary',
        channelId,
        webhookUrl,
      },
    });

    if (error) {
      console.error('❌ Failed to create webhook:', error);
      return;
    }

    if (!data?.success || !data?.resourceId) {
      console.error('❌ Failed to create webhook with Google:', data);
      return;
    }

    console.log('✅ Webhook created with Google:', data);

    // Store channel in database
    const expirationTime = new Date(parseInt(data.expiration)).toISOString();

    const { data: channel, error: dbError } = await supabase
      .from('google_calendar_channels')
      .insert({
        user_id: userData.user.id,
        org_id: membership.org_id,
        channel_id: channelId,
        resource_id: data.resourceId,
        calendar_id: 'primary',
        webhook_url: webhookUrl,
        expiration_time: expirationTime,
        is_active: true,
      })
      .select()
      .single();

    if (dbError) {
      console.error('❌ Failed to save channel to database:', dbError);
      return;
    }

    console.log('✅ Webhook subscription created successfully!');
    console.log('📊 Channel:', channel);
    console.log('⏰ Expires:', expirationTime);

    return channel;
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run it
subscribeToWebhook();
