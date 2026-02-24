# Email Branding Guide

## System-Wide Email Logo

All emails sent from Sixty now include the Sixty logo in the header for consistent branding.

---

## Current Configuration

### Logo URL
```
https://ygdpgliavpxeugaajgrb.supabase.co/storage/v1/object/public/Logos/ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459/Icon.png
```

### Display Settings
- **Height**: 48px (width: auto, maintains aspect ratio)
- **Position**: Top center of email, above all content
- **Styling**: Clean header with bottom border separator

---

## Where the Logo is Configured

### 1. Environment Variables

**Local Development**: `.env`
```bash
VITE_EMAIL_LOGO_URL=https://ygdpgliavpxeugaajgrb.supabase.co/storage/v1/object/public/Logos/ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459/Icon.png
```

**Staging**: `.env.staging`
```bash
VITE_EMAIL_LOGO_URL=https://ygdpgliavpxeugaajgrb.supabase.co/storage/v1/object/public/Logos/ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459/Icon.png
```

**Production**: `.env.production`
```bash
VITE_EMAIL_LOGO_URL=https://ygdpgliavpxeugaajgrb.supabase.co/storage/v1/object/public/Logos/ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459/Icon.png
```

**Template**: `.env.example`
```bash
VITE_EMAIL_LOGO_URL=https://ygdpgliavpxeugaajgrb.supabase.co/storage/v1/object/public/Logos/ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459/Icon.png
```

### 2. Edge Functions

**File**: `supabase/functions/send-organization-invitation/index.ts`

```typescript
// Get system-wide email logo from environment
const emailLogoUrl = Deno.env.get('EMAIL_LOGO_URL') ||
  'https://ygdpgliavpxeugaajgrb.supabase.co/storage/v1/object/public/Logos/ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459/Icon.png';

const emailVariables = {
  // ... other variables
  app_logo_url: emailLogoUrl,
  // ...
};
```

### 3. Email Templates

**Database**: `encharge_email_templates` table

The `organization_invitation` template includes:

```html
<!-- App Logo Header -->
<div style="text-align: center; margin: 0 0 32px 0; padding-bottom: 24px; border-bottom: 1px solid #e5e7eb;">
    <img src="{{app_logo_url}}" alt="Sixty"
         style="height: 48px; width: auto; margin: 0 auto; display: block;" />
</div>
```

Variables schema:
```json
{
  "name": "app_logo_url",
  "description": "URL to Sixty application logo"
}
```

---

## Email Structure

```
┌─────────────────────────────────────┐
│  [Sixty Logo - 48px height]         │ ← New header
├─────────────────────────────────────┤
│  Join Acme Corp on Sixty            │
├─────────────────────────────────────┤
│  [Inviter Avatar - 64px circle]     │
│  Invited by Max Parish              │
├─────────────────────────────────────┤
│  Hi John,                           │
│                                     │
│  Max Parish has invited you...      │
│                                     │
│  [Accept Invitation Button]         │
├─────────────────────────────────────┤
│  Footer / Support Info              │
└─────────────────────────────────────┘
```

---

## How to Change the Logo

### Option 1: Change Logo File (Keep Same URL)

If you want to replace the logo but keep the same URL:

1. Upload new logo to same Supabase Storage location
2. Overwrite existing file
3. No code changes needed (URL stays the same)

### Option 2: Use Different Logo URL

If you want to use a different URL:

1. **Upload new logo to Supabase Storage**:
   ```sql
   -- Get signed upload URL
   SELECT * FROM storage.objects WHERE bucket_id = 'Logos';
   ```

2. **Update environment variables**:
   ```bash
   # In .env, .env.staging, .env.production
   VITE_EMAIL_LOGO_URL=https://your-new-logo-url.png
   ```

3. **Redeploy edge functions** (if logo is set in edge function):
   ```bash
   npx supabase functions deploy send-organization-invitation
   ```

4. **No database migration needed** - logo URL is passed as a variable

---

## Logo Requirements

### Technical Specs
- **Format**: PNG, JPG, or SVG
- **Recommended size**: 192x48px (4:1 aspect ratio)
- **Max height**: 96px (displays at 48px for retina)
- **Background**: Transparent or white
- **File size**: < 50KB for fast loading

### Accessibility
- ✅ Must be publicly accessible (no authentication)
- ✅ Must use HTTPS
- ✅ Should include alt text ("Sixty")
- ✅ Works in all email clients (avoid SVG if unsure)

