# Staging Deployment Test Checklist

## 🔴 Critical - Must Pass Before Launch

### 1. Environment Configuration
- [ ] Verify `.env` uses staging Supabase project
- [ ] Confirm all URLs point to staging (not production)
- [ ] Check that API keys are staging-specific
- [ ] Verify service role key is for staging project only

### 2. Authentication Flow
- [ ] Sign up with new account
- [ ] Sign in with existing account
- [ ] Password reset flow
- [ ] Email verification (if enabled)
- [ ] Auth redirect URLs point to staging domain
- [ ] Session persistence across page refreshes
- [ ] Sign out functionality

### 3. Database Connectivity
- [ ] Can create new records (meetings, contacts, deals)
- [ ] Can read existing records
- [ ] Can update records
- [ ] Can delete records
- [ ] RLS policies working (can't access other users' data)
- [ ] Realtime subscriptions working

### 4. Core User Flows

#### Meeting Management
- [ ] Create new meeting
- [ ] Edit meeting details
- [ ] Delete meeting
- [ ] View meeting list
- [ ] Meeting detail page loads correctly
- [ ] Meeting search/filter works

#### Contact Management
- [ ] Create new contact
- [ ] Edit contact
- [ ] Delete contact
- [ ] Contact list loads
- [ ] Contact detail view
- [ ] Quick Add Contact modal

#### Deal Pipeline
- [ ] Create new deal
- [ ] Move deal between stages
- [ ] Edit deal details
- [ ] Delete deal
- [ ] Deal search/filter
- [ ] Deal value calculations

#### Task Management
- [ ] Create task
- [ ] Mark task complete
- [ ] Edit task
- [ ] Delete task
- [ ] Task notifications/reminders

## 🟡 Important - External Integrations

### 5. Google Calendar Integration
**CRITICAL**: These URLs must be staging-specific!

- [ ] OAuth consent screen shows staging URL
- [ ] Successful OAuth connection
- [ ] Calendar sync imports events
- [ ] Events created in app appear in Google Calendar
- [ ] Webhook URL points to staging edge function
- [ ] Calendar disconnect works
- [ ] Events stored in `calendar_events` table

**Check these specific URLs**:
```bash
# In Google Cloud Console
OAuth Redirect URI: https://staging-project-ref.supabase.co/auth/v1/callback
Webhook URL: https://staging-project-ref.supabase.co/functions/v1/google-calendar-webhook
```

### 6. Fathom Meeting Integration
- [ ] Can connect Fathom account
- [ ] Meeting transcripts are indexed
- [ ] AI search over transcripts works
- [ ] Webhook URL points to staging

**Check webhook URL**:
```bash
https://staging-project-ref.supabase.co/functions/v1/fathom-webhook
```

### 7. Slack Integration
- [ ] Slack OAuth flow completes
- [ ] Pipeline notifications send to correct channel
- [ ] Win/loss notifications work
- [ ] Slack webhook URL is staging-specific
- [ ] Slack commands respond correctly

**Check webhook URL**:
```bash
https://staging-project-ref.supabase.co/functions/v1/slack-webhook
```

### 8. Email Notifications
- [ ] Welcome emails send
- [ ] Password reset emails send
- [ ] Email links point to staging domain
- [ ] Unsubscribe links work

## 🟢 Nice to Have - Polish

### 9. Performance & UX
- [ ] Page load times acceptable (<3s)
- [ ] No console errors
- [ ] No 404s on assets
- [ ] Responsive design works on mobile
- [ ] Dark mode toggle works (if applicable)
- [ ] Toast notifications appear correctly

### 10. Edge Functions
Test each edge function individually:

- [ ] `deep-enrich-organization` - enriches org data
- [ ] `google-calendar-webhook` - receives calendar updates
- [ ] `fathom-webhook` - processes meeting transcripts
- [ ] `slack-webhook` - handles Slack events

**Test with curl**:
```bash
# Example
curl -X POST https://staging-project-ref.supabase.co/functions/v1/google-calendar-webhook \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

### 11. Data Isolation
**CRITICAL**: Ensure staging doesn't touch production!

- [ ] No production data visible in staging
- [ ] Creating records in staging doesn't affect production
- [ ] Staging database is completely separate
- [ ] API calls go to staging Supabase project
- [ ] No shared auth between prod/staging

## 🔧 Quick Test Script

Run this to test basic functionality:

```typescript
// In browser console on staging site
const testBasicFlow = async () => {
  // 1. Check Supabase connection
  const { data: profile } = await supabase.auth.getUser();
  console.log('✅ Auth works:', profile);

  // 2. Test database write
  const { data: meeting } = await supabase
    .from('meetings')
    .insert({ title: 'Test Meeting' })
    .select()
    .single();
  console.log('✅ DB write works:', meeting);

  // 3. Test database read
  const { data: meetings } = await supabase
    .from('meetings')
    .select('*')
    .limit(1);
  console.log('✅ DB read works:', meetings);

  // 4. Clean up
  await supabase.from('meetings').delete().eq('id', meeting.id);
  console.log('✅ DB delete works');
};

testBasicFlow();
```

## 🚨 Red Flags - Stop if You See These

- Any reference to production URLs in network tab
- Console errors about CORS or auth
- `PGRST116` errors (missing records due to wrong query)
- Seeing production data in staging
- Email links pointing to production
- OAuth redirects going to production

## 📊 Verification Commands

```bash
# Check environment variables
cat .env | grep SUPABASE_URL

# Check if correct project
# Should show staging project ref
cat .env | grep SUPABASE_ANON_KEY | cut -c1-20

# Verify no production references
grep -r "app.use60.com" src/ --exclude-dir=node_modules
grep -r "production-project-ref" . --exclude-dir=node_modules
```

## ✅ Sign-Off Criteria

Staging is ready when:
1. ✅ All critical (🔴) items pass
2. ✅ All integration URLs verified as staging-specific
3. ✅ Zero production data accessible
4. ✅ All external webhooks point to staging
5. ✅ At least one full user journey completed successfully

## 📝 Notes

- Document any issues found in GitHub issues with `staging` label
- Keep this checklist updated as new features are added
- Run this checklist before every staging deployment
- Use this as template for production pre-launch checklist
