# Microsoft 365 Integration — Pre-Production Checklist

## Code Review Summary

The branch `feat/microsoft-365-integration` has 10 changed files covering:
- OAuth flow (PKCE) with token exchange and refresh
- Outlook email actions (list, send, reply, forward, archive, trash, etc.)
- Calendar sync via push notifications (Graph webhooks)
- Integration store parity with Google (toggle, sync, health checks)
- Migration for 3 new tables + RLS + indexes

**Code quality is solid.** Key hardening already done:
- `maybeSingle()` used correctly (no PGRST116 risk)
- `encodeURIComponent()` on all Graph API path params (prevents path injection)
- `clientState` validation on webhook notifications (prevents spoofed pushes)
- Token revocation detection with specific error matching (not blanket 400s)
- Migration is re-runnable (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`, `IF NOT EXISTS` on indexes)
- Optimistic UI updates with proper rollback on error

---

## BLOCKING — Must Do Before Deploy

### 1. Azure App Registration

You need an Azure AD app registration at [portal.azure.com](https://portal.azure.com):

1. Go to **Azure Active Directory > App registrations > New registration**
2. Name: `60 Sales Dashboard` (or similar)
3. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**
4. Redirect URI (Web): `https://ygdpgliavpxeugaajgrb.supabase.co/functions/v1/microsoft-oauth-callback`
   - For staging: `https://caerqjzvuerejfrdtygb.supabase.co/functions/v1/microsoft-oauth-callback`
5. Under **Certificates & secrets > Client secrets**, create a new secret and copy the value
6. Under **API permissions**, add these **delegated** permissions:
   - `openid`
   - `profile`
   - `email`
   - `offline_access`
   - `User.Read`
   - `Mail.Read`
   - `Mail.ReadWrite`
   - `Mail.Send`
   - `Calendars.ReadWrite`
7. Click **Grant admin consent** (if you're a tenant admin) or users will consent individually

### 2. Set Edge Function Secrets

```bash
# Production
supabase secrets set --project-ref ygdpgliavpxeugaajgrb \
  MS_CLIENT_ID="<your-azure-client-id>" \
  MS_CLIENT_SECRET="<your-azure-client-secret>"

# Staging
supabase secrets set --project-ref caerqjzvuerejfrdtygb \
  MS_CLIENT_ID="<your-azure-client-id>" \
  MS_CLIENT_SECRET="<your-azure-client-secret>"
```

Also verify `FRONTEND_URL` is set (used by OAuth callback redirect):
```bash
supabase secrets list --project-ref ygdpgliavpxeugaajgrb | grep FRONTEND_URL
```
If missing:
```bash
supabase secrets set --project-ref ygdpgliavpxeugaajgrb FRONTEND_URL="https://app.use60.com"
```

### 3. Apply Database Migration

```bash
# Production
supabase db push --project-ref ygdpgliavpxeugaajgrb

# Staging
supabase db push --project-ref caerqjzvuerejfrdtygb
```

This creates: `microsoft_integrations`, `microsoft_oauth_states`, `microsoft_service_logs`

### 4. Deploy Edge Functions

```bash
# Deploy all Microsoft-related edge functions
supabase functions deploy microsoft-oauth-initiate --project-ref ygdpgliavpxeugaajgrb
supabase functions deploy microsoft-oauth-callback --project-ref ygdpgliavpxeugaajgrb --no-verify-jwt
supabase functions deploy ms-graph-email --project-ref ygdpgliavpxeugaajgrb
supabase functions deploy ms-graph-webhook --project-ref ygdpgliavpxeugaajgrb --no-verify-jwt
supabase functions deploy ms-graph-calendar-sync --project-ref ygdpgliavpxeugaajgrb
```

Note: `microsoft-oauth-callback` and `ms-graph-webhook` need `--no-verify-jwt` because:
- Callback receives redirects from Microsoft (no Supabase JWT)
- Webhook receives push notifications from Microsoft Graph

Check if these are already declared in `supabase/config.toml` under `[functions.<name>]` with `verify_jwt = false`. If so, the flag isn't needed.

### 5. Set Webhook Endpoint as Public

Verify `ms-graph-webhook` is accessible without auth. Test with:
```bash
curl -X POST "https://ygdpgliavpxeugaajgrb.supabase.co/functions/v1/ms-graph-webhook?validationToken=test123"
```
Should return `test123` as `text/plain`.

---

## NON-BLOCKING — Should Do Before GA

### 6. `jsonb_set_key` RPC May Not Exist

The OAuth callback calls `supabase.rpc('jsonb_set_key', ...)` to set `connected_email_provider` in `user_settings.preferences`. This RPC function has **no migration** in the codebase. It's wrapped in try/catch so it won't break the flow, but the preference won't be set.

**Options:**
- a) Verify it exists in production: `SELECT proname FROM pg_proc WHERE proname = 'jsonb_set_key';`
- b) If it doesn't exist, create it or replace the RPC call with a direct JSONB update:
  ```sql
  UPDATE user_settings
  SET preferences = jsonb_set(
    COALESCE(preferences, '{}'::jsonb),
    '{connected_email_provider}',
    '"microsoft"'::jsonb
  )
  WHERE user_id = $1;
  ```

