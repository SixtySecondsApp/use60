# Internal Meeting Prep — Manual Slack Test Guide (IMP-007)

## Overview

This guide covers manual end-to-end testing of the Internal Meeting Prep (IMP)
pipeline from calendar event classification through to Slack delivery and
manager pre-read forwarding.

---

## Prerequisites

1. A development Supabase project with the IMP migrations applied:
   - `20260222700001_internal_meeting_columns.sql` (IMP-001)
   - `20260222700002_internal_meeting_prep_config.sql` (IMP-002)

2. At least two user accounts in the same org with:
   - Slack connected (`slack_auth` rows)
   - One user with role `admin` or `owner` (acts as manager)
   - One user with role `member` (acts as rep)

3. The following edge functions deployed to staging:
   - `proactive-meeting-prep`
   - `agent-orchestrator`
   - `slack-interactive`

4. `SLACK_SIGNING_SECRET` set in edge function secrets.

---

## Test Scenarios

### Scenario 1: Internal 1:1 Meeting Detection

**Setup**

1. Insert a `calendar_events` row for the rep user:

```sql
INSERT INTO calendar_events (
  user_id, title, start_time, end_time,
  attendees_count, attendees, is_internal, meeting_type
) VALUES (
  '<rep-user-id>',
  'Weekly 1:1 with Manager',
  now() + interval '90 minutes',
  now() + interval '2 hours',
  2,
  '[{"email": "<rep-email>@<org-domain>"}, {"email": "<manager-email>@<org-domain>"}]',
  NULL,  -- unclassified — detector will fill this
  NULL
);
```

2. Trigger the `proactive-meeting-prep` function manually:

```bash
curl -X POST \
  "https://<project-ref>.supabase.co/functions/v1/proactive-meeting-prep" \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" \
  -d '{"action": "prep_single", "userId": "<rep-user-id>"}'
```

**Expected Result**

- `calendar_events.is_internal` updated to `true`
- `calendar_events.meeting_type` updated to `one_on_one`
- Rep receives a Slack DM with:
  - Header: "1:1 Prep: Weekly 1:1 with Manager"
  - Sections: Pipeline Overview, Coaching Points, Recent Wins, Suggested Discussion Points
  - Button: "Send to manager as pre-read" (if `manager_preread_enabled = true`)
  - Button: "View Full Prep" (links to app)

---

### Scenario 2: Pipeline Review Classification

**Setup**

Insert a calendar event with title containing "Pipeline Review":

```sql
INSERT INTO calendar_events (
  user_id, title, start_time, end_time,
  attendees_count, attendees, is_internal, meeting_type
) VALUES (
  '<rep-user-id>',
  'Thursday Pipeline Review',
  now() + interval '90 minutes',
  now() + interval '2 hours',
  5,
  '[{"email": "a@<org-domain>"}, {"email": "b@<org-domain>"}, {"email": "c@<org-domain>"}, {"email": "d@<org-domain>"}, {"email": "e@<org-domain>"}]',
  NULL,
  NULL
);
```

**Expected Result**

- `meeting_type = 'pipeline_review'`
- Slack DM contains:
  - Pipeline Math Summary (coverage ratio, target, closed so far)
  - Pipeline by Stage
  - Deals at Risk section
  - Recent Wins
  - Suggested Agenda

---

### Scenario 3: QBR Classification

**Setup**

```sql
INSERT INTO calendar_events (
  user_id, title, start_time, end_time,
  attendees_count, attendees, is_internal, meeting_type
) VALUES (
  '<rep-user-id>',
  'Q1 2026 QBR',
  now() + interval '90 minutes',
  now() + interval '3 hours',
  10,
  -- 10 internal attendees
  '[{"email": "a@<org-domain>"}, {"email": "b@<org-domain>"}, {"email": "c@<org-domain>"}]',
  NULL,
  NULL
);
```

**Expected Result**

- `meeting_type = 'qbr'`
- Slack DM contains:
  - Quarter Performance section (Q1 2026)
  - Win / Loss Breakdown
  - Competitive Mentions
  - Next Quarter Projection
  - Suggested QBR Agenda

---

### Scenario 4: Standup (Lightweight Prep)

**Setup**

