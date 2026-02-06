# Consult Report: Avatar Upload & Email Change Features

**Generated**: 2025-02-02
**Feature**: User Profile Picture Uploads + Email Change Verification
**Effort**: 5.5 - 8 hours (including testing)

---

## User Requirements

### Avatar Upload
- ✅ Upload profile pictures (JPG, PNG, WebP - max 5MB)
- ✅ Click on avatar image to open file picker
- ✅ Click "Change Picture" text to open file picker (existing, but improve UX)
- ✅ Remove avatar button to revert to initials
- ✅ Display initials when no avatar set
- ⚠️ Fix: `POST 400 Bad Request` error on avatar upload to Supabase Storage

### Email Change Flow
- ✅ "Change Email" button in profile settings (next to uneditable email)
- ✅ Modal requesting: new email (2x for confirmation), current password
- ✅ Allow cancellation of pending email change requests
- ✅ Only one pending email change at a time
- ✅ Send verification email using template matching early access welcome style
- ✅ Magic link clicks verify the new email
- ✅ Email change only completes after verification link clicked
- ✅ Success page: "Email successfully changed" → auto-redirect to dashboard in 5 seconds
- ✅ User stays in organization and keeps all data
- ✅ Template stored in database and editable via admin dashboard

---

## Codebase Analysis

### Existing Assets

**Avatar Upload (Partial)**
- `src/pages/Profile.tsx` — Working avatar upload (lines 119-188)
  - File validation: JPEG, PNG, GIF, WebP, 5MB max
  - Uploads to `avatars` Supabase Storage bucket
  - Stores public URL in `profiles.avatar_url`
  - Missing: remove option, improved UI

**Email Templates Infrastructure**
- `src/lib/services/enchargeTemplateService.ts` — Template CRUD
- `src/lib/services/emailTemplateService.ts` — Waitlist template service
- `src/pages/admin/EmailTemplates.tsx` — Admin editor (basic)
- Tables: `encharge_email_templates`, `waitlist_email_templates`
- Variables: `{{placeholder}}` syntax with conditional `{{#if}}` support

**Authentication**
- `src/lib/contexts/AuthContext.tsx` — Unified auth (Supabase + Clerk)
- `src/pages/auth/VerifyEmail.tsx` — Email verification pattern (reusable)
- Patterns: email verification links, token validation, auto-redirect

**Avatar Display**
- `src/components/ui/avatar.tsx` — Radix UI Avatar with initials fallback

### Critical Gaps

| Gap | Impact | Solution |
|-----|--------|----------|
| Avatar bucket RLS unclear | 400 error on upload | Verify/create bucket RLS policies |
| No remove avatar option | Can't revert to initials | Add `remove_avatar` column + UI |
| No email change flow | Feature not implementable | Build edge functions + token system |
| No pending email state | Can't track changes | Add `pending_email` column to profiles |
| No email change template | Can't send verification | Create migration with template |
| No token storage | Can't verify links | Create `email_change_tokens` table |

### Database Schema Changes Required

```sql
-- profiles table additions
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pending_email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS remove_avatar BOOLEAN DEFAULT false;

-- New table for email change tokens
CREATE TABLE email_change_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  new_email TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Email template addition
INSERT INTO encharge_email_templates (
  template_name, template_type, subject_line, html_body, variables
) VALUES (
  'email_change_verification',
  'email_change_verification',
  'Confirm Your Email Change',
  '[HTML template]',
  '["old_email", "new_email", "verification_link", "expiry_time"]'::jsonb
);
```

---

## Risk Analysis

### High Severity

**Issue**: Email verification flow not implemented
**Impact**: Cannot safely change user emails
**Mitigation**:
1. Generate secure token (32+ bytes)
2. Store in `email_change_tokens` with 24-hour expiry
3. Send verification link to new email
4. Only update `auth.users.email` + `profiles.email` after verification
5. Implement rate limiting (1 per 60 seconds)

### Medium Severity

