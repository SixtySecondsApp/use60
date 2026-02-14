# Scheduling Rules -- Comprehensive Reference

This document defines the rules, algorithms, and defaults that govern how the find-available-slots skill identifies, scores, and presents meeting time options. Every rule is designed for B2B sales scheduling where the goal is maximizing prospect acceptance rates while respecting professional boundaries.

---

## 1. Working Hours by Timezone

### Default Working Hours

When no explicit working hours are configured, apply these defaults based on the participant's timezone:

| Region | Default Start | Default End | Notes |
|--------|--------------|-------------|-------|
| US Eastern (ET) | 9:00 AM | 5:30 PM | Standard US business hours |
| US Central (CT) | 8:30 AM | 5:00 PM | Slightly earlier start common |
| US Mountain (MT) | 8:00 AM | 5:00 PM | Earlier start trend |
| US Pacific (PT) | 9:00 AM | 5:30 PM | Tech industry often later |
| UK (GMT/BST) | 9:00 AM | 5:30 PM | Standard UK business |
| Central Europe (CET) | 9:00 AM | 6:00 PM | Later end common in DACH/France |
| India (IST) | 10:00 AM | 7:00 PM | Later start for global overlap |
| Australia Eastern (AEST) | 8:30 AM | 5:00 PM | Earlier start common |
| Japan/Korea (JST/KST) | 9:00 AM | 6:00 PM | Longer days common |
| Singapore/HK (SGT/HKT) | 9:00 AM | 6:00 PM | Financial hub hours |

### Configurable Overrides

Working hours can be overridden at three levels (highest priority first):
1. **User-level setting** in platform preferences (per-user customization)
2. **Organization-level default** in org settings (company standard)
3. **Timezone-based default** from the table above (fallback)

### Extended Hours Policy

Some users work outside standard hours. The skill should:
- Never schedule a prospect-facing meeting outside the PROSPECT's working hours
- Allow the user's own schedule to extend to their configured hours
- Flag any slot that falls in the first or last 30 minutes of working hours as "edge of day"

---

## 2. Buffer Rules

### Standard Buffers

Buffers prevent back-to-back meeting fatigue and ensure participants have transition time.

| Buffer Type | Duration | When Applied |
|------------|----------|--------------|
| Pre-meeting buffer | 15 min | Before the proposed meeting start |
| Post-meeting buffer | 15 min | After the proposed meeting end |
| Back-to-back penalty buffer | 30 min | When participant already has 2+ consecutive meetings |
| Cross-timezone adjustment | +5 min | Added when meeting involves 3+ timezone difference |
| Executive meeting buffer | 20 min | When meeting involves C-level participants (detected from CRM title) |

### Buffer Calculation Logic

```
effective_start = meeting_start - pre_buffer
effective_end = meeting_end + post_buffer

A slot is valid only if the window [effective_start, effective_end]
does not overlap with any existing event's [effective_start, effective_end].
```

### Back-to-Back Chain Detection

Count consecutive meetings for each participant on the target day:

1. Two meetings in a row (gap < 15 min): apply standard buffers, flag as "busy stretch"
2. Three meetings in a row: add the 30-minute back-to-back penalty buffer, warn the user
3. Four or more in a row: do NOT schedule into this chain under any circumstances

A "gap" of less than 15 minutes between two events counts as consecutive (people need time to wrap up, use the restroom, grab water, refocus).

### Buffer Relaxation

When fewer than 3 slots are found with standard buffers:
1. First relaxation: reduce pre/post buffers to 10 minutes
2. Second relaxation: remove post-meeting buffer entirely (keep 10-min pre-buffer)
3. Never relax below 10 minutes pre-meeting buffer
4. Always note in the output when relaxed buffers were applied

---

## 3. Slot Scoring Algorithm

Each candidate slot receives a score from 0 to 100 based on six weighted factors. The weights are calibrated for B2B sales meeting scheduling.

### Factor 1: Time-of-Day Preference (25%)

Score based on the slot's start time in the PROSPECT's timezone:

| Time Range (Prospect TZ) | Score | Rationale |
|--------------------------|-------|-----------|
| 9:00 AM - 9:30 AM | 70 | Good but start-of-day, may be catching up |
| 9:30 AM - 11:00 AM | 95 | Peak focus, highest engagement window |
| 11:00 AM - 12:00 PM | 85 | Strong, but approaching lunch |
| 12:00 PM - 1:00 PM | 40 | Lunch hour, low acceptance |
| 1:00 PM - 2:00 PM | 75 | Post-lunch energy dip, but acceptable |
| 2:00 PM - 3:30 PM | 85 | Afternoon recovery, good engagement |
| 3:30 PM - 4:30 PM | 65 | End-of-day wind-down begins |
| 4:30 PM - 5:30 PM | 45 | Low energy, high cancellation risk |
| Before 9:00 AM | 20 | Too early, unprofessional unless requested |
| After 5:30 PM | 15 | After hours, respect boundaries |

