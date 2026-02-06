# Clerk Authentication Migration Guide

This guide explains how to migrate from Supabase Auth to Clerk authentication for the Sixty Sales Dashboard. The migration enables shared authentication across both Supabase projects (internal CRM and external customer-facing).

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Clerk Authentication                          │
│                    (Central Identity Provider)                       │
│                                                                      │
│  • User creation/management at clerk.com                            │
│  • Issues JWTs with 'supabase' template                            │
│  • Handles login, signup, password reset                            │
└─────────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┴───────────────────┐
          │                                       │
          ▼                                       ▼
┌─────────────────────────┐         ┌─────────────────────────┐
│   Internal Project      │         │   External Project      │
│   ewtuefzeogytgmsnkpmb  │         │   cregubixyglvfzvtlgit  │
├─────────────────────────┤         ├─────────────────────────┤
│ • clerk_user_mapping    │         │ • clerk_user_mapping    │
│ • current_user_id()     │         │ • current_user_id()     │
│ • RLS with Clerk JWT    │         │ • RLS with Clerk JWT    │
│ • All Edge Functions    │         │                         │
└─────────────────────────┘         └─────────────────────────┘
          │                                       ▲
          │       Edge Functions can query        │
          └───────────────────────────────────────┘
```

## Prerequisites

1. **Clerk Account**: Sign up at https://clerk.com
2. **Clerk Application**: Create an application for your project
3. **JWT Template**: Configure a 'supabase' JWT template in Clerk

## Step 1: Configure Clerk JWT Template

**CRITICAL**: For Clerk JWTs to be verified by Supabase, you must configure the template with Supabase's JWT Secret.

1. Get your Supabase JWT Secret:
   - Go to Supabase Dashboard → Project Settings → API
   - Copy the "JWT Secret" (under "JWT Settings")

2. Go to Clerk Dashboard → JWT Templates
3. Click "New template" → "Supabase"
4. Configure the template:
   - **Name**: `supabase`
   - **Signing algorithm**: `HS256`
   - **Signing key**: Paste your Supabase JWT Secret
   - **Claims**:
     ```json
     {
       "sub": "{{user.id}}",
       "email": "{{user.primary_email_address}}",
       "aud": "authenticated",
       "role": "authenticated"
     }
     ```
5. Save the template

**Note**: The Supabase JWT Secret is used to sign the Clerk-issued tokens so that Supabase can verify them. This is what enables `request.jwt.claims` to be populated in PostgreSQL functions.

## Step 2: Set Environment Variables

Add these to your `.env` (or `.env.local`):

```env
# Clerk Authentication
VITE_CLERK_PUBLISHABLE_KEY="pk_test_xxxxx"
CLERK_SECRET_KEY="sk_test_xxxxx"
VITE_USE_CLERK_AUTH="true"

# Supabase Project (primary)
# Use your current Supabase project URL + publishable key (anon key)
VITE_SUPABASE_URL="https://<your-project-ref>.supabase.co"
VITE_SUPABASE_ANON_KEY="your-internal-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-internal-service-role-key"

# Optional: External Supabase Project (only if you still run a 2-project architecture)
VITE_EXTERNAL_SUPABASE_URL="https://<your-external-project-ref>.supabase.co"
VITE_EXTERNAL_SUPABASE_ANON_KEY="your-external-anon-key"
EXTERNAL_SUPABASE_SERVICE_ROLE_KEY="your-external-service-role-key"
```

## Step 3: Run Database Migrations

### Internal Project

The migrations should already exist from previous setup. Verify by checking these tables/functions exist:

```sql
-- Check clerk_user_mapping table
SELECT * FROM clerk_user_mapping LIMIT 1;

-- Check current_user_id function
SELECT current_user_id();

-- Check RLS policies use current_user_id()
SELECT policyname FROM pg_policies WHERE schemaname = 'public';
```

### External Project

Run the migrations in order:

1. Go to Supabase Dashboard → SQL Editor for external project
2. Run `supabase/external-project/migrations/001_initial_schema.sql`
3. Run `supabase/external-project/migrations/002_clerk_auth.sql`
4. Run `supabase/external-project/migrations/003_rls_policies.sql`

## Step 4: Seed User Mappings

For existing users, you need to create `clerk_user_mapping` entries.

### Option A: Manual Mapping

1. Create users in Clerk Dashboard that match your existing Supabase users (same email)
2. Run the seed script with the Clerk user IDs:

```sql
-- Example: Map an existing user
INSERT INTO clerk_user_mapping (supabase_user_id, clerk_user_id, email)
VALUES (
  'existing-supabase-uuid',
  'user_2abc123xyz',  -- Clerk user ID from Dashboard
  'user@example.com'
);
```

### Option B: Auto-Provisioning

New users signing up via Clerk will be automatically provisioned when they first access the app. The `clerk-user-sync` Edge Function handles this.

## Step 5: Deploy Edge Function

Deploy the clerk-user-sync function to handle user provisioning:

```bash
supabase functions deploy clerk-user-sync
```

Set the required secrets:

```bash
supabase secrets set EXTERNAL_SUPABASE_URL=https://<your-external-project-ref>.supabase.co
supabase secrets set EXTERNAL_SUPABASE_SERVICE_ROLE_KEY=your-external-service-role-key
```

## Step 6: Configure Clerk Webhooks (Optional)

To automatically sync user changes from Clerk to Supabase:

1. Go to Clerk Dashboard → Webhooks
2. Add endpoint: `https://<your-project-ref>.supabase.co/functions/v1/clerk-user-sync`
3. Select events:
   - `user.created`
   - `user.updated`
   - `user.deleted`