**Issue**: Avatar upload returns 400 Bad Request
**Impact**: Feature non-functional
**Mitigation**:
1. Verify `avatars` bucket exists in Supabase Storage
2. Check RLS policies allow authenticated write
3. Verify file validation before upload
4. Add server-side validation in edge function
5. Test with different file types/sizes

**Issue**: Dual auth complication (Supabase Auth + Clerk)
**Impact**: Different code paths for email/avatar changes
**Mitigation**:
1. Create abstraction layer for auth updates
2. Handle both `supabase.auth.updateUser()` and Clerk API calls
3. Sync Clerk changes back to profiles table
4. Test thoroughly in both modes

### Low Severity

**Issue**: Storage bucket consistency (mix of S3 + Supabase)
**Impact**: Fragmented architecture
**Mitigation**: Use Supabase Storage for simplicity (already established for avatars)

### Security Notes

- ✅ Always verify email before updating `auth.users.email`
- ✅ Rate limit email change requests
- ✅ Implement audit logging for email changes
- ✅ Validate file types/sizes server-side for avatars
- ✅ Use RLS to prevent users changing others' emails
- ⚠️ AWS credentials exposed in `.env.production` — rotate AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY immediately

---

## Recommended Patterns

### From Codebase Analysis

**State Management**
```typescript
// Use Zustand for UI state, React Query for server state
const { data: user } = useUserProfile(email);  // React Query
const { theme } = useThemeStore();              // Zustand
```

**Mutations**
```typescript
// Custom async hooks with error handling
async function handleEmailChange(newEmail: string) {
  try {
    setLoading(true);
    const { data } = await apiCall('/request-email-change', {
      method: 'POST',
      body: { newEmail }
    });
    toast.success('Verification email sent');
    queryClient.invalidateQueries(['user-profile']);
  } catch (error) {
    toast.error(sanitizeErrorMessage(error));
  }
}
```

**Forms**
```typescript
// Manual validation, async submission, toast feedback
const [newEmail, setNewEmail] = useState('');
const handleSubmit = async (e) => {
  e.preventDefault();
  if (!newEmail || newEmail !== confirmEmail) {
    toast.error('Emails do not match');
    return;
  }
  await handleEmailChange(newEmail);
};
```

**Error Handling**
```typescript
// Sanitize errors, log details, provide user feedback
toast.error(sanitizeErrorMessage(error));
logger.error('Email change failed:', error);
```

**Modals**
```typescript
// Radix UI Dialog with controlled state
const [isOpen, setIsOpen] = useState(false);
<Dialog open={isOpen} onOpenChange={setIsOpen}>
  {/* Modal content */}
</Dialog>
```

---

## Architecture Decision: Email Verification Flow

### Chosen Approach: Server-side Verification Links

**Why this approach:**
- ✅ Matches existing pattern (VerifyEmail.tsx)
- ✅ Secure token generation and validation
- ✅ Email-based verification (user has access to new email)
- ✅ Supports rate limiting and expiry
- ✅ Database-backed, not JWT-based (simpler to revoke)

**Flow:**
1. User submits new email + password in modal
2. Edge function validates and generates 32-byte random token
3. Stores token + new_email in `email_change_tokens` table (24-hour expiry)
4. Sends verification email with magic link: `/auth/verify-email-change?token=xyz`
5. User clicks link → `/auth/verify-email-change` page validates token
6. Edge function updates both `auth.users.email` and `profiles.email`
7. Redirects to success page → auto-redirect to dashboard

**Why not other approaches:**
- ❌ Instant email change (no verification): Allows account takeover, doesn't match requirement
- ❌ JWT-based tokens: More complex, harder to revoke if compromised
- ❌ SMS verification: Not all users have SMS, complicates flow
- ❌ Password-reset link: Different UX, users expect email-based verification

---

## Execution Plan Overview

### Phase 1: Database Layer (20-25 min)
- ✅ Add columns to profiles table
- ✅ Create email_change_tokens table
- ✅ Create email_change_verification template