**Override**: If the user specified a time_preference (e.g., "afternoon"), re-weight the matching range to 95 and reduce non-matching ranges proportionally.

### Factor 2: Day-of-Week Effectiveness (20%)

Based on B2B sales meeting acceptance and show-up rate data:

| Day | Score | Acceptance Rate (Industry Avg) | Notes |
|-----|-------|-------------------------------|-------|
| Monday | 60 | 68% | People catching up, planning week |
| Tuesday | 95 | 82% | Peak day for sales meetings |
| Wednesday | 90 | 80% | Strong mid-week engagement |
| Thursday | 85 | 78% | Good, but people start winding down |
| Friday | 40 | 58% | Lowest acceptance, highest no-show |
| Saturday | 5 | N/A | Never schedule unless explicitly requested |
| Sunday | 5 | N/A | Never schedule unless explicitly requested |

**Urgency override**: If urgency is "today" and today is Friday, do not penalize -- the user explicitly needs a same-day meeting.

### Factor 3: Timezone Friendliness (20%)

Score based on how well the slot fits ALL participants' core hours (10 AM - 3 PM local):

```
For each participant:
  If slot falls within 10 AM - 3 PM local: tz_score += 100
  If slot falls within 9 AM - 10 AM or 3 PM - 5 PM local: tz_score += 70
  If slot falls within 8 AM - 9 AM or 5 PM - 6 PM local: tz_score += 30
  If slot falls outside 8 AM - 6 PM local: tz_score += 0

Final timezone score = average(all participant tz_scores)
```

**Prospect weighting**: The prospect's timezone comfort is weighted 1.5x relative to internal participants. A slot at 10 AM for the prospect and 7 AM for the sales rep is better than 10 AM for the rep and 7 AM for the prospect.

### Factor 4: Calendar Density (15%)

Score based on the user's meeting load on the target day:

| Meetings on Day | Score | Rationale |
|-----------------|-------|-----------|
| 0-2 meetings | 95 | Light day, high energy available |
| 3-4 meetings | 75 | Moderate load, still fine |
| 5-6 meetings | 50 | Heavy day, fatigue risk |
| 7+ meetings | 25 | Overloaded, avoid if possible |

**Sandwich penalty**: If the proposed slot is between two existing meetings with less than 30 minutes gap on either side, subtract 15 points. Back-to-back sandwiches cause mental fatigue.

### Factor 5: Recency and Spacing (10%)

Score based on days since last interaction with this contact:

| Days Since Last Meeting | Score | Rationale |
|------------------------|-------|-----------|
| 0-1 days | 40 | Very recent, may feel pushy |
| 2-3 days | 70 | Good pacing, shows attentiveness |
| 4-7 days | 90 | Natural follow-up window |
| 8-14 days | 80 | Slightly overdue, sooner is better |
| 15+ days | 60 | Stale -- schedule ASAP, but the gap itself lowers rapport |
| No prior meetings | 85 | First meeting, no recency bias |

**Deal stage modifier**: If the deal is in "Negotiation" or "Closing" stage, add +10 to all recency scores (urgency is inherent).

### Factor 6: User Preference Match (10%)

Binary bonuses for matching stated preferences:

| Preference Match | Bonus |
|-----------------|-------|
| Matches stated time_preference | +90 |
| On user's preferred meeting day | +80 |
| Avoids known personal blocks | +85 |
| No preferences stated | +70 (neutral) |

### Final Score Calculation

```
final_score = (time_of_day * 0.25) +
              (day_of_week * 0.20) +
              (timezone_friendliness * 0.20) +
              (calendar_density * 0.15) +
              (recency_spacing * 0.10) +
              (preference_match * 0.10)
```

Present slots sorted by final_score descending. If two slots score within 3 points, prefer the earlier date (sooner is better in sales).

---

## 4. Meeting Duration Defaults by Type

| Meeting Type | Default Duration | Buffer Override | Notes |
|-------------|-----------------|-----------------|-------|
| Intro call | 30 min | Standard (15 min) | First contact, keep it tight |
| Discovery call | 45 min | Standard (15 min) | Need time to explore pain points |
| Demo | 45 min | Extended (20 min) | Allow setup and Q&A overflow |
| Follow-up | 25 min | Standard (15 min) | Focused, specific agenda |
| Deep dive / technical review | 60 min | Extended (20 min) | Complex topics need room |
| Quick check-in | 15 min | Minimal (10 min) | Keep it brief |
| Negotiation / closing | 45 min | Extended (20 min) | High-stakes, allow for discussion |
| Internal sync | 25 min | Standard (15 min) | Keep internal meetings short |
| Onboarding kickoff | 60 min | Extended (20 min) | First working session |

### Duration Auto-Detection

When no duration or meeting type is specified, infer from context:
1. **Deal stage**: Early stage = 30 min, Mid-pipeline = 45 min, Late stage = 45 min
2. **Relationship**: New contact = 30 min, Existing contact = 25 min
3. **Participant count**: 2 people = standard, 3-4 = add 15 min, 5+ = add 30 min
4. **Fallback**: 30 minutes (the universal safe default)

