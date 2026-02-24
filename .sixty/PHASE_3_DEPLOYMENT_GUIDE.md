# Phase 3 Deployment Guide

**Date**: 2026-02-03
**Version**: 1.0
**Status**: Ready for Deployment

---

## Pre-Deployment Requirements

### 1. Database Templates Must Exist

All email functions depend on templates in the `encharge_email_templates` table. Verify these 18 templates exist before deploying:

#### Organization & Membership (4)
- [ ] `organization_invitation` - Organization invitation template
- [ ] `member_removed` - Member removal notification
- [ ] `org_approval` - Organization approval notification
- [ ] `join_request_approved` - Join request approval

#### Waitlist & Access (2)
- [ ] `waitlist_invite` - Waitlist invitation
- [ ] `waitlist_welcome` - Waitlist welcome email

#### Onboarding (1)
- [ ] `welcome` - General welcome email

#### Integrations (2)
- [ ] `fathom_connected` - Fathom connected confirmation
- [ ] `first_meeting_synced` - First meeting sync notification

#### Subscription & Trial (5)
- [ ] `trial_ending` - Trial ending soon warning
- [ ] `trial_expired` - Trial expired notification
- [ ] `subscription_confirmed` - Subscription confirmation
- [ ] `meeting_limit_warning` - Meeting limit warning
- [ ] `upgrade_prompt` - Upgrade prompt

#### Account Management (3)
- [ ] `email_change_verification` - Email change verification
- [ ] `password_reset` - Password reset request
- [ ] `join_request_rejected` - Join request rejection

#### Admin/Moderation (1)
- [ ] `permission_to_close` - Permission to close request

### 2. Environment Variables

Ensure these are set in Supabase edge function environment:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
EDGE_FUNCTION_SECRET=<secure-random-string>
AWS_ACCESS_KEY_ID=<aws-key>
AWS_SECRET_ACCESS_KEY=<aws-secret>
AWS_REGION=eu-west-2
ENCHARGE_WRITE_KEY=<encharge-key>
```

### 3. Database Schema Requirements

The following tables must exist with proper columns:

#### encharge_email_templates
```sql
CREATE TABLE encharge_email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_type TEXT NOT NULL UNIQUE,
  template_name TEXT NOT NULL,
  subject_line TEXT NOT NULL,
  html_body TEXT,
  text_body TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### email_logs
```sql
CREATE TABLE email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_type TEXT NOT NULL,
  to_email TEXT NOT NULL,
  user_id UUID,
  status TEXT DEFAULT 'sent',
  metadata JSONB,
  sent_via TEXT DEFAULT 'aws_ses',
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### profiles
```sql
-- Must have these columns:
- id UUID PRIMARY KEY
- email TEXT
- first_name TEXT
- last_name TEXT
```

---

## Deployment Steps

### Step 1: Verify Database Templates

Run this SQL to check template status:

```sql
SELECT
  template_type,
  template_name,
  is_active,
  CASE
    WHEN html_body IS NOT NULL THEN 'HTML ✓'
    ELSE 'Missing HTML'
  END as html_status,
  CASE
    WHEN text_body IS NOT NULL THEN 'Text ✓'
    ELSE 'No Text'
  END as text_status
FROM encharge_email_templates
ORDER BY template_type;
```

Expected result: 18 rows with all `is_active = true`

### Step 2: Deploy Edge Functions

Deploy in this order:

1. **Core Dispatcher** (dependency for all others)
   ```bash
   supabase functions deploy encharge-send-email
   ```

2. **Updated Functions** (changed from previous phase)
   ```bash
   supabase functions deploy send-organization-invitation
   supabase functions deploy send-removal-email
   supabase functions deploy waitlist-welcome-email
   ```

3. **New Functions** (created in Phase 3)
   ```bash
   supabase functions deploy org-approval-email
   supabase functions deploy fathom-connected-email
   supabase functions deploy first-meeting-synced-email
   supabase functions deploy subscription-confirmed-email
   supabase functions deploy meeting-limit-warning-email
   supabase functions deploy permission-to-close-email
   ```

### Step 3: Configure Secrets

Set the following in Supabase Edge Function settings:

```bash
# In Supabase Dashboard: Settings > Secrets