### Phase 2: Frontend UI (80-110 min)
- ✅ Fix avatar upload error + improve UX
- ✅ Add avatar remove button + initials display
- ✅ Add email change modal to Profile/Settings

### Phase 3: Backend (50-70 min)
- ✅ Create request-email-change edge function
- ✅ Create verify-email-change edge function
- ✅ Create email-changed success page

### Phase 4: Integration (15-20 min)
- ✅ Connect UI to edge functions
- ✅ Wire up React Query invalidations

### Phase 5: Testing (50-70 min, optional)
- ✅ E2E test: Avatar upload/remove/validation
- ✅ E2E test: Email change request/verify/redirect

---

## MVP vs Full Scope

### MVP (3-4.5 hours)
**Delivers**: Working avatar + email change flows, both end-to-end functional

**Includes**:
- Avatar upload with remove option
- Email change request modal with validation
- Email verification via magic link
- Success page with auto-redirect
- Admin template editor (basic, can edit in database)

**Excludes**:
- Comprehensive E2E tests (add later)
- Email change history/audit logs
- Resend verification email UI

### Phase 2 Additions
- Advanced admin email template editor (WYSIWYG)
- Email change history in settings
- Resend verification from pending state
- Comprehensive E2E test coverage
- Webhook support for Clerk sync

---

## Parallel Execution Opportunities

The following can be developed simultaneously:

| Group | Time Saved | Reason |
|-------|-----------|--------|
| Migrations + Template | 15-20 min | Pure SQL, no dependencies |
| Avatar UI + Email Modal | 10-15 min | Different form sections |
| Request + Verify edge functions | 10-15 min | Can develop against interfaces |
| E2E tests | 10-15 min | Independent scenarios |

**Total potential savings**: 45-65 min (33% of MVP timeline)

---

## Files to Create/Modify

### New Files
```
supabase/migrations/[timestamp]_add_email_change_feature.sql
supabase/functions/request-email-change/index.ts
supabase/functions/verify-email-change/index.ts
src/pages/auth/EmailChangeVerification.tsx
src/pages/auth/EmailChangeSuccess.tsx
src/pages/settings/AccountSettings.tsx
src/components/AvatarUpload.tsx (extracted from Profile.tsx)
src/lib/hooks/useUpdateAvatar.ts
src/lib/hooks/useUpdateEmail.ts
tests/e2e/avatar-upload.spec.ts
tests/e2e/email-change.spec.ts
```

### Modified Files
```
src/pages/Profile.tsx (refactor, extract avatar component)
src/lib/services/enchargeTemplateService.ts (add email_change_verification type)
src/pages/admin/EmailTemplates.tsx (extend with new template type)
src/lib/contexts/AuthContext.tsx (add email verification handling)
```

---

## Blockers to Address Before Starting

1. **Verify Supabase Storage bucket configuration**
   - Does `avatars` bucket exist?
   - Is it publicly readable?
   - Are RLS policies correct?
   - Solution: Check Supabase dashboard → Storage → Avatars

2. **Confirm AWS credentials validity**
   - `.env.production` has exposed AWS keys
   - Need to verify they still work
   - Action: Rotate AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY after this task

3. **Decide on Clerk auth support**
   - Do you use Clerk auth in production?
   - If yes, need to handle Clerk API calls in email change
   - If no, can simplify to Supabase Auth only
   - Recommendation: Build for both, test with at least Supabase Auth first

---

## Questions Answered

✅ Avatar formats: JPG, PNG, WebP (5MB max)
✅ Email change restrictions: One pending at a time, cancelable
✅ Email template style: Match early access welcome email
✅ Template system: Simple variables ({{firstName}}, {{magicLink}}, etc.)

---

## Next Steps

Ready to execute? Run:

```bash
60/run  # Start building the plan stories
```

Or review the detailed plan first:

```bash
cat .sixty/plan.json  # See all 12 stories with dependencies
```
