# Edge Function "non-2xx" Error Debugging

When you see **"Edge Function returned a non-2xx status code"**, the Supabase client hides the actual error. Here's how to find it.

## 1. Check the UI (after fix)

The integration store now extracts the real error from the response body. After retrying, you should see the actual message (e.g. "Invalid authentication token", "NYLAS_CLIENT_ID not configured").

## 2. Browser DevTools

1. Open **Network** tab
2. Trigger the action (e.g. click "Upgrade" for Nylas)
3. Find the request to `.../functions/v1/nylas-oauth-initiate` (or the failing function)
4. Click it → **Response** tab — the body contains `{ "error": "actual message" }`

## 3. Supabase Dashboard Logs

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → your project
2. **Edge Functions** → select the function (e.g. `nylas-oauth-initiate`)
3. **Logs** tab — see `console.error` output and stack traces

## 4. Common nylas-oauth-initiate errors

| Error | Cause | Fix |
|-------|-------|-----|
| No authorization header | JWT not sent | Supabase client should auto-attach; check auth session |
| Invalid authentication token | Expired/invalid JWT | User needs to re-login |
| NYLAS_CLIENT_ID not configured | Missing secret | Add in Dashboard → Edge Functions → Secrets |
| Failed to initialize Nylas OAuth flow | DB insert failed (google_oauth_states) | Check RLS, table exists, migrations applied |

## 5. Test with curl (bypasses Supabase client)

```bash
# Get JWT from browser (Local Storage → sb-xxx-auth-token → access_token)
curl -X POST "https://caerqjzvuerejfrdtygb.supabase.co/functions/v1/nylas-oauth-initiate" \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"origin":"https://staging.use60.com"}'
```

Response body will show the actual error.

## 6. REST API "No API key found in request"

If you see this when calling `microsoft_integrations` or other REST endpoints:

- **From the app**: Ensure you're logged in. The integration store now skips the Microsoft check when no auth token is available.
- **Direct URL testing**: The REST API requires an `apikey` header with your project's anon key. Add: `-H "apikey: YOUR_ANON_KEY"` and `-H "Authorization: Bearer YOUR_JWT"` to your curl/Postman request.
