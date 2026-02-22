# The Always-On Sales Copilot: What's Missing

**A review of the use60 agent architecture with specific additions for ambient intelligence**

**Date:** 21 February 2026
**Author:** Andrew Bryce / Sixty Seconds
**Status:** Review & Expansion

---

## The Gap Between "Agent System" and "Always-On Copilot"

Everything we've built so far — the config schema, the personalisation architecture, the playbooks, the approval policies — is solid infrastructure. But it's infrastructure for a *reactive system*. Events happen, agents respond. Meeting ends, CRM updates. Deal goes stale, alert fires.

An always-on copilot doesn't just respond to events. It *notices* things between events. It connects dots that no individual trigger would catch. It has a sense of time, momentum, and context that persists across the entire sales org.

The difference is this: a reactive agent says "your meeting with Sarah Chen ended, here's the follow-up." An always-on copilot says "Sarah's VP just liked your competitor's LinkedIn post, and Sarah's reply to your proposal has been slower than her usual response time, and the deal has been in Negotiation 8 days longer than your average — you might be losing this one."

That second version requires capabilities the current architecture doesn't have. Here's what's missing, and how each one creates a specific, tangible always-on behaviour.

---

## 1. Temporal Intelligence — The Sales Clock

### What's Missing

The agent has no concept of time beyond "this meeting is in 2 hours" and "this deal hasn't been touched in 14 days." It doesn't know what day of the quarter it is, whether the rep is ahead or behind on their number, or that the fiscal year ends in 6 weeks.

Sales teams live and die by the calendar. The last two weeks of a quarter feel completely different from the first two weeks. An always-on copilot needs to feel that urgency and adjust its behaviour accordingly.

### What It Should Do

**Quarter-Aware Prioritisation:**
The agent should weight every action through a temporal lens. Early in the quarter, prioritise pipeline building and discovery. Mid-quarter, focus on deal progression. Late in the quarter, everything is about closing.

```json
{
  "config_key": "temporal.quarter_phases",
  "config_value": {
    "build": {
      "weeks": [1, 2, 3, 4],
      "agent_emphasis": "pipeline_generation",
      "briefing_focus": "new opportunities, prospecting activity, pipeline coverage ratio",
      "risk_threshold_adjustment": 0,
      "nudge_frequency": "normal"
    },
    "progress": {
      "weeks": [5, 6, 7, 8],
      "agent_emphasis": "deal_progression",
      "briefing_focus": "stage movement, stuck deals, multi-threading gaps",
      "risk_threshold_adjustment": -5,
      "nudge_frequency": "normal"
    },
    "close": {
      "weeks": [9, 10, 11, 12, 13],
      "agent_emphasis": "closing",
      "briefing_focus": "commit deals, close date accuracy, deal blockers, forecast vs target",
      "risk_threshold_adjustment": -15,
      "nudge_frequency": "increased"
    }
  }
}
```

**Deadline Awareness:**
The agent knows about upcoming deadlines beyond just deal close dates. Renewal dates for existing customers. Contract expiry at competitors (if captured in calls). Budget cycle timing mentioned in conversations. End-of-trial dates for prospects.

```
💡 Heads up — Sarah Chen mentioned in your October call that their 
current contract with [competitor] renews in March. That's 5 weeks 
away. If you're going to displace them, the decision probably needs 
to happen in the next 2-3 weeks.

[Draft urgency email] [View October call notes] [Dismiss]
```

**Day-of-Week Patterns:**
The agent learns when prospects are most responsive. Not as a standalone feature, but as ambient intelligence that shapes when it suggests sending emails, scheduling calls, or following up.

```json
{
  "table": "contact_engagement_patterns",
  "columns": {
    "contact_id": "uuid",
    "best_email_day": "text",
    "best_email_hour": "integer",
    "avg_response_time_hours": "numeric",
    "current_response_time_hours": "numeric",
    "response_trend": "text",
    "last_calculated": "timestamptz"
  }
}
```

When the agent drafts a follow-up and the rep approves it, it doesn't just send — it schedules for the contact's optimal window. "I'll send this Tuesday at 9:15am — that's when David typically responds fastest."

---

## 2. Pipeline Mathematics — The Numbers That Matter

