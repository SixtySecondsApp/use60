# Deployment Guide: Avatar Upload & Email Change Features

## Status: MVP COMPLETE ✅

All 11 core stories implemented and committed. Ready for testing and deployment to staging.

---

## What's Been Completed

### Phase 1: Database Layer ✅ (3 stories)
- **AVATAR-1**: Added `remove_avatar` and `pending_email` columns to profiles table
- **EMAIL-TOKEN-TABLE**: Created `email_change_tokens` table with RLS policies
- **EMAIL-TEMPLATE-1**: Created branded email template for verification

### Phase 2: Avatar Backend & Component ✅ (3 stories)
- **AVATAR-2**: Setup avatars bucket RLS configuration
- **AVATAR-3**: Created reusable `AvatarUpload` component
- **AVATAR-4**: Implemented remove avatar functionality

### Phase 3: Email Backend Functions ✅ (2 stories)
- **EMAIL-REQUEST-EDGE**: Edge function for requesting email change (with rate limiting)
- **EMAIL-VERIFY-EDGE**: Edge function for verifying and applying email change

### Phase 4: Email Frontend & Routes ✅ (3 stories)
- **EMAIL-SUCCESS-PAGE**: Success page with auto-redirect
- **EMAIL-VERIFICATION-ROUTE**: Magic link handling page
- **EMAIL-MODAL & EMAIL-INTEGRATION**: Modal integrated into Profile page

---

## Database Migrations to Deploy

Before deploying to production, execute these migrations in order:

```sql
-- Run these in Supabase SQL Editor or via CLI
```

### Migration Files (in `/supabase/migrations/`):

1. **20260202140000_add_avatar_and_email_change_features.sql**
   - Adds `remove_avatar` and `pending_email` columns
   - Creates `email_change_tokens` table
   - Includes RLS policies

2. **20260202140001_add_email_change_verification_template.sql**
   - Inserts email template for verification
   - Includes all variables and HTML styling

3. **20260202140002_setup_avatars_bucket_rls.sql**
   - Configures avatars storage bucket
   - Sets up public read/authenticated write access

### Deployment Steps:

```bash
# Option 1: Using Supabase CLI (if linked)
supabase migration up

# Option 2: Manual via Supabase Dashboard
# 1. Go to SQL Editor
# 2. Copy content from each migration file
# 3. Execute in order

# Option 3: Link project first, then deploy
supabase link --project-ref <your-project-id>
supabase migration up
```

---

## Environment Variables Required

Make sure these are set in your `.env` files:

```env
# Supabase
VITE_SUPABASE_URL=https://caerqjzvuerejfrdtygb.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# Frontend URL (for verification links)
FRONTEND_URL=https://app.use60.com  # or localhost:5175 for dev
```

---

## New Components & Pages

### Components
- `src/components/AvatarUpload.tsx` - Reusable avatar upload component
- `src/components/EmailChangeModal.tsx` - Email change request modal

### Pages
- `src/pages/auth/EmailChangeVerification.tsx` - Magic link verification page
- `src/pages/auth/EmailChangeSuccess.tsx` - Success confirmation page

### Edge Functions
- `supabase/functions/request-email-change/index.ts` - Request email change
- `supabase/functions/verify-email-change/index.ts` - Verify and apply change

### Updated Pages
- `src/pages/Profile.tsx` - Integrated avatar component and email change button

---

## Testing Checklist

### Avatar Upload
- [ ] Click avatar image to select file
- [ ] Click "Change Picture" button to select file
- [ ] Upload JPG/PNG/GIF/WebP (max 5MB)
- [ ] File too large shows error
- [ ] Invalid format shows error
- [ ] Avatar displays after upload
- [ ] Old avatar replaced on new upload
- [ ] "Remove Picture" button appears
- [ ] Clicking remove shows confirmation
- [ ] After remove, initials display
- [ ] Can upload new avatar after remove

