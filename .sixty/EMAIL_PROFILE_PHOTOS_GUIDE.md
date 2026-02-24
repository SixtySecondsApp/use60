# Adding Profile Photos to Email Templates

## Overview

This guide explains how to add sender profile photos to email templates (e.g., showing the inviter's avatar in invitation emails).

---

## Architecture

```
Frontend (invitationService.ts)
    ↓ Gets inviter's avatar_url from profiles table
    ↓ Passes to edge function
Edge Function (send-organization-invitation)
    ↓ Includes inviter_avatar_url in variables
    ↓ Passes to email dispatcher
Email Dispatcher (encharge-send-email)
    ↓ Replaces {{inviter_avatar_url}} in template
    ↓ Sends via AWS SES
Email Client
    ↓ Displays avatar image
```

---

## Step-by-Step Implementation

### Step 1: Update Frontend to Fetch Avatar URL

**File**: `src/lib/services/invitationService.ts`

Update the `sendInvitationEmail` function to fetch the inviter's avatar:

```typescript
async function sendInvitationEmail(invitation: Invitation, inviterName?: string) {
  try {
    // Get organization name
    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', invitation.org_id)
      .single();

    const organizationName = org?.name || 'the organization';

    // Get invitee's first name from profile or extract from email
    let inviteeName = 'there';
    const { data: inviteeProfile } = await supabase
      .from('profiles')
      .select('first_name')
      .eq('email', invitation.email.toLowerCase())
      .maybeSingle();

    if (inviteeProfile?.first_name) {
      inviteeName = inviteeProfile.first_name;
    } else {
      const emailName = invitation.email.split('@')[0];
      inviteeName = emailName.charAt(0).toUpperCase() + emailName.slice(1);
    }

    // ✨ NEW: Get inviter's avatar URL
    let inviterAvatarUrl = null;

    // Get current user (the inviter)
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data: inviterProfile } = await supabase
        .from('profiles')
        .select('avatar_url, first_name, last_name')
        .eq('id', user.id)
        .maybeSingle();

      if (inviterProfile?.avatar_url) {
        inviterAvatarUrl = inviterProfile.avatar_url;
      }

      // Use profile name if inviterName not provided
      if (!inviterName && inviterProfile) {
        const firstName = inviterProfile.first_name || '';
        const lastName = inviterProfile.last_name || '';
        inviterName = `${firstName} ${lastName}`.trim() || 'A team member';
      }
    }

    // Generate fallback avatar using UI Avatars service if no avatar_url
    const fallbackAvatar = inviterAvatarUrl ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(inviterName || 'User')}&size=96&background=3b82f6&color=ffffff&rounded=true`;

    // Build invitation URL
    const baseUrl = typeof window !== 'undefined'
      ? window.location.origin
      : (import.meta.env.VITE_PUBLIC_URL || 'https://app.use60.com');

    const invitationUrl = `${baseUrl}/invite/${invitation.token}`;

    // Call edge function with avatar URL
    const edgeFunctionSecret = import.meta.env.VITE_EDGE_FUNCTION_SECRET || '';

    const { error } = await supabase.functions.invoke('send-organization-invitation', {
      body: {
        to_email: invitation.email,
        to_name: inviteeName,
        organization_name: organizationName,
        inviter_name: inviterName || 'A team member',
        inviter_avatar_url: fallbackAvatar,  // ✨ NEW: Pass avatar URL
        invitation_url: invitationUrl,
      },
      headers: edgeFunctionSecret
        ? { 'Authorization': `Bearer ${edgeFunctionSecret}` }
        : {},
    });

    // ... rest of function
  }
}
```

---

### Step 2: Update Edge Function to Include Avatar

**File**: `supabase/functions/send-organization-invitation/index.ts`

The edge function already delegates to `encharge-send-email`, so just ensure the variable is passed through:

```typescript
// Around line 130-138
const emailVariables = {
  recipient_name: recipientName,
  organization_name: organization_name,
  inviter_name: inviter_name,
  inviter_avatar_url: inviter_avatar_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(inviter_name) + '&size=96&background=3b82f6&color=ffffff&rounded=true',  // ✨ NEW
  action_url: invitation_url,
  invitation_url: invitation_url,
  expiry_time: expiry_time,
  support_email: 'support@use60.com',
};
```

Update the input interface:

```typescript
interface SendInvitationRequest {
  to_email: string;
  to_name?: string;
  organization_name: string;
  inviter_name: string;
  inviter_avatar_url?: string;  // ✨ NEW: Optional avatar URL
  invitation_url: string;
}
```

---

### Step 3: Update Email Template in Database

The email template needs to be updated to display the avatar. There are two options:

#### Option A: Update Existing Template in Database

Run this SQL to update the `organization_invitation` template:

```sql
UPDATE encharge_email_templates
SET html_body = '<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            line-height: 1.6;
            color: #4b5563;
            background: #f9fafb;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background: #f9fafb;
        }
        .email-wrapper {
            background: white;
            border-radius: 8px;
            padding: 40px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        h1 {
            color: #1f2937;
            margin-bottom: 20px;
            font-size: 28px;
            font-weight: 700;
        }
        .inviter-section {
            text-align: center;
            margin-bottom: 32px;
            padding-bottom: 24px;
            border-bottom: 1px solid #e5e7eb;
        }
        .inviter-avatar {
            width: 64px;
            height: 64px;
            border-radius: 50%;
            object-fit: cover;
            margin: 0 auto 12px;
            display: block;
            border: 2px solid #e5e7eb;
        }
        .inviter-name {
            font-size: 14px;
            color: #6b7280;
            font-weight: 500;
        }
        p {
            color: #4b5563;
            margin-bottom: 16px;
            line-height: 1.6;
        }
        .button {
            display: inline-block;
            padding: 12px 28px;
            background: #3b82f6;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 500;
            font-size: 14px;
            margin: 20px 0;
        }
        .button:hover {
            background: #2563eb;
        }
        .url-section {
            background: #f3f4f6;
            padding: 16px;
            border-radius: 6px;
            margin: 20px 0;
            word-break: break-all;
        }
        .url-section code {
            font-family: monospace;
            font-size: 12px;
            color: #374151;
        }
        .footer {
            margin-top: 32px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            font-size: 12px;
            color: #9ca3af;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="email-wrapper">
            <h1>Join {{organization_name}} on Sixty</h1>

            <div class="inviter-section">
                <img src="{{inviter_avatar_url}}" alt="{{inviter_name}}" class="inviter-avatar" />
                <p class="inviter-name">Invited by {{inviter_name}}</p>
            </div>

            <p>Hi {{recipient_name}},</p>

            <p>{{inviter_name}} has invited you to join <strong>{{organization_name}}</strong> on Sixty. Accept the invitation below to get started collaborating with your team.</p>

            <div style="text-align: center;">
                <a href="{{invitation_url}}" class="button">Accept Invitation</a>
            </div>

            <div class="url-section">
                <p style="margin-bottom: 8px; font-size: 12px; color: #6b7280;">Or copy and paste this link in your browser:</p>
                <code>{{invitation_url}}</code>
            </div>

            <p style="font-size: 14px; color: #6b7280;">
                This invitation will expire in {{expiry_time}}.
            </p>

            <div class="footer">
                <p>This is an automated message from Sixty. If you have any questions, please contact us at {{support_email}}</p>
            </div>
        </div>
    </div>
</body>
</html>',
text_body = 'Hi {{recipient_name}},

{{inviter_name}} has invited you to join {{organization_name}} on Sixty.

Accept the invitation by clicking:
{{invitation_url}}

This invitation will expire in {{expiry_time}}.

If you have any questions, contact us at {{support_email}}'
WHERE template_name = 'organization_invitation';
```

#### Option B: Create Migration

**File**: `supabase/migrations/20260203210000_update_invitation_template_with_avatar.sql`

```sql
-- Update organization invitation template to include avatar
UPDATE encharge_email_templates
SET html_body = '...(same as above)...',
    text_body = '...(same as above)...'
WHERE template_name = 'organization_invitation';
```

---

### Step 4: Testing

After implementing, test the full flow:

1. **Create Invitation**:
   ```typescript
   // In browser console or test
   await createInvitation({
     orgId: 'your-org-id',
     email: 'test@example.com',
     role: 'member'
   });
   ```

2. **Check Email**:
   - Verify avatar image displays correctly
   - If no avatar: Should show fallback from UI Avatars (initials on blue background)
   - If avatar exists: Should show user's profile photo

3. **Verify Variables**:
   Check edge function logs to confirm variables include:
   ```json
   {
     "inviter_avatar_url": "https://..."
   }
   ```

---

## Fallback Strategy

The implementation uses a **waterfall approach** for avatars:

1. **Primary**: User's `avatar_url` from profiles table
2. **Fallback**: UI Avatars service (generates avatar from name initials)

### UI Avatars Service

Free service that generates avatars from text:
```
https://ui-avatars.com/api/?name=Max+Parish&size=96&background=3b82f6&color=ffffff&rounded=true
```

Parameters:
- `name`: User's name (URL encoded)
- `size`: Image size in pixels (96 recommended)
- `background`: Background color (hex without #)
- `color`: Text color (hex without #)
- `rounded`: true for circular image

**Pros**:
- Always works (no broken images)
- Consistent branding (blue background)
- Fast CDN delivery
- Free for reasonable use

**Cons**:
- External dependency
- Privacy: Sends name to third-party

**Alternative**: Generate initials avatar in your own edge function or use a default static image.

---

## Email Client Compatibility

### Image Support

All major email clients support `<img>` tags:
- ✅ Gmail (web, mobile, app)
- ✅ Outlook (web, desktop, mobile)
- ✅ Apple Mail
- ✅ Yahoo Mail
- ✅ Mobile clients (iOS Mail, Android)

### Best Practices

1. **Always include `alt` text**:
   ```html
   <img src="{{inviter_avatar_url}}" alt="{{inviter_name}}" />
   ```

2. **Use explicit dimensions**:
   ```html
   <img src="{{inviter_avatar_url}}" alt="{{inviter_name}}" width="64" height="64" />
   ```

3. **Provide fallback**:
   - If image fails to load, alt text shows
   - UI Avatars as secondary fallback

4. **Use HTTPS URLs**:
   - Supabase Storage URLs are HTTPS ✅
   - UI Avatars uses HTTPS ✅

---

## Security Considerations

### Public Avatar URLs

Avatars must be **publicly accessible** for email clients to display them:

1. **Supabase Storage**: Avatars bucket should be public
   - Already configured in migration `20260203160100_setup_org_logos_bucket_rls.sql`
   - Public read access enabled

2. **Privacy**: Avatars are visible to anyone with the email
   - This is expected behavior
   - Users should be aware their avatar is public
   - Consider adding privacy notice in settings

### Content Security

1. **Validate URLs**: Ensure avatar URLs are from trusted sources
   - Supabase Storage: ✅ Trusted
   - UI Avatars: ✅ Trusted
   - User-uploaded: Validate domain

2. **XSS Prevention**: Don't allow HTML in avatar URLs
   - Template engine escapes variables ✅
   - URL validation recommended

---

## Troubleshooting

### Avatar Not Displaying

**Issue**: Email shows broken image icon

**Checklist**:
1. ✅ Avatar URL is HTTPS (not HTTP)
2. ✅ Avatar URL is publicly accessible (not behind auth)
3. ✅ Image file exists and is valid
4. ✅ Email client allows images (some block by default)
5. ✅ Template variable `{{inviter_avatar_url}}` is being replaced

**Test**:
```typescript
// Check if URL is accessible
fetch(avatarUrl)
  .then(r => console.log('Avatar accessible:', r.ok))
  .catch(e => console.error('Avatar not accessible:', e));
```

### Raw CSS Showing

**Issue**: Email shows CSS code instead of styled content

**Cause**: Template is being sent as plain text instead of HTML

**Fix**: Ensure edge function sends:
```typescript
await sendEmail({
  to: to_email,
  subject: '...',
  html: emailHtml,  // ← HTML version
  text: emailText,  // ← Plain text version
  from: 'invites@use60.com',
  fromName: 'Sixty',
});
```

**Verify**: Check `_shared/ses.ts` sendEmail function uses HTML:
```typescript
const params = {
  Destination: { ToAddresses: [to] },
  Message: {
    Body: {
      Html: { Charset: 'UTF-8', Data: html },  // ← Must be "Html" not "Text"
      Text: { Charset: 'UTF-8', Data: text },
    },
    Subject: { Charset: 'UTF-8', Data: subject },
  },
  Source: `${fromName} <${from}>`,
};
```

---

## Next Steps

1. ✅ Update `invitationService.ts` to fetch avatar
2. ✅ Update edge function to include avatar variable
3. ✅ Update email template with avatar HTML
4. ✅ Test with user who has avatar
5. ✅ Test with user who doesn't have avatar (fallback)
6. ✅ Deploy to staging
7. ✅ Send test invitation
8. ✅ Verify email displays correctly
9. ✅ Deploy to production

---

## Example: Complete Email with Avatar

```html
<!DOCTYPE html>
<html>
<head>
    <style>
        /* Styles inline or in <style> tag */
    </style>
</head>
<body>
    <div class="container">
        <div class="email-wrapper">
            <h1>Join Acme Corp on Sixty</h1>

            <!-- ✨ Avatar Section -->
            <div class="inviter-section">
                <img src="https://caerqjzvuerejfrdtygb.supabase.co/storage/v1/object/public/avatars/user123.jpg"
                     alt="Max Parish"
                     class="inviter-avatar"
                     width="64"
                     height="64" />
                <p class="inviter-name">Invited by Max Parish</p>
            </div>

            <p>Hi John,</p>
            <p>Max Parish has invited you to join <strong>Acme Corp</strong>...</p>

            <!-- Rest of template -->
        </div>
    </div>
</body>
</html>
```

---

## Additional Features (Future)

### Organization Logo

Similar approach for organization logos:
```typescript
organization_logo_url: org?.logo_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(organization_name)
```

Then in template:
```html
<img src="{{organization_logo_url}}" alt="{{organization_name}}" class="org-logo" />
```

### Multiple Recipients

If sending to multiple people, avatar is still relevant (shows who invited them all).

### Email Signature

Could include sender's full signature:
```html
<div class="signature">
  <img src="{{inviter_avatar_url}}" alt="{{inviter_name}}" />
  <div>
    <strong>{{inviter_name}}</strong><br>
    {{inviter_role}} at {{organization_name}}
  </div>
</div>
```

---

*This guide provides complete implementation for adding profile photos to email templates.*