### Email Client Compatibility
- ✅ Gmail (web, mobile, app)
- ✅ Outlook (web, desktop, mobile)
- ✅ Apple Mail
- ✅ Yahoo Mail
- ✅ Mobile clients (iOS Mail, Android)

---

## Testing the Logo

### Send Test Invitation

1. Go to app Settings → Team Members
2. Invite someone to the organization
3. Check the email

### Verify Logo Displays

The email should show:
- ✅ Sixty logo at top (48px height)
- ✅ Logo loads quickly
- ✅ Logo is not broken/missing
- ✅ Logo looks sharp on retina displays
- ✅ Border separator below logo

### Test in Multiple Clients

- Gmail desktop
- Gmail mobile
- Outlook desktop
- Apple Mail (iPhone/Mac)
- Yahoo Mail

---

## Fallback Behavior

If the logo URL fails to load:

1. **Email still sends** - logo failure doesn't block email
2. **Alt text shows** - "Sixty" displays instead of image
3. **Layout preserved** - spacing remains correct
4. **No broken image icon** - email clients handle gracefully

**Default fallback** is hardcoded in edge function:
```typescript
const emailLogoUrl = Deno.env.get('EMAIL_LOGO_URL') ||
  'https://ygdpgliavpxeugaajgrb.supabase.co/storage/v1/object/public/Logos/ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459/Icon.png';
```

---

## Adding Logo to Other Email Templates

### Step 1: Update Edge Function

Add logo URL to email variables:

```typescript
const emailVariables = {
  app_logo_url: emailLogoUrl,
  // ... other variables
};
```

### Step 2: Update Email Template

Add logo header to HTML:

```html
<div style="text-align: center; margin: 0 0 32px 0; padding-bottom: 24px; border-bottom: 1px solid #e5e7eb;">
    <img src="{{app_logo_url}}" alt="Sixty"
         style="height: 48px; width: auto; margin: 0 auto; display: block;" />
</div>
```

### Step 3: Update Variables Schema

Add to template variables:

```json
{
  "name": "app_logo_url",
  "description": "URL to Sixty application logo"
}
```

### Step 4: Apply Migration

```bash
node apply-migration-api.mjs
```

---

## Environment Setup

### For New Developers

1. Copy `.env.example` to `.env`
2. Logo URL is already set - no changes needed
3. Logo works out of the box

### For Deployment

**Vercel Environment Variables**:
```
EMAIL_LOGO_URL=https://ygdpgliavpxeugaajgrb.supabase.co/storage/v1/object/public/Logos/ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459/Icon.png
```

**Supabase Edge Functions** (via dashboard):
```
EMAIL_LOGO_URL=https://ygdpgliavpxeugaajgrb.supabase.co/storage/v1/object/public/Logos/ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459/Icon.png
```

---

## Troubleshooting

### Logo Not Showing

**Check 1**: Verify URL is accessible
```bash
curl -I https://ygdpgliavpxeugaajgrb.supabase.co/storage/v1/object/public/Logos/ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459/Icon.png
```

Expected: `200 OK`

**Check 2**: Verify environment variable is set
```typescript
console.log('Logo URL:', Deno.env.get('EMAIL_LOGO_URL'));
```

**Check 3**: Check email template includes variable
```sql
SELECT variables
FROM encharge_email_templates
WHERE template_name = 'organization_invitation';
```

Should include: `{"name": "app_logo_url", ...}`

### Logo Too Large/Small

Adjust height in email template:
```html
<!-- Make larger -->
<img src="{{app_logo_url}}" style="height: 64px; ..." />

<!-- Make smaller -->
<img src="{{app_logo_url}}" style="height: 32px; ..." />
```

Then apply migration.

### Logo Not Centered

Verify inline styles:
```html
<div style="text-align: center; ...">
    <img style="margin: 0 auto; display: block; ..." />
</div>
```

---

## Summary

✅ **Logo configured**: Sixty logo in all emails
✅ **URL**: Environment variable `VITE_EMAIL_LOGO_URL`
✅ **Applied to**: `organization_invitation` template
✅ **Migration**: `20260203230000_add_logo_to_email_template.sql`
✅ **Status**: Live on staging

**To extend to other emails**: Follow "Adding Logo to Other Email Templates" section above.

---

*Email branding configured 2026-02-03*