### 7. Microsoft Publisher Verification

Without publisher verification, users see an "unverified app" consent screen. To verify:
1. Go to Azure AD > App registrations > your app > Branding & properties
2. Add your verified domain under **Publisher domain**
3. Optionally register in Microsoft Partner Network for the verified publisher badge

This is non-blocking (users can still consent) but looks unprofessional.

### 8. Token Refresh Cron Job

Google has `google-token-refresh` and a Railway cron. Microsoft needs the same:
- Create `microsoft-token-refresh` edge function (or extend existing pattern)
- Set up a cron to call it every 30-45 minutes
- Microsoft tokens expire in ~1 hour by default

Currently tokens refresh lazily (on next API call via `getMicrosoftIntegration`), which works but means the first call after expiry has extra latency.

### 9. Webhook Subscription Renewal Cron

Microsoft Graph subscriptions expire after 3 days (as configured in `SUBSCRIPTION_EXPIRY_DAYS`). You need a cron job to renew them:
- Query `microsoft_integrations` where `mail_subscription_expiry < now() + interval '1 day'`
- Call `ms-graph-webhook?action=renew` for each

Without this, push notifications silently stop after 3 days.

### 10. Landing Package Store Sync

`packages/landing/src/lib/stores/integrationStore.ts` still uses the old method names (`toggleService`, `clearError`, `setLoading`, `isServiceEnabled`). These weren't renamed in this branch. If the landing package shares the same store, it will break when the main app store changes merge. Non-blocking since landing is a separate build.

---

## Testing Checklist

- [ ] OAuth flow: Connect Microsoft account, verify redirect back to `/integrations?microsoft_status=connected`
- [ ] Token display: Config modal shows connected email and token expiry
- [ ] Service toggles: Enable/disable Outlook and Calendar, verify `service_preferences` updates in DB
- [ ] Send email: From a contact page, send via Outlook
- [ ] List emails: Verify inbox listing works
- [ ] Reply/forward: Test HTML and plain text modes
- [ ] Webhook setup: Set up mail subscription, verify subscription ID stored in DB
- [ ] Webhook notification: Send yourself an email, verify the webhook fires and triggers sync
- [ ] Token refresh: Wait for token expiry (or manually expire in DB), verify next API call refreshes
- [ ] Disconnect: Disconnect Microsoft, verify cleanup (integration marked inactive)
- [ ] Reconnect: Connect again after disconnect, verify clean state
- [ ] Dual provider: Connect both Google and Microsoft, verify no cross-contamination
- [ ] Error handling: Revoke app access in Azure AD, verify graceful degradation and "reconnect" prompt

---

*Delete this file after completing the checklist.*
