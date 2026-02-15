# Sales Message Patterns

Proven Block Kit patterns for sales workflows. Each pattern includes the block structure, when to use it, and a builder reference.

## Pattern 1: Alert Card

**Use for**: Deal stage changes, stale deal alerts, email reply alerts, win probability shifts.

```
┌─────────────────────────────────────┐
│ 🔔 header: Alert title              │
├─────────────────────────────────────┤
│ section: What happened (1-2 lines)  │
├─────────────────────────────────────┤
│ sectionWithFields: Key metrics      │
│  ┌──────────┬──────────┐           │
│  │ Stage    │ Value    │           │
│  │ Owner    │ Close    │           │
│  └──────────┴──────────┘           │
├─────────────────────────────────────┤
│ actions: [View Deal] [Dismiss]      │
├─────────────────────────────────────┤
│ context: timestamp + source         │
└─────────────────────────────────────┘
```

**Block count**: 5-6
**Key**: Lead with what changed, show before→after in fields.

**Builders**: `buildDealStageChangeMessage`, `buildStaleDealAlertMessage`, `buildEmailReplyAlertMessage`, `buildWinProbabilityChangeMessage`

## Pattern 2: Briefing / Prep

**Use for**: Meeting prep, morning briefs, account intelligence.

```
┌─────────────────────────────────────┐
│ 📅 header: "Meeting in 15 mins"     │
├─────────────────────────────────────┤
│ section: Meeting title + time       │
│ sectionWithFields:                  │
│  ┌──────────┬──────────┐           │
│  │ Company  │ Stage    │           │
│  │ Deal $   │ Health   │           │
│  └──────────┴──────────┘           │
├─────────────────────────────────────┤
│ divider                             │
├─────────────────────────────────────┤
│ section: *Attendees*                │
│ section: • Name – Title (notes)     │
├─────────────────────────────────────┤
│ section: *Talking Points*           │
│ section: 1. Point one               │
│          2. Point two               │
├─────────────────────────────────────┤
│ section: *⚠️ Risk Signals*          │
│ section: • Risk description         │
├─────────────────────────────────────┤
│ actions: [Open in App] [View Deal]  │
├─────────────────────────────────────┤
│ context: "Sixty AI • via pipeline"  │
└─────────────────────────────────────┘
```

**Block count**: 10-15 (longest pattern)
**Key**: Group by section with bold headers. Most important info (deal, attendees) first.

**Builders**: `buildMeetingPrepMessage`, `buildMorningBriefMessage`, `buildAccountIntelligenceDigest`

## Pattern 3: Coaching / Feedback

**Use for**: Per-meeting coaching, weekly coaching digest, performance reviews.

```
┌─────────────────────────────────────┐
│ 🎯 header: "Coaching: Meeting Name" │
├─────────────────────────────────────┤
│ section: Overall assessment (1 line)│
├─────────────────────────────────────┤
│ sectionWithFields: Score grid       │
│  ┌──────────────┬──────────────┐   │
│  │ Talk Ratio   │ Questions    │   │
│  │ 45% 🟢🟢⚪  │ 7/10 🟢🟢🟢 │   │
│  │ Objections   │ Discovery    │   │
│  │ 6/10 🟡🟡⚪  │ 8/10 🟢🟢🟢 │   │
│  └──────────────┴──────────────┘   │
├─────────────────────────────────────┤
│ divider                             │
├─────────────────────────────────────┤
│ section: *Key Insights*             │
│ section: 💡 Positive insight        │
│          ⚠️ Area to improve         │
├─────────────────────────────────────┤
│ section: *Top Recommendation*       │
│ section: > Specific action to take  │
├─────────────────────────────────────┤
│ actions: [View Analysis]            │
├─────────────────────────────────────┤
│ context: "Sixty Coaching AI"        │
└─────────────────────────────────────┘
```

**Block count**: 8-12
**Key**: Scores as emoji progress bars in fields. Separate positive/negative insights.

**Builders**: `buildCoachingMicroFeedbackMessage`, `buildWeeklyCoachingDigestMessage`

## Pattern 4: Digest / Summary

**Use for**: Daily digest, weekly digest, pipeline summary, account digest.

