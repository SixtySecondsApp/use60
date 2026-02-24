# Waitlist Invitation Flow - Visual Testing Guide

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     WAITLIST ADMIN PANEL                    │
│                  (WaitlistTable.tsx)                        │
│                                                             │
│  [Pending Entry] → [Click ✓ Button] → grantAccess()       │
│                                              ↓              │
│                                    Toast: "Invitation sent" │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                   SUPABASE EDGE FUNCTION                    │
│           (send-waitlist-invitation)                        │
│                                                             │
│  1. Create Auth User (magic link)                          │
│  2. Send Email (via encharge-send-email)                   │
│  3. Update DB (status: released)                           │
│  4. Return: { success: true }                              │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                     USER RECEIVES EMAIL                     │
│                                                             │
│  From: noreply@use60.com                                   │
│  Subject: Welcome to Sixty Seconds! Set Your Password      │
│  [Click Link] → https://app.use60.com/auth/callback?...   │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                    AUTH CALLBACK PAGE                       │
│                 (AuthCallback.tsx)                          │
│                                                             │
│  1. Verify token (OAuth/Magic link)                        │
│  2. Create profile (upsert)                                │
│  3. LINK WAITLIST ENTRY (user_id)                          │
│  4. Detect email domain:                                   │
│     Corporate? → Org detection                             │
│     Personal?  → Set needs_website_input flag              │
│  5. Redirect → /dashboard (password modal)                 │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                   USER SETS PASSWORD                        │
│                                                             │
│  [Password Modal] → [Set Password] → Authenticated         │
│  [Close Modal] → Proceed to onboarding                     │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                    ONBOARDING FLOW                          │
│                                                             │
│  Corporate Emails:  Enrichment → Skills → Complete         │
│  Personal Emails:   Website → Enrichment → Skills → Comp.  │
│                                                             │
│  Completion recorded in: user_onboarding_progress          │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                      DASHBOARD LOAD                         │
│                    (Dashboard.tsx)                          │
│                                                             │
│  useEffect runs:                                           │
│  1. Check: waitlist_entry_id in metadata? ✓                │
│  2. Check: onboarding_completed_at? ✓                      │
│  3. Update: status='converted', converted_at=NOW()         │
│  4. Clear: waitlist_entry_id from metadata                 │
│                                                             │
│  User now sees dashboard with full access                  │
└─────────────────────────────────────────────────────────────┘

Status Transitions:
  pending ──[Admin sends]──> released ──[User completes]──> converted
```

---

## Database State at Each Step

### Step 1: After Invitation Sent

```sql
SELECT id, email, status, user_id, invited_at, converted_at
FROM meetings_waitlist
WHERE email = 'user@example.com';

┌───────┬───────────────┬──────────┬─────────┬──────────────┬─────────────┐
│ id    │ email         │ status   │ user_id │ invited_at   │ converted_at│
├───────┼───────────────┼──────────┼─────────┼──────────────┼─────────────┤
│ abc.. │ user@exa..    │ released │ NULL    │ 2024-01-16.. │ NULL        │
└───────┴───────────────┴──────────┴─────────┴──────────────┴─────────────┘

Status: ✅ CORRECT - Released, no user_id yet
```

---

### Step 2: After User Clicks Link (AuthCallback)

```sql
SELECT id, email, status, user_id, invited_at, converted_at
FROM meetings_waitlist
WHERE email = 'user@example.com';

┌───────┬───────────────┬──────────┬──────────────┬──────────────┬─────────────┐
│ id    │ email         │ status   │ user_id      │ invited_at   │ converted_at│
├───────┼───────────────┼──────────┼──────────────┼──────────────┼─────────────┤
│ abc.. │ user@exa..    │ released │ user_12345.. │ 2024-01-16.. │ NULL        │
└───────┴───────────────┴──────────┴──────────────┴──────────────┴─────────────┘

Status: ✅ CORRECT - user_id linked, status still released
```

---

### Step 3: After Onboarding Complete (Dashboard)

```sql
SELECT id, email, status, user_id, invited_at, converted_at
FROM meetings_waitlist
WHERE email = 'user@example.com';

┌───────┬───────────────┬──────────┬──────────────┬──────────────┬──────────────┐
│ id    │ email         │ status   │ user_id      │ invited_at   │ converted_at │
├───────┼───────────────┼──────────┼──────────────┼──────────────┼──────────────┤
│ abc.. │ user@exa..    │ converted│ user_12345.. │ 2024-01-16.. │ 2024-01-16.. │
└───────┴───────────────┴──────────┴──────────────┴──────────────┴──────────────┘