### What's Missing

The agent knows about individual deals. It doesn't know the arithmetic of the pipeline. It can't tell you whether you're on track to hit your number because it doesn't know what your number is. It doesn't calculate coverage ratios, weighted pipeline, or run rate.

### What It Should Do

**Quota Tracking:**

```json
{
  "config_key": "pipeline.targets",
  "config_value": {
    "source": "manual",
    "period": "quarterly",
    "targets": {
      "revenue": null,
      "deals_closed": null,
      "pipeline_generated": null
    },
    "coverage_ratio_target": 3.0
  },
  "ui_component": "number_inputs",
  "ui_category": "Pipeline & Targets"
}
```

Once the rep or their manager enters a target (or it's pulled from the CRM), the agent always knows the gap. This unlocks a category of proactive intelligence that doesn't exist today:

**Monday Morning Pipeline Math:**
```
📊 Q1 Pipeline Check — Week 8 of 13

Target: £120,000
Closed so far: £47,200 (39%)
Weighted pipeline: £89,400 (74%)
Coverage ratio: 2.1x (target: 3.0x)

⚠️ At your current close rate (34%), you'd close £30,400 of remaining 
pipeline — putting you at £77,600. That's £42,400 short.

To close the gap:
• Close 2 of your 3 "Negotiation" deals (worth £38,000 combined)
• OR add £126k in new qualified pipeline (at 34% close rate)

Your highest-value next action is getting the Meridian deal (£22,000) 
unstuck — it's been in Proposal for 18 days.

[View pipeline detail] [Focus on Meridian →]
```

This isn't a new agent. It's context that gets woven into the daily briefing, the risk scorer, the coaching digest. Every agent becomes pipeline-aware.

**Forecast Accuracy Tracking:**

The agent tracks what reps predict versus what actually closes. Over time, this becomes coaching intelligence: "You tend to be 20% optimistic on close dates in the Proposal stage. Adjusting your forecast accordingly."

```json
{
  "table": "pipeline_snapshots",
  "purpose": "Weekly snapshot of pipeline state for trend analysis and forecast accuracy",
  "columns": {
    "org_id": "uuid",
    "user_id": "uuid",
    "snapshot_date": "date",
    "period": "text",
    "total_pipeline_value": "numeric",
    "weighted_pipeline_value": "numeric",
    "deals_by_stage": "jsonb",
    "deals_at_risk": "integer",
    "closed_this_period": "numeric",
    "target": "numeric",
    "coverage_ratio": "numeric",
    "forecast_accuracy_trailing": "numeric"
  },
  "frequency": "weekly snapshot on Monday morning before briefing"
}
```

---

## 3. The Relationship Graph — Who Knows Who

### What's Missing

The agent knows about contacts on individual deals. It doesn't maintain a relationship map across the org. It can't tell you that your champion at Acme Corp used to work at Zenith where you have another active deal. It can't suggest warm introductions. It doesn't know when a contact moves companies, unless it's a closed-lost deal being monitored by the re-engagement trigger.

### What It Should Do

**Contact Intelligence Layer:**

```json
{
  "table": "contact_graph",
  "purpose": "Persistent relationship intelligence across all contacts the org has engaged",
  "columns": {
    "org_id": "uuid",
    "contact_id": "uuid",
    "name": "text",
    "current_company": "text",
    "current_role": "text",
    "relationship_strength": "integer",
    "last_interaction": "timestamptz",
    "interaction_count": "integer",
    "deals_involved_in": "uuid[]",
    "known_connections": "jsonb",
    "company_history": "jsonb",
    "decision_maker_type": "text",
    "communication_preferences": "jsonb",
    "last_enriched": "timestamptz"
  }
}
```

**Cross-Deal Connection Detection:**

When the pre-meeting prep agent enriches attendees for an upcoming call, it doesn't just pull their LinkedIn profile — it checks the relationship graph:

```
📋 Meeting prep: James Wright, VP Engineering at TechFlow

🔗 Connection found: James previously worked at Meridian Group 
(2019-2023) where he overlapped with Sarah Chen, your champion 
on the Meridian deal. They were in the same leadership team.

Consider: James might already have an impression of your company 
through Sarah. You could reference the Meridian relationship to 
build trust — or ask Sarah for a warm intro if the deal stalls.
```

**Warm Introduction Mapping:**

When prospecting or trying to break into a new account, the agent checks whether anyone in the contact graph has a connection:

```
🔗 Trying to reach decision makers at FinanceFirst?

Your contact Lisa Park (from the DataBridge deal) moved to 
FinanceFirst as Head of Operations 3 months ago. She was very 
positive about your product during the DataBridge evaluation.

[Draft intro request to Lisa] [Add to outreach without reference]
```

This is built from data the system already captures — meeting attendees, CRM contacts, Apollo enrichment data. It just needs to be persisted in a graph structure rather than treated as isolated per-deal records.

---

## 4. Email & Inbox Signal Processing — The Always-Listening Layer

### What's Missing

The current agent wakes up for meetings and scheduled crons. Emails are mentioned in the master plan as a future phase, but they're the single biggest source of buying signals between meetings.

A prospect who replies within 20 minutes is behaving differently from one who takes 4 days. An email that says "sounds good, let me check with the team" is different from "we need to discuss pricing." These signals are happening constantly and the agent isn't watching.

### What It Should Do

**Inbound Email Classification:**

Not full email management — that's a massive scope. Instead, a focused signal extractor that monitors the rep's inbox for sales-relevant patterns:

```json
{
  "config_key": "email_monitoring.enabled",
  "config_value": true,
  "ui_category": "Integrations",
  "description": "Monitor your inbox for buying signals, response patterns, and time-sensitive requests"
}
```

```json
{
  "config_key": "email_monitoring.signal_types",
  "config_value": {
    "response_speed": {
      "fast_reply_threshold_hours": 2,
      "slow_reply_threshold_hours": 72,
      "track_trend": true
    },
    "intent_signals": {
      "meeting_request": "detect and offer scheduling",
      "pricing_question": "flag and draft response",
      "competitor_mention": "flag and surface battlecard",
      "introduction_offer": "flag and suggest response",
      "objection": "flag and surface handling",
      "positive_buying": "flag and update deal"
    },
    "absence_signals": {
      "expected_reply_overdue": "flag after 2x contact's average response time",
      "proposal_not_opened": "flag after 48 hours",
      "follow_up_not_responded": "flag and suggest next action"
    }
  }
}
```

**The Always-On Slack Nudge:**

This is where the always-on feeling comes from. Between meetings, between scheduled checks, the agent surfaces things as they happen:

```
📧 Quick signal: David Park (Zenith, £18k Proposal stage) 
just forwarded your proposal to finance@zenith.com.

This usually means internal budget review is happening. 
Good sign — but expect pricing questions in the next few days.

[Prep pricing justification] [Note in CRM] [Dismiss]
```

```
📧 Heads up: Sarah Chen hasn't opened your follow-up from 
Tuesday. That's unusual — she typically opens within 4 hours 
(her average is 3.2 hours). This is her second slow response 
in a row.

Risk score updated: Acme Corp moved from Medium → High risk.

[Draft alternative touchpoint] [Check LinkedIn for activity] [Wait another day]
```

**The Signal → Action Chain:**

Every email signal connects back to the agent fleet:

| Email Signal | Agent Action |
|---|---|
| Fast reply with positive sentiment | Update deal momentum, reduce risk score |
| Slow reply (2x+ average) | Increment risk score, note in deal memory |
| Forwarded to internal stakeholder | Log multi-threading signal, suggest follow-up |
| Meeting request detected | Offer calendar times via Slack |
| Pricing question | Draft response, pull pricing template |
| "Let's hold off" / "not right now" | Critical risk alert, suggest intervention |
| Out-of-office reply | Reschedule pending actions, note return date |
| New CC'd contact | Add to relationship graph, enrich via Apollo |

---

## 5. Competitive Intelligence Accumulation — The Memory That Compounds

### What's Missing

Every sales call where a competitor is mentioned is a data point. Currently, the intent detection flags it as a one-time signal. But across dozens of calls, a pattern emerges: which competitors come up most, what objections they create, how deals that mention competitors perform versus those that don't.

The agent has no persistent competitive intelligence layer. Each mention is isolated.

### What It Should Do

**Competitive Intelligence Database:**

```json
{
  "table": "competitive_intelligence",
  "purpose": "Accumulating competitive knowledge from all sales interactions",
  "columns": {
    "org_id": "uuid",
    "competitor_name": "text",
    "mention_source": "text",
    "deal_id": "uuid",
    "meeting_id": "uuid",
    "mention_date": "timestamptz",
    "context": "text",
    "prospect_sentiment": "text",
    "competitor_strengths_mentioned": "text[]",
    "competitor_weaknesses_mentioned": "text[]",
    "pricing_mentioned": "jsonb",
    "outcome": "text"
  }
}
```

**What Compounds:**

After 20 deals that mention CompetitorX, the agent knows:

- CompetitorX wins on price 60% of the time, but loses on integration depth
- Deals involving CompetitorX take 30% longer to close
- The most effective counter-positioning is [specific talk track from winning deals]
- CompetitorX is most often mentioned in the Discovery stage
- Deals where the rep addresses the competitive threat early have a 2x higher close rate

This feeds directly into the playbook:

```
🏁 Competitive alert: James Wright just mentioned [CompetitorX] 
in your call.

From your org's history with CompetitorX (12 encounters):
• You win 58% of competitive deals against them
• Their strength: pricing (mentioned 9/12 times)
• Your winning move: emphasise integration depth early
• Best talk track (from your closed-won deals): "[specific phrasing 
  that worked for another rep on the team]"

[View full battlecard] [Log competitive notes] [Dismiss]
```

The coaching digest also incorporates this:

```
📊 Competitive Trends This Month:
CompetitorX appeared in 4 deals (up from 1 last month). 
You've won 2, lost 1, 1 still active. The lost deal cited 
pricing as the deciding factor. Consider whether your 
value proposition is landing clearly enough in early calls.
```

---

## 6. Cross-Deal Pattern Recognition — The Intelligence Layer

### What's Missing

Each agent analyses deals individually. Nobody is connecting dots across the pipeline: "3 of your 5 Proposal-stage deals have the same objection," or "every deal you've lost this quarter had single-threaded engagement."

### What It Should Do

**Pipeline Pattern Engine:**

A periodic analysis (weekly, feeding into the coaching digest and daily briefing) that looks across all active deals for patterns:

```json
{
  "config_key": "intelligence.cross_deal_patterns",
  "config_value": {
    "enabled": true,
    "frequency": "weekly",
    "pattern_types": [
      "common_objections_across_deals",
      "stage_bottleneck_analysis",
      "engagement_pattern_comparison",
      "win_loss_correlation_factors",
      "rep_behaviour_impact_on_outcomes",
      "seasonal_and_cyclical_patterns"
    ]
  }
}
```

**Specific Patterns It Surfaces:**

**Objection Clustering:**
```
📊 Pattern detected: 3 of your 5 active Qualification-stage 
deals have raised "integration complexity" concerns. This 
wasn't a theme last quarter.

Possible cause: Your recent pitch deck removed the integration 
architecture slide. Consider adding it back.

[View affected deals] [See how other reps handle this]
```

**Stage Bottleneck:**
```
📊 Your deals are spending 40% longer in Proposal than your 
team average. The two deals that moved fastest both had an 
internal champion who attended the proposal review.

Try: Inviting the champion to the proposal walkthrough rather 
than sending it asynchronously.
```

**Win/Loss Correlation:**
```
📊 Looking at your last 20 closed deals:
• Deals where you held 3+ meetings: 52% close rate
• Deals where you held 1-2 meetings: 18% close rate
• Multi-threaded deals (2+ contacts): 61% close rate
• Single-threaded deals: 24% close rate

Your current pipeline has 4 single-threaded deals. 
Multi-threading these could be your highest-leverage action.

[Show single-threaded deals] [Draft multi-threading outreach]
```

---

## 7. Internal Meeting Prep — Beyond Sales Calls

### What's Missing

The pre-meeting agent only preps for external sales calls. But sales reps spend significant time in internal meetings that the agent could make dramatically more productive: 1:1s with their manager, pipeline reviews, QBRs, forecast calls, team standups.

### What It Should Do

**Internal Meeting Detection:**

When the agent sees a calendar event with only internal attendees (same org domain), it triggers a different prep flow:

```json
{
  "config_key": "meetings.internal_prep",
  "config_value": {
    "enabled": true,
    "meeting_types": {
      "one_on_one_with_manager": {
        "detect": "2-person meeting with user's reporting manager",
        "prep": [
          "pipeline_summary_since_last_1on1",
          "deals_progressed",
          "deals_at_risk_with_context",
          "coaching_points_this_week",
          "blockers_to_raise",
          "wins_to_celebrate"
        ]
      },
      "pipeline_review": {
        "detect": "meeting title contains 'pipeline' or 'forecast' or 'review'",
        "prep": [
          "full_pipeline_by_stage_with_movement",
          "forecast_vs_target",
          "coverage_ratio",
          "commit_vs_upside_categorisation",
          "deals_with_close_date_this_month",
          "risk_summary"
        ]
      },
      "qbr": {
        "detect": "meeting title contains 'QBR' or 'quarterly business review'",
        "prep": [
          "quarter_performance_summary",
          "win_loss_analysis",
          "pipeline_trend_charts_data",
          "top_deals_in_progress",
          "competitive_landscape_summary",
          "next_quarter_pipeline_projection"
        ]
      },
      "team_standup": {
        "detect": "recurring meeting with 3+ team members",
        "prep": [
          "personal_update_bullets",
          "deals_needing_team_help",
          "wins_since_last_standup"
        ]
      }
    }
  }
}
```

**1:1 Prep Example:**

```
📋 1:1 with [Manager Name] at 2:00 PM — here's your prep

Since your last 1:1 (Feb 14):
✅ Closed: DataBridge — £12,000 (3 days ahead of schedule)
📈 Progressed: Acme Corp Discovery → Qualification
⚠️ At risk: Meridian Group — 18 days in Proposal, champion quiet

Coaching note: Your talk-to-listen ratio improved this week 
(42% vs 55% last week). Your discovery questions are getting 
stronger — the Acme call was a good example.

Suggested topics to raise:
• Need manager help with Meridian (executive sponsor intro?)
• TechFlow deal — they want a reference customer. Do we have one?
• Capacity — 3 new meetings booked next week, pipeline review Thursday

[Edit prep] [Send to manager as pre-read] [Dismiss]
```

This is high-value, low-effort for the agent. It already has all this data. It's just not packaging it for internal consumption.

---

## 8. End-of-Day Synthesis — Closing the Loop

### What's Missing

The morning briefing opens the day. Nothing closes it. The agent doesn't reflect on what happened, what got done, what didn't, and what tomorrow looks like. The rep finishes their day and the agent goes silent until 8am.

### What It Should Do

**End-of-Day Wrap (5:00 PM local):**

```
🌙 Day wrap — Thursday, 20 Feb

📊 TODAY'S SCORECARD
├─ 3 meetings completed, 0 no-shows
├─ 2 follow-up emails sent (approved and delivered)
├─ CRM updated on 3 deals
├─ 1 new deal created (TechFlow, £15,000)
└─ Pipeline moved: +£15,000 added, £12,000 closed

⏳ STILL OPEN
├─ Meridian proposal response — still waiting (day 19)
├─ Reply to David Park's pricing question (drafted, not sent)
└─ Action item: Send case study to James Wright

📅 TOMORROW
├─ 9:30am — Sarah Chen, Acme Corp (Qualification call)
│  Prep queued — will deliver at 8:00am
├─ 11:00am — Internal: Team standup
└─ 2:00pm — 1:1 with [Manager]
   Prep queued — will include today's updates

🤖 OVERNIGHT PLAN
├─ Enriching 3 new contacts from today's meetings
├─ Monitoring Meridian for email opens
├─ Running weekly pipeline pattern analysis
└─ Processing campaign replies from Q1 outreach

Anything I should prioritise differently for tomorrow?
[Looks good] [Adjust priorities] [Add a task]
```

**Why This Matters:**

The end-of-day wrap isn't just a summary. It does three things:

1. **Accountability** — the rep sees what got done and what didn't, creating a natural habit loop
2. **Tomorrow prep** — the rep goes to bed knowing tomorrow is already being prepared
3. **Overnight work visibility** — the agent isn't silent from 5pm to 8am, it's working. The "overnight plan" section shows the rep that the copilot is always on, even when they're not

The morning briefing then references the overnight work: "Overnight: enriched 3 contacts ✓, Meridian opened your email at 11:42pm ✓, campaign got 2 new replies ✓"

This creates a continuous loop. Morning → Day → Evening → Overnight → Morning. No gaps.

---

## 9. Ambient Signal Layer — The Eyes That Never Close

### What's Missing

Between meetings and emails, prospects leave digital breadcrumbs. Website visits, document views, LinkedIn activity, Slack mentions (in shared channels), proposal opens, video replays. Each one is a weak signal. Combined, they tell a story.

### What It Should Do

**Signal Ingestion Framework:**

```json
{
  "config_key": "signals.ambient",
  "config_value": {
    "sources": {
      "proposal_tracking": {
        "enabled": true,
        "signals": ["opened", "time_spent", "pages_viewed", "forwarded", "downloaded"],
        "integration": "proposal_template_tracking_pixel"
      },
      "email_engagement": {
        "enabled": true,
        "signals": ["opened", "link_clicked", "replied", "forwarded"],
        "integration": "email_provider_webhooks"
      },
      "website_visits": {
        "enabled": false,
        "signals": ["pricing_page", "demo_page", "case_studies", "multiple_visits"],
        "integration": "website_analytics_webhook",
        "is_premium": true
      },
      "social_activity": {
        "enabled": false,
        "signals": ["company_post", "contact_post", "engagement_with_our_content"],
        "integration": "apify_linkedin_monitor",
        "is_premium": true
      }
    },
    "signal_decay_hours": 72,
    "minimum_significance_score": 0.4
  }
}
```

**Signal Aggregation — Not Individual Alerts:**

The key design decision: don't alert on every individual signal. That's notification spam. Instead, aggregate signals into a "deal temperature" that rises and falls:

```json
{
  "table": "deal_signal_temperature",
  "purpose": "Real-time deal engagement temperature from all signal sources",
  "columns": {
    "deal_id": "uuid",
    "temperature": "numeric",
    "trend": "text",
    "last_signal": "timestamptz",
    "signal_count_24h": "integer",
    "signal_count_7d": "integer",
    "top_signals": "jsonb",
    "updated_at": "timestamptz"
  }
}
```

The agent only surfaces ambient signals when they form a meaningful pattern:

```
🌡️ Acme Corp is heating up

In the last 24 hours:
• Sarah Chen opened your proposal 3 times (spent 12 min total)
• An unknown user at acme.com visited your pricing page
• Sarah forwarded your email to 2 internal addresses

This deal's engagement score jumped from 42 → 78 in a day. 
Something is happening internally. This might be a good time 
to reach out with a "just checking in on the proposal" touchpoint.

[Draft check-in] [Wait and watch] [Call Sarah now]
```

Or the inverse:

```
🌡️ TechFlow is cooling down

No signals in the last 10 days:
• No email opens since Feb 11
• Proposal never opened (sent Feb 8)
• No website visits
• James Wright hasn't posted on LinkedIn in 2 weeks

Deal temperature dropped from 65 → 22. Combined with the 
18-day stage duration, this deal is at serious risk.

[Try a different channel] [Draft break-up email] [Check job change signals]
```

---

## 10. Org-Wide Learning — The Team Brain

### What's Missing

Every agent operates in the context of a single rep's pipeline. But a sales org is a team, and the most powerful coaching comes from learning what works across the team. Which talk tracks lead to closes? Which objection handling approaches work? What do the top performers do differently?

### What It Should Do

**Anonymised Cross-Rep Patterns (Manager View):**

This is sensitive — reps shouldn't see each other's individual performance. But managers should see team-level insights, and the coaching engine should be able to recommend tactics that work for other reps without naming them.

```json
{
  "config_key": "intelligence.org_learning",
  "config_value": {
    "enabled": true,
    "requires_role": "manager",
    "anonymise_individual_data": true,
    "learning_categories": [
      "winning_talk_tracks",
      "effective_objection_handling",
      "optimal_meeting_cadence",
      "best_email_subject_lines",
      "successful_competitive_positioning",
      "stage_progression_best_practices"
    ]
  }
}
```

**Rep-Facing Coaching From Team Data:**

```
💡 Coaching tip: When facing budget objections, your team's 
most effective approach is leading with ROI quantification 
rather than discounting. Reps who use this approach close 
budget-objected deals at 2.3x the rate of those who offer 
discounts first.

Here's a talk track from a recent winning deal:
"Rather than adjusting the price, let me help you build 
the business case for your CFO..."

[Save to my playbook] [Show more examples] [Dismiss]
```

**The Knowledge Base That Builds Itself:**

Over time, this creates an org-specific sales knowledge base:

| What The Org Learns | Source | Feeds Into |
|---|---|---|
| Best objection handling per objection type | Meeting transcripts + win/loss data | Coaching digest, post-meeting tips |
| Optimal meeting cadence per deal type | CRM activity + close data | Deal risk scorer thresholds |
| Most effective email subject lines | Email engagement data | Follow-up email drafts |
| Winning competitive positioning per competitor | Competitive intelligence + outcomes | Competitive alerts, battlecards |
| Ideal deal velocity per stage | CRM stage duration data | Risk scoring, stage rules |
| Which discovery questions predict close | Transcript analysis + outcomes | Pre-meeting prep, coaching |

---

## 11. The Conversational Layer — The Copilot You Can Talk To

### What's Missing

All the intelligence above is delivered as notifications. But a true copilot responds when you ask it questions. The existing copilot in use60 (the web chat) is reactive — the rep asks a question, it responds. It doesn't have access to the real-time agent intelligence.

### What It Should Do

**Slack as a Conversational Interface:**

The rep should be able to DM the agent in Slack and get answers informed by all the agent intelligence:

```
Rep: "What's happening with the Acme deal?"

Agent: "Acme Corp (£45,000, Qualification stage, 23 days):

Your last meeting was Feb 14 with Sarah Chen. She agreed to 
set up an internal demo with their tech team. You sent a 
follow-up email Feb 15 — she opened it twice but hasn't replied.

Her response time has slowed from an average of 3.2 hours to 
72+ hours over the last two interactions. Risk score is Medium 
(62/100), mainly due to engagement decay and single-threaded 
contact.

One thing worth noting — the unknown web visitor from acme.com 
on your pricing page could be Sarah's colleague doing research, 
which would actually be a positive signal.

I'd suggest a low-pressure touchpoint — maybe sharing that case 
study she mentioned being interested in, rather than asking for 
a status update."

Rep: "Draft that email"

Agent: [Generates email using writing style, deal context, case study mention from transcript]
```

This is where all the ambient intelligence becomes truly useful. The agent isn't just surfacing alerts — it's a knowledgeable colleague you can ask anything about your pipeline. It has memory across all deals, all meetings, all emails, all signals.

**Natural Language Deal Queries:**

```
"Which deals are most at risk this week?"
"What should I focus on to hit my number?"
"When was the last time I spoke to anyone at Zenith?"
"Draft a break-up email for the Meridian deal"
"What competitor keeps coming up this month?"
"Show me my pipeline coverage for Q1"
"Why did we lose the DataBridge deal?"
"What works when people push back on pricing?"
```

Each of these queries draws on a different part of the intelligence layer:
- Risk queries → Deal Risk Scorer + signal temperature
- Target queries → Pipeline mathematics + temporal intelligence
- History queries → Contact graph + deal memory
- Draft queries → Playbook + writing style + deal context
- Pattern queries → Cross-deal patterns + competitive intelligence + org learning

---

## 12. The Always-On Daily Rhythm

Putting it all together, here's what a rep's day looks like with the full copilot:

| Time | What Happens | Agent Layer |
|---|---|---|
| 7:50 AM | Overnight summary arrives: enrichments done, signals detected, campaigns processed | End-of-day → morning bridge |
| 8:00 AM | Morning briefing with pipeline math, today's meetings, attention items, quarter context | Daily briefing + temporal + pipeline math |
| 8:15 AM | Rep asks "what should I focus on today?" — agent gives prioritised action list | Conversational layer + all intelligence |
| 9:00 AM | Pre-meeting prep for 10am call, including relationship graph connections | Pre-meeting + contact graph |
| 9:45 AM | Quick signal: prospect opened proposal 3x this morning | Ambient signal layer |
| 10:00 AM | Meeting happens | — |
| 10:35 AM | Post-meeting: CRM updated, follow-up drafted, intent detected, risk scores adjusted | Post-meeting + auto CRM + risk scorer |
| 11:00 AM | Email signal: different prospect replied to follow-up with questions | Email signal processing |
| 11:05 AM | Agent drafts response to email, presents in Slack for approval | Email + playbook + voice |
| 12:00 PM | Pipeline review meeting — agent preps pipeline summary with talking points | Internal meeting prep |
| 1:30 PM | Agent notices deal has been in stage 2x longer than average, nudges | Cross-deal patterns + temporal |
| 2:00 PM | 1:1 with manager — agent delivers prep with coaching context | Internal meeting prep + coaching |
| 3:00 PM | Competitive alert from afternoon call — battlecard surfaced | Competitive intelligence |
| 3:15 PM | Rep asks "how do other reps handle this objection?" | Org-wide learning + conversational |
| 4:00 PM | Re-engagement trigger: champion from closed-lost deal changed jobs | Re-engagement + contact graph |
| 5:00 PM | End-of-day wrap: scorecard, open items, tomorrow prep, overnight plan | End-of-day synthesis |
| 5:01 PM+ | Overnight: enrichment, signal monitoring, pattern analysis, campaign processing | Background agents |

No gaps. No silence. The copilot is always there, always watching, always thinking about the rep's pipeline.

---

## Implementation Priority: What to Build When

### Already Covered in Current Architecture
- ✅ Per-agent config schema
- ✅ Playbook personalisation with methodology switching
- ✅ Approval policies and autonomy dial
- ✅ CRM field mapping
- ✅ Heartbeat system
- ✅ Fleet orchestration

### Add to Phase 1 (Foundation)
- **Pipeline mathematics** — target entry, coverage calculation, gap analysis. Low effort, high impact on daily briefing quality.
- **End-of-day synthesis** — mirror of morning briefing. Completes the daily loop. Low effort since it uses the same data.
- **Temporal intelligence** — quarter phase detection and urgency weighting. Config-only change, no new data.

### Add to Phase 2 (First Agents)
- **Email signal processing** — critical for the always-on feeling. This is what fills the gaps between meetings. Medium effort, requires email integration webhook.
- **Internal meeting prep** — uses existing data in a new packaging. Low-medium effort, very high perceived value.
- **Contact engagement patterns** — response time tracking. Small data model addition, feeds into risk scoring.

### Add to Phase 3 (Intelligence Layer)
- **Competitive intelligence accumulation** — builds over time, each call adds data. Medium effort to set up, compounds in value.
- **Cross-deal pattern recognition** — weekly analysis job. Medium effort, transforms the coaching digest.
- **Relationship graph** — persistent contact intelligence. Medium effort, transforms pre-meeting prep and prospecting.

### Add to Phase 4 (Differentiation)
- **Ambient signal layer** — proposal tracking, website visits, social monitoring. High effort (multiple integrations), but this is where the "wow" lives.
- **Org-wide learning** — needs volume (10+ reps, 100+ deals) to be statistically meaningful. Build the infrastructure now, turn it on when orgs are large enough.
- **Conversational Slack interface** — the natural language deal query layer. High effort, but this is the moment where it stops being a notification system and becomes a true copilot.
- **Pipeline forecast accuracy** — needs 2+ quarters of snapshot data. Start collecting now, surface later.

---

## The Narrative: From Tool to Teammate

The current architecture makes use60 a powerful tool — it does things for you when triggered.

These additions make it a teammate — it thinks about your deals when you're not, it notices things you'd miss, it learns what works across your org, it prepares you for every conversation (not just sales calls), it knows where you are in the quarter and what matters most right now.

The competitive moat this creates is significant. CRM tools are commodity. Meeting transcription is commodity. Even AI-generated follow-up emails are becoming commodity. But an agent that has watched every deal in your pipeline for months, that knows your contacts' response patterns, that has accumulated your team's competitive intelligence, that can tell you exactly why you're going to miss your number and what to do about it — that's not something you switch away from.

That's always-on.