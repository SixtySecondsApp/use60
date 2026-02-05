# Staging Environment Fixes

**Created**: 2026-01-26
**Issues Identified**: WebSocket failures, missing tables, authorization errors

---

## Issues Summary

### 1. WebSocket Connection Failures ❌
**Symptom**: `WebSocket connection to 'wss://...?apikey=...%0A&vsn=1.0.0' failed`
**Root Cause**: Newline character (`%0A`) being appended to API key during runtime
**Impact**: Supabase Realtime features not working (live updates, subscriptions)

### 2. Missing Tables (404 Errors) ❌
- `organization_join_requests` - Migration exists but not applied
- `fireflies_integrations` - Migration created, needs to be applied

### 3. Fathom Disconnect Authorization (401 Error) ❌
**Symptom**: `Failed to load resource: the server responded with a status of 401 ()`
**Endpoint**: `/functions/v1/fathom-disconnect`
**Impact**: Users cannot disconnect Fathom integration

---

## Fix Steps

### Step 1: Apply Missing Migrations to Staging

```bash
# Switch to staging project
supabase link --project-ref caerqjzvuerejfrdtygb

# Apply all pending migrations
supabase db push

# Verify migrations applied
supabase migration list
```

**Expected Result**:
- `20260117000002_add_organization_join_requests.sql` ✅ Applied
- `20260126000003_add_fireflies_integrations.sql` ✅ Applied

### Step 2: Fix WebSocket Connection Issue

**Investigation Needed**: Check where the newline is being added to the API key.

Possible causes:
1. Environment variable loading issue in Vite
2. Supabase client initialization adding extra characters
3. Browser extension interference

**Temporary Workaround**: Clear browser cache and reload

**Permanent Fix**:
```typescript
// In src/lib/supabase-external.ts or wherever client is initialized
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
```

### Step 3: Fix Fathom Disconnect Authorization

**Status**: ✅ Code is correct - frontend properly sends auth header
**Root Cause**: Function likely not deployed to staging OR user session expired

**Solution**: Redeploy the function to staging
```bash
# Deploy fathom-disconnect function
supabase functions deploy fathom-disconnect --project-ref caerqjzvuerejfrdtygb
```

**Note**: If error persists, user may need to log out and log back in to refresh their session.

### Step 4: Verify Fixes

After applying migrations and fixes:

1. **Test WebSocket**: Check browser console - no more WebSocket errors
2. **Test Organization Join**: Navigate to org settings - no 404 errors
3. **Test Fireflies**: Navigate to integrations - no 404 errors
4. **Test Fathom Disconnect**: Try disconnecting Fathom - no 401 errors

---

## Migration Details

### `organization_join_requests` Table
**Purpose**: Allow users to request to join organizations
**Features**:
- Pending/approved/rejected status workflow
- RLS policies for user privacy
- Admin approval/rejection functions
- Automatic duplicate prevention

### `fireflies_integrations` Table
**Purpose**: Per-user Fireflies.ai integration via API key
**Features**:
- User-scoped API key storage
- Team meeting sync option
- Sync state tracking
- RLS policies for user privacy

---

## Testing Checklist

- [ ] Migrations applied successfully
- [ ] No WebSocket connection errors in console
- [ ] Organization join requests work without 404
- [ ] Fireflies integration page loads without 404
- [ ] Fathom disconnect works without 401
- [ ] Supabase Realtime subscriptions working
- [ ] Live updates functioning (test with meetings table)

---

## Next Steps

1. Apply migrations to staging immediately
2. Deploy frontend fix for WebSocket issue (if needed)
3. Deploy fathom-disconnect authorization fix
4. Test all integrations end-to-end
5. Monitor Sentry for any remaining errors

---

## Production Deployment

**IMPORTANT**: These migrations must also be applied to production before deploying code that uses these tables.

```bash
# Production deployment checklist
1. Apply migrations to production database
2. Deploy edge functions with fixes
3. Deploy frontend with fixes
4. Monitor for 24 hours
5. Update team on new features available
```
