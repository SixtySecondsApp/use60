# Magic Link Fix Summary

## Issues Fixed

### 1. Email Template Styling ✅
- Created SQL migration to update magic link template with dark mode styling matching waitlist_welcome template
- File: `supabase/migrations/20251219000003_update_magic_link_template_styling.sql`
- Run this migration to update the template in the database

### 2. Session Creation & Redirect ✅
- Updated `AuthCallback.tsx` to properly handle magic link verification
- Added multiple fallback methods to find waitlist_entry_id:
  1. URL query params (might be lost in redirect)
  2. localStorage
  3. User metadata (stored when magic link is generated)
  4. Database lookup by email
- Added logging to debug session creation issues

### 3. User Metadata Storage ✅
- Updated `generate-magic-link` Edge Function to store `waitlist_entry_id` in user metadata
- This ensures we can find the waitlist entry even if URL params are lost

### 4. Redirect URL Issue ⚠️
**Problem**: The magic link's `redirect_to` parameter is showing as just `https://app.use60.com` instead of `/auth/callback?waitlist_entry={id}`

**Potential Causes**:
- Supabase Site URL setting might be overriding the redirectTo
- Redirect URL might need to be in the allowed redirect URLs list
- Supabase might be stripping query parameters

**Solution Applied**:
- Store waitlist_entry_id in user metadata (so we can find it even if URL params are lost)
- Look up waitlist entry by email as fallback
- Improved session handling with retry logic

## Files Modified

1. `supabase/functions/generate-magic-link/index.ts` - Store waitlist_entry_id in metadata
2. `src/pages/auth/AuthCallback.tsx` - Enhanced magic link handling with multiple fallback methods
3. `supabase/migrations/20251219000003_update_magic_link_template_styling.sql` - Update email template styling

## Next Steps

1. **Run the template styling migration**:
   ```sql
   -- Run: supabase/migrations/20251219000003_update_magic_link_template_styling.sql
   ```

2. **Deploy the Edge Function** (if not already):
   ```bash
   supabase functions deploy generate-magic-link
   ```

3. **Check Supabase Settings** (IMPORTANT for local dev):
   - Go to Supabase Dashboard → Authentication → URL Configuration
   - **For Production**: Add `https://app.use60.com/auth/callback*` to the **Redirect URLs** list
   - **For Local Development**: Add your local dev URLs to the **Redirect URLs** list, for example:
     - `http://localhost:3000/auth/callback*`
     - `http://localhost:5173/auth/callback*`
     - `http://127.0.0.1:3000/auth/callback*`
     - Or use a wildcard: `http://localhost:*`
   - **Site URL** should be set to your production URL (`https://app.use60.com`), but redirect URLs can include localhost for local development
   - Note: The code uses `window.location.origin` so it will automatically work with any origin (localhost, production, etc.)

4. **Test the Flow**:
   - Resend a magic link to a test waitlist entry
   - Click the link
   - Check browser console for logs starting with `[AuthCallback]`
   - Verify it redirects to SetPassword page
   - Complete password setup
   - Verify redirect to dashboard

## Debugging

If the magic link still doesn't work:

1. Check browser console for `[AuthCallback]` logs
2. Verify the magic link URL includes the correct `redirect_to` parameter
3. Check if session is being created (look for session in localStorage or Network tab)
4. Verify waitlist_entry_id is in user metadata after magic link verification




