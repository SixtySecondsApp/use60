# Email System - Comprehensive Architecture Guide

**Last Updated**: 2026-02-03
**Version**: 1.0
**Status**: Production Ready
**Audience**: Architects, DevOps, Senior Engineers

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Component Architecture](#component-architecture)
3. [Design Patterns](#design-patterns)
4. [Authentication & Security](#authentication--security)
5. [Performance Characteristics](#performance-characteristics)
6. [Maintenance & Operations](#maintenance--operations)
7. [Integration Points](#integration-points)
8. [Future Enhancements](#future-enhancements)

---

## System Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          FRONTEND/BACKEND                           │
├─────────────────────────────────────────────────────────────────────┤
│  React Components / TypeScript Services / Node.js Server            │
│  - InvitationService                                                │
│  - WaitlistAdminService                                             │
│  - Other domain services                                            │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ HTTPS
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    SUPABASE EDGE FUNCTIONS                          │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────┐   ┌──────────────────────────────┐       │
│  │ Direct Functions     │   │ Central Dispatcher           │       │
│  ├──────────────────────┤   ├──────────────────────────────┤       │
│  │ send-organization-   │   │ encharge-send-email          │       │
│  │   invitation         │   │ (supports all 18 types)      │       │
│  │                      │   │                              │       │
│  │ waitlist-welcome-    │   │ Event Mapping:               │       │
│  │   email              │   │ - Maps 18 template types     │       │
│  │                      │   │ - Handlebars substitution    │       │
│  │ send-removal-email   │   │ - Bearer token auth          │       │
│  │                      │   │ - Error handling             │       │
│  └──────────────────────┘   └──────────────────────────────┘       │
│                                       │                            │
│                              ┌────────┴────────┐                  │
│                              ▼                 ▼                   │
│                         ┌──────────────┐  ┌─────────────────┐    │
│                         │ _shared/ses  │  │ Encharge Event  │    │
│                         │ (AWS SES)    │  │ Tracking        │    │
│                         └──────────────┘  └─────────────────┘    │
└────────────────┬────────────────────────────────┬─────────────────┘
                 │ AWS Signature V4              │ HTTP POST
                 ▼                               ▼
        ┌─────────────────────┐        ┌──────────────────────┐
        │    AWS SES V2       │        │ Encharge Ingest API  │
        │ (SendRawEmail)      │        │ (Event tracking)     │
        │                     │        │                      │
        │ - MIME formatting   │        │ - User segmentation  │
        │ - Email delivery    │        │ - Analytics          │
        │ - Message ID        │        │ - Attribution        │
        └────────┬────────────┘        └──────────────────────┘
                 │
                 ▼
        ┌─────────────────────┐
        │  Email Recipients   │
        │  (SMTP delivery)    │
        └─────────────────────┘

        ┌─────────────────────────────────────┐
        │    SUPABASE POSTGRESQL DATABASE    │
        ├─────────────────────────────────────┤
        │ encharge_email_templates            │
        │ - 18 templates (HTML + text)        │
        │ - Variable definitions              │
        │ - Subject lines                     │
        │                                     │
        │ email_logs                          │
        │ - Send history                      │
        │ - Metadata + variables              │
        │ - Message IDs                       │
        │ - Status tracking                   │
        └─────────────────────────────────────┘
```

### Key Components

1. **Frontend/Backend Services** - Call email functions via HTTP
2. **Edge Functions** - Process requests, build variables, orchestrate delivery
3. **Database** - Store templates and logs
4. **AWS SES** - Email delivery via SMTP (REST API)
5. **Encharge** - Event tracking and analytics
6. **Email Recipients** - Final delivery via SMTP

### Data Flow from Trigger to Delivery

```
1. Trigger Event
   └─> User invites someone to org / Trial ends / Meeting synced

2. Call Email Function
   └─> Frontend: supabase.functions.invoke('encharge-send-email')
   └─> Backend: POST to edge function with Bearer token

3. Authentication
   └─> Verify EDGE_FUNCTION_SECRET or service role key
   └─> If invalid → return 401 Unauthorized

4. Fetch Template
   └─> Query: SELECT FROM encharge_email_templates
   └─> If not found → return 404 Not Found

5. Build Variables
   └─> Default: recipient_name, user_email
   └─> Plus: provided variables from request
   └─> Combine: database values + request variables

6. Process Template
   └─> Replace {{variable}} with actual values
   └─> HTML: processTemplate(html_body, variables)
   └─> Text: processTemplate(text_body, variables)

7. Format Email
   └─> Build MIME message (multipart/alternative)
   └─> Base64 encode HTML for reliability
   └─> Include plain text fallback

8. Sign Request
   └─> AWS Signature V4 (HMAC-SHA256)
   └─> Include credentials scope, date, signature

9. Send via AWS SES
   └─> POST to email.{region}.amazonaws.com
   └─> Action: SendRawEmail with RawMessage.Data
   └─> Response: MessageId (for tracking)

10. Track Event
    └─> POST to Encharge ingest.encharge.io
    └─> Event name: 'Organization Invitation Sent', etc.
    └─> User data: email, firstName, lastName, userId
    └─> Properties: template_type, variables, etc.

11. Log Send
    └─> INSERT into email_logs
    └─> Status: 'sent', metadata: {template_id, message_id, variables}
    └─> user_id, to_email, email_type

12. Return Response
    └─> success: true
    └─> message_id: AWS SES message ID
    └─> template_name: friendly name
    └─> event_tracked: Encharge event name
```

---

## Component Architecture

### Edge Functions: Individual Email Types

**Files**:
- `supabase/functions/send-organization-invitation/index.ts`
- `supabase/functions/waitlist-welcome-email/index.ts`
- `supabase/functions/send-removal-email/index.ts`

**Purpose**: Specialized functions for specific email types

**How They Work**:
1. Receive typed request (to_email, organization_name, etc.)
2. Fetch user/org data from database if needed
3. Build standardized variables object
4. Call central dispatcher (encharge-send-email)
5. Return response with metadata

**When Each Is Used**:
- **send-organization-invitation**: Organization owners invite members
- **waitlist-welcome-email**: Grant users access from waitlist
- **send-removal-email**: Notify user of removal from org

**Database Lookups**:
```typescript
// Example: Get org name for removal email
const { data: org } = await supabase
  .from('organizations')
  .select('name')
  .eq('id', orgId)
  .single();

// Example: Get user name for invitation
const { data: user } = await supabase
  .from('profiles')
  .select('full_name, email')
  .eq('id', userId)
  .single();
```

**Error Handling**:
```typescript
// Missing required data
if (!org) {
  return new Response(
    JSON.stringify({ error: 'Organization not found' }),
    { status: 404, headers: corsHeaders }
  );
}

// Network or database error
catch (error) {
  console.error('Failed to fetch org:', error);
  return new Response(
    JSON.stringify({ error: 'Internal server error' }),
    { status: 500, headers: corsHeaders }
  );
}
```

### Central Dispatcher (encharge-send-email)

**File**: `supabase/functions/encharge-send-email/index.ts`

**Purpose**: Unified entry point for all 18 email types

**Responsibility**:
1. Authentication & authorization
2. Request parsing and validation
3. Template fetching and selection
4. Variable substitution
5. AWS SES integration
6. Encharge event tracking
7. Database logging

**Event Mapping (18 Types)**:
```typescript
const eventNameMap: Record<string, string> = {
  // Organization & Membership (4)
  organization_invitation: 'Organization Invitation Sent',
  member_removed: 'Member Removed',
  org_approval: 'Organization Approval',
  join_request_approved: 'Join Request Approved',

  // Waitlist & Access (2)
  waitlist_invite: 'Waitlist Invite Sent',
  waitlist_welcome: 'Waitlist Welcome Sent',

  // Onboarding (1)
  welcome: 'Account Created',

  // Integrations (2)
  fathom_connected: 'Fathom Connected',
  first_meeting_synced: 'First Meeting Synced',

  // Subscription & Trial (5)
  trial_ending: 'Trial Ending Soon',
  trial_expired: 'Trial Expired',
  subscription_confirmed: 'Subscription Confirmed',
  meeting_limit_warning: 'Meeting Limit Warning',
  upgrade_prompt: 'Upgrade Prompt Sent',

  // Account Management (3)
  email_change_verification: 'Email Change Verification',
  password_reset: 'Password Reset Requested',
  join_request_rejected: 'Join Request Rejected',

  // Admin/Moderation (1)
  permission_to_close: 'Permission to Close Requested',
};
```

**Variable Substitution**:
```typescript
function processTemplate(template: string, variables: Record<string, any>): string {
  let processed = template;
  for (const [key, value] of Object.entries(variables)) {
    // Replace {{key}} with value
    const regex = new RegExp(`{{${key}}}`, 'g');
    processed = processed.replace(regex, String(value || ''));
  }
  return processed;
}

// Example
processTemplate(
  'Hello {{recipient_name}}, welcome to {{organization_name}}',
  { recipient_name: 'John', organization_name: 'Acme' }
);
// Result: 'Hello John, welcome to Acme'
```

**Bearer Token Authentication**:
```typescript
function verifySecret(req: Request): boolean {
  const secret = Deno.env.get('EDGE_FUNCTION_SECRET');

  // Check Bearer token
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    if (token === secret) return true;
  }

  // Fallback to header
  const headerSecret = req.headers.get('x-edge-function-secret');
  if (headerSecret === secret) return true;

  // Fallback to service role (backward compat)
  if (authHeader?.includes(SUPABASE_SERVICE_ROLE_KEY)) return true;

  return false;
}
```

**Graceful Failure Handling**:
```typescript
// Template not found
if (!template) {
  return new Response(
    JSON.stringify({ success: false, error: 'Template not found' }),
    { status: 404, headers: corsHeaders }
  );
}

// SES failure (non-fatal - try to log)
if (!sesResult.success) {
  return new Response(
    JSON.stringify({ success: false, error: sesResult.error }),
    { status: 500, headers: corsHeaders }
  );
}

// Logging failure (non-blocking)
try {
  await supabase.from('email_logs').insert({...});
} catch (logError) {
  console.warn('Failed to log email (non-fatal):', logError);
  // Continue - email was sent, logging failed
}
```

### Database Layer

#### encharge_email_templates

**Purpose**: Store all email templates with standardized structure

**Schema**:
```sql
CREATE TABLE encharge_email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name VARCHAR(255) UNIQUE NOT NULL,  -- 'organization_invitation'
  template_type VARCHAR(255) UNIQUE NOT NULL,  -- Matches request type
  subject_line TEXT NOT NULL,                  -- 'Welcome to {{organization_name}}'
  html_body TEXT NOT NULL,                     -- Full HTML template
  text_body TEXT,                              -- Plain text fallback
  is_active BOOLEAN DEFAULT TRUE,              -- Enable/disable template
  variables JSONB,                             -- [{name, description}, ...]
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Example Row**:
```json
{
  "id": "12345678-1234-1234-1234-123456789012",
  "template_name": "organization_invitation",
  "template_type": "organization_invitation",
  "subject_line": "{{inviter_name}} invited you to {{organization_name}}",
  "html_body": "<p>Hi {{recipient_name}},</p><p>{{inviter_name}} invited you to join {{organization_name}}.</p><p><a href=\"{{action_url}}\">Accept Invitation</a></p>",
  "text_body": "Hi {{recipient_name}},\n\n{{inviter_name}} invited you to join {{organization_name}}.\n\nAccept: {{action_url}}",
  "is_active": true,
  "variables": [
    {"name": "recipient_name", "description": "Person being invited"},
    {"name": "organization_name", "description": "Organization name"},
    {"name": "inviter_name", "description": "Person sending invitation"},
    {"name": "action_url", "description": "Invitation link"}
  ],
  "created_at": "2026-01-15T10:00:00Z",
  "updated_at": "2026-02-03T12:00:00Z"
}
```

**Query Pattern**:
```sql
-- Fetch template for sending
SELECT * FROM encharge_email_templates
WHERE template_type = $1 AND is_active = TRUE;

-- Update template content
UPDATE encharge_email_templates
SET html_body = $1, text_body = $2, updated_at = NOW()
WHERE template_type = $3;

-- List all active templates
SELECT template_name, template_type, updated_at
FROM encharge_email_templates
WHERE is_active = TRUE
ORDER BY updated_at DESC;
```

**How Templates Are Stored**:
- One row per email type (18 total)
- Template type is unique identifier
- HTML and plain text versions both required
- Variables documented in JSONB column
- Inactive templates can be kept as history

**How to Query for Templates**:
```typescript
// In edge function
const { data: template } = await supabase
  .from('encharge_email_templates')
  .select('*')
  .eq('template_type', requestType)
  .eq('is_active', true)
  .single();

// In admin dashboard
const { data: allTemplates } = await supabase
  .from('encharge_email_templates')
  .select('template_name, template_type, updated_at, is_active')
  .order('template_type');
```

**How to Add New Templates**:
```sql
-- Migration: 20260203210000_add_new_email_template.sql
INSERT INTO encharge_email_templates (
  template_name,
  template_type,
  subject_line,
  html_body,
  text_body,
  is_active,
  variables
) VALUES (
  'new_event',
  'new_event',
  'Subject with {{variables}}',
  '<p>HTML content with {{variables}}</p>',
  'Text content with {{variables}}',
  TRUE,
  '[{"name": "var1", "description": "..."}]'::jsonb
)
ON CONFLICT (template_name) DO UPDATE
SET updated_at = NOW();
```

#### email_logs

**Purpose**: Track all email sends for auditing, debugging, and analytics

**Schema**:
```sql
CREATE TABLE email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_type VARCHAR(255) NOT NULL,         -- 'organization_invitation', etc.
  to_email VARCHAR(255) NOT NULL,           -- Recipient address
  user_id UUID,                             -- Associated user (nullable)
  status VARCHAR(50) DEFAULT 'sent',        -- 'sent', 'failed', 'bounced'
  metadata JSONB,                           -- {template_id, message_id, variables}
  sent_via VARCHAR(50) DEFAULT 'aws_ses',   -- Email service used
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_email_logs_type ON email_logs(email_type);
CREATE INDEX idx_email_logs_user ON email_logs(user_id);
CREATE INDEX idx_email_logs_email ON email_logs(to_email);
CREATE INDEX idx_email_logs_created ON email_logs(created_at DESC);
```

**Example Row**:
```json
{
  "id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "email_type": "organization_invitation",
  "to_email": "sarah@acme.com",
  "user_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  "status": "sent",
  "metadata": {
    "template_id": "12345678-1234-1234-1234-123456789012",
    "template_name": "organization_invitation",
    "message_id": "000001900179a9e1-1234567890abc-000000",
    "variables": {
      "recipient_name": "Sarah",
      "organization_name": "Acme Corp",
      "inviter_name": "John Smith",
      "action_url": "https://app.use60.com/invite/token123"
    }
  },
  "sent_via": "aws_ses",
  "created_at": "2026-02-03T10:30:00Z",
  "updated_at": "2026-02-03T10:30:00Z"
}
```

**What Gets Logged**:
- Email type identifier
- Recipient email address
- Associated user ID (if applicable)
- Send status (always 'sent' if successful)
- Full metadata including AWS message ID
- All variables passed to template

**Query Examples**:
```sql
-- Recent sends
SELECT email_type, to_email, status, created_at
FROM email_logs
ORDER BY created_at DESC
LIMIT 50;

-- By type
SELECT COUNT(*), email_type
FROM email_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY email_type;

-- Success rate
SELECT
  email_type,
  COUNT(*) FILTER (WHERE status = 'sent') as sent,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'sent') / COUNT(*), 2) as success_rate
FROM email_logs
GROUP BY email_type;

-- Find duplicates (same user, same type, within 5 minutes)
SELECT to_email, email_type, COUNT(*), MAX(created_at)
FROM email_logs
WHERE created_at > NOW() - INTERVAL '1 day'
GROUP BY to_email, email_type, DATE_TRUNC('5 min', created_at)
HAVING COUNT(*) > 1;
```

**How to Troubleshoot**:
```sql
-- User got email they didn't expect
SELECT * FROM email_logs
WHERE to_email = 'user@example.com'
ORDER BY created_at DESC
LIMIT 20;

-- Check metadata for what variables were sent
SELECT metadata FROM email_logs
WHERE id = 'specific-log-id';

-- Verify message arrived (requires external MTA feedback)
SELECT * FROM email_logs
WHERE status != 'sent'  -- Would be set by bounce handlers
ORDER BY created_at DESC;
```

---

## Design Patterns

### Consistent Variable Naming

All variables use `snake_case` (lowercase with underscores):

```typescript
// Standard variables across all templates
const standardVariables = {
  recipient_name: "John Smith",           // Person receiving email
  organization_name: "Acme Corp",         // Organization context
  user_email: "john@acme.com",            // Email address
  action_url: "https://app.use60.com/...", // Primary CTA link
  expiry_time: "7 days",                  // Duration if applicable
  support_email: "support@use60.com",     // Support contact
  admin_name: "Sarah Chen",               // Admin performing action
};

// Template-specific variables
const specificVariables = {
  invitation_url: "https://...",  // Deprecated - use action_url
  inviter_name: "Sarah",
  company_name: "Sixty",
  plan_name: "Professional",
  trial_days: "3",
};
```

**Rationale**: Consistent naming reduces errors, improves searchability, and simplifies onboarding.

### Template Standardization

**Subject Line Pattern**:
- Include key context variable
- Make it scannable
- Keep under 50 characters when possible

```
✓ "Your {{trial_days}}-day trial is ending"
✓ "Join {{organization_name}} on Sixty"
✓ "{{admin_name}} approved your join request"
✗ "Email"
✗ "Action Required"
```

**HTML Body Pattern**:
- Greeting: "Hi {{recipient_name}},"
- Context: State what happened
- Action: CTA button with {{action_url}}
- Footer: Fine print, support email

```html
<p>Hi {{recipient_name}},</p>

<p>{{context_sentence}}</p>

<p><a href="{{action_url}}" style="...">Action Button</a></p>

<p style="font-size: 12px; color: #6b7280;">
  {{fine_print}}. Contact: {{support_email}}
</p>
```

**Text Body Pattern**:
- Plain text version without formatting
- Same content as HTML (accessibility)
- Include URL directly (no link syntax)

```
Hi {{recipient_name}},

{{context_sentence}}

{{action_url}}

{{fine_print}}
```

### Handlebars Substitution

**How It Works**:
```typescript
// Template
"Hello {{recipient_name}}, welcome to {{organization_name}}"

// Variables
{ recipient_name: "John", organization_name: "Acme" }

// Result
"Hello John, welcome to Acme"
```

**Implementation**:
```typescript
function processTemplate(template: string, vars: Record<string, any>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, String(value || ''));
  }
  return result;
}
```

**Edge Cases**:
- Missing variable → empty string: `{{unknown_var}}` becomes ""
- Null/undefined → empty string
- Numbers converted to string
- Special characters NOT HTML-encoded (done separately)
- Double substitution prevented (single pass)

### Bearer Token Authentication

**Why Bearer Tokens**:
- Standard HTTP authentication
- Avoids CORS preflight with custom headers
- Works with proxies and load balancers
- Follows RFC 6750

**Implementation**:
```typescript
// In edge function
const authHeader = req.headers.get('authorization');
if (authHeader?.startsWith('Bearer ')) {
  const token = authHeader.slice(7); // Remove "Bearer " prefix
  if (token === EDGE_FUNCTION_SECRET) {
    // Authenticated
  }
}

// In client
fetch('https://project.supabase.co/functions/v1/encharge-send-email', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${EDGE_FUNCTION_SECRET}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    template_type: 'organization_invitation',
    to_email: 'sarah@acme.com',
    variables: {...},
  }),
});
```

**Fallback Chain**:
1. Custom `x-edge-function-secret` header (for testing)
2. Bearer token in Authorization header
3. Service role key (backward compatibility)
4. API key header (deprecated)

### Graceful Failure Handling

**Non-Blocking Operations**:
```typescript
// Email send is primary - must succeed
const sesResult = await sendEmailViaSES(...);
if (!sesResult.success) {
  return { success: false, error: sesResult.error };
}

// Encharge tracking is secondary - fail silently
try {
  await trackEnchargeEvent(...);
} catch (error) {
  console.warn('Encharge tracking failed (non-critical):', error);
  // Continue - email was sent
}

// Database logging is tertiary - fail silently
try {
  await supabase.from('email_logs').insert({...});
} catch (error) {
  console.warn('Database logging failed (non-critical):', error);
  // Continue - email was sent
}
```

**HTTP Status Codes**:
- `200 OK` - Email sent successfully
- `400 Bad Request` - Missing required fields
- `401 Unauthorized` - Invalid authentication
- `403 Forbidden` - User not authorized
- `404 Not Found` - Template not found
- `500 Internal Server Error` - Unexpected error (AWS, database)

---

## Authentication & Security

### How Bearer Token Auth Works

**Configuration**:
```bash
# In Supabase project settings
EDGE_FUNCTION_SECRET=your-random-secret-key-here

# In frontend
VITE_EDGE_FUNCTION_SECRET=your-random-secret-key-here

# In backend/admin
EDGE_FUNCTION_SECRET=your-random-secret-key-here
```

**Token Generation**:
```bash
# Generate secure random token (32+ bytes)
openssl rand -hex 32
# Output: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0
```

**Sending Requests**:
```typescript
// Method 1: Bearer Token (Recommended)
const response = await fetch(
  `${SUPABASE_URL}/functions/v1/encharge-send-email`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${EDGE_FUNCTION_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({...}),
  }
);

// Method 2: Custom Header (For testing)
const response = await fetch(
  `${SUPABASE_URL}/functions/v1/encharge-send-email`,
  {
    method: 'POST',
    headers: {
      'x-edge-function-secret': EDGE_FUNCTION_SECRET,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({...}),
  }
);
```

**Validation in Edge Function**:
```typescript
function verifySecret(req: Request): boolean {
  const secret = Deno.env.get('EDGE_FUNCTION_SECRET');

  // 1. Check Bearer token
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    if (token === secret) return true;
  }

  // 2. Check custom header
  const headerSecret = req.headers.get('x-edge-function-secret');
  if (headerSecret === secret) return true;

  // 3. Fallback to service role (backward compat)
  const fallbackToken = authHeader?.substring(7);
  if (fallbackToken === SUPABASE_SERVICE_ROLE_KEY) return true;

  return false;
}
```

### EDGE_FUNCTION_SECRET Configuration

**What It Is**:
- Random string used to authenticate edge function calls
- Separate from Supabase service role key
- Should be 32+ characters (cryptographically random)
- Rotated periodically for security

**Where It's Used**:
- `encharge-send-email` - Main dispatcher
- `send-organization-invitation` - Direct function
- `waitlist-welcome-email` - Direct function
- `send-removal-email` - Direct function

**How to Configure**:
1. Generate random secret: `openssl rand -hex 32`
2. Set in Supabase project settings (Secrets)
3. Deployed automatically to all edge functions
4. Set in frontend .env as VITE_EDGE_FUNCTION_SECRET
5. Set in backend .env as EDGE_FUNCTION_SECRET

**Rotation Strategy**:
```bash
# Create new secret
NEW_SECRET=$(openssl rand -hex 32)

# Update Supabase environment variable
supabase secrets set EDGE_FUNCTION_SECRET=$NEW_SECRET

# Update frontend/backend configs
# - Update .env files
# - Redeploy applications

# Wait for grace period (24 hours) for cache invalidation
# Old secret still works during transition

# After grace period, remove old secret
```

### Service Role Key Handling

**Important**: Service role key should NEVER be exposed to frontend!

**Frontend Code**:
```typescript
// WRONG - Never do this!
const response = await fetch(endpoint, {
  headers: {
    'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY}`,
  },
});

// CORRECT - Use edge function secret instead
const response = await fetch(endpoint, {
  headers: {
    'Authorization': `Bearer ${import.meta.env.VITE_EDGE_FUNCTION_SECRET}`,
  },
});
```

**Backend/Admin Code**:
```typescript
// OK - Backend can use service role key
const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const response = await client
  .from('email_logs')
  .select('*');
```

### CORS Headers

**Configuration**:
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-edge-function-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
```

**Why Needed**:
- Browser enforces same-origin policy
- Supabase edge functions may be on different domain
- CORS preflight (OPTIONS) must succeed first
- Authorization header not standard in browsers

**Why Bearer Token**:
- Bearer token in Authorization header is standard
- Doesn't require CORS preflight on some cases
- Works better with proxies/firewalls
- Follows RFC 6750

### Security Best Practices

**Never Log Sensitive Data**:
```typescript
// BAD - Logs full secret
console.log('Secret:', EDGE_FUNCTION_SECRET);

// GOOD - Log only non-sensitive metadata
console.log('Auth status:', { authenticated: true, method: 'bearer' });
```

**Validate All Inputs**:
```typescript
// Validate email format
if (!isValidEmail(toEmail)) {
  throw new Error('Invalid email address');
}

// Validate URL
if (!actionUrl.startsWith('https://')) {
  throw new Error('URL must be HTTPS');
}

// Validate lengths
if (organizationName.length > 500) {
  throw new Error('Organization name too long');
}
```

**Rate Limiting**:
```typescript
// Consider rate limiting by IP/user
// Prevent abuse: max 10 emails per minute per IP
// Implement at edge function or API gateway level

const rateLimitKey = `ratelimit:${clientIP}`;
const count = await getRedisValue(rateLimitKey);
if (count && count > 10) {
  return new Response(
    JSON.stringify({ error: 'Rate limit exceeded' }),
    { status: 429 }
  );
}
```

**Audit Logging**:
```typescript
// Log all authentication failures
console.warn('[encharge-send-email] Auth failed', {
  timestamp: new Date().toISOString(),
  ip: req.headers.get('cf-connecting-ip'),
  method: 'bearer', // or 'header', 'apikey'
  reason: 'invalid_token',
});
```

---

## Performance Characteristics

### Expected Response Times

**Typical End-to-End**:
- Authentication check: 1-2ms
- Template fetch: 10-50ms (with database round-trip)
- Variable substitution: 2-5ms
- MIME formatting: 5-10ms
- AWS SES request: 50-200ms (network latency)
- Encharge tracking: 10-50ms (parallel)
- Database logging: 10-50ms (non-blocking)
- **Total**: 100-400ms

**Worst Case**:
- Cold database connection: +50-100ms
- SES throttling: +500-1000ms
- Network retry: +1000-5000ms

**Best Case**:
- Template in cache: -30-40ms
- Local database: -20-30ms
- **Total**: 50-150ms

### Database Query Patterns

**Template Query** (Single template lookup):
```sql
-- Indexed by template_type, uses index efficiently
SELECT * FROM encharge_email_templates
WHERE template_type = $1 AND is_active = TRUE;
-- Performance: <1ms with index
```

**Email Logs Insert** (Non-blocking):
```sql
-- Simple insert, should be <5ms
INSERT INTO email_logs (email_type, to_email, user_id, status, metadata, sent_via)
VALUES ($1, $2, $3, $4, $5, $6);
-- Performance: <5ms
```

**Analytics Query** (Batch):
```sql
-- Used for dashboards, not email path
SELECT COUNT(*), email_type FROM email_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY email_type;
-- Performance: <100ms (should add index on created_at)
```

**Missing Index Alert**:
```sql
-- Current indexes
SELECT indexname FROM pg_indexes
WHERE tablename = 'email_logs';

-- Should have:
-- - idx_email_logs_type (email_type)
-- - idx_email_logs_user (user_id)
-- - idx_email_logs_created (created_at DESC)
-- - idx_email_logs_email (to_email)
```

### Caching Opportunities

**Template Cache**:
```typescript
const templateCache = new Map<string, Template>();

async function getTemplate(type: string): Promise<Template> {
  // Check memory cache first
  if (templateCache.has(type)) {
    return templateCache.get(type)!;
  }

  // Fetch from database
  const template = await fetchTemplateFromDB(type);

  // Cache for 1 hour
  templateCache.set(type, template);
  setTimeout(() => templateCache.delete(type), 3600000);

  return template;
}
```

**Compiled Templates**:
```typescript
import Handlebars from 'handlebars';

const compiledTemplates = new Map<string, HandlebarsTemplateDelegate>();

function getCompiledTemplate(htmlBody: string): HandlebarsTemplateDelegate {
  const hash = hashContent(htmlBody);

  if (!compiledTemplates.has(hash)) {
    compiledTemplates.set(hash, Handlebars.compile(htmlBody));
  }

  return compiledTemplates.get(hash)!;
}
```

**User Data Cache** (5 minutes):
```typescript
const userCache = new Map<string, UserData>();

async function getUserData(userId: string): Promise<UserData> {
  if (userCache.has(userId)) {
    return userCache.get(userId)!;
  }

  const userData = await fetchUserFromDB(userId);
  userCache.set(userId, userData);

  // Auto-expire after 5 minutes
  setTimeout(() => userCache.delete(userId), 300000);

  return userData;
}
```

### Rate Limiting Considerations

**AWS SES Limits**:
- Default: 14 emails/second per account
- Can request increase to 1000+/second
- Implement backoff if hitting limits

**Encharge Limits**:
- 10,000 events/day (typically unlimited)
- Rate limiting per IP: check docs

**Implementation**:
```typescript
const emailQueue = new PQueue({
  concurrency: 10,        // 10 concurrent requests
  interval: 1000,         // Per second
  maxSize: 1000,          // Queue size
});

// Limit sends to 10/second
await emailQueue.add(() => sendEmail(variables));
```

### Scaling Recommendations

**For 100K emails/day**:
- Acceptable with current architecture
- May need to increase SES sending limit
- Consider batch sending in background

**For 1M emails/day**:
- Implement job queue (Bull, BullMQ, etc.)
- Process emails in workers
- Add Redis for queue management
- Monitor SES limits and throttle

**For 10M+ emails/day**:
- Dedicated email service (Sendgrid, Mailgun)
- Event-driven architecture
- Message queue (RabbitMQ, Kafka)
- Database sharding for logs

---

## Maintenance & Operations

### Monitoring Email Sends

**Real-Time Dashboard Query**:
```sql
SELECT
  NOW() as timestamp,
  email_type,
  COUNT(*) as last_hour_count,
  COUNT(*) FILTER (WHERE status = 'failed') as failures
FROM email_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY email_type
ORDER BY last_hour_count DESC;
```

**Alerts to Set Up**:
1. High failure rate: >5% failures in last hour
2. Template not found: Query returns 0 rows
3. SES throttling: Response includes ThrottlingException
4. Long latency: Emails taking >1000ms to send

**Monitoring Script** (Deno):
```typescript
async function monitorEmailHealth() {
  const result = await supabase
    .from('email_logs')
    .select('status, COUNT(*) as count')
    .gte('created_at', new Date(Date.now() - 3600000))
    .group_by('status');

  const failureRate = result.failed / (result.sent + result.failed);

  if (failureRate > 0.05) {
    await sendAlert('High email failure rate: ' + (failureRate * 100).toFixed(2) + '%');
  }
}

// Run every 5 minutes
setInterval(monitorEmailHealth, 300000);
```

### Troubleshooting Failures

**Error: Template not found**
```
Fix: Verify template_type is correct, check encharge_email_templates table
SELECT * FROM encharge_email_templates WHERE template_type = 'X';
```

**Error: SES ThrottlingException**
```
Fix: Reduce sending rate, wait 1 minute, retry
Implement exponential backoff with jitter
```

**Error: 401 Unauthorized**
```
Fix: Verify EDGE_FUNCTION_SECRET is correct and set in environment
Check Authorization header is properly formatted
```

**Error: Variables not substituting**
```
Fix: Check variable names match template exactly
Ensure snake_case (no camelCase or UPPERCASE)
Verify variable passed in request body
```

### Updating Templates

**Safe Update Process**:
```sql
-- 1. Start with inactive copy
INSERT INTO encharge_email_templates (
  template_name,
  template_type,
  subject_line,
  html_body,
  text_body,
  is_active,
  variables
) VALUES (
  'event_name_v2',
  'event_name_v2',
  'New subject',
  'New HTML',
  'New text',
  FALSE,  -- Start inactive
  variables
);

-- 2. Test activation (send to test account)
-- Verify layout, rendering, variable substitution

-- 3. Once verified, activate new version
UPDATE encharge_email_templates
SET is_active = TRUE
WHERE template_name = 'event_name_v2';

-- 4. Deactivate old version
UPDATE encharge_email_templates
SET is_active = FALSE
WHERE template_name = 'event_name' AND template_name != 'event_name_v2';

-- 5. After 30 days, delete old version
DELETE FROM encharge_email_templates
WHERE template_name = 'event_name' AND is_active = FALSE;
```

### Adding New Email Types

**Complete Checklist**:
- [ ] Create migration with template
- [ ] Update EVENT_MAP in encharge-send-email
- [ ] Add documentation to EMAIL_VARIABLE_REFERENCE.md
- [ ] Create integration test
- [ ] Test end-to-end in dev
- [ ] Deploy to production
- [ ] Monitor first 100 sends
- [ ] Update runbooks/alerts

**Migration Template**:
```sql
-- migration: 20260220_add_new_email_type.sql
INSERT INTO encharge_email_templates (
  template_name,
  template_type,
  subject_line,
  html_body,
  text_body,
  is_active,
  variables,
  created_at,
  updated_at
) VALUES (
  'new_type',
  'new_type',
  'Subject with {{variables}}',
  '<p>HTML body</p>',
  'Text body',
  TRUE,
  '[{"name": "var1"}, {"name": "var2"}]'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (template_name) DO UPDATE
SET updated_at = NOW();
```

### Version Management

**Template Versioning**:
- Keep one active version per template_type
- Inactive versions for rollback
- Updated_at tracks when changed
- Database audit log (created_at immutable)

**API Versioning**:
- Edge functions don't have version in URL
- Backward compatible updates only
- Breaking changes require new function

**Rollback Procedures**:
```sql
-- If new template has issues:

-- 1. Deactivate new version
UPDATE encharge_email_templates
SET is_active = FALSE
WHERE template_name = 'event_name_v2';

-- 2. Re-activate old version
UPDATE encharge_email_templates
SET is_active = TRUE
WHERE template_name = 'event_name'
  AND template_name NOT LIKE '%_v2';

-- Emails will use old version immediately
```

---

## Integration Points

### How Frontend Calls Email Functions

**Via React Query**:
```typescript
const sendInvitationMutation = useMutation({
  mutationFn: async (params: InvitationParams) => {
    const { data, error } = await supabase.functions.invoke(
      'send-organization-invitation',
      {
        body: params,
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_EDGE_FUNCTION_SECRET}`,
        },
      }
    );
    if (error) throw error;
    return data;
  },
  onSuccess: () => {
    toast.success('Invitation sent!');
    queryClient.invalidateQueries(['invitations']);
  },
  onError: (error) => {
    toast.error('Failed to send invitation');
    console.error(error);
  },
});

