# Email System Standardization - Implementation Guide

**Created**: 2025-02-03
**Branch**: fix/go-live-bug-fixes
**Priority**: CRITICAL (Go-live blocking)
**Estimated Time**: 2.5 hours

---

## Overview

Your email system has evolved with multiple authentication patterns, duplicated code, and inconsistent naming conventions. This guide provides step-by-step instructions to fix critical bugs and standardize everything around proven patterns.

### What's Broken Right Now

1. **Critical Bug**: `waitlist-welcome-email` queries non-existent `html_template` column (should be `html_body`)
2. **Security Issue**: `waitlist-welcome-email` has no authentication - anyone can send emails
3. **Duplication**: `send-waitlist-welcome` is just a wrapper with no value
4. **Code Duplication**: AWS SES signing code duplicated in 2 places
5. **Inconsistent Auth**: 4 different authentication patterns across email functions
6. **Inconsistent Variables**: Templates use `user_name`, `first_name`, `action_url`, `invitation_link`, `magic_link` (same URLs with 3 names!)
7. **Incomplete Logging**: Only encharge-send-email logs emails; others don't

### What This Fixes

✅ All three critical email types work reliably: invitations, waitlist welcome, early access
✅ Single authentication pattern across all functions
✅ Unified AWS SES implementation (no duplication)
✅ Consistent template variables everywhere
✅ Complete email audit trail in email_logs table

---

## Story-by-Story Implementation

### EMAIL-001: Fix waitlist-welcome-email Column Name Bug (5 min)

**File**: `supabase/functions/waitlist-welcome-email/index.ts`
**Change**: Line 247

**Current (Broken)**:
```typescript
let htmlBody = template.html_template || '';
```

**Fixed**:
```typescript
let htmlBody = template.html_body || '';
```

**Why**: The column in `encharge_email_templates` table is `html_body`, not `html_template`. This causes template fetches to return undefined, sending empty/broken emails.

**Verification**:
```bash
# Check the schema
psql $DATABASE_URL -c "SELECT column_name FROM information_schema.columns WHERE table_name='encharge_email_templates'" | grep html
# Should show: html_body

# Test with staging
curl -X POST http://localhost:54321/functions/v1/waitlist-welcome-email \
  -H "Content-Type: application/json" \
  -H "x-edge-function-secret: staging-email-secret-use60-2025-xyz789" \
  -d '{"to_email":"test@example.com","to_name":"Test User"}'
```

---

### EMAIL-002: Add Missing Authentication to waitlist-welcome-email (10 min)

**File**: `supabase/functions/waitlist-welcome-email/index.ts`
**Location**: Before line 164 where request processing starts

**Add this function** (copy from `send-organization-invitation/index.ts`):

```typescript
function verifySecret(req: Request): boolean {
  const secret = Deno.env.get('EDGE_FUNCTION_SECRET');
  if (!secret) {
    console.warn('[waitlist-welcome-email] No EDGE_FUNCTION_SECRET configured');
    return false;
  }

  // Check for secret in headers (preferred method)
  const headerSecret = req.headers.get('x-edge-function-secret');
  if (headerSecret && headerSecret === secret) {
    return true;
  }

  // Check for JWT in Authorization header (fallback for old code)
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return true;
  }

  // If running locally (no secret), allow requests for development
  if (!Deno.env.get('EDGE_FUNCTION_SECRET')) {
    console.log('[waitlist-welcome-email] Running in development mode (no secret)');
    return true;
  }

  return false;
}
```

**Update the serve handler** (around line 164):

```typescript
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ADD THIS: Verify custom authentication
  if (!verifySecret(req)) {
    console.error('[waitlist-welcome-email] Authentication failed: invalid secret');
    return new Response(JSON.stringify({ error: 'Unauthorized: invalid credentials' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ... rest of function continues
```

**Verification**:
```bash
# Should fail without secret
curl -X POST http://localhost:54321/functions/v1/waitlist-welcome-email \
  -H "Content-Type: application/json" \
  -d '{"to_email":"test@example.com"}' \
# Should return 401

# Should succeed with secret
curl -X POST http://localhost:54321/functions/v1/waitlist-welcome-email \
  -H "Content-Type: application/json" \
  -H "x-edge-function-secret: staging-email-secret-use60-2025-xyz789" \
  -d '{"to_email":"test@example.com","to_name":"Test User"}' \
# Should return 200 or 404 (template not found, but auth succeeded)
```