```sql
INSERT INTO calendar_events (
  user_id, title, start_time, end_time,
  attendees_count, attendees, is_internal, meeting_type
) VALUES (
  '<rep-user-id>',
  'Daily Standup',
  now() + interval '90 minutes',
  now() + interval '105 minutes',
  6,
  '[{"email": "a@<org-domain>"}, {"email": "b@<org-domain>"}, {"email": "c@<org-domain>"}]',
  NULL,
  NULL
);
```

**Expected Result**

- `meeting_type = 'standup'`
- Slack DM is brief (lightweight), contains:
  - Yesterday / Since Last Standup
  - Deals Needing Help
  - Wins
  - Today's Focus
- No "Send to manager as pre-read" (lightweight format)

---

### Scenario 5: External Meeting — No Internal Prep

**Setup**

Insert a meeting with mixed internal/external attendees:

```sql
INSERT INTO calendar_events (
  user_id, title, start_time, end_time,
  attendees_count, attendees, is_internal, meeting_type
) VALUES (
  '<rep-user-id>',
  'Discovery Call with Prospect',
  now() + interval '90 minutes',
  now() + interval '2 hours',
  3,
  '[{"email": "alice@<org-domain>"}, {"email": "prospect@external.com"}, {"email": "ceo@external.com"}]',
  NULL,
  NULL
);
```

**Expected Result**

- `is_internal = false`, `meeting_type = 'external'`
- Standard external meeting prep is triggered (NOT internal prep)
- Rep receives the normal external meeting briefing (attendee enrichment, deal context)

---

### Scenario 6: Manager Pre-read Button

After receiving a 1:1 prep Slack message (Scenario 1):

1. Click "Send to manager as pre-read"
2. The `slack-interactive` function receives `imp_send_preread::<event_id>`

**Expected Result**

- Manager receives a condensed Slack DM with:
  - Header: "Pre-read: Weekly 1:1 with Manager"
  - Rep name, meeting time, meeting type
  - First 3 sections of the prep briefing
  - Footer: "Pre-read shared by [rep name] via 60 Copilot"

---

## Disabling Internal Prep for an Org

To disable internal prep for a specific org without touching defaults:

```sql
INSERT INTO agent_config_org_overrides
  (org_id, agent_type, config_key, config_value)
VALUES
  ('<org-id>', 'internal_meeting_prep', 'internal_prep_enabled', 'false')
ON CONFLICT (org_id, agent_type, config_key) DO UPDATE
  SET config_value = 'false', updated_at = now();
```

**Verify**: Trigger `proactive-meeting-prep` for an internal meeting — no internal
prep should be generated, and the event should be skipped silently.

---

## Disabling Specific Meeting Types

```sql
-- Disable standup prep for an org
INSERT INTO agent_config_org_overrides
  (org_id, agent_type, config_key, config_value)
VALUES
  ('<org-id>', 'internal_meeting_prep', 'standup_enabled', 'false')
ON CONFLICT (org_id, agent_type, config_key) DO UPDATE
  SET config_value = 'false', updated_at = now();
```

---

## Running the Automated Test Suite

```bash
# From the repo root
npm run test -- supabase/functions/proactive-meeting-prep/test-internal.ts

# With verbose output
npm run test -- supabase/functions/proactive-meeting-prep/test-internal.ts --reporter=verbose
```

Tests cover:
- `detectInternalMeeting`: same domain, mixed, solo, object attendees, fallback, unresolvable domain
- `classifyMeetingType`: all 6 types including edge cases and QBR priority over pipeline_review
- `generateInternalPrep`: structure tests for all 4 active types + external
- Scenario integration tests: manager 1:1, pipeline review, QBR, standup, external bypass

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `is_internal` not updated | Detector not running; check orchestrator job logs | Verify `internal_meeting_prep` event type is routed in orchestrator |
| No Slack DM received | `slack_auth` row missing for user | Check `slack_auth` table for the rep user_id |
| Pre-read not sent to manager | No admin/owner found with Slack connected | Ensure at least one org admin has `slack_auth` row |
| `internal_prep_enabled = false` log | Agent config override disabling prep | Check `agent_config_org_overrides` for the org |
| `org_domain_unresolvable` | `organizations.company_website` and user email both null | Set `company_website` in org settings |