Status: ✅ CORRECT - Converted with timestamp
```

---

## Browser Console Output Timeline

### When Admin Sends Invitation

```javascript
// [grantAccess] Called with:
//   entryId: "abc123..."
//   adminUserId: "admin456..."

// ✅ [waitlistAdminService] Invoking send-waitlist-invitation edge function

// ✅ [Edge Function Response] { success: true }

// ✅ Toast: "Invitation sent to user@example.com"
```

---

### When User Clicks Link

```javascript
// [AuthCallback] Starting callback processing
// [AuthCallback] Found access_token in URL hash, waiting for Supabase to process...
// [AuthCallback] Initial session check: hasSession: false
// [AuthCallback] Verifying OTP with token_hash and type: magiclink
// ✅ [AuthCallback] Session created from verifyOtp
// [AuthCallback] Ensuring profile exists for user: user_12345...
// ✅ [AuthCallback] Successfully ensured profile exists
// [AuthCallback] Personal email detected: gmail.com, will request website input during onboarding
// ✅ [AuthCallback] Successfully linked waitlist entry to user: abc123...
// [AuthCallback] Setting up invited user for password setup on dashboard: abc123...
// [AuthCallback] Setting needs_password_setup flag
// ✅ [AuthCallback] Redirecting to dashboard with password modal
```

---

### When User Reaches Dashboard

```javascript
// 📊 Dashboard auth state:
//   hasSession: true
//   hasUserData: true
//   userId: user_12345...
//   isLoadingUser: false

// [Dashboard] Checking waitlist conversion...
// [Dashboard] Found waitlist_entry_id in metadata: abc123...
// [Dashboard] User has completed onboarding: true

// ✅ [Dashboard] Waitlist entry marked as converted: abc123...
// [Dashboard] Cleared waitlist_entry_id from user metadata
```

---

## Visual Testing Checklist

### Admin Perspective

```
┌─ WAITLIST PAGE ────────────────────────────────────────┐
│                                                        │
│ Entry: john@acme.com                 Status: Pending  │
│ ┌──────────────────────────────────┐                 │
│ │ Click this button to send invite │                 │
│ │            [✓ Check]             │                 │
│ └──────────────────────────────────┘                 │
│         ✅ Button is clickable                        │
│         ✅ Button shows check icon                    │
│         ✅ Button disabled while processing           │
│         ✅ Green toast appears: "Invitation sent..."  │
│         ✅ Status may update to "Released"           │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

### User Email Perspective

