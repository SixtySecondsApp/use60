# OAuth Relay Pattern for Development

This document explains the OAuth relay pattern used for localhost development.

## Overview

When developing on `localhost:5175`, OAuth providers cannot redirect back to `http://localhost` because:
1. Most providers don't allow `localhost` as a valid redirect URI
2. Even if allowed, the callback would hit the wrong database (staging instead of development)

**Solution**: Use a **relay pattern** where:
1. Localhost opens OAuth popup to `staging.use60.com`
2. OAuth provider redirects back to `staging.use60.com/oauth/{provider}/callback`
3. Staging callback page detects it's in a popup (`window.opener` exists)
4. Staging posts the **authorization code** back to localhost via `postMessage`
5. Localhost receives the code and calls **its own development edge function**
6. Development edge function saves tokens to **development database** ✅

---

## Current Implementation Status

| Integration | Relay Pattern | Edge Function | Status |
|-------------|---------------|---------------|--------|
| **Fathom** | ⚠️ Partial | ✅ Yes | ⚠️ **Needs upgrade** |
| **Google** | ✅ Implemented | ❌ Missing | 🔴 **Incomplete** |
| **Slack** | N/A | ✅ Yes | ✅ **Working** |
| **HubSpot** | N/A | ✅ Yes | ✅ **Working** |

### Fathom - Needs Upgrade ⚠️

**Current Issue**: FathomCallback calls the edge function directly, which saves to staging DB instead of relaying the code to localhost.

**What needs fixing**:
```typescript
// In FathomCallback.tsx - replace direct edge function call with relay
if (isRelayMode) {
  // POST CODE to localhost, not call edge function
  window.opener.postMessage({
    type: 'fathom-oauth-code',
    code,
    state
  }, window.location.origin);
  window.close();
  return;
}

// Only call edge function in direct mode
const { data } = await supabase.functions.invoke('fathom-oauth-callback', { body: { code, state } });
```

**Status**: Relay pattern structure exists, but needs to relay **code** instead of calling edge function.

---

### Google - Incomplete 🔴

**Current Status**:
- ✅ GoogleCallback.tsx updated with relay pattern
- ❌ Missing postMessage listener in parent window
- ❌ Missing googleAuthService.ts file
- ❌ Missing token exchange implementation

**What needs to be created**:

1. **Create Google OAuth Hook** (`src/lib/hooks/useGoogleIntegration.ts`):
```typescript
export function useGoogleIntegration() {
  const connectGoogle = async () => {
    // Open popup to staging
    const popup = window.open(
      'https://staging.use60.com/auth/google/callback',
      'Google OAuth',
      'width=600,height=700'
    );

    // Listen for postMessage with authorization code
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'google-oauth-code') {
        const { code, state } = event.data;

        // Call development edge function with code
        const { data } = await supabase.functions.invoke('google-oauth-callback', {
          body: { code, state }
        });

        // Handle success/error
        popup.close();
      }
    };

    window.addEventListener('message', handleMessage);
  };

  return { connectGoogle };
}
```

2. **Create Edge Function** (`supabase/functions/google-oauth-callback/index.ts`):
```typescript
Deno.serve(async (req) => {
  const { code, state } = await req.json();

  // Exchange code for tokens
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: JSON.stringify({
      code,
      client_id: Deno.env.get('VITE_GOOGLE_CLIENT_ID'),
      client_secret: Deno.env.get('VITE_GOOGLE_CLIENT_SECRET'),
      redirect_uri: Deno.env.get('VITE_GOOGLE_REDIRECT_URI'),
      grant_type: 'authorization_code',
    }),
  });

  const tokens = await response.json();

  // Save tokens to database
  const { error } = await supabase.from('google_integrations').insert({
    user_id: userId,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    // ...
  });

  return new Response(JSON.stringify({ success: true }));
});
```

**Status**: Needs full implementation.

---

### Slack - Working ✅

**Current Setup**:
- Uses edge function directly: `https://wbgmnyekgqklggilgqag.supabase.co/functions/v1/slack-oauth-callback`
- No relay needed (edge function handles everything)
- Already registered in Slack app settings