supabase secrets set EDGE_FUNCTION_SECRET="$(openssl rand -hex 32)"
supabase secrets set AWS_ACCESS_KEY_ID="your-aws-key"
supabase secrets set AWS_SECRET_ACCESS_KEY="your-aws-secret"
supabase secrets set ENCHARGE_WRITE_KEY="your-encharge-key"
```

Or use CLI:
```bash
supabase secrets set EDGE_FUNCTION_SECRET --env-file .env.secrets
```

### Step 4: Test Each Function

#### Test send-organization-invitation

```bash
curl -X POST "https://your-project.supabase.co/functions/v1/send-organization-invitation" \
  -H "Authorization: Bearer YOUR_EDGE_FUNCTION_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "to_email": "test@example.com",
    "to_name": "John",
    "organization_name": "Test Org",
    "inviter_name": "Sarah",
    "invitation_url": "https://app.use60.com/invite/test123"
  }'
```

Expected response:
```json
{
  "success": true,
  "message_id": "...",
  "template_type": "organization_invitation"
}
```

#### Test send-removal-email

```bash
curl -X POST "https://your-project.supabase.co/functions/v1/send-removal-email" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "org_id": "550e8400-e29b-41d4-a716-446655440001",
    "org_name": "Test Org",
    "admin_name": "Jane Doe"
  }'
```

#### Test org-approval-email

```bash
curl -X POST "https://your-project.supabase.co/functions/v1/org-approval-email" \
  -H "Authorization: Bearer YOUR_EDGE_FUNCTION_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "organization_id": "550e8400-e29b-41d4-a716-446655440001",
    "organization_name": "Test Org",
    "approval_type": "setup_complete"
  }'
```

### Step 5: Monitor Email Logs

```sql
-- Check sent emails
SELECT
  email_type,
  to_email,
  status,
  created_at,
  metadata->>'message_id' as message_id
FROM email_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 50;

-- Check failures
SELECT
  email_type,
  to_email,
  status,
  metadata
FROM email_logs
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 20;
```

### Step 6: Verify Encharge Tracking

Check that email events are tracked in Encharge:

1. Open Encharge dashboard
2. Navigate to Events tab
3. Look for events named:
   - "Organization Invitation Sent"
   - "Member Removed"
   - "Organization Approval"
   - "Fathom Connected"
   - etc.

---

## Rollback Plan

If issues occur during deployment:

### Option 1: Rollback Edge Functions

```bash
# View function versions
supabase functions list

# Deploy previous version
supabase functions deploy FUNCTION_NAME --version=PREVIOUS_VERSION_HASH
```

### Option 2: Disable Functions

Set `is_active = false` on templates to prevent sends:

```sql
UPDATE encharge_email_templates
SET is_active = false
WHERE template_type IN (
  'org_approval',
  'fathom_connected',
  'first_meeting_synced',
  'subscription_confirmed',
  'meeting_limit_warning',
  'permission_to_close'
);
```

### Option 3: Use Feature Flag

Add database feature flag to control email dispatch:

```sql
-- In settings table or config
INSERT INTO app_config (key, value)
VALUES ('email_dispatcher_enabled', 'true');
```

Then check in dispatcher:
```typescript
const config = await getConfig('email_dispatcher_enabled');
if (config?.value === 'false') {
  return new Response(JSON.stringify({
    success: false,
    error: 'Email dispatcher disabled'
  }), { status: 503 });
}
```

---

## Common Issues & Fixes

### Issue: "Template not found"

**Cause**: Template doesn't exist in database or `is_active = false`

**Fix**:
```sql
-- Check template exists
SELECT * FROM encharge_email_templates
WHERE template_type = 'organization_invitation';