```
┌─ EMAIL INBOX ──────────────────────────────────────────┐
│                                                        │
│ [New] Welcome to Sixty Seconds! Set Your Password     │
│ From: noreply@use60.com                              │
│ Date: Just now                                        │
│                                                        │
│ Email Content:                                         │
│ ┌────────────────────────────────────────────────────┐│
│ │ Hi John,                                            ││
│ │                                                     ││
│ │ Welcome to Sixty Seconds! 🎉                       ││
│ │                                                     ││
│ │ Click the link below to set your password and get  ││
│ │ started:                                            ││
│ │                                                     ││
│ │ [Set Your Password] ← CLICK THIS LINK              ││
│ │                                                     ││
│ │ Link expires in 7 days.                            ││
│ │                                                     ││
│ │ Questions? Contact support@use60.com               ││
│ │                                                     ││
│ └────────────────────────────────────────────────────┘│
│                                                        │
│ ✅ Email received quickly (1-2 minutes)               │
│ ✅ Subject is correct                                 │
│ ✅ Link is clickable                                  │
│ ✅ Link contains magic token                          │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

### User Browser Perspective

#### Step 1: Password Setup

```
┌─ PASSWORD SETUP MODAL ─────────────────────────────────┐
│                                                        │
│  Set Your Password                                    │
│                                                        │
│  Email: john@acme.com                                │
│  Password: [________________] ← User types here       │
│                                                        │
│  [Cancel]  [Set Password]                            │
│                                                        │
│ ✅ Modal appears automatically                        │
│ ✅ Email is pre-filled                                │
│ ✅ Password field is focused                          │
│ ✅ Button disabled until password entered             │
│                                                        │
└────────────────────────────────────────────────────────┘
```

#### Step 2: Onboarding (Corporate Email)

```
┌─ ONBOARDING FLOW ──────────────────────────────────────┐
│                                                        │
│ Step 1: Enrichment                                   │
│  Company Name: Acme Corp  [_______________]          │
│  Industry: Technology     [_____dropdown__]          │
│  Company Size: 50-100     [_____dropdown__]          │
│                                                        │
│  [Next]                                              │
│                                                        │
│ ✅ No "What's your website?" step                     │
│ ✅ Goes straight to enrichment                        │
│ ✅ Corporate email recognized                         │
│                                                        │
│ Step 2: Skills Configuration                         │
│ [Skills selection interface...]                      │
│                                                        │
│ ✅ User configures their sales tools                  │
│                                                        │
│ Step 3: Complete!                                    │
│ [Celebration screen...]                              │
│                                                        │
│ ✅ Redirects to /dashboard                            │
│                                                        │
└────────────────────────────────────────────────────────┘
```

#### Step 3: Onboarding (Personal Email)

```
┌─ ONBOARDING FLOW ──────────────────────────────────────┐
│                                                        │
│ Step 1: What's your company website?                 │
│  Website: [_______________]                          │
│  Or: [I don't have a website yet]                    │
│                                                        │
│  [Next]                                              │
│                                                        │
│ ✅ Website input appears for personal email           │
│ ✅ Can enter domain OR skip for Q&A                   │
│                                                        │
│ [If website entered...]                              │
│  Step 2: Enrichment                                  │
│  [Same as corporate flow]                            │
│                                                        │
│ [If skipped...]                                      │
│  Step 2: Tell us about your company                  │
│  Company Name: [_______________]                     │
│  Industry: [dropdown]                                │
│  Size: [dropdown]                                    │
│                                                        │
│ ✅ Q&A for users without company website              │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

## Quick Status Check

### Use This to Verify Everything is Working

```javascript
// Paste this in browser console after signing up:

async function checkWaitlistStatus() {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: entry } = await supabase
    .from('meetings_waitlist')
    .select('*')
    .eq('user_id', user?.id)
    .maybeSingle();

  const { data: progress } = await supabase
    .from('user_onboarding_progress')
    .select('*')
    .eq('user_id', user?.id)
    .maybeSingle();

  console.log('=== WAITLIST STATUS ===');
  console.log('User:', user?.email);
  console.log('Waitlist Entry:', {
    email: entry?.email,
    status: entry?.status,
    user_id: entry?.user_id ? '✅ Linked' : '❌ Not linked',
    invited_at: entry?.invited_at,
    converted_at: entry?.converted_at,
  });
  console.log('Onboarding:', {
    completed: progress?.onboarding_completed_at ? '✅ Yes' : '❌ No',
    skipped: progress?.skipped_onboarding ? '✅ Yes' : '❌ No',
    completed_at: progress?.onboarding_completed_at,
  });

  // Overall status
  const isConverted = entry?.status === 'converted';
  const isOnboarded = progress?.onboarding_completed_at || progress?.skipped_onboarding;
  const isLinked = entry?.user_id;

  console.log('=== OVERALL STATUS ===');
  console.log(isLinked ? '✅ Waitlist linked' : '❌ Waitlist not linked');
  console.log(isOnboarded ? '✅ Onboarding complete' : '❌ Onboarding incomplete');
  console.log(isConverted ? '✅ Entry converted' : '❌ Entry not converted');
}

await checkWaitlistStatus();
```

**Expected Output:**
```
=== WAITLIST STATUS ===
User: john@acme.com
Waitlist Entry: {
  email: john@acme.com
  status: converted      ← Should be this
  user_id: ✅ Linked      ← Should be linked
  invited_at: 2024-01-16T...
  converted_at: 2024-01-16T...  ← Should be populated
}
Onboarding: {
  completed: ✅ Yes       ← Should be complete
  skipped: ❌ No
  completed_at: 2024-01-16T...
}
=== OVERALL STATUS ===
✅ Waitlist linked
✅ Onboarding complete
✅ Entry converted

All systems GO! ✅✅✅
```

---

## Test Result Matrix

| Scenario | Email Received | Link Works | Password Setup | Dashboard Access | Status Converted |
|----------|---|---|---|---|---|
| **Test 1: Basic Flow** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Test 2: Corporate Email** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Test 3: Existing Org** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Test 4: Personal + Website** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Test 5: Personal + Q&A** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Test 6: Status Tracking** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Test 7: Error Handling** | ❌ | N/A | N/A | N/A | ❌ |

---

## Success!

When all tests pass, you'll see:

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│               ✅✅✅ ALL TESTS PASSING ✅✅✅               │
│                                                          │
│  ✅ Invitations sent                                    │
│  ✅ Emails received                                     │
│  ✅ Links work                                          │
│  ✅ Passwords set                                       │
│  ✅ Onboarding completed                                │
│  ✅ Statuses converted                                  │
│  ✅ No errors                                           │
│  ✅ Database consistent                                 │
│                                                          │
│     🎉 Waitlist invitation flow is LIVE! 🎉             │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

