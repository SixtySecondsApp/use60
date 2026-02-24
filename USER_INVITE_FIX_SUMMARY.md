# User Invitation Fix - Waitlist Flow Implementation

## Problem
User invitation from Platform/Users was failing with error: "Failed to generate password setup link"

## Solution
Changed user invitation to use the **same flow as waitlist acceptance** - the "Welcome to Early Access" email template with custom tokens.

## Changes Made

### 1. Frontend - Updated User Invitation Hook
**File**: `src/lib/hooks/useUsers.ts` (inviteUser function)

**New Flow**:
1. Create auth user using `supabase.auth.admin.createUser()`
2. Create/ensure profile exists in `profiles` table
3. Generate custom token via `generate-waitlist-token` edge function (with `user_id` instead of `waitlist_entry_id`)
4. Send "Welcome to Early Access" email (`waitlist_invite` template) with token link
5. User clicks link → sets password → completes onboarding

**Previous Flow** (now removed):
- Used Vercel API route `/api/admin/invite-user`
- Tried to generate Supabase `invite` link (was failing)
- Used `welcome` email template

### 2. Database - Support Direct User Invitations
**Migration**: `supabase/migrations/20260217230000_update_waitlist_tokens_for_user_invites.sql`

Changes to `waitlist_magic_tokens` table:
- ✅ Made `waitlist_entry_id` nullable (was NOT NULL)
- ✅ Added `user_id` column (references `auth.users`)
- ✅ Added CHECK constraint: at least one of `waitlist_entry_id` OR `user_id` must be set
- ✅ Added index on `user_id` for performance

### 3. Edge Functions - Support Both Flows
**Files Updated**:
- `supabase/functions/generate-waitlist-token/index.ts`
- `supabase/functions/validate-waitlist-token/index.ts`

**Changes**:
- Accept either `waitlist_entry_id` OR `user_id` in request
- Validate existence of waitlist entry OR user
- Store appropriate ID in token record
- Return both IDs in validation response

## Deployment Steps

### Step 1: Apply Database Migration
Run the migration in Supabase Dashboard SQL Editor:

```bash
# Open in browser
https://supabase.com/dashboard/project/caerqjzvuerejfrdtygb/sql

# Or use the prepared file
cat APPLY_MIGRATION_MANUALLY.sql
```

### Step 2: Deploy Updated Edge Functions (Staging)
```bash
# Deploy generate-waitlist-token
npx supabase functions deploy generate-waitlist-token \
  --project-ref caerqjzvuerejfrdtygb \
  --no-verify-jwt

# Deploy validate-waitlist-token
npx supabase functions deploy validate-waitlist-token \
  --project-ref caerqjzvuerejfrdtygb \
  --no-verify-jwt
```

**Note**: Staging requires `--no-verify-jwt` due to ES256 JWT format (see CLAUDE.md)

### Step 3: Test User Invitation Flow
1. Go to Platform > Users
2. Click "Add User"
3. Enter email, first name, last name
4. Click "Create User"
5. ✅ Should see: "Welcome to early access email sent to {email}"
6. Check user's email for "Welcome to Early Access" email
7. Click link in email
8. Should land on `/auth/set-password?token={token}`
9. Set password
10. Complete onboarding

## User Experience

### For Waitlist Users (unchanged):
- Admin grants access in Waitlist Management
- Receives "Welcome to Early Access" email
- Sets password → completes onboarding

### For Direct Invitations (new):
- Admin adds user in Platform/Users
- **Receives same "Welcome to Early Access" email** ✅
- Sets password → completes onboarding

## Why This Approach?

1. **Consistent UX**: All users get the same onboarding experience
2. **Proven Flow**: Waitlist acceptance already works perfectly
3. **Single Email Template**: Maintains brand consistency
4. **Custom Control**: Full control over signup flow (not Supabase defaults)
5. **Token Security**: 24-hour expiry, single-use tokens

## Files Changed
- `src/lib/hooks/useUsers.ts` - inviteUser function
- `supabase/functions/generate-waitlist-token/index.ts` - support user_id
- `supabase/functions/validate-waitlist-token/index.ts` - return user_id
- `supabase/migrations/20260217230000_update_waitlist_tokens_for_user_invites.sql` - schema update
- `APPLY_MIGRATION_MANUALLY.sql` - manual migration script

## Next Steps (Optional)
- [ ] Remove `/api/admin/invite-user` Vercel endpoint (now unused)
- [ ] Update `welcome` email template reference if needed elsewhere
- [ ] Consider merging waitlist acceptance + user invitation into single service