4. Add the webhook secret to Edge Function environment

## Step 7: Enable Clerk Auth

Set the feature flag to enable Clerk:

```env
VITE_USE_CLERK_AUTH="true"
```

Restart your development server.

## How Authentication Works

### Sign In Flow

1. User enters credentials in Clerk-powered login form
2. Clerk validates credentials and creates session
3. Frontend receives Clerk session with user ID
4. `ClerkAuthContext` looks up `clerk_user_mapping` to find Supabase UUID
5. If no mapping exists, calls `clerk-user-sync` Edge Function to create one
6. User ID is mapped to Supabase UUID for all data queries

### API Request Flow

1. Frontend gets JWT from Clerk using `getToken({ template: 'supabase' })`
2. JWT is sent to Supabase in Authorization header
3. Supabase extracts `sub` claim (Clerk user ID)
4. `current_user_id()` function maps Clerk ID → Supabase UUID
5. RLS policies use `current_user_id()` to filter data

## Database Functions

### `current_user_id()`

Returns the authenticated user's Supabase UUID. Supports both Supabase Auth and Clerk JWT:

```sql
CREATE OR REPLACE FUNCTION current_user_id()
RETURNS UUID AS $$
DECLARE
    v_supabase_id UUID;
    v_clerk_id TEXT;
    v_mapped_id UUID;
BEGIN
    -- Try Supabase native auth first (fastest path)
    v_supabase_id := auth.uid();
    IF v_supabase_id IS NOT NULL THEN
        RETURN v_supabase_id;
    END IF;

    -- Fall back to Clerk JWT
    v_clerk_id := current_setting('request.jwt.claims', true)::json->>'sub';
    IF v_clerk_id IS NOT NULL THEN
        SELECT supabase_user_id INTO v_mapped_id
        FROM clerk_user_mapping
        WHERE clerk_user_id = v_clerk_id;
        RETURN v_mapped_id;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
```

### `is_current_user_admin()`

Checks if the current user is an admin:

```sql
SELECT is_current_user_admin(); -- Returns TRUE or FALSE
```

## Troubleshooting

### "No mapping found" error

If users can't access their data:

1. Check `clerk_user_mapping` table has an entry for the user
2. Verify the Clerk user ID matches (`user_xxxxx` format)
3. Check the email is correct and lowercase

```sql
SELECT * FROM clerk_user_mapping WHERE email = 'user@example.com';
```

### JWT validation errors

If Supabase rejects the Clerk JWT:

1. Verify the JWT template is named `supabase`
2. Check the JWT includes required claims (`sub`, `aud`, `role`)
3. Ensure Supabase project has JWT secret configured

### RLS blocking access

If RLS policies block valid users:

1. Test `current_user_id()` returns correct UUID
2. Check the user has entries in `clerk_user_mapping`
3. Verify policies use `current_user_id()` not `auth.uid()`

```sql
-- Test current_user_id() (requires authenticated request)
SELECT current_user_id();

-- Check policies
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'deals';
```

## Rollback

To rollback to Supabase Auth:

1. Set `VITE_USE_CLERK_AUTH="false"` in environment
2. Restart the application
3. Users will need to use their Supabase Auth credentials

Note: Data created while using Clerk will still be accessible since both auth systems use the same Supabase UUIDs.

## Files Reference

| File | Purpose |
|------|---------|
| `src/lib/contexts/ClerkAuthContext.tsx` | Clerk auth provider with Supabase mapping |
| `src/lib/contexts/AuthContext.tsx` | Unified auth provider (delegates to Clerk or Supabase) |
| `src/lib/supabase/clerkClient.ts` | Supabase client factory for Clerk JWT |
| `src/lib/external-project-config.ts` | Project configuration and Edge Function lists |
| `src/lib/supabase-external.ts` | External Supabase client helper |
| `supabase/functions/clerk-user-sync/index.ts` | User provisioning Edge Function |
| `supabase/migrations/20251204200000_fix_clerk_auth_complete.sql` | Internal project Clerk auth setup |
| `supabase/external-project/migrations/002_clerk_auth.sql` | External project Clerk auth setup |
| `scripts/seed-clerk-user-mapping.sql` | Helper script for seeding user mappings |