```
┌─────────────────────────────────────┐
│ 📊 header: "Weekly Coaching Digest" │
├─────────────────────────────────────┤
│ section: Greeting + summary stat    │
├─────────────────────────────────────┤
│ sectionWithFields: Metrics          │
│  ┌──────────────┬──────────────┐   │
│  │ Meetings: 8  │ Avg Score    │   │
│  │ Talk: 42% 📈 │ Questions 📈 │   │
│  └──────────────┴──────────────┘   │
├─────────────────────────────────────┤
│ divider                             │
├─────────────────────────────────────┤
│ section: *📈 Improving*             │
│ section: • Area 1 • Area 2         │
├─────────────────────────────────────┤
│ section: *🎯 Focus Areas*           │
│ section: • Area 1 • Area 2         │
├─────────────────────────────────────┤
│ section: *⭐ Best Moment*           │
│ section: > Quote or description     │
├─────────────────────────────────────┤
│ section: *🏋️ Weekly Challenge*      │
│ section: Description                │
├─────────────────────────────────────┤
│ actions: [View Dashboard]           │
├─────────────────────────────────────┤
│ context: "Week of Jan 13 • Sixty"   │
└─────────────────────────────────────┘
```

**Block count**: 12-20
**Key**: Use dividers between logical groups. Include trend indicators (📈/📉). Lead with headline metric.

**Builders**: `buildWeeklyCoachingDigestMessage`, `buildDailyDigestMessage`, `buildAccountIntelligenceDigest`

## Pattern 5: HITL Approval

**Use for**: Email draft approval, follow-up confirmation, proposal review.

```
┌─────────────────────────────────────┐
│ ✅ header: "Review & Approve"       │
├─────────────────────────────────────┤
│ section: What needs approval        │
├─────────────────────────────────────┤
│ section: *Draft Preview*            │
│ section: > Email body or content    │
│          > (blockquoted for clarity) │
├─────────────────────────────────────┤
│ sectionWithFields: Context          │
│  ┌──────────┬──────────┐           │
│  │ To       │ Subject  │           │
│  │ Re: Deal │ Via      │           │
│  └──────────┴──────────┘           │
├─────────────────────────────────────┤
│ actions: [✅ Approve] [✏️ Edit] [❌ Reject] │
├─────────────────────────────────────┤
│ context: "Expires in 24h • Sixty"   │
└─────────────────────────────────────┘
```

**Block count**: 6-8
**Key**: Show full draft content. Clear approve/reject/edit buttons. Approve = primary (green), Reject = danger (red).

**Builders**: `buildHITLApprovalMessage`, `buildHITLConfirmationMessage`, `buildHITLEditRequestMessage`

## Pattern 6: Celebration

**Use for**: Deal won, milestone reached, quota hit.

```
┌─────────────────────────────────────┐
│ 🎉 header: "Deal Won!"             │
├─────────────────────────────────────┤
│ section: Rep closed $X with Company │
├─────────────────────────────────────┤
│ sectionWithFields: Deal details     │
│  ┌──────────┬──────────┐           │
│  │ Value    │ Cycle    │           │
│  │ Stage    │ Product  │           │
│  └──────────┴──────────┘           │
├─────────────────────────────────────┤
│ context: 🎊 "Way to go!" • date    │
└─────────────────────────────────────┘
```

**Block count**: 4-5 (deliberately short — celebration, not information overload)
**Key**: Keep it brief and celebratory. One emoji in header. Fields for key deal stats.

**Builders**: `buildDealWonMessage`, `buildDealLostMessage` (loss uses 🔍 instead)

## Content Hierarchy Rules

1. **Header** → What type of message (1 line, 150 chars max)
2. **Lead section** → The most important takeaway (1-2 sentences)
3. **Fields** → Key metrics at a glance (2-6 fields)
4. **Details** → Supporting information (sections with bold sub-headers)
5. **Actions** → What the rep should do next (1-3 buttons)
6. **Context** → Metadata, timestamp, attribution (always last)

## Mobile Rendering Notes

- Fields stack vertically on mobile (2-col → 1-col)
- Keep field labels short (under 20 chars) so they don't wrap
- Buttons stack vertically on mobile — order by priority (primary first)
- Long sections are collapsed behind "Show more" on mobile
- Emoji renders larger on mobile — good for visual scanning, bad if overused