### Email Change Flow
- [ ] "Change Email" button visible next to email field
- [ ] Modal opens with 2 email fields
- [ ] Emails must match (validation)
- [ ] Password verification required
- [ ] Can't use same email as current
- [ ] Can't use email already in use
- [ ] Request succeeds with "verification email sent" message
- [ ] Pending state shown with resend option
- [ ] Verification link opens magic link page
- [ ] Link validation shows loading then success
- [ ] Success page shows new email
- [ ] Auto-redirect to dashboard after 5 sec
- [ ] New email works for login
- [ ] Old email no longer works for login

### Security
- [ ] Rate limiting (max 3 requests per hour)
- [ ] Token expires after 24 hours
- [ ] Token can only be used once
- [ ] Users can't verify others' tokens
- [ ] Password verification prevents unauthorized changes
- [ ] Audit logs created (if audit table exists)

---

## Known Limitations & Future Improvements

### Current Limitations
1. **Email sending**: Edge functions are configured for template rendering but actual AWS SES integration needs env vars
2. **Audit logging**: Assumes `audit_logs` table exists; removes silently if it doesn't
3. **Clerk auth sync**: Code supports both Supabase and Clerk, but Clerk email changes may need separate sync

### Phase 2 Enhancements (Not in MVP)
- Advanced admin template editor (WYSIWYG)
- Email change history display
- Resend verification from pending state UI
- Comprehensive E2E test coverage
- Webhook support for third-party email verification

---

## Rollback Plan

If issues occur, revert these commits:

```bash
# Identify commits
git log --oneline | head -5

# Revert last commit (migrations)
git revert <commit-hash>

# Or reset to previous state
git reset --hard <previous-commit-hash>
```

---

## Verification After Deployment

1. **Check migrations applied**:
   ```sql
   SELECT column_name FROM information_schema.columns
   WHERE table_name='profiles' AND column_name IN ('remove_avatar', 'pending_email');
   -- Should return 2 rows
   ```

2. **Check tables exist**:
   ```sql
   SELECT table_name FROM information_schema.tables
   WHERE table_schema='public' AND table_name='email_change_tokens';
   -- Should return 1 row
   ```

3. **Check templates**:
   ```sql
   SELECT template_type FROM encharge_email_templates
   WHERE template_type='email_change_verification';
   -- Should return 1 row
   ```

---

## Support & Questions

For issues with deployment:
1. Check migration errors in Supabase logs
2. Verify all environment variables are set
3. Ensure Supabase project is linked if using CLI
4. Check avatars storage bucket exists and is public

---

## Files Modified/Created

```
New Directories:
- (none - uses existing structure)

New Files:
- src/components/AvatarUpload.tsx (251 lines)
- src/components/EmailChangeModal.tsx (316 lines)
- src/pages/auth/EmailChangeVerification.tsx (132 lines)
- src/pages/auth/EmailChangeSuccess.tsx (76 lines)
- supabase/functions/request-email-change/index.ts (189 lines)
- supabase/functions/verify-email-change/index.ts (198 lines)
- supabase/migrations/20260202140000_add_avatar_and_email_change_features.sql (69 lines)
- supabase/migrations/20260202140001_add_email_change_verification_template.sql (42 lines)
- supabase/migrations/20260202140002_setup_avatars_bucket_rls.sql (24 lines)
- DEPLOYMENT_GUIDE.md (this file)

Modified Files:
- src/pages/Profile.tsx (+40 lines, integrated AvatarUpload and EmailChangeModal)
- .sixty/plan.json (updated status)

Total: 1,379 lines of new code
```

---

## Commits

```
ef5663cb - feat: AVATAR-1, EMAIL-TOKEN-TABLE, EMAIL-TEMPLATE-1 - Add database schema
77cb56b6 - feat: AVATAR-2 to EMAIL-INTEGRATION - Implement avatar and email change features
```

---

**Last Updated**: 2025-02-02
**Status**: Ready for Staging Deployment
**Next Step**: Deploy to staging and run comprehensive testing