---

## 5. Timezone Overlap Calculation

For meetings with participants across multiple timezones, the overlap window is the intersection of all participants' working hours.

### Overlap Algorithm

```
1. Convert each participant's working hours to UTC
2. Find the intersection:
   overlap_start = max(all participants' UTC start)
   overlap_end = min(all participants' UTC end)
3. overlap_duration = overlap_end - overlap_start
4. If overlap_duration < meeting_duration + buffers: flag as "narrow overlap"
5. If overlap_duration <= 0: flag as "no overlap"
```

### Narrow Overlap Handling

| Overlap Duration | Action |
|-----------------|--------|
| > 4 hours | Normal scheduling, full scoring applies |
| 2-4 hours | Reduce candidate slots to 3, note limited window |
| 1-2 hours | Present 1-2 options, suggest shorter meeting duration |
| < 1 hour | Warn user, suggest async alternative or split-timezone meeting |
| 0 (no overlap) | Cannot schedule synchronously -- recommend Loom, email, or alternate day with extended hours |

### Common Timezone Pairs and Overlap

| User TZ | Prospect TZ | Overlap Window (UTC) | Practical Hours |
|---------|-------------|---------------------|-----------------|
| US Eastern | UK (GMT) | 14:00 - 17:30 | 9 AM - 12:30 PM ET / 2 PM - 5:30 PM GMT |
| US Eastern | Central Europe | 15:00 - 17:30 | 10 AM - 12:30 PM ET / 4 PM - 6:30 PM CET |
| US Pacific | UK (GMT) | 17:00 - 17:30 | 9 AM - 9:30 AM PT / 5 PM - 5:30 PM GMT |
| US Eastern | India (IST) | 14:00 - 15:30 | 9 AM - 10:30 AM ET / 7:30 PM - 9 PM IST |
| US Pacific | Australia (AEST) | 22:30 - 01:00 | Extremely narrow, suggest async |

---

## 6. Conflict Detection Rules

Not all calendar events represent the same level of "busy." The skill classifies each event and handles conflicts accordingly.

### Event Classification

| Event Type | Classification | Scheduling Action |
|-----------|---------------|-------------------|
| Confirmed meeting, 2+ attendees | Hard conflict | Never double-book |
| 1:1 meeting, confirmed | Hard conflict | Never double-book |
| Tentative / Maybe RSVP | Soft conflict | Schedule but flag with warning |
| All-day event (vacation, OOO) | Blocked | Do not schedule on this day |
| All-day event (conference, offsite) | Soft blocked | Schedule only if user overrides |
| Focus time (Google Calendar) | Soft conflict | Avoid, but allow with user's permission |
| Recurring hold / placeholder | Soft conflict | Check with user, often moveable |
| Solo event (no other attendees) | Soft conflict | Likely a personal block, schedule around it |
| Canceled event still showing | Ignore | Filter out declined and canceled events |
| Free / available (explicitly set) | No conflict | Preferred scheduling window |

### Overlap Tolerance

An event is considered conflicting if it overlaps with the proposed slot by even 1 minute. There is no partial-overlap tolerance -- either the slot is clear or it is not.

### Multi-Calendar Handling

Users may have multiple calendars (work, personal, team). When checking availability:
1. **Primary work calendar**: always checked, hard conflicts apply
2. **Secondary calendars**: checked if connected, personal events treated as soft blocks
3. **Shared team calendars**: informational only, do not block unless the event names the user as an attendee
4. **Holiday calendars**: check for public holidays, treat as blocked

---

## 7. Presentation Format Rules

### Timezone Display

- Always show the user's timezone first, prospect's timezone in parentheses
- Use standard abbreviations (EST, GMT, CET, IST, AEST) not UTC offsets
- Account for daylight saving time at the specific date of the proposed slot
- If a DST transition occurs during the scheduling window, note it explicitly

### Slot Count

| Scenario | Slots to Present |
|----------|-----------------|
| Normal availability | 3-5 slots |
| Limited availability | 2-3 slots with constraint explanation |
| Very limited (narrow TZ overlap) | 1-2 slots with async alternative |
| No availability | 0 slots with next-step recommendations |

### Warning Labels

Apply these labels to any slot that meets the condition:

| Condition | Warning Text |
|-----------|-------------|
| Before 9 AM for any participant | "Early start for [Name]" |
| After 5 PM for any participant | "Late in [Name]'s day" |
| Friday slot | "Friday -- lower acceptance rates" |
| Same-day slot | "Today -- short notice" |
| Back-to-back for user | "Back-to-back with [previous meeting]" |
| Tentative conflict | "[Name] has a tentative event" |
| Relaxed buffers applied | "Reduced buffer -- tight schedule" |
| 7+ day gap since last contact | "Overdue follow-up" |
