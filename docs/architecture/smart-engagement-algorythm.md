# Smart Engagement Algorithm - Implementation Plan

## Overview

Design an intelligent notification system that tracks user activity patterns, optimizes notification timing/frequency, and adapts based on feedback to make the AI feel like a helpful teammate rather than noisy software.

## Problem Statement

- Proactive AI notifications can overwhelm users if sent too frequently
- No current tracking of when users are most active or engaged
- No feedback mechanism for notification preferences
- Need to re-engage inactive users without being annoying

## Goals

1. Track user engagement - Know when users are active, what they interact with
2. Smart timing - Send notifications when users are most likely to act on them
3. Adaptive frequency - Adjust notification volume based on user behavior
4. Feedback loop - Let users indicate if they want more/less via Slack buttons
5. Re-engagement - Intelligently bring back inactive users

## Configuration (Confirmed)

| Setting | Value | Notes |
|---------|-------|-------|
| Default Frequency | Moderate | 2/hour max, 8/day |
| Re-engagement | Moderate | 3-day first nudge, 2-3/week |
| Feedback Timing | Every 2 weeks | Or after 20 notifications |
| Admin Dashboard | Yes | Include in Phase 1 |

---

## Implementation Progress

### Phase Status Legend
| Status | Meaning |
|--------|---------|
| 🔴 | Not Started |
| 🟡 | In Progress |
| 🟢 | Complete |
| ⏸️ | Blocked |

### Progress Summary

| Phase | Name | Status | Progress |
|-------|------|--------|----------|
| 1 | Foundation (Database + Tracking + Admin) | 🟢 | 5/5 tasks |
| 2 | Smart Timing + Frequency | 🟢 | 4/4 tasks |
| 3 | Feedback Loop | 🟢 | 4/4 tasks |
| 4 | Re-engagement | 🟢 | 4/4 tasks |
| 5 | Process Map Integration | 🟢 | 1/1 tasks |

---

## Phase 1: Foundation (Database + Basic Tracking + Admin View) 🟢

**Status:** Complete
**Dependencies:** None
**Completed:** 2026-01-02

### Tasks

- [x] 1.1 Create database migrations for engagement tables
- [x] 1.2 Add activity tracking to frontend (basic page views, actions)
- [x] 1.3 Enhance `slack-interactive` to log interactions
- [x] 1.4 Add `notification_interactions` logging to delivery functions
- [x] 1.5 Build admin engagement dashboard (user metrics, notification stats)
- [x] 1.6 Create compute-engagement Edge Function (bonus)
- [x] 1.7 Schedule daily cron job at 2 AM UTC (bonus)
- [x] 1.8 Add to Platform Admin sidebar (bonus)

### Files to Create/Modify

**New Files:**
- `supabase/migrations/YYYYMMDD_user_engagement_tables.sql`
- `src/lib/hooks/useActivityTracker.ts`
- `src/lib/services/activityService.ts`

**Modified Files:**
- `supabase/functions/slack-interactive/index.ts`
- `supabase/functions/_shared/proactive/deliverySlack.ts`
- `src/App.tsx` (add activity tracker provider)

### Technical Details

<details>
<summary>1.1 Database Tables (click to expand)</summary>

#### user_engagement_metrics - Core user activity tracking

```sql
CREATE TABLE user_engagement_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  org_id UUID NOT NULL REFERENCES organizations(id),

  -- Activity timestamps
  last_app_active_at TIMESTAMPTZ,
  last_slack_active_at TIMESTAMPTZ,
  last_notification_clicked_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,

  -- Activity patterns (computed)
  typical_active_hours JSONB,              -- {mon: [9,10,11,14,15], tue: [...]}
  peak_activity_hour INTEGER,              -- Most active hour (0-23)
  avg_daily_sessions INTEGER,
  avg_session_duration_minutes INTEGER,

  -- Engagement scores (0-100)
  app_engagement_score INTEGER DEFAULT 50,
  slack_engagement_score INTEGER DEFAULT 50,
  notification_engagement_score INTEGER DEFAULT 50,
  overall_engagement_score INTEGER DEFAULT 50,

  -- Notification preferences (learned)
  preferred_notification_frequency TEXT DEFAULT 'moderate',
  notification_fatigue_level INTEGER DEFAULT 0,
  last_feedback_requested_at TIMESTAMPTZ,

  -- Timezone
  inferred_timezone TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX ON user_engagement_metrics(user_id);
CREATE INDEX ON user_engagement_metrics(org_id, overall_engagement_score);
```

#### user_activity_events - Raw activity event log