**Status**: No changes needed.

---

### HubSpot - Working ✅

**Current Setup**:
- Uses edge function directly: `https://wbgmnyekgqklggilgqag.supabase.co/functions/v1/hubspot-oauth-callback`
- No relay needed (edge function handles everything)
- Already registered in HubSpot app settings

**Status**: No changes needed.

---

## Environment Configuration

### `.env.development` (Updated)

```bash
# Fathom - Relay via staging
VITE_FATHOM_REDIRECT_URI=https://staging.use60.com/oauth/fathom/callback

# Google - Relay via staging
VITE_GOOGLE_REDIRECT_URI=https://staging.use60.com/auth/google/callback

# Slack - Edge function (no relay)
SLACK_REDIRECT_URI=https://wbgmnyekgqklggilgqag.supabase.co/functions/v1/slack-oauth-callback

# HubSpot - Edge function (no relay)
HUBSPOT_REDIRECT_URI=https://wbgmnyekgqklggilgqag.supabase.co/functions/v1/hubspot-oauth-callback
```

---

## OAuth Provider Configuration

### Required Redirect URIs in OAuth Apps

Register these redirect URIs in each OAuth provider's app settings:

| Provider | Redirect URI (for staging relay) |
|----------|-----------------------------------|
| **Fathom** | `https://staging.use60.com/oauth/fathom/callback` |
| **Google** | `https://staging.use60.com/auth/google/callback` |
| **Slack** | `https://wbgmnyekgqklggilgqag.supabase.co/functions/v1/slack-oauth-callback` |
| **HubSpot** | `https://wbgmnyekgqklggilgqag.supabase.co/functions/v1/hubspot-oauth-callback` |

---

## Testing the Relay Pattern

### Test Fathom Relay (after fixing)

1. Open `http://localhost:5175/integrations`
2. Click "Connect Fathom"
3. Popup opens to `staging.use60.com/oauth/fathom/callback`
4. Fathom redirects back to staging with code
5. Staging posts code back to localhost
6. Localhost calls development edge function
7. Check database: `SELECT * FROM fathom_integrations WHERE user_id = 'your-user-id'`
8. Integration should exist in **development database** ✅

### Test Google OAuth (after implementation)

1. Open `http://localhost:5175/integrations`
2. Click "Connect Google"
3. Follow same flow as Fathom
4. Check database: `SELECT * FROM google_integrations WHERE user_id = 'your-user-id'`
5. Integration should exist in **development database** ✅

---

## Next Steps

1. **Fix Fathom Relay Pattern** ⚠️
   - Update FathomCallback to relay code instead of calling edge function
   - Test on localhost

2. **Implement Google OAuth** 🔴
   - Create useGoogleIntegration hook with postMessage listener
   - Create google-oauth-callback edge function
   - Test full flow

3. **Update OAuth App Settings** 📝
   - Verify Fathom app has `staging.use60.com/oauth/fathom/callback`
   - Add Google redirect URI to Google Cloud Console
   - Verify Slack and HubSpot edge function URLs are registered

---

## Benefits of Relay Pattern

✅ **No separate dev OAuth apps needed** - Reuse production/staging apps
✅ **Correct database** - Data saved to development DB when on localhost
✅ **Same UX** - Identical OAuth flow for all environments
✅ **Security** - postMessage only accepts messages from same origin
✅ **Fallback** - Polling mechanism if postMessage fails

---

## Troubleshooting

### Issue: Integration shows on dev.use60.com but not localhost

**Cause**: Both environments should use same development database. If not showing on localhost:
1. Hard refresh: `Cmd+Shift+R`
2. Clear cache: DevTools → Application → Clear storage
3. Check browser console for errors

### Issue: postMessage blocked by browser

**Symptoms**: Popup closes but localhost doesn't receive message

**Solution**: Relay pattern includes polling fallback that checks database every second for new integrations.

### Issue: OAuth fails with 401 error

**Cause**: Edge function authentication failed

**Solution**: Ensure user is logged in and session token is valid.
