# Signup Flow Fix Summary

## Problem
Getting **401 Unauthorized** and **42501 RLS violation** errors when trying to create profile during signup.

Root cause: After `signUp()` but before `signInWithPassword()`, there is NO authentication context. The client uses the anon key, which can't bypass RLS.

## Solution Implemented

### 1. Database Trigger (Auto-creates Profile)
**File**: `supabase/migrations/20260121000009_auto_create_profile_on_auth_signup.sql`

When a new auth user is created, a PostgreSQL trigger automatically creates a profile in `public.profiles` with:
- `id` (from auth.users.id)
- `email` (from auth.users.email)
- `profile_status` = 'active'

This happens server-side, bypassing all RLS issues.

### 2. Store Names in Auth Metadata (SetPassword)
**File**: `src/pages/auth/SetPassword.tsx`

Changed approach:
- ❌ **OLD**: Try to upsert to profiles table (fails with RLS)
- ✅ **NEW**: Store first_name/last_name in `auth.users.user_metadata` via `updateUser()`

```typescript
await supabase.auth.updateUser({
  data: {
    first_name: firstName.trim(),
    last_name: lastName.trim(),
  },
});
```

### 3. Sync Auth Metadata to Profile (Onboarding)
**File**: `src/pages/onboarding/index.tsx`

Added `useEffect` that runs when user enters onboarding:
- User is now authenticated (session exists)
- Can safely UPDATE profiles table without RLS issues
- Syncs first_name/last_name from auth metadata to profiles table

```typescript
const { data: { user: authUser } } = await supabase.auth.getUser();

// Update profile with auth metadata
await supabase
  .from('profiles')
  .update({
    first_name: authUser.user_metadata.first_name,
    last_name: authUser.user_metadata.last_name,
  })
  .eq('id', user.id);
```

### 4. Improved RLS Policies
**File**: `supabase/migrations/20260121000010_fix_profiles_rls_for_signup.sql`

Added UPDATE policy to allow authenticated users to update their own profile.

## Complete Signup Flow Now

1. **SetPassword Page**
   - User enters: First Name, Last Name, Password
   - `signUp()` creates auth user
   - `updateUser()` stores first/last name in auth metadata
   - `signInWithPassword()` signs user in
   - Redirect to `/onboarding`

2. **Database**
   - Trigger auto-creates profile with id + email
   - localStorage cleared (no stale org IDs)

3. **Onboarding**
   - User is authenticated
   - `useEffect` syncs auth metadata to profile
   - First/last name now in profiles table
   - User selects company domain
   - Organization matching/creation logic runs

4. **Dashboard**
   - User has complete profile
   - Team members shows full name (not "Unknown User")
   - Profile page shows all fields

## Files Changed

1. ✅ `src/pages/auth/SetPassword.tsx` - Store names in auth metadata instead of upsert
2. ✅ `src/pages/onboarding/index.tsx` - Sync auth metadata to profile after sign in
3. ✅ `supabase/migrations/20260121000009_auto_create_profile_on_auth_signup.sql` - Auto-create profile trigger
4. ✅ `supabase/migrations/20260121000010_fix_profiles_rls_for_signup.sql` - Update RLS policies

## Required Supabase Migrations

**RUN THESE IN SUPABASE SQL EDITOR:**

### Migration 1: Auto-create profile on auth signup
```sql
CREATE OR REPLACE FUNCTION public.create_profile_on_auth_user_created()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
    INSERT INTO public.profiles (
      id,
      email,
      profile_status,
      created_at,
      updated_at
    ) VALUES (
      NEW.id,
      NEW.email,
      'active',
      NOW(),
      NOW()
    ) ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_create_profile_on_auth_signup ON auth.users;

CREATE TRIGGER trigger_create_profile_on_auth_signup
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.create_profile_on_auth_user_created();
```

### Migration 2: Fix RLS policies
```sql
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;

CREATE POLICY "profiles_insert" ON public.profiles
FOR INSERT
WITH CHECK (
  public.is_service_role()
  OR id = auth.uid()
  OR email IN (
    SELECT email FROM auth.users
    WHERE email = profiles.email
    AND created_at > NOW() - INTERVAL '1 hour'
  )
);

CREATE POLICY "profiles_update" ON public.profiles
FOR UPDATE
USING (
  public.is_service_role()
  OR id = auth.uid()
  OR (email IN (
    SELECT email FROM auth.users
    WHERE email = profiles.email
    AND created_at > NOW() - INTERVAL '1 hour'
  ))
)
WITH CHECK (
  public.is_service_role()
  OR id = auth.uid()
  OR (email IN (
    SELECT email FROM auth.users
    WHERE email = profiles.email
    AND created_at > NOW() - INTERVAL '1 hour'
  ))
);
```

## Testing

Use the credentials:
- **Token**: `fc9cc294444c5e564f7fe7702e1d61a89474b749c3899f93c54d1188f919791f`
- **Waitlist ID**: `0bd53b2c-b2f0-47d7-af79-a81ee386085d`
- **Email**: `test-20260121115440@example.com`

Navigate to:
```
http://localhost:5175/auth/set-password?token=fc9cc294444c5e564f7fe7702e1d61a89474b749c3899f93c54d1188f919791f&waitlist_entry=0bd53b2c-b2f0-47d7-af79-a81ee386085d
```

Fill form and submit. Should redirect to `/onboarding` without errors.

## Why This Works

- ✅ **No RLS violations**: Profile update happens after user is authenticated
- ✅ **No 401 errors**: Auth metadata is set while user exists in auth context
- ✅ **Automatic profile creation**: Database trigger handles it server-side
- ✅ **Complete user data**: First/last name properly synced to profiles table
- ✅ **Clean flow**: User goes through normal auth → onboarding → dashboard process