```sql
CREATE TABLE user_activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  org_id UUID NOT NULL REFERENCES organizations(id),

  -- Event details
  event_type TEXT NOT NULL,       -- app_pageview, app_action, slack_button_click, etc.
  event_source TEXT NOT NULL,     -- app, slack, email
  event_category TEXT,            -- deals, meetings, tasks, contacts, settings

  -- Context
  entity_type TEXT,
  entity_id UUID,
  action_detail TEXT,

  -- Timing
  event_at TIMESTAMPTZ DEFAULT NOW(),
  day_of_week INTEGER,            -- 0-6
  hour_of_day INTEGER,            -- 0-23

  -- Session tracking
  session_id UUID,
  metadata JSONB
);
CREATE INDEX ON user_activity_events(user_id, event_at DESC);
CREATE INDEX ON user_activity_events(event_type, event_at DESC);
```

#### notification_interactions - Track notification engagement

```sql
CREATE TABLE notification_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  org_id UUID NOT NULL REFERENCES organizations(id),

  -- Notification reference
  notification_id UUID,
  slack_notification_sent_id UUID,
  notification_type TEXT NOT NULL,

  -- Delivery details
  delivered_at TIMESTAMPTZ NOT NULL,
  delivered_via TEXT NOT NULL,    -- slack_dm, slack_channel, in_app

  -- Interaction tracking
  seen_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  action_taken TEXT,
  time_to_interaction_seconds INTEGER,

  -- Feedback
  feedback_rating TEXT,           -- helpful, not_helpful, too_frequent
  feedback_at TIMESTAMPTZ,

  -- Context at delivery
  user_was_active BOOLEAN,
  hour_of_day INTEGER,
  day_of_week INTEGER
);
CREATE INDEX ON notification_interactions(user_id, delivered_at DESC);
CREATE INDEX ON notification_interactions(notification_type, delivered_at DESC);
```

#### notification_feedback - Explicit user feedback

```sql
CREATE TABLE notification_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  org_id UUID NOT NULL REFERENCES organizations(id),

  feedback_type TEXT NOT NULL,
  feedback_value TEXT NOT NULL,
  feedback_source TEXT NOT NULL,

  notification_type TEXT,
  triggered_by_notification_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON notification_feedback(user_id, created_at DESC);
```

</details>

<details>
<summary>1.2 Activity Tracking Implementation (click to expand)</summary>

#### Frontend Activity Tracker
- Track page views, button clicks, time on page
- Send batched events every 30 seconds to avoid overhead
- Track session start/end

#### Slack Interaction Tracking
- Log all button clicks to `user_activity_events`
- Track notification read receipts where possible
- Record time between notification and interaction

</details>

---

## Phase 2: Smart Timing + Frequency 🟢

**Status:** Complete
**Dependencies:** Phase 1 complete
**Completed:** 2026-01-02

### Tasks

- [x] 2.1 Implement engagement score computation function
- [x] 2.2 Create notification queue table and processor
- [x] 2.3 Implement `calculateOptimalSendTime` algorithm
- [x] 2.4 Add frequency limiter to notification delivery
- [x] 2.5 Create shared engagement module (bonus)
- [x] 2.6 Add cron job for queue processing (bonus)

### Files Created

**New Files:**
- `supabase/functions/_shared/engagement/types.ts` - Shared types and interfaces
- `supabase/functions/_shared/engagement/config.ts` - Configuration constants
- `supabase/functions/_shared/engagement/metrics.ts` - Engagement score computation
- `supabase/functions/_shared/engagement/timing.ts` - Optimal send time algorithm
- `supabase/functions/_shared/engagement/frequency.ts` - Frequency limiting logic
- `supabase/functions/_shared/engagement/index.ts` - Module exports
- `supabase/functions/process-notification-queue/index.ts` - Queue processor
- `supabase/migrations/20260102200001_notification_queue.sql` - Queue table + functions

**Modified Files:**
- `supabase/functions/cron-admin/index.ts` - Added queue processor to manual triggers

### Technical Details

<details>
<summary>2.1 Optimal Send Time Calculator (click to expand)</summary>

```typescript
interface SendTimeRecommendation {
  recommendedTime: Date;
  confidence: number;        // 0-1
  reasoning: string;
  fallbackTime: Date;
}

function calculateOptimalSendTime(
  userId: string,
  notificationType: string,
  urgency: 'low' | 'medium' | 'high' | 'urgent'
): SendTimeRecommendation {
  // 1. Get user's engagement metrics
  // 2. Analyze historical interaction patterns
  // 3. Determine optimal hour based on:
  //    - User's typical active hours
  //    - Historical notification interaction times
  //    - Day of week patterns
  //    - Notification type patterns
  // 4. Factor in urgency:
  //    - urgent: send immediately
  //    - high: send within 2 hours of optimal time
  //    - medium: wait for optimal time (within 8 hours)
  //    - low: wait for optimal time (within 24 hours)
}
```