---

### EMAIL-003: Consolidate AWS SES Code (20 min)

**File**: `supabase/functions/waitlist-welcome-email/index.ts`

**Current Implementation**: Lines 27-110 duplicate crypto functions from `_shared/ses.ts`

**Steps**:

1. **Add import** at the top:
```typescript
import { sendEmail } from '../_shared/ses.ts';
```

2. **Delete** these functions (they're in _shared/ses.ts):
   - `hmacSha256()`
   - `sha256()`
   - `toHex()`
   - `getSigningKey()`
   - `signRequest()`
   - `sendEmailViaSES()` (but keep sendEmail call)

3. **Replace sendEmailViaSES call** (around line 280):

**Before**:
```typescript
const sesResult = await sendEmailViaSES(
  to_email,
  SES_FROM_EMAIL,
  subject_line,
  htmlBody,
  text_body
);
```

**After**:
```typescript
const sesResult = await sendEmail({
  to: to_email,
  subject: subject_line,
  html: htmlBody,
  text: text_body,
  from: SES_FROM_EMAIL,
  fromName: SES_FROM_NAME || 'Sixty Seconds'
});
```

**Verify the function still works**:
```bash
# Test that email sending still works after consolidation
curl -X POST http://localhost:54321/functions/v1/waitlist-welcome-email \
  -H "Content-Type: application/json" \
  -H "x-edge-function-secret: staging-email-secret-use60-2025-xyz789" \
  -d '{
    "to_email": "test@example.com",
    "to_name": "Test User"
  }'
```

---

### EMAIL-004: Eliminate Duplicate send-waitlist-welcome (15 min)

**File to Delete**: `supabase/functions/send-waitlist-welcome/index.ts`

**Steps**:

1. **Find all references** to this function:
```bash
grep -r "send-waitlist-welcome" src/ supabase/ --include="*.ts" --include="*.tsx"
```

2. **Update all callers** to use `waitlist-welcome-email` instead:

**Example** (check your actual code):
```typescript
// Before: calling send-waitlist-welcome
const response = await fetch(`${SUPABASE_URL}/functions/v1/send-waitlist-welcome`, {
  method: 'POST',
  body: JSON.stringify({ email, name })
});

// After: calling waitlist-welcome-email
const response = await fetch(`${SUPABASE_URL}/functions/v1/waitlist-welcome-email`, {
  method: 'POST',
  headers: {
    'x-edge-function-secret': EDGE_FUNCTION_SECRET
  },
  body: JSON.stringify({ to_email: email, to_name: name })
});
```

3. **Delete the directory**:
```bash
rm -rf supabase/functions/send-waitlist-welcome/
```

4. **Update deno.json** (if it lists functions):
   - Remove reference to send-waitlist-welcome

5. **Test all callers** still work after the migration

---

### EMAIL-005: Standardize Authentication Pattern (25 min)

This standardizes all email functions to use the `EDGE_FUNCTION_SECRET` pattern.

#### A. Update `encharge-send-email/index.ts`

**Replace authentication section** (around line 419-514) with:

```typescript
function verifySecret(req: Request): boolean {
  const secret = Deno.env.get('EDGE_FUNCTION_SECRET');
  if (!secret) {
    console.warn('[encharge-send-email] No EDGE_FUNCTION_SECRET configured');
    return false;
  }

  const headerSecret = req.headers.get('x-edge-function-secret');
  if (headerSecret && headerSecret === secret) {
    return true;
  }

  // Fallback: check service role key for service-to-service calls
  const authHeader = req.headers.get('Authorization');
  const apikeyHeader = req.headers.get('apikey');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (serviceRoleKey) {
    if (authHeader === `Bearer ${serviceRoleKey}` || apikeyHeader === serviceRoleKey) {
      console.log('[encharge-send-email] Authenticated as service role');
      return true;
    }
  }

  return false;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Verify authentication first
  if (!verifySecret(req)) {
    console.error('[encharge-send-email] Authentication failed');
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // ... rest of function
```

#### B. Update `send-removal-email/index.ts`

Apply same pattern - replace its authentication section with verifySecret function.

#### C. Update `send-organization-invitation/index.ts`

This already uses the correct pattern. Just verify it's there - no changes needed.

#### D. Update `src/lib/services/invitationService.ts`

Make sure it passes the secret header:

```typescript
async function sendInvitationEmail(invitation: Invitation, inviterName?: string) {
  const edgeFunctionSecret = import.meta.env.VITE_EDGE_FUNCTION_SECRET || '';

  const { error } = await supabase.functions.invoke('send-organization-invitation', {
    body: {
      to_email: invitation.email,
      to_name: inviteeName,
      organization_name: organizationName,
      inviter_name: inviterName,
      invitation_url: invitationUrl,
    },
    headers: edgeFunctionSecret
      ? { 'x-edge-function-secret': edgeFunctionSecret }
      : undefined,
  });

  // Non-blocking: log error but don't throw
  if (error) {
    logger.warn('[InvitationService] Email sending failed', error);
    return false;
  }

  return true;
}
```

**Verification**:
```bash
# All functions should accept x-edge-function-secret header now
curl -X POST http://localhost:54321/functions/v1/encharge-send-email \
  -H "Content-Type: application/json" \
  -H "x-edge-function-secret: staging-email-secret-use60-2025-xyz789" \
  -d '{
    "template_type": "welcome",
    "to_email": "test@example.com"
  }'
```

---

### EMAIL-006: Standardize Template Variable Names (20 min)

**Canonical Variable Names** (use these everywhere):

```
recipient_name      # Name of email recipient (instead of: user_name, to_name, first_name)
user_email          # User's email address
organization_name   # Organization name
inviter_name        # Name of person sending invite
action_url          # URL for action (instead of: invitation_link, invitation_url, magic_link)
expiry_time         # Human-readable expiration (e.g., "7 days")
support_email       # Support contact email
admin_email         # Admin who performed action
```

#### Step 1: Update all email template records in database

```sql
-- List current templates and their variables
SELECT template_type, subject_line FROM encharge_email_templates WHERE is_active = true;

-- Update subject lines and bodies to use standard variables
-- Example for 'welcome' template:
UPDATE encharge_email_templates
SET
  subject_line = 'Welcome to Sixty Seconds, {{recipient_name}}',
  html_body = '<p>Hi {{recipient_name}},</p><p>Welcome! <a href="{{action_url}}">Get started here</a></p>',
  text_body = 'Hi {{recipient_name}}, Welcome! Visit {{action_url}}'
WHERE template_type = 'welcome';

-- Repeat for all active templates (waitlist_welcome, member_removed, password_reset, etc.)
```

#### Step 2: Update send-organization-invitation/index.ts

```typescript
// Around line 100, change variable names:
const emailVariables = {
  recipient_name: to_name || to_email.split('@')[0],  // was: to_name
  organization_name: orgName,                           // was: organization_name (correct already)
  inviter_name: inviterName || 'A team member',         // was: inviter_name (correct already)
  action_url: invitationUrl,                            // was: invitation_url
  expiry_time: '7 days',
};

// Pass these when building template
```

#### Step 3: Update send-waitlist-invitation/index.ts

```typescript
// Remove the three-name aliasing nonsense
const emailVariables = {
  recipient_name: first_name || email.split('@')[0],
  user_email: email,
  organization_name: company_name || '',
  action_url: invitationUrl,  // Single name, not invitation_link + magic_link
  support_email: 'support@use60.com',
};
```

#### Step 4: Update send-removal-email/index.ts

```typescript
const emailVariables = {
  recipient_name: profile.first_name || profile.email,
  organization_name: organization.name,
  admin_email: adminProfile?.email || 'support@use60.com',
  support_email: 'support@use60.com',
};
```

#### Step 5: Update encharge-send-email/index.ts variable substitution

No change needed - it already does generic variable substitution. Just make sure callers use standard names.

**Verification**:
```bash
# Test that templates still render correctly with new variable names
curl -X POST http://localhost:54321/functions/v1/encharge-send-email \
  -H "Content-Type: application/json" \
  -H "x-edge-function-secret: staging-email-secret-use60-2025-xyz789" \
  -d '{
    "template_type": "welcome",
    "to_email": "test@example.com",
    "to_name": "Test User",
    "variables": {
      "recipient_name": "Test User",
      "action_url": "https://app.use60.com/dashboard",
      "support_email": "support@use60.com"
    }
  }'
```

---

### EMAIL-007: Standardize Email Logging (15 min)

Add logging to all functions that don't currently log.

#### A. Add logging to `send-organization-invitation/index.ts`

**After successful SES send** (around line 180):

```typescript
// After sendEmail() succeeds
if (sesResult.success) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    await supabase.from('email_logs').insert({
      email_type: 'organization_invitation',
      to_email: to_email,
      user_id: null,  // We might not have user_id for uninvited users
      status: 'sent',
      metadata: {
        template_type: 'organization_invitation',
        message_id: sesResult.messageId,
        variables: emailVariables,
        organization_name: emailVariables.organization_name,
      },
      sent_via: 'aws_ses',
    });
  } catch (logError) {
    console.warn('[send-organization-invitation] Failed to log email:', logError);
    // Non-blocking - continue even if logging fails
  }
}
```

#### B. Add logging to `send-waitlist-invitation/index.ts`

**After successful SES send**:

```typescript
if (sesResult.success) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    await supabase.from('email_logs').insert({
      email_type: 'waitlist_invite',
      to_email: email,
      user_id: userId,
      status: 'sent',
      metadata: {
        message_id: sesResult.messageId,
        variables: emailVariables,
      },
      sent_via: 'aws_ses',
    });
  } catch (logError) {
    console.warn('[send-waitlist-invitation] Failed to log email:', logError);
  }
}
```

#### C. Verify encharge-send-email is logging

It should already be doing this around line 621. Confirm it's logging with consistent schema.

**Verification**:
```bash
# After sending emails, query the logs
psql $DATABASE_URL -c "SELECT email_type, to_email, status, sent_at FROM email_logs ORDER BY created_at DESC LIMIT 5;"

# Should show: organization_invitation, waitlist_invite, member_removed all in the table
```

---

### EMAIL-008: Integration Test (20 min)

Create a comprehensive test that verifies all three email flows work end-to-end.

**Create file**: `test/email-integration.test.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const edgeFunctionSecret = process.env.VITE_EDGE_FUNCTION_SECRET;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

describe('Email System Integration Tests', () => {
  it('should send organization invitation email', async () => {
    const response = await supabase.functions.invoke('send-organization-invitation', {
      body: {
        to_email: 'test-invite@example.com',
        to_name: 'Test Invitee',
        organization_name: 'Test Org',
        inviter_name: 'Test Inviter',
        invitation_url: 'https://app.use60.com/join/test123',
      },
      headers: {
        'x-edge-function-secret': edgeFunctionSecret,
      },
    });

    expect(response.error).toBeNull();
    expect(response.data).toBeDefined();

    // Verify email was logged
    const { data: logs } = await supabase
      .from('email_logs')
      .select('*')
      .eq('email_type', 'organization_invitation')
      .eq('to_email', 'test-invite@example.com')
      .order('created_at', { ascending: false })
      .limit(1);

    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe('sent');
  });

  it('should send waitlist welcome email', async () => {
    const response = await supabase.functions.invoke('waitlist-welcome-email', {
      body: {
        to_email: 'test-waitlist@example.com',
        to_name: 'Test Waitlist User',
      },
      headers: {
        'x-edge-function-secret': edgeFunctionSecret,
      },
    });

    expect(response.error).toBeNull();
    expect(response.data).toBeDefined();

    // Verify email was logged
    const { data: logs } = await supabase
      .from('email_logs')
      .select('*')
      .eq('email_type', 'waitlist_welcome')
      .eq('to_email', 'test-waitlist@example.com')
      .order('created_at', { ascending: false })
      .limit(1);

    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe('sent');
  });

  it('should send waitlist invite (early access) email', async () => {
    const response = await supabase.functions.invoke('send-waitlist-invitation', {
      body: {
        email: 'test-earlyaccess@example.com',
        first_name: 'Test',
        last_name: 'User',
      },
      headers: {
        'x-edge-function-secret': edgeFunctionSecret,
      },
    });

    expect(response.error).toBeNull();
    expect(response.data).toBeDefined();

    // Verify email was logged
    const { data: logs } = await supabase
      .from('email_logs')
      .select('*')
      .eq('email_type', 'waitlist_invite')
      .eq('to_email', 'test-earlyaccess@example.com')
      .order('created_at', { ascending: false })
      .limit(1);

    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe('sent');
  });

  it('should reject requests without valid secret', async () => {
    const response = await supabase.functions.invoke('send-organization-invitation', {
      body: {
        to_email: 'test@example.com',
        to_name: 'Test',
        organization_name: 'Test Org',
        inviter_name: 'Test',
        invitation_url: 'https://example.com',
      },
      headers: {
        'x-edge-function-secret': 'invalid-secret',
      },
    });

    expect(response.error).toBeDefined();
    expect(response.error.status).toBe(401);
  });
});
```

**Run the tests**:
```bash
npm test test/email-integration.test.ts

# Or manually test each flow:
# 1. Organization invitation
curl -X POST $SUPABASE_URL/functions/v1/send-organization-invitation \
  -H "Content-Type: application/json" \
  -H "x-edge-function-secret: $EDGE_FUNCTION_SECRET" \
  -d '{
    "to_email": "test-invite@example.com",
    "to_name": "Test Invitee",
    "organization_name": "Test Org",
    "inviter_name": "Test Inviter",
    "invitation_url": "https://app.use60.com/join/test123"
  }'

# 2. Waitlist welcome
curl -X POST $SUPABASE_URL/functions/v1/waitlist-welcome-email \
  -H "Content-Type: application/json" \
  -H "x-edge-function-secret: $EDGE_FUNCTION_SECRET" \
  -d '{
    "to_email": "test-waitlist@example.com",
    "to_name": "Test Waitlist User"
  }'

# 3. Waitlist invite (early access)
curl -X POST $SUPABASE_URL/functions/v1/send-waitlist-invitation \
  -H "Content-Type: application/json" \
  -H "x-edge-function-secret: $EDGE_FUNCTION_SECRET" \
  -d '{
    "email": "test-earlyaccess@example.com",
    "first_name": "Test",
    "last_name": "User"
  }'

# Verify logging
psql $DATABASE_URL -c "SELECT email_type, to_email, status FROM email_logs ORDER BY created_at DESC LIMIT 10;"
```

---

## Execution Checklist

- [ ] **EMAIL-001**: Fix html_template → html_body column name (5 min)
- [ ] **EMAIL-002**: Add EDGE_FUNCTION_SECRET auth to waitlist-welcome-email (10 min)
- [ ] **EMAIL-003**: Consolidate AWS SES code, remove duplication (20 min)
- [ ] **EMAIL-004**: Delete send-waitlist-welcome function and update callers (15 min)
- [ ] **EMAIL-005**: Standardize auth pattern across all functions (25 min)
- [ ] **EMAIL-006**: Standardize template variable names (20 min)
- [ ] **EMAIL-007**: Add logging to all functions (15 min)
- [ ] **EMAIL-008**: Integration test all three email types (20 min)

**Total: ~2.5 hours**

---

## Deployment Steps

1. **Test locally** in staging environment with .env.staging
2. **Run integration tests** to verify all three email types work
3. **Commit changes** to fix/go-live-bug-fixes branch
4. **Create PR** for code review
5. **Deploy to production** during low-traffic window
6. **Monitor** email_logs table for 24 hours to confirm all sends are working

---

## Rollback Plan

If something breaks:

1. **Revert commit** to previous working state
2. **Email failures are non-blocking** - system continues working even if emails fail
3. **Check logs** in email_logs table to see what failed
4. **Investigate** specific error messages in function logs

---

## Questions?

All the code patterns and detailed explanations are in the standardization guide (`.sixty/STANDARDIZATION_GUIDE.md`). Refer there for:

- Complete AWS SES implementation details
- Authentication pattern examples
- Template variable standard names
- Error handling patterns
- Logging schema details

Good luck! 🚀
