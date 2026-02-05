# Deploy Magic Link Edge Function

The magic link generation now uses a new Edge Function. You need to deploy it before it will work.

## Deploy the Function

Run this command in your terminal from the project root:

```bash
supabase functions deploy generate-magic-link
```

Or if you're using the Supabase CLI with a specific project:

```bash
supabase functions deploy generate-magic-link --project-ref YOUR_PROJECT_REF
```

## Verify Deployment

After deployment, the function should be available at:
```
https://YOUR_PROJECT_REF.functions.supabase.co/generate-magic-link
```

## What This Function Does

- Uses Supabase Admin API to generate magic links
- Does NOT automatically send emails (so we can use our custom template)
- Returns the magic link URL for use in our custom email template

## Alternative: Quick Fix Without Deployment

If you need a quick fix before deploying, you can temporarily use `signInWithOtp` which will send Supabase's default email, but the magic link will still work. However, this will send TWO emails (Supabase default + our custom one), so it's not ideal.