</details>

<details>
<summary>2.2 Frequency Limiter (click to expand)</summary>

```typescript
const FREQUENCY_PROFILES = {
  low: { maxPerHour: 1, maxPerDay: 3, minTimeBetween: 120, cooldownAfterDismiss: 240 },
  moderate: { maxPerHour: 2, maxPerDay: 8, minTimeBetween: 45, cooldownAfterDismiss: 120 },
  high: { maxPerHour: 4, maxPerDay: 15, minTimeBetween: 15, cooldownAfterDismiss: 60 },
};

async function shouldSendNotification(
  userId: string,
  notificationType: string,
  urgency: string
): Promise<{ shouldSend: boolean; reason: string; delayUntil?: Date }> {
  // Check hourly/daily limits
  // Check fatigue level (>70 = suppress)
  // Urgent notifications bypass some limits
}
```

</details>

<details>
<summary>2.3 Notification Queue Table (click to expand)</summary>

```sql
CREATE TABLE notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  org_id UUID NOT NULL,

  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  payload JSONB NOT NULL,

  scheduled_for TIMESTAMPTZ NOT NULL,
  urgency TEXT NOT NULL DEFAULT 'medium',
  priority INTEGER DEFAULT 50,
  status TEXT DEFAULT 'pending',  -- pending, sent, cancelled, expired

  dedupe_key TEXT,
  reason_for_time TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);
CREATE INDEX ON notification_queue(status, scheduled_for);
CREATE INDEX ON notification_queue(user_id, status);
```

</details>

<details>
<summary>2.4 Engagement Score Computation (click to expand)</summary>

```sql
CREATE OR REPLACE FUNCTION compute_user_engagement_metrics(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_app_score INTEGER;
  v_slack_score INTEGER;
  v_notification_score INTEGER;
  v_overall_score INTEGER;
BEGIN
  -- Calculate app engagement (last 30 days)
  -- Calculate Slack engagement
  -- Calculate notification engagement (click rate)
  -- Overall weighted score: app*0.4 + slack*0.3 + notification*0.3
  -- Calculate typical active hours and peak hour
  -- Upsert metrics
END;
$$ LANGUAGE plpgsql;

-- Run daily via pg_cron at 3 AM
SELECT cron.schedule('compute-engagement-metrics', '0 3 * * *', $$...$$);
```

</details>

---

## Phase 3: Feedback Loop 🟢

**Status:** Complete
**Dependencies:** Phase 2 complete
**Completed:** 2026-01-02

### Tasks

- [x] 3.1 Add bi-weekly feedback Slack messages
- [x] 3.2 Implement feedback button handlers in `slack-interactive`
- [x] 3.3 Add subtle per-notification feedback option
- [x] 3.4 Create preference adjustment logic
- [x] 3.5 Create feedback request Edge Function (bonus)
- [x] 3.6 Add cron job for daily feedback requests (bonus)

### Files Created

**New Files:**
- `supabase/functions/_shared/engagement/feedback.ts` - Feedback utilities and block builders
- `supabase/functions/send-feedback-requests/index.ts` - Edge Function for sending feedback requests
- `supabase/migrations/20260102200002_feedback_functions.sql` - Database functions for feedback

**Modified Files:**
- `supabase/functions/slack-interactive/index.ts` - Added per-notification feedback handlers
- `supabase/functions/_shared/engagement/index.ts` - Export feedback functions
- `supabase/functions/cron-admin/index.ts` - Added feedback request to manual triggers

### Technical Details

<details>
<summary>3.1 Periodic Feedback Request (click to expand)</summary>

Every 2 weeks (or after 20 notifications), ask users:

```typescript
const feedbackMessage = {
  blocks: [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "Hey! Just checking in - how are you finding the notifications from 60? :thinking_face:"
      }
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Want more" },
          style: "primary",
          action_id: "notification_feedback_more",
          value: "more"
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Just right" },
          action_id: "notification_feedback_right",
          value: "just_right"
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Too many" },
          style: "danger",
          action_id: "notification_feedback_less",
          value: "less"
        }
      ]
    }
  ]
};
```

</details>

<details>
<summary>3.2 Feedback Processing (click to expand)</summary>

```typescript
async function processNotificationFeedback(
  userId: string,
  feedbackValue: 'more' | 'just_right' | 'less' | 'helpful' | 'not_helpful'
) {
  if (feedbackValue === 'more') {
    await updateFrequencyPreference(userId, 'high');
    await resetFatigueLevel(userId);
  } else if (feedbackValue === 'less') {
    await updateFrequencyPreference(userId, 'low');
    await increaseFatigueLevel(userId, 30);
  } else if (feedbackValue === 'just_right') {
    await logPositiveFeedback(userId);
  }

  // Send confirmation
  const messages = {
    more: "Got it! I'll send you more updates. :rocket:",
    less: "Understood! I'll be more selective with updates. :zipper_mouth_face:",
    just_right: "Perfect! I'll keep things just as they are. :ok_hand:",
  };
  await sendSlackMessage(userId, messages[feedbackValue]);
}
```

