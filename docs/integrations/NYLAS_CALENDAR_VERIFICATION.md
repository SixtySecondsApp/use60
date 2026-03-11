# Nylas Calendar Integration Verification

Nylas provides Google Calendar access through their pre-verified GCP app (no CASA assessment). Gmail works directly via Google API.

## Flow

1. **Connect Google** (Integrations page) → Standard Google OAuth → `google_integrations` row
2. **Upgrade to Calendar** (when status is "limited") → `connectNylas()` → `nylas-oauth-initiate` → Nylas Hosted OAuth → `nylas-oauth-callback` → `nylas_integrations` row

## Edge Functions (staging: --no-verify-jwt)

| Function | Purpose |
|----------|---------|
| nylas-oauth-initiate | Generates Nylas auth URL, stores state in google_oauth_states |
| nylas-oauth-callback | Exchanges code for grant_id, upserts nylas_integrations |

## Required Secrets (Supabase Edge Function)

- `NYLAS_CLIENT_ID` — Nylas application client ID
- `NYLAS_API_KEY` — Nylas API key

## Nylas Dashboard Config

1. **Redirect URI**: Add `https://<project-ref>.supabase.co/functions/v1/nylas-oauth-callback`
   - Staging: `https://caerqjzvuerejfrdtygb.supabase.co/functions/v1/nylas-oauth-callback`
   - Production: `https://ygdpgliavpxeugaajgrb.supabase.co/functions/v1/nylas-oauth-callback`

2. **Provider**: Google, scope: `calendar`

## Test nylas-oauth-initiate

```bash
# Get JWT: Log into staging, DevTools → Application → Local Storage
# Key: sb-caerqjzvuerejfrdtygb-auth-token (or similar)
# Value: JSON with access_token

./scripts/test-nylas-oauth-initiate.sh "<your-jwt>" staging
```

Expected: HTTP 200, JSON with `authUrl` (Nylas authorization URL).

## Manual E2E Test

1. Go to https://staging.use60.com/integrations
2. Connect Google (if not already) — standard Google OAuth
3. If status shows "Limited", click "Upgrade" / "Connect Calendar"
4. Should redirect to Nylas → authorize → redirect back to /integrations?nylas_status=connected
5. Toast: "Calendar connected!"
6. Status should change to "Active"
