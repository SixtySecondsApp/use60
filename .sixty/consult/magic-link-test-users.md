# Consult Report: Magic Link Test User Onboarding

**Generated**: 2026-03-02
**Feature**: Admin-generated magic links for pre-provisioned test users with 500 credits

---

## User Requirements

**Goal**: Generate a magic link from the platform admin area that:
1. Pre-creates an organization for a recipient
2. Optionally marks them as a "test user" with 500 pre-loaded credits
3. Recipient clicks link → enters email, password, first/last name → lands on dashboard
4. Minimal onboarding (org creation + enrichment skipped)
5. Email verification required before account activation
6. Links expire after 7 days

**Admin UI Location**: New "Magic Links" tab on `/platform/users` page (alongside existing "Users" and "Auth Codes" tabs)

---

## Codebase Analysis

### Existing Assets to Reuse

| Asset | Path | Reuse Strategy |
|-------|------|----------------|
| Token generation pattern | `supabase/functions/generate-waitlist-token/index.ts` | Clone & adapt for test user tokens |
| Token validation pattern | `supabase/functions/validate-waitlist-token/index.ts` | Same validation flow |
| Magic token table schema | `supabase/migrations/20260119000002_create_waitlist_magic_tokens.sql` | Adapt schema for test users |
| Invite signup flow | `src/pages/auth/InviteSignup.tsx` | Reference for signup-with-token UX |
| Accept invitation page | `src/pages/auth/AcceptInvitation.tsx` | Reference for token extraction + validation |
| Credit granting RPC | `supabase/migrations/20260227160007_admin_trial_credit_actions.sql` | Direct reuse of `admin_grant_credits()` |
| CORS helper | `supabase/functions/_shared/corsHelper.ts` | Use `getCorsHeaders(req)` pattern |
| Users admin page | `src/pages/admin/Users.tsx` | Add "Magic Links" tab |
| Invitation service | `src/lib/services/invitationService.ts` | Reference for token service pattern |

### Patterns to Follow

**Token Generation**: 64-char hex via `crypto.getRandomValues(new Uint8Array(32))`
**Edge Functions**: `verify_jwt = false` + manual auth check inside function
**CORS**: Use `getCorsHeaders(req)` + `handleCorsPreflightRequest(req)` from `_shared/corsHelper.ts`
**Admin Gating**: Check `profiles.is_admin = true` via service role client
**Credit Grant**: Use existing `admin_grant_credits(org_id, 500, 'Test user provisioning')` RPC
**State Management**: React Query for server state, Zustand for UI state

---

## Architecture

### Flow Diagram

```
ADMIN (Platform > Users > Magic Links tab)
  │
  ├─ Fill form: org name, recipient email, [x] test user (500 credits)
  │
  ├─ Click "Generate Magic Link"
  │     │
  │     ▼
  │  Edge Function: generate-test-user-link
  │     ├─ Auth: verify platform admin (is_admin = true)
  │     ├─ Create org (name, domain if provided)
  │     ├─ Create organization_memberships placeholder
  │     ├─ Insert test_user_magic_links row (token, org_id, email, 7-day expiry)
  │     ├─ If test_user checkbox: flag org for 500 credits on activation
  │     └─ Return: magic link URL + token
  │
  ├─ Display link to copy / send via email
  │
  ▼
RECIPIENT (clicks magic link)
  │
  ├─ Route: /auth/test-signup/:token
  │
  ├─ Frontend: TestUserSignup component
  │     ├─ Extract token from URL
  │     ├─ Call validate-test-user-link edge function
  │     ├─ Show org name + form: email, password, first name, last name
  │     ├─ Email must match token email (pre-filled, readonly)
  │     └─ Submit → complete-test-user-signup
  │
  ▼
Edge Function: complete-test-user-signup
  │
  ├─ Validate token (not expired, not used, email matches)
  ├─ Create auth.users record (Supabase signUp with email confirmation)
  ├─ Create profile record
  ├─ Link user to pre-created org membership (set user_id)
  ├─ Mark token as used (used_at = now())
  ├─ If test_user: grant 500 credits via admin_grant_credits()
  ├─ Set onboarding flags to skip org creation steps
  └─ Send email verification (Supabase built-in)
  │
  ▼
RECIPIENT verifies email → logs in → Dashboard (no onboarding)
```