</details>

---

## Phase 4: Re-engagement 🟢

**Status:** Complete
**Dependencies:** Phase 3 complete
**Completed:** 2026-01-02

### Tasks

- [x] 4.1 Implement user segmentation logic
- [x] 4.2 Create re-engagement notification types
- [x] 4.3 Add content-driven triggers (emails, upcoming meetings)
- [x] 4.4 Build re-engagement scheduler

### Files Created

**New Files:**
- `supabase/functions/_shared/engagement/segmentation.ts` - User segmentation helpers and transitions
- `supabase/functions/_shared/engagement/reengagement.ts` - Re-engagement notification types and builders
- `supabase/functions/process-reengagement/index.ts` - Re-engagement processor Edge Function
- `supabase/migrations/20260102200003_reengagement.sql` - Re-engagement database functions

**Modified Files:**
- `supabase/functions/_shared/engagement/index.ts` - Export segmentation and re-engagement functions
- `supabase/functions/cron-admin/index.ts` - Add process-reengagement to manual triggers

### Technical Details

<details>
<summary>4.1 User Segments (click to expand)</summary>

```typescript
type UserSegment =
  | 'power_user'    // >5 sessions/week, high engagement
  | 'regular'       // 2-5 sessions/week
  | 'casual'        // <2 sessions/week
  | 'at_risk'       // Declining engagement
  | 'dormant'       // No activity 7+ days
  | 'churned';      // No activity 30+ days

function calculateUserSegment(metrics: UserEngagementMetrics): UserSegment {
  const daysSinceActive = daysSince(metrics.last_app_active_at);

  if (daysSinceActive > 30) return 'churned';
  if (daysSinceActive > 7) return 'dormant';
  if (isEngagementDeclining(metrics)) return 'at_risk';
  if (metrics.avg_daily_sessions > 1) return 'power_user';
  if (metrics.avg_daily_sessions > 0.3) return 'regular';
  return 'casual';
}
```

</details>

<details>
<summary>4.2 Re-engagement Triggers (click to expand)</summary>

```typescript
const RE_ENGAGEMENT_TRIGGERS = {
  dormant: {
    after_days: 3,
    notification_type: 'gentle_nudge',
    message: "Hey {name}, you've got {deal_count} deals in motion. Here's what's happening..."
  },
  at_risk: {
    after_days: 5,
    notification_type: 'value_reminder',
    message: "Your meetings this week: {meetings}. I've got prep ready when you need it."
  },
  churned: {
    after_days: 14,
    notification_type: 'win_back',
    message: "Miss you! {company_name} sent an email - want me to catch you up?"
  }
};
```

**Content-Driven Triggers** (instead of generic "come back" messages):
- New email received from key contact
- Deal stage change detected
- Meeting coming up tomorrow
- Competitor mentioned in news
- Champion changed jobs

</details>

---

## Phase 5: Process Map Integration 🟢

**Status:** Complete
**Dependencies:** Phase 1 complete (minimum)
**Completed:** 2026-01-02

### Tasks

- [x] 5.1 Add Smart Engagement as option on platform admin Process Map page

### Files Modified

**Modified Files:**
- `src/pages/admin/ProcessMaps.tsx` - Added 'smart_engagement' workflow to AVAILABLE_PROCESSES

---

## Success Metrics

| Metric | Target | Current Baseline |
|--------|--------|------------------|
| Notification Click Rate | >25% | TBD |
| 7-day User Retention | Increase | TBD |
| Feedback Score ("just right" or "want more") | >80% | N/A |
| Average Response Time | Decrease | TBD |
| Dormant User Re-activation | Increase | TBD |

---

## Changelog

| Date | Phase | Change | Author |
|------|-------|--------|--------|
| 2024-XX-XX | All | Initial plan created | - |
| 2026-01-02 | 1 | Phase 1 complete: database, tracking, dashboard, cron | Claude |
| 2026-01-02 | 2 | Phase 2 complete: notification queue, optimal timing, frequency limiting | Claude |
| 2026-01-02 | 3 | Phase 3 complete: feedback loop, preference adjustment, per-notification feedback | Claude |
| 2026-01-02 | 4 | Phase 4 complete: user segmentation, re-engagement types, content triggers, scheduler | Claude |
| 2026-01-02 | 5 | Phase 5 complete: Smart Engagement added to Process Map admin page | Claude |

