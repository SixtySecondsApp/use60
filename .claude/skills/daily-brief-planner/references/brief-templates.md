# Briefing Templates by Time Mode

Full briefing templates for every time mode the Daily Brief Planner supports. Each template includes section structure, content guidance, tone notes, and a fully formatted example. Use these as the canonical output format.

## Table of Contents
1. [Morning Brief Template (Before 12pm)](#morning-brief-template)
2. [Afternoon Brief Template (12pm-5pm)](#afternoon-brief-template)
3. [Evening Brief Template (After 5pm)](#evening-brief-template)
4. [Monday Morning Special](#monday-morning-special)
5. [Friday Afternoon Special](#friday-afternoon-special)
6. [Template Selection Logic](#template-selection-logic)
7. [Section Formatting Standards](#section-formatting-standards)
8. [Tone and Voice Guide](#tone-and-voice-guide)

---

## Morning Brief Template

**Mode**: Morning (before 12pm)
**Psychology**: The rep is fresh and planning-oriented. This is the highest-leverage moment -- it shapes the entire day.
**Tone**: Energized, clear, forward-looking. Like a mission briefing before deployment.

### Section Structure

```
[GREETING]
Good morning! Here's your day at a glance.

[SCHEDULE] — Always first. Meetings are the backbone of a sales day.
SCHEDULE ({count} meetings)
  {time}  {title} ({contact} - {company})
  {time}  {title}
  ...

[PRIORITY DEALS] — 3-5 deals that need attention today.
PRIORITY DEALS ({count})
  {company}  ${value}  {stage}  {alert_reason}
  ...

[CONTACTS] — People linked to active deals who need follow-up.
CONTACTS TO REACH ({count})
  {name} ({company})  Last contact: {days} days  {suggested_action}
  ...

[TASKS] — Grouped by priority. Overdue items flagged with [!].
TASKS DUE TODAY ({count})
  [!] {overdue_task_title}
  [ ] {pending_task_title}
  ...

[SUMMARY] — One sentence. Sets the tone.
{summary_sentence}
```

### Fully Formatted Example

```
Good morning! Here's your day at a glance.

SCHEDULE (5 meetings)
  08:30  Team standup
  09:30  Discovery call with Lisa Park (Meridian Health - $72K Qualified)
  11:00  Demo with Carlos Vega (NovaTech - $38K Demo)
  14:00  Contract review with Sarah Chen (Acme Corp - $95K Negotiation)
  16:30  Pipeline review with manager

PRIORITY DEALS (4)
  Acme Corp       $95K  Negotiation   Contract review today - close by Friday
  Meridian Health $72K  Qualified     Discovery call today - qualify budget
  NovaTech        $38K  Demo          Demo today - needs strong technical proof
  DataBridge      $54K  Proposal      No reply in 6 days - proposal may be stalled

CONTACTS TO REACH (2)
  James Park (DataBridge)    Last contact: 6 days   Send a check-in on proposal status
  Rachel Torres (FinServe)   Last contact: 8 days   Re-engage on pilot timeline

TASKS DUE TODAY (4)
  [!] Send updated contract to Acme Corp (overdue by 1 day)
  [ ] Prepare discovery questions for Meridian Health
  [ ] Customize demo deck for NovaTech
  [ ] Update forecast spreadsheet for pipeline review

Big day ahead -- your $95K Acme close is within reach, and two live calls give you momentum.
```

### Content Rules for Morning

| Rule | Detail |
|------|--------|
| Show ALL meetings | Never truncate. The rep needs the full picture. |
| Meetings include linked deals | If a meeting has a deal, show company, value, and stage inline. |
| Priority deals max 5 | More than 5 creates decision paralysis (Miller's Law). |
| Every deal has an alert | One-line reason for inclusion. Not "needs attention" -- be specific. |
| Tasks sorted by priority | Overdue first, then high, medium, low. |
| Summary is 1 sentence | Not a paragraph. Sets energy and tone. |

---

## Afternoon Brief Template

**Mode**: Afternoon (12pm-5pm)
**Psychology**: Energy dips post-lunch. The rep needs a quick recalibration, not a wall of text. Acknowledge what landed, highlight what slipped, refocus on what remains.
**Tone**: Supportive, momentum-aware. Like a halftime coach. Acknowledge progress before redirecting.

### Section Structure

```
[GREETING]
Here's your afternoon check-in.

[PROGRESS] — Always first in afternoon. Seeing progress sustains energy.
TODAY'S PROGRESS
  {meetings_completed} meetings held | {tasks_completed} tasks done | {deals_touched} deals touched

[REMAINING SCHEDULE] — Only what is LEFT. Do not repeat morning meetings.
STILL ON YOUR CALENDAR ({count})
  {time}  {title} ({context})
  ...

[UNFINISHED ITEMS] — Tasks or follow-ups that were due by now but remain open.
STILL NEEDS YOUR ATTENTION ({count})
  {task_or_followup_title} — {context}
  ...

[EMERGING ALERTS] — Anything that changed since morning.
SINCE THIS MORNING ({count})
  {alert_description}
  ...

[RE-PRIORITIZED DEALS] — Recalculated based on morning activity.
DEAL PRIORITIES (updated)
  {company}  ${value}  {stage}  {updated_alert}
  ...

[SUMMARY]
{summary_sentence}
```

### Fully Formatted Example

```
Here's your afternoon check-in.

TODAY'S PROGRESS
  3 meetings held | 4 tasks done | 2 deals touched

STILL ON YOUR CALENDAR (2)
  14:00  Contract review with Sarah Chen (Acme Corp - $95K Negotiation)
  16:30  Pipeline review with manager

STILL NEEDS YOUR ATTENTION (2)
  Send updated contract to Acme Corp — overdue, review meeting is at 2pm
  Follow up with James Park at DataBridge — proposal silence now at 6 days

SINCE THIS MORNING (1)
  Meridian Health: Lisa Park confirmed budget authority on discovery call

DEAL PRIORITIES (updated)
  Acme Corp       $95K  Negotiation   Contract review in 45 min - prep now
  DataBridge      $54K  Proposal      Still dark - escalation needed
  Meridian Health $72K  Qualified     Positive signal - schedule demo this week

Strong morning. Lock in the Acme contract review and chase DataBridge before EOD.
```

### Content Rules for Afternoon

| Rule | Detail |
|------|--------|
| Lead with progress | Numbers first: meetings held, tasks done, deals touched. |
| Only remaining meetings | Morning meetings are history. Show what is ahead. |
| Unfinished items are flagged | Use "still needs your attention" -- not accusatory, but clear. |
| Emerging alerts are new info | Only things that changed since morning. No stale data. |
| Deals re-prioritized | A deal that got a positive call drops in urgency; one that was supposed to get a call but didn't rises. |
| Summary acknowledges AND redirects | "Strong morning. Now focus on X." |

---

## Evening Brief Template

**Mode**: Evening (after 5pm)
**Psychology**: The rep is winding down. They want closure on today and a preview of tomorrow so they can mentally detach. Lead with wins -- always end the day positive.
**Tone**: Reflective, encouraging, forward-looking. Like a debrief that closes one chapter and opens the next.

### Section Structure

```
[GREETING]
Wrapping up your day. Here's how it went.

[DAY SUMMARY] — Quantified results. Numbers give closure.
TODAY'S RESULTS
  {meetings_held} meetings held | {tasks_completed} tasks completed | {deals_touched} deals touched

[WINS] — Always lead with wins. It ends the day positive.
WINS
  {win_description}
  ...

[FLAGS] — Things that need attention but NOT tonight.
NEEDS ATTENTION (not tonight - tomorrow)
  {flag_description}
  ...

[TOMORROW PREVIEW] — First 2-3 meetings and one focus area.
TOMORROW PREVIEW
  {time}  {title} ({context})
  ...
  Focus area: {one_line_focus}

[SIGN-OFF]
{encouraging_close}
```

### Fully Formatted Example

```
Wrapping up your day. Here's how it went.

TODAY'S RESULTS
  5 meetings held | 7 tasks completed | 4 deals touched

WINS
  Acme Corp contract signed -- $95K closed won
  Meridian Health budget confirmed -- moving to Demo stage
  NovaTech demo received positive feedback -- scheduling technical review

NEEDS ATTENTION (not tonight - tomorrow)
  DataBridge still dark at 7 days -- consider exec sponsor outreach
  FinServe pilot timeline needs confirmation -- Rachel hasn't responded

TOMORROW PREVIEW
  09:00  Demo prep session for Meridian Health
  10:30  Technical review with NovaTech engineering team
  14:00  1:1 with sales manager
  Focus area: Convert Meridian momentum into a booked demo

Outstanding day -- a $95K close and two deals advancing. Rest up.
```

### Content Rules for Evening

| Rule | Detail |
|------|--------|
| Wins are always first after results | Even on a bad day, find something. A completed task counts. |
| Flags are explicitly labeled "not tonight" | The rep should not feel compelled to work more. |
| Tomorrow preview is max 3 meetings | Plus one focus area. Keep it light -- this is a preview, not a plan. |
| Sign-off is encouraging | 1 sentence. Positive. Never guilt-inducing. |
| Include tomorrow's meetings | Requires an additional fetch for tomorrow's calendar. |

---

## Monday Morning Special

On Monday mornings, the standard morning brief is extended with a week preview. This helps the rep set the trajectory for the entire week, not just the day.

### Additional Section (after standard morning brief)

```
THIS WEEK AT A GLANCE
  {total_meetings} meetings across 5 days
  {deals_closing_this_week} deals closing this week (${total_value})
  {overdue_tasks} overdue tasks carried forward

  Key milestones:
  - {milestone_1}
  - {milestone_2}
  - {milestone_3}
```

### Fully Formatted Example (extension)

```
THIS WEEK AT A GLANCE
  14 meetings across 5 days
  3 deals closing this week ($207K)
  2 overdue tasks carried forward from last week

  Key milestones:
  - Acme Corp contract signature expected Wednesday
  - Meridian Health demo scheduled Thursday
  - Quarterly pipeline review Friday at 3pm
```

### Data Requirements
- Fetch meetings for the entire week: `get_meetings_for_period({ period: "this_week" })`
- Fetch deals closing this week: `get_pipeline_deals({ filter: "closing_soon", period: "this_week" })`
- Fetch overdue tasks: `list_tasks({ status: "pending", filter: "overdue" })`

---

## Friday Afternoon Special

On Friday afternoons, the standard afternoon brief is extended with a week recap and next-week prep section. This gives the rep closure on the week and sets up Monday.

### Additional Section (after standard afternoon brief)

```
WEEK IN REVIEW
  {meetings_this_week} meetings held | {tasks_this_week} tasks completed | {deals_advanced} deals advanced
  Pipeline change: ${pipeline_start} -> ${pipeline_end} ({delta})

  This week's wins:
  - {win_1}
  - {win_2}

  Carried to next week:
  - {carryover_1}
  - {carryover_2}

NEXT WEEK PREVIEW
  Monday: {first_meeting_or_priority}
  Key deals closing: {deal_names}
  Prep needed: {prep_item}
```

### Fully Formatted Example (extension)

```
WEEK IN REVIEW
  14 meetings held | 18 tasks completed | 3 deals advanced
  Pipeline change: $420K -> $532K (+$112K)

  This week's wins:
  - Closed Acme Corp for $95K
  - Moved Meridian Health from Qualified to Demo
  - Booked 3 new discovery calls

  Carried to next week:
  - DataBridge re-engagement (still dark)
  - FinServe pilot confirmation

NEXT WEEK PREVIEW
  Monday: Discovery call with BrightPath at 10am
  Key deals closing: NovaTech ($38K), DataBridge ($54K)
  Prep needed: Finalize NovaTech pricing before Monday
```

### Data Requirements
- Fetch completed tasks for the week: `list_tasks({ status: "completed", filter: "this_week" })`
- Fetch next week's meetings: `get_meetings_for_period({ period: "next_week" })`
- Fetch deals closing next week: `get_pipeline_deals({ filter: "closing_soon", period: "next_week" })`

---

## Template Selection Logic

The briefing mode is determined by the current time of day. Special modes layer on top of the base mode.

```
IF time_of_day is not provided:
  Derive from current timestamp:
    before 12:00 -> "morning"
    12:00-17:00  -> "afternoon"
    after 17:00  -> "evening"
  If timestamp unavailable -> default to "morning"

BASE TEMPLATE:
  "morning"   -> Morning Brief Template
  "afternoon" -> Afternoon Brief Template
  "evening"   -> Evening Brief Template

SPECIAL EXTENSIONS:
  IF Monday AND morning -> append Monday Morning Special
  IF Friday AND afternoon -> append Friday Afternoon Special
  IF Saturday or Sunday -> Weekend Mode (fetch Monday data instead)
```

### Weekend Mode Behavior

When the date falls on a weekend:
- Greeting: "It's {Saturday/Sunday} -- here's a quick look at what's coming Monday."
- Show Monday's meetings instead of today's (today has none)
- Show carry-over items: overdue tasks, stale deals
- Keep it light -- no pressure to work on the weekend

---

## Section Formatting Standards

Every section in the briefing follows consistent formatting rules for maximum scannability.

### The 3-5-1 Rule

| Constraint | Limit | Rationale |
|-----------|-------|-----------|
| Visible sections without scrolling | 3 | Reduces cognitive load on first glance |
| Items per section | 5 | Miller's Law -- 7 plus or minus 2, err conservative |
| Lines per item | 1-2 | Scannability. If it takes 3 lines, it is too detailed. |

### Item Format

Every item follows the pattern: **Entity Name** | Key Metric | Action Signal

| Item Type | Format | Example |
|-----------|--------|---------|
| Meeting | `{time}  {title} ({contact} - {company} ${value} {stage})` | `10:00  Demo with Sarah Chen (Acme Corp - $45K Proposal)` |
| Deal | `{company}  ${value}  {stage}  {alert}` | `Acme Corp  $45K  Proposal  Closes Friday - no reply since Tue` |
| Contact | `{name} ({company})  Last contact: {days} days  {action}` | `James Park (TechFlow)  Last contact: 9 days  Re-engage champion` |
| Task | `[{status}] {title}` | `[!] Send revised proposal to Acme (overdue)` |

### Task Status Icons

| Icon | Meaning |
|------|---------|
| `[!]` | Overdue -- needs immediate attention |
| `[ ]` | Pending -- due today |
| `[~]` | In progress (afternoon/evening only) |
| `[x]` | Completed (afternoon/evening progress tracking) |

---

## Tone and Voice Guide

The briefing tone varies by time mode, but certain principles are constant.

### Universal Principles

| Principle | Detail |
|-----------|--------|
| Professional but human | Not robotic, not chatty. A trusted aide. |
| Concise over comprehensive | Better to omit a low-priority item than to make the brief too long. |
| Action-oriented language | "Send pricing follow-up" not "Consider reaching out about pricing." |
| Never guilt-inducing | "3 tasks overdue" not "You failed to complete 3 tasks." |
| Honest about gaps | "Deal health scores unavailable" not silence. |

### Tone by Mode

| Mode | Tone | Voice Analogy | Example Greeting |
|------|------|---------------|------------------|
| Morning | Energized, structured | Mission briefing commander | "Good morning! Here's your day at a glance." |
| Afternoon | Supportive, momentum-aware | Halftime coach | "Here's your afternoon check-in." |
| Evening | Reflective, encouraging | Post-game analyst | "Wrapping up your day. Here's how it went." |
| Monday AM | Ambitious, week-scoped | Monday standup lead | "Good morning! Here's your week at a glance." |
| Friday PM | Celebratory, forward-looking | End-of-sprint retrospective | "Wrapping up the week. Here's how it went." |

### Summary Sentence Patterns

| Mode | Pattern | Example |
|------|---------|---------|
| Morning | Focus + energy | "Big day ahead -- your $95K close is within reach." |
| Afternoon | Acknowledge + redirect | "Strong morning. Lock in the Acme review before EOD." |
| Evening | Celebrate + preview | "Outstanding day -- a $95K close and two deals advancing." |
| Monday | Week scope + ambition | "Big week ahead -- $207K in pipeline closing by Friday." |
| Friday | Celebrate + rest | "Strong week -- $112K in new pipeline added. Enjoy the weekend." |