// Usage in component
const handleSendInvite = () => {
  sendInvitationMutation.mutate({
    to_email: 'newuser@acme.com',
    organization_name: 'Acme Corp',
    inviter_name: currentUser.name,
    invitation_url: generateInviteUrl(),
  });
};
```

### How Backend Services Trigger Emails

**Node.js Service**:
```typescript
// src/lib/services/emailService.ts
async function sendTrialEndingEmail(userId: string) {
  const user = await getUser(userId);
  const daysRemaining = calculateDaysRemaining(user.trial_expires_at);

  const response = await fetch(
    `${process.env.SUPABASE_URL}/functions/v1/encharge-send-email`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.EDGE_FUNCTION_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        template_type: 'trial_ending',
        to_email: user.email,
        to_name: user.full_name,
        variables: {
          recipient_name: user.full_name.split(' ')[0],
          trial_days: String(daysRemaining),
          action_url: 'https://app.use60.com/upgrade',
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Email send failed: ${response.statusText}`);
  }

  return response.json();
}
```

### Event System Integration

**Trigger Points**:
- User invited to org → `send-organization-invitation`
- User removed from org → `send-removal-email`
- Trial ending → `trial_ending`
- Subscription confirmed → `subscription_confirmed`
- First meeting synced → `first_meeting_synced`

**Implementation**:
```typescript
// When user accepts invitation
await supabase
  .from('organization_members')
  .insert({ user_id, organization_id });

// Trigger welcome email
await emailService.sendWelcomeEmail(user_id);

// Trigger Encharge tracking
await supabase.functions.invoke('encharge-send-email', {
  body: {
    template_type: 'welcome',
    to_email: user.email,
    variables: { /*...*/ },
  },
});
```

### Admin Interfaces

**Template Management UI**:
```typescript
// Admin component to edit templates
const [template, setTemplate] = useState<EmailTemplate>();

const updateTemplate = async () => {
  const response = await supabase
    .from('encharge_email_templates')
    .update({
      html_body: template.html_body,
      text_body: template.text_body,
      subject_line: template.subject_line,
      updated_at: new Date(),
    })
    .eq('template_type', template.template_type);

  toast.success('Template updated');
};
```

**Email Logs Dashboard**:
```typescript
// View recent emails
const { data: logs } = await supabase
  .from('email_logs')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(50);

// Analytics
const byType = logs.reduce((acc, log) => {
  acc[log.email_type] = (acc[log.email_type] || 0) + 1;
  return acc;
}, {});
```

### Analytics/Tracking Integration

**Encharge Event Tracking**:
```typescript
// Sent to Encharge for segmentation
{
  name: 'Organization Invitation Sent',
  user: {
    email: 'sarah@acme.com',
    userId: 'user-123',
    firstName: 'Sarah',
    lastName: 'Chen',
  },
  properties: {
    template_type: 'organization_invitation',
    organization_name: 'Acme Corp',
    inviter_name: 'John Smith',
  },
}
```

**Custom Analytics**:
```sql
-- Track email performance
SELECT
  email_type,
  DATE_TRUNC('day', created_at) as day,
  COUNT(*) as sent,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'sent') / COUNT(*), 2) as success_rate
FROM email_logs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY email_type, day
ORDER BY day DESC;
```

---

## Future Enhancements

### Planned Improvements

**1. Bounce Handling**:
- Integrate with SES bounce notifications
- Automatically suppress bounced addresses
- Track bounce types (permanent vs temporary)

**2. Retry Mechanism**:
- Automatic retry for transient failures
- Exponential backoff strategy
- Max 3 retries with increasing delays

**3. Email Verification**:
- Webhook for delivery confirmation
- Track opens/clicks if opted in
- Integration with Encharge for attribution

**4. Template Versioning**:
- Keep full history of template changes
- A/B testing framework
- Rollback to previous versions easily

**5. Scheduled Sends**:
- Send emails at specific times
- Schedule campaigns in advance
- Time zone aware scheduling

### Extension Points

**Custom Authentication**:
```typescript
// Allow per-service API keys instead of global secret
const serviceKey = req.headers.get('x-service-api-key');
if (isValidServiceKey(serviceKey)) {
  // Authenticated
}
```

**Custom Integrations**:
```typescript
// Send to additional services
await sendToSlack(emailMetadata);  // Alert admins
await sendToTwilio(emailMetadata); // SMS fallback
await sendToSegment(emailMetadata); // Analytics
```

**Template Builders**:
- Visual template editor
- Drag-and-drop blocks
- Preview rendering

### Backward Compatibility

**Commitment**:
- Never remove template types
- Always accept old variable names (fallback)
- Deprecated: Log warnings but continue support
- Versioning: Can introduce new params without breaking old calls

**Example**:
```typescript
// Old call still works
const response = await sendEmail({
  template_type: 'organization_invitation',
  to_email: 'user@example.com',
  variables: {
    first_name: 'John',  // deprecated
    org_name: 'Acme',    // deprecated
  },
});

// Edge function handles mapping
variables.recipient_name = variables.first_name || variables.recipient_name;
variables.organization_name = variables.org_name || variables.organization_name;
```

### Migration Paths

**From Other Email Providers**:
1. Run in parallel: New system + old system
2. Monitor success rate
3. Gradually shift volume
4. Deprecate old system

**From Manual Emails**:
1. Identify repetitive email patterns
2. Create templates
3. Automate triggers
4. Monitor and refine

---

## Document End

**Last Updated**: 2026-02-03
**Status**: Production Ready
**Maintainer**: Engineering Team

For questions or updates needed, contact the architecture team.
