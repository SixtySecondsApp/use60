# Progress Log — Token Refresh Reliability & User Notifications

## Overview

Fix Google OAuth token refresh reliability and notify users when reconnection is needed.

### Problem Summary

User's Google token expired on Jan 23rd, but:
- `token_status` still shows "valid" (though `expires_at` is in the past)
- No notification was sent
- Calendar sync stopped, MeetingBaaS bot won't join meetings

### Root Causes

1. **4-hour cron gap**: Tokens can expire between runs
2. **15-minute refresh window too narrow**: Many tokens get skipped
3. **No detection of already-expired tokens**: Only checks "expiring soon"
4. **No user notifications**: TODO at line 202 never implemented

---

## Features

| Feature | Stories | Priority | Status |
|---------|---------|----------|--------|
| Token Refresh Reliability | 3 | 1 | ⏳ Pending |
| User Notifications | 4 | 2 | ⏳ Pending |

---

## Dependency Graph

```
┌───────────────────────────────────────────────────────────────┐
│           TOKEN REFRESH RELIABILITY & NOTIFICATIONS           │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────────────────────────────────┐              │
│  │ PARALLEL: Token Refresh Fixes               │              │
│  │                                             │              │
│  │  TOK-001 (cron freq)  ────────────┐         │              │
│  │  TOK-002 (window)     ────────────┼─────┐   │              │
│  │  TOK-003 (expired)    ────────────┘     │   │              │
│  └─────────────────────────────────────────┼───┘              │
│                                            │                  │
│                                            ▼                  │
│                                                               │
│  NOT-001 (schema) ───────────────────────────┐                │
│         │                                    │                │
│         └────────────────────┬───────────────┼───┐            │
│                              │               │   │            │
│                              ▼               │   │            │
│                         NOT-002 (backend) ◄──┘   │            │
│                              │                   │            │
│                              │                   ▼            │
│                              │            NOT-003 (banner)    │
│                              │                   │            │
│                              │                   ▼            │
│                              │            NOT-004 (layout)    │
│                              │                                │
└──────────────────────────────┴────────────────────────────────┘
```

---

## Feature 1: Token Refresh Reliability

**Goal**: Prevent tokens from expiring silently by increasing check frequency and catching already-expired tokens

### Stories

| ID | Title | Status | Time | Parallel |
|----|-------|--------|------|----------|
| TOK-001 | Increase cron frequency (4h → 1h) | ⏳ Pending | ~5m | Yes |
| TOK-002 | Expand refresh window (15m → 60m) | ⏳ Pending | ~5m | Yes |
| TOK-003 | Detect already-expired tokens | ⏳ Pending | ~10m | Yes |

### Key Changes

**vercel.json** (TOK-001):
```diff
- "schedule": "30 */4 * * *"
+ "schedule": "0 * * * *"
```

**google-token-refresh/index.ts** (TOK-002, TOK-003):
```typescript
// TOK-002: Expand window
const REFRESH_WINDOW_MS = 60 * 60 * 1000; // 1 hour (was 15 minutes)

// TOK-003: Detect expired tokens
const isExpired = expiresAtDate.getTime() < now.getTime();
const isExpiringSoon = timeUntilExpiry <= REFRESH_WINDOW_MS && timeUntilExpiry > 0;

if (isExpired) {
  console.log(`[google-token-refresh] Token EXPIRED for user ${user_id}, attempting refresh`);
} else if (!isExpiringSoon) {
  results.push({ ... status: 'skipped' ... });
  continue;
}
```

---

## Feature 2: User Notifications

**Goal**: Notify users via Slack DM and in-app banner when their Google integration needs reconnection

### Stories

| ID | Title | Status | Time | Depends On |
|----|-------|--------|------|------------|
| NOT-001 | Add user_id to integration_alerts | ⏳ Pending | ~10m | - |
| NOT-002 | Implement sendReconnectionNotification | ⏳ Pending | ~25m | NOT-001, TOK-003 |
| NOT-003 | Create IntegrationReconnectBanner | ⏳ Pending | ~20m | NOT-001 |
| NOT-004 | Add banner to AppLayout | ⏳ Pending | ~15m | NOT-003 |

### Notification Flow

```
Token Refresh Fails (permanent)
         │
         ▼
┌─────────────────────────────────────┐
│  sendReconnectionNotification()     │
│                                     │
│  1. Create integration_alert        │◄── In-app (banner will query this)
│     with user_id                    │
│                                     │
│  2. Get user's Slack integration    │
│                                     │
│  3. Send Slack DM via               │◄── Slack notification
│     sendSlackDM() from proactive    │
└─────────────────────────────────────┘
```

### Key Files

- `supabase/migrations/20260125000001_add_user_id_to_integration_alerts.sql` — Schema change
- `supabase/functions/google-token-refresh/index.ts` — Notification sender
- `supabase/functions/_shared/proactive/deliverySlack.ts` — Existing Slack DM infrastructure
- `src/components/integrations/IntegrationReconnectBanner.tsx` — New component
- `src/components/AppLayout.tsx` — Banner integration

---

## Codebase Patterns

### Slack DM (using existing infrastructure)

```typescript
import { sendSlackDM } from '../_shared/proactive/deliverySlack.ts';

// Get user's bot token
const { data: slackIntegration } = await supabase
  .from('slack_integrations')
  .select('access_token, bot_user_id')
  .eq('user_id', userId)
  .eq('is_active', true)
  .maybeSingle();

// Need to get Slack user ID from authed_user JSONB
const slackUserId = slackIntegration?.authed_user?.id;

if (slackIntegration && slackUserId) {
  await sendSlackDM({
    botToken: slackIntegration.access_token,
    slackUserId: slackUserId,
    text: 'Your Google integration needs reconnection',
    blocks: [...],
  });
}
```

### Banner Pattern (following TrialBanner)

```tsx
// Same pattern as TrialBanner in AppLayout
<ImpersonationBanner />
<ViewModeBanner />
<ExternalViewBanner />
<TrialBanner />
<IntegrationReconnectBanner /> {/* New - same position */}
```

### Integration Query Pattern

```typescript
// Use maybeSingle() since user might not have integration
const { data } = await supabase
  .from('google_integrations')
  .select('token_status, expires_at')
  .eq('user_id', user?.id)
  .maybeSingle();

const needsReconnect = data?.token_status === 'revoked' ||
                       data?.token_status === 'needs_reconnect' ||
                       new Date(data?.expires_at) < new Date();
```

---

## Testing Plan

| Test | Description |
|------|-------------|
| Expired token detection | Set expires_at to past date, verify refresh attempt |
| Slack notification | Verify DM received with reconnect button |
| In-app banner | Verify banner appears when token_status='revoked' |
| Happy path | Verify normal token refresh still works |
| Reconnection flow | Verify user can reconnect and banner disappears |

---

## Quality Gates

| Gate | Status | When |
|------|--------|------|
| Lint (changed files) | Required | Every story |
| Type check | Required | NOT-003, NOT-004 |
| Build | Required | Feature complete |
| Manual Test | Required | After all stories |

---

## Session Log

*No sessions recorded yet. Run `60/run` to begin execution.*

---

## Next Steps

```bash
# Start execution
60/run

# Or execute specific story
60/run --story TOK-001

# Check status
60/status --detail
```
