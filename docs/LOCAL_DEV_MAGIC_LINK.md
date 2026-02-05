# Testing Magic Links on Local Dev Server

## The Issue

Magic link URLs contain a **redirect URL that is baked into the link** when it's generated. This means:
- If you generate a magic link while running on `localhost:3000`, it will redirect to `localhost:3000`
- If you generate a magic link while running on `app.use60.com`, it will redirect to `app.use60.com`

**You cannot change the redirect URL of an existing magic link** - you must generate a new one.

## Solution for Local Testing

To test magic links on your local dev server:

1. **Make sure your local dev server is running** (e.g., `http://localhost:3000` or `http://localhost:5173`)

2. **Generate a NEW magic link from your local admin panel:**
   - Open your local admin panel (e.g., `http://localhost:3000/admin/waitlist`)
   - Find the waitlist entry you want to test
   - Click "Resend Magic Link" or "Grant Access"
   - This will generate a NEW magic link with `localhost` as the redirect URL

3. **Use the NEW magic link from the email** - the old one will always redirect to production

## Important Notes

- **Old magic links won't work for local testing** - they were generated with production URLs
- **Always generate new magic links when switching between local/production environments**
- The code uses `window.location.origin` automatically, so it will work correctly as long as you generate the link from the correct environment

## Supabase Settings for Local Dev

Make sure your Supabase project has localhost URLs in the allowed redirect URLs:

1. Go to Supabase Dashboard → Authentication → URL Configuration
2. Add to Redirect URLs:
   - `http://localhost:3000/auth/callback*`
   - `http://localhost:5173/auth/callback*`
   - Or use wildcard: `http://localhost:*`

## Debugging

If a magic link redirects to the wrong place:
1. Check the email - look at the actual magic link URL
2. Look for `redirect_to=` parameter in the URL
3. That's where it will redirect (can't be changed)
4. Generate a new magic link from the correct environment



