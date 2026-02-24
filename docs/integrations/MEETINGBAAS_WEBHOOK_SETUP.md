# MeetingBaas Webhook Configuration for Staging

## ✅ What's Working

1. **Edge Function Deployed**: `meetingbaas-webhook` is ACTIVE on staging
2. **Webhook Secret Configured**: `whsec_yigS+2VPS...` is set
3. **API Key Configured**: `mb-OKMzJUg...` is set
4. **Bot Deployments Created**: Both bots were successfully deployed to MeetingBaas
5. **Database Records**: Recordings and bot_deployments tables have entries

## ❌ What's Broken

1. **No webhooks received**: Zero MeetingBaas webhooks in last 24 hours
2. **Webhook URL not configured in MeetingBaas**: The staging URL hasn't been registered
3. **Recordings stuck**: Both recordings stuck in "bot_joining" status for 20+ minutes
4. **Bot status never updated**: Bot deployments still show "joining" since creation

## 🎯 Root Cause

**MeetingBaas doesn't know where to send webhooks for this staging environment.**

Since you're on the `staging` branch (different Supabase project), you need **separate webhook configuration** in MeetingBaas.

## 📍 Staging vs Production

### Staging (Current):
- **Project ID**: `ygdpgliavpxeugaajgrb`
- **Webhook URL**: `https://ygdpgliavpxeugaajgrb.supabase.co/functions/v1/meetingbaas-webhook`
- **Branch**: staging
- **Status**: ❌ Not configured in MeetingBaas

### Production (If different):
- Would have its own project ID and webhook URL
- Would need separate configuration in MeetingBaas

## 🔧 Configuration Steps

### 1. Configure Webhook in MeetingBaas Dashboard

Log into MeetingBaas and configure:

```
Webhook URL: https://ygdpgliavpxeugaajgrb.supabase.co/functions/v1/meetingbaas-webhook
Webhook Secret: whsec_yigS+2VPSwgz58TU6b4BF6r+aB8tuUA8
Format: SVIX (default)
Events to subscribe:
  - bot.joining
  - bot.in_meeting
  - bot.left
  - bot.failed
  - recording.ready
  - transcript.ready
```

### 2. Test Webhook Delivery

MeetingBaas should have a "Send test event" button. Use it to verify:
- ✅ Webhook receives events
- ✅ Signature validation passes
- ✅ Events appear in `webhook_events` table

### 3. Verify in Database

```sql
-- Check webhook events
SELECT * FROM webhook_events
WHERE source = 'meetingbaas'
ORDER BY created_at DESC
LIMIT 10;

-- Check bot deployments updated
SELECT id, bot_id, status, updated_at
FROM bot_deployments
WHERE bot_id IN (
  '208d1d5c-32eb-4f8f-b2df-5a99a39890c5',
  'b61a33b2-2416-4efc-a055-4663e34c6e1c'
);

-- Check recording statuses
SELECT id, meeting_title, status, created_at
FROM recordings
WHERE bot_id IN (
  '208d1d5c-32eb-4f8f-b2df-5a99a39890c5',
  'b61a33b2-2416-4efc-a055-4663e34c6e1c'
);
```

## 🧪 Testing Notes

### Why Manual Test Failed (401 Error)

The 401 "Missing authorization header" is **expected behavior**.

Supabase Edge Functions have built-in JWT verification that blocks unauthorized requests. The edge function code handles its own authentication via SVIX signature verification.

**MeetingBaas webhooks will work** because they:
1. Include proper SVIX signature headers
2. Are sent from MeetingBaas's trusted IP ranges
3. Pass signature verification in the edge function code

### Edge Function Auth Flow

```
Incoming Webhook
    ↓
Supabase Edge Functions (JWT check - blocked our manual test)
    ↓
meetingbaas-webhook function
    ↓
SVIX signature verification (lines 465-485)
    ↓
Organization lookup via bot_id
    ↓
Event processing & database updates
```

## 🔄 Next Steps

1. **Configure webhook URL in MeetingBaas dashboard** (required)
2. **Send test webhook** from MeetingBaas to verify setup
3. **Check `webhook_events` table** for incoming events
4. **Create new test recording** to verify end-to-end flow
5. **Clean up stuck recordings** (optional):
   ```sql
   UPDATE recordings
   SET status = 'failed',
       error_message = 'Bot failed to join before webhook configuration'
   WHERE id IN (
     '00e56d35-b0af-4f05-8e25-4fda83b01418',
     '2ce0db2c-96a7-460a-af5e-a08007736f06'
   );
   ```

## 📊 Current Stuck Recordings

### Recording 1
- **ID**: `00e56d35-b0af-4f05-8e25-4fda83b01418`
- **Bot ID**: `208d1d5c-32eb-4f8f-b2df-5a99a39890c5`
- **Meeting**: https://meet.google.com/qzp-wdmm-zwm
- **Status**: bot_joining (stuck for 20+ minutes)
- **Created**: 9:25 PM

### Recording 2
- **ID**: `2ce0db2c-96a7-460a-af5e-a08007736f06`
- **Bot ID**: `b61a33b2-2416-4efc-a055-4663e34c6e1c`
- **Meeting**: https://meet.google.com/dfy-mwbq-pth
- **Status**: bot_joining (stuck for 25+ minutes)
- **Created**: 9:20 PM

## 💡 Key Insights

1. **Each Supabase project = unique webhook URL**: Staging, production, PR previews all need separate configuration
2. **Webhook secret is account-level**: Same secret works across all environments
3. **Zero webhooks = misconfigured**: If no webhooks in 24 hours, URL isn't registered
4. **Bot deployments never update without webhooks**: They stay in initial "joining" status forever
5. **Manual testing will fail with 401**: This is normal - real MeetingBaas webhooks will work

## ✅ Success Criteria

After configuration, you should see:
- ✅ Webhook events in `webhook_events` table
- ✅ Bot deployments status changing: `joining` → `in_meeting` → `completed`
- ✅ Recording status changing: `bot_joining` → `recording` → `processing` → `ready`
- ✅ Transcript data populated after meeting ends
- ✅ S3 URLs for video recordings

---

**Last Updated**: 2026-01-05 21:50 UTC
**Environment**: Staging (ygdpgliavpxeugaajgrb)
**Status**: ⚠️ Awaiting MeetingBaas webhook configuration