### Email Verification Approach

Since you want email verification before account activation, I recommend:

**Option A (Recommended): Supabase signUp with `emailRedirectTo`**
- Call `supabase.auth.admin.createUser()` with `email_confirm: false`
- Then call `supabase.auth.admin.generateLink({ type: 'signup', email })` to get a verification link
- Or simpler: use `supabase.auth.signUp()` which auto-sends confirmation email
- User clicks confirmation → redirected to app → auto-logged in

**Why this works**: Supabase has built-in email confirmation flow. The user enters their details, gets a confirmation email, clicks it, and lands in the app with their pre-created org ready.

---

## Database Schema

### New Table: `test_user_magic_links`

```sql
CREATE TABLE public.test_user_magic_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  is_test_user BOOLEAN DEFAULT false,     -- triggers 500 credit grant
  credit_amount DECIMAL(12,4) DEFAULT 500,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  used_at TIMESTAMPTZ,                    -- NULL = not consumed
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  activated_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  org_name TEXT,                          -- denormalized for display

  CONSTRAINT token_not_empty CHECK (token != ''),
  CONSTRAINT valid_credit_amount CHECK (credit_amount >= 0)
);

-- Performance indexes
CREATE INDEX idx_test_magic_links_token ON test_user_magic_links(token);
CREATE INDEX idx_test_magic_links_email ON test_user_magic_links(email);
CREATE INDEX idx_test_magic_links_expires ON test_user_magic_links(expires_at);
CREATE INDEX idx_test_magic_links_created_by ON test_user_magic_links(created_by);

-- RLS
ALTER TABLE test_user_magic_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages test links"
  ON test_user_magic_links FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Public can validate unexpired tokens"
  ON test_user_magic_links FOR SELECT
  USING (expires_at > now() AND used_at IS NULL);

CREATE POLICY "Platform admins can view all"
  ON test_user_magic_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );
```

---

## Edge Functions (3 new)

### 1. `generate-test-user-link`
- **Auth**: Platform admin only
- **Creates**: Organization + test_user_magic_links row
- **Returns**: `{ token, link, org_id, expires_at }`
- **Config**: `verify_jwt = false`

### 2. `validate-test-user-link`
- **Auth**: Public (token is the auth)
- **Validates**: Token exists, not expired, not used
- **Returns**: `{ valid, org_name, email, is_test_user }`
- **Config**: `verify_jwt = false`

### 3. `complete-test-user-signup`
- **Auth**: Public (token is the auth)
- **Creates**: Auth user, profile, links membership, grants credits
- **Returns**: `{ success, redirect_url }`
- **Config**: `verify_jwt = false`

---

## Frontend Components

### 1. Magic Links Tab (in Users.tsx)
- Table of generated links with status (active/used/expired)
- "Generate New Link" button → dialog
- Dialog: org name, email, [x] test user (500 credits), generate button
- Copy link button, revoke button

### 2. TestUserSignup Page (`/auth/test-signup/:token`)
- Clean signup form: email (pre-filled from token), password, first name, last name
- Shows org name they're joining
- "Create Account" → sends verification email
- "Check your email" confirmation screen

### 3. Route Addition (App.tsx)
```tsx
<Route path="/auth/test-signup/:token" element={<TestUserSignup />} />
```

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Token brute force | Low | 64-char hex = 2^256 entropy |
| Link forwarded to wrong person | Medium | Email must match token email |
| Mass link generation abuse | Low | Admin-only, audit trail via created_by |
| Orphaned orgs (link never used) | Low | 7-day expiry + cleanup cron |
| Credit abuse | Low | Credits only granted once (used_at check) |
| Test user creates real org later | Low | Normal onboarding still works, test org stays separate |

---

## Execution Plan