-- If not found, create it (see EMAIL_DESIGN_SYSTEM.md for templates)
INSERT INTO encharge_email_templates (...)
VALUES (...);

-- If is_active is false, enable it
UPDATE encharge_email_templates
SET is_active = true
WHERE template_type = 'organization_invitation';
```

### Issue: "Unauthorized: invalid credentials"

**Cause**: EDGE_FUNCTION_SECRET not set or wrong value

**Fix**:
```bash
# Check secret is set
supabase secrets list

# Verify Authorization header is sent with correct secret
# Header format: Authorization: Bearer YOUR_SECRET_VALUE
```

### Issue: "Failed to send email" / SES errors

**Cause**: AWS credentials missing or incorrect

**Fix**:
```bash
# Verify AWS credentials
echo $AWS_ACCESS_KEY_ID
echo $AWS_SECRET_ACCESS_KEY

# Test SES connection
curl -X POST "https://your-project.supabase.co/functions/v1/encharge-send-email?test=ses" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```

### Issue: Variables not substituted in template

**Cause**: Variable names don't match template placeholders

**Fix**:
1. Check template has `{{variable_name}}` syntax
2. Verify variable names match EMAIL_VARIABLES_SCHEMA.md
3. Check variable values are strings (convert numbers/dates to strings)

```typescript
// Ensure all values are strings
const variables = {
  recipient_name: String(profile.first_name),
  current_meetings: String(45),  // Convert number to string
  meeting_date: String(new Date()).substring(0, 10), // Convert date
};
```

### Issue: Email not logged

**Cause**: email_logs table missing or permissions issue

**Fix**:
```sql
-- Verify table exists
SELECT table_name FROM information_schema.tables
WHERE table_name = 'email_logs';

-- Check RLS policies allow inserts
SELECT * FROM pg_policies
WHERE tablename = 'email_logs'
AND permissive = true;

-- Grant service role permissions
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY email_logs_insert ON email_logs
FOR INSERT WITH CHECK (true);
```

---

## Performance Considerations

### Email Queue Optimization

Emails are sent synchronously. For high volume, consider:

1. **Add Async Queue**
   - Use pg_boss or similar
   - Dispatcher enqueues jobs
   - Separate worker processes sends emails

2. **Batch Operations**
   - Group sends by recipient domain
   - Rate limit per provider

3. **Caching**
   - Cache template lookups for 5 minutes
   - Reduces database queries

### Monitoring & Alerts

Set up monitoring for:

```sql
-- Alert on high failure rate
SELECT
  email_type,
  COUNT(*) as total,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as failures,
  ROUND(100.0 * COUNT(CASE WHEN status = 'failed' THEN 1 END) / COUNT(*), 2) as failure_rate
FROM email_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY email_type
HAVING COUNT(CASE WHEN status = 'failed' THEN 1 END) > 0
ORDER BY failure_rate DESC;
```

---

## Maintenance Tasks

### Weekly
- [ ] Review email_logs for failures
- [ ] Check Encharge event tracking
- [ ] Monitor AWS SES quotas and usage

### Monthly
- [ ] Archive old email_logs (>30 days)
- [ ] Review template performance
- [ ] Update variable documentation

### As Needed
- [ ] Add new email types to dispatcher
- [ ] Update template content
- [ ] Adjust variable substitution logic

---

## Success Criteria

Deployment is successful when:

1. ✅ All 18 email templates exist and are active
2. ✅ All 6 new functions deploy without errors
3. ✅ All 4 updated functions deploy cleanly
4. ✅ Test emails send successfully
5. ✅ Variables are correctly substituted
6. ✅ Emails logged to email_logs table
7. ✅ Encharge events tracked
8. ✅ No errors in function logs
9. ✅ SES quota not exceeded
10. ✅ Support team confirms receipt of test emails

---

## Sign-Off

Ready for production deployment after:
1. Database templates verified to exist
2. All environment variables set
3. Test suite passes
4. Staging deployment validated

**Next**: Deploy to production staging environment first, validate for 24 hours, then promote to production.