| # | Story | Type | Est. | Dependencies |
|---|-------|------|------|-------------|
| 1 | Create `test_user_magic_links` migration + RLS | schema | 15m | — |
| 2 | Build `generate-test-user-link` edge function | backend | 30m | Story 1 |
| 3 | Build `validate-test-user-link` edge function | backend | 20m | Story 1 |
| 4 | Build `complete-test-user-signup` edge function | backend | 45m | Stories 1-3 |
| 5 | Add "Magic Links" tab to Users.tsx with generation dialog | frontend | 40m | Story 2 |
| 6 | Build `TestUserSignup` page + route | frontend | 40m | Stories 3-4 |
| 7 | Add post-verification redirect logic (skip onboarding) | frontend | 20m | Story 6 |
| 8 | Config: Add edge functions to config.toml | config | 5m | Stories 2-4 |

**Total Estimate**: 3-4 hours
**Parallel Opportunities**: Stories 5+6 can run in parallel after backend is done

---

## Deep Research Findings (Agent Teams)

### Onboarding Skip Mechanism (Exact)

The `ProtectedRoute.tsx` checks `user_onboarding_progress` table. To skip onboarding, ALL of these must be true:
- `onboarding_completed_at` is NOT NULL
- `onboarding_step` = `'complete'`
- `skipped_onboarding` = `false` or `true` (either works)

The `complete_invite_signup(p_token)` RPC already does this:
```sql
INSERT INTO user_onboarding_progress (user_id, onboarding_step, onboarding_completed_at, skipped_onboarding)
VALUES (v_user_id, 'complete', NOW(), false)
ON CONFLICT (user_id) DO UPDATE SET
  onboarding_step = 'complete',
  onboarding_completed_at = NOW(),
  skipped_onboarding = false;
```

Our `complete-test-user-signup` edge function must replicate this exact pattern.

### AuthCallback.tsx Gotcha (MAGIC-007)

Lines 571-606 auto-complete onboarding for users who "joined existing org" — BUT the check is:
```typescript
memberships.some(m => m.role === 'member')
```

Our test user gets `role='owner'`, NOT `'member'`. This means the auto-complete path WON'T trigger for them. However, since we explicitly set `user_onboarding_progress.onboarding_completed_at` in the edge function, the later check at lines 618-620 will pass:
```typescript
if (!progress || (!progress.onboarding_completed_at && !progress.skipped_onboarding)) {
  navigate('/onboarding', { replace: true });
} else {
  navigate(next, { replace: true }); // ← This path, goes to dashboard
}
```

So no code change needed in AuthCallback — the existing flow handles it.

### Credit System Integration

Key finding: `admin_grant_credits()` requires `is_platform_admin()` which checks `auth.uid()`. Since the edge function runs as service role (no user context), we need to either:
1. Call `add_credits()` directly (bypasses admin check) — RECOMMENDED for edge function
2. Set up a custom RPC without the admin check

`add_credits(org_id, amount, type, description, stripe_id, created_by)` is the underlying function. Call with `type='admin_grant'` and `created_by=admin_user_id` (from the token's `created_by` field).

### Admin UI Pattern (AuthCodeGenerator)

The existing AuthCodeGenerator component (398 lines) provides the exact pattern:
- State: codes list, isLoading, isCreating, searchQuery, newCode form
- Layout: header → create form → search → table
- Table: inline editing, copy buttons, delete with AlertDialog
- Actions: Create, Edit, Delete, Copy, Generate Random

The MagicLinkGenerator should follow this same structure but with org name + email + test user checkbox.

### Organization Table Minimum Fields

To create an org, only `name` is required. All other fields have defaults:
- `is_active` defaults to `true`
- `company_enrichment_status` defaults to `'not_started'`
- `currency_code` defaults to `'GBP'`
- `currency_locale` defaults to `'en-GB'`

---

## Ideas & Enhancements (Future)

1. **Bulk generation**: CSV upload of emails → generate multiple links at once
2. **Custom credit amounts**: Admin sets credit amount per link (not just 500)
3. **Link analytics**: Track when link was opened (not just used)
4. **Slack notification**: Notify admin when a test user activates
5. **Template orgs**: Pre-load test orgs with sample deals, contacts, meetings
6. **Expiry extension**: Allow admin to extend link expiry without regenerating
7. **Auto-email sending**: Send the magic link directly via email from the platform (using existing email infra)
