# PRD: Onboarding WOW Experience — Instant Replay Walkthrough + Dashboard Tour

**Generated**: 2026-02-27
**Feature ID**: onboarding-wow-experience
**Priority**: P0 — First impression, retention-critical
**Prefix**: WOW

---

## Executive Summary

The current onboarding "Instant Replay" is a fake SSE pipeline that dumps generic Acme Corp demo data. It reads like a terminal log — zero excitement, zero personalization, zero understanding of what 60 actually does. The user finishes onboarding and lands on the dashboard thinking "now what?"

This PRD redesigns the final onboarding step and first-login experience into a **WOW moment** — a cinematic, personalized walkthrough that shows the user exactly what 60 will do for them, using their company context, with beautiful animations that build anticipation and deliver payoff.

**The goal**: User finishes onboarding thinking "holy shit, this thing is going to change how I sell."

---

## Problem Statement

### Current Pain Points

1. **Instant Replay is a dead-end** — Shows a loading spinner, dumps generic text, user clicks "Finish." No emotional payoff.
2. **No personalization** — "Acme Corp" means nothing. The user just spent 5 minutes entering their company info and it's not used.
3. **Dashboard confusion** — User lands on dashboard with no context. "I have no idea what to do" (direct quote).
4. **ProductTour is broken** — `data-tour="dashboard"` target has a backslash bug and never highlights. Tour is generic text with no personality.
5. **ActivationChecklist is static** — No animations, no celebration, no guidance on WHY each item matters.
6. **Disconnected experiences** — Replay, Tour, and Checklist are three separate things that don't form a cohesive narrative.

### Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Instant Replay completion rate | ~30% (most skip) | >80% |
| Time to first meaningful action post-onboarding | Unknown (users churn) | <5 minutes |
| Activation checklist items completed (day 1) | ~1.5/7 | >3/7 |
| "Connect notetaker" completion in onboarding | ~40% | >60% |

---

## Design Philosophy

### The Narrative Arc

The onboarding ending should feel like a movie trailer for what 60 will do for you:

```
SETUP → ANTICIPATION → REVEAL → PAYOFF → AGENCY
```

1. **SETUP**: "Let me show you what happens after your next meeting with {companyName}'s prospects..."
2. **ANTICIPATION**: Animated timeline builds — meeting detected, AI processing, results generating
3. **REVEAL**: Staggered cards appear showing summary, actions, follow-up email — all personalized
4. **PAYOFF**: "This happens automatically. Every meeting. Every follow-up. While you focus on closing."
5. **AGENCY**: CTA to dashboard with clear next steps

### Visual Language

- **Glassmorphism**: `bg-gray-900/80 backdrop-blur-sm` with subtle gradient overlays
- **Violet-600 primary**: Consistent with onboarding, NOT blue-600 (tour bug)
- **Staggered reveals**: Cards appear one-by-one with `staggerChildren: 0.15`
- **Micro-interactions**: Checkmarks animate in, progress bars fill, cards slide up
- **Typewriter effect**: Key text types out character-by-character for dramatic effect
- **Particle/glow effects**: Subtle violet glow on the "AI processing" phase

---

## Part 1: Instant Replay Walkthrough (Replaces Current Panel)

### Overview

Replace the SSE-pipeline-that-dumps-text with a **cinematic 4-act walkthrough** that plays inside the same `InstantReplayPanel` container. No backend calls needed — it's a choreographed animation sequence using the user's real company name.

### Data Sources for Personalization

```typescript
// Available from onboardingV2Store at this point in the flow:
const companyName = enrichment?.company_name || manualData?.company_name || orgName;
const industry = enrichment?.industry || manualData?.industry || 'your industry';
const products = enrichment?.products || manualData?.products || [];
const companyDomain = enrichment?.domain || state.domain || '';

// User's own name from profile
const userName = profile?.full_name?.split(' ')[0] || 'there';
```

### Act Structure

#### Act 1: "Meeting Detected" (0-3s)

A meeting card slides up showing a simulated upcoming meeting:

```
┌─────────────────────────────────────────────┐
│  📅 Tomorrow, 10:00 AM                      │
│                                              │
│  Product Demo — {companyName}               │
│  with Sarah Chen, VP Sales at NovaTech      │
│                                              │
│  🔵 60 is preparing your meeting brief...   │
└─────────────────────────────────────────────┘
```

- Meeting card uses glassmorphism styling
- Calendar icon pulses briefly
- Company name is the user's actual company
- "NovaTech" is a fictional prospect (always the same — consistency)
- Bottom status line types out character-by-character

#### Act 2: "Meeting Prep" (3-7s)

The meeting card transforms/expands to show AI-generated prep:

```
┌─────────────────────────────────────────────┐
│  🧠 Meeting Brief — NovaTech Demo           │
│                                              │
│  ATTENDEE INTEL                              │
│  ┌─────────────────────────────────────┐    │
│  │ Sarah Chen — VP Sales, NovaTech     │    │
│  │ • Reports to CRO, 3 direct reports  │    │
│  │ • Previously at Salesforce (4 yrs)  │    │
│  │ • Active on LinkedIn (posts weekly) │    │
│  └─────────────────────────────────────┘    │
│                                              │
│  TALKING POINTS FOR {companyName}            │
│  • How {product[0]} solves their gap in...  │
│  • Reference their Q4 expansion plans       │
│  • Competitor displacement opportunity       │
│                                              │
│  ⚡ Ready 12 hours before your meeting      │
└─────────────────────────────────────────────┘
```

- Cards stagger in from bottom with `y: 20 → 0, opacity: 0 → 1`
- Each bullet point appears with a 150ms delay
- Product names pulled from enrichment data
- "Ready 12 hours before" badge pulses once

#### Act 3: "Post-Meeting Magic" (7-14s)

The prep card slides left/fades, replaced by a "meeting just ended" timeline:

```
┌─────────────────────────────────────────────┐
│  ✅ Meeting Complete — NovaTech Demo         │
│  Duration: 47 min | Recorded by 60          │
│                                              │
│  ─── 60 is processing... ───                │
│                                              │
│  ┌── SUMMARY ──────────────────────────┐    │
│  │ NovaTech expressed strong interest   │    │
│  │ in {companyName}'s {product[0]}.     │    │
│  │ Key decision maker engaged.          │    │
│  │ Budget confirmed for Q1.             │    │
│  │ Next step: technical deep-dive.      │    │
│  └─────────────────────────────────────┘    │
│                                              │
│  ┌── ACTION ITEMS (3) ─────────────────┐    │
│  │ □ Send pricing proposal — You (Fri) │    │
│  │ □ Schedule tech demo — Sarah (Mon)  │    │
│  │ □ Loop in CTO for security Q's      │    │
│  └─────────────────────────────────────┘    │
│                                              │
│  ┌── FOLLOW-UP EMAIL ─────────────────┐    │
│  │ Subject: Great chat, Sarah!         │    │
│  │                                      │    │
│  │ Hi Sarah,                           │    │
│  │ Thanks for taking the time to see   │    │
│  │ how {companyName} can help NovaTech │    │
│  │ streamline your sales workflow...   │    │
│  │                                      │    │
│  │ [Preview — not sent automatically]  │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

- "60 is processing..." shows a shimmer animation for 1.5s
- Summary card slides up first
- Action Items card slides up 400ms later
- Follow-up Email card slides up 400ms after that
- Each card has a subtle violet left border accent
- Company name and product names are personalized throughout
- Action items have unchecked boxes that animate to checked after 1s

#### Act 4: "The Payoff" (14-18s)

All cards compress into a summary strip, and the closing message appears:

```
┌─────────────────────────────────────────────┐
│                                              │
│        ✨ This happens automatically.       │
│                                              │
│     Every meeting. Every follow-up.          │
│     Every deal — while you focus on          │
│     closing revenue for {companyName}.       │
│                                              │
│  ┌─────────────────────────────────────┐    │
│  │  📊 Pipeline    │  📧 Follow-ups   │    │
│  │  Auto-updated   │  Auto-drafted    │    │
│  │                  │                   │    │
│  │  🧠 Prep        │  📋 Actions      │    │
│  │  Auto-generated │  Auto-tracked    │    │
│  └─────────────────────────────────────┘    │
│                                              │
│  ┌─────────────────────────────────────┐    │
│  │  🚀  Enter Your Command Centre       │    │
│  └─────────────────────────────────────┘    │
│                                              │
│  Skip — I'll explore on my own              │
│                                              │
└─────────────────────────────────────────────┘
```

- The headline types out with a typewriter effect
- 4-quadrant capability grid fades in as a group
- Each quadrant has a subtle scale-up animation on appear
- CTA button has a gradient shimmer animation
- The whole thing breathes confidence and professionalism

### State Machine (Revised)

```typescript
type PanelState = 'offer' | 'walkthrough' | 'complete' | 'error';
type WalkthroughAct = 'meeting-detected' | 'meeting-prep' | 'post-meeting' | 'payoff';
```

- `offer`: Show the CTA to start (keep existing but improve copy)
- `walkthrough`: Auto-advancing 4-act animation sequence
- `complete`: Show "Enter Your Command Centre" CTA
- `error`: Fallback (should never trigger since no API calls)

### Animation Toolkit

```typescript
// Stagger container
const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.15, delayChildren: 0.2 }
  }
};

// Slide-up child
const slideUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } }
};

// Typewriter effect hook
function useTypewriter(text: string, speed = 30, delay = 0) { ... }

// Shimmer loading bar
const shimmer = {
  animate: {
    backgroundPosition: ['200% 0', '-200% 0'],
    transition: { duration: 2, repeat: Infinity, ease: 'linear' }
  }
};

// Glow pulse
const glowPulse = {
  animate: {
    boxShadow: [
      '0 0 0 0 rgba(139, 92, 246, 0)',
      '0 0 20px 4px rgba(139, 92, 246, 0.3)',
      '0 0 0 0 rgba(139, 92, 246, 0)'
    ],
    transition: { duration: 2, repeat: Infinity }
  }
};
```

### No Backend Changes Required

The current `instant-replay` edge function stays as-is (demo mode). But the frontend **no longer calls it**. The walkthrough is entirely client-side — just animated components with personalized data from the onboarding store. This means:
- Zero latency (no network round-trip)
- Zero failure modes (no CORS, no auth, no SSE parsing)
- Works offline
- Always consistent experience

---

## Part 2: Post-Onboarding Dashboard Tour (Enhanced ProductTour)

### Overview

When the user clicks "Enter Your Command Centre," they land on the dashboard. The existing `ProductTour` (react-joyride) fires, but it's currently broken and generic. We'll:

1. Fix the `data-tour="dashboard"` backslash bug
2. Add missing `data-tour` targets
3. Rewrite tour copy to be personalized and action-oriented
4. Add a "Welcome" splash overlay before Joyride starts
5. Match design system (violet-600, not blue-600)

### Welcome Splash (New — before Joyride)

A full-screen glassmorphic overlay that appears for 3 seconds:

```
┌─────────────────────────────────────────────────────────┐
│                                                          │
│                                                          │
│            Welcome to your Command Centre,               │
│                     {firstName} 👋                       │
│                                                          │
│         {companyName}'s AI sales teammate                │
│              is ready to get to work.                    │
│                                                          │
│            Let me show you around...                     │
│                                                          │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

- Full viewport overlay with `bg-black/70 backdrop-blur-lg`
- Text fades in with stagger
- Auto-dismisses after 3s OR on click
- Transitions smoothly into Joyride first step

### Enhanced Tour Steps (8 steps, up from 5)

| # | Target | Title | Content |
|---|--------|-------|---------|
| 1 | `[data-tour="dashboard"]` | "Your Daily Briefing" | "Every morning, 60 prepares your day — meetings prepped, follow-ups queued, pipeline updated. This is your home base." |
| 2 | `[data-tour="meetings"]` | "Meeting Intelligence" | "Every meeting gets an AI summary, action items, and a follow-up draft. Just like the demo you just saw — but with your real meetings." |
| 3 | `[data-tour="copilot"]` | "Ask 60 Anything" | "Need a proposal? Competitive intel? 'What did Sarah say about budget?' — just ask. 60 knows your deals, contacts, and history." |
| 4 | `[data-tour="credits"]` | "AI Credits" | "Each AI action uses credits. You've got free credits to start — {creditBalance} remaining. Top up anytime in Settings." |
| 5 | `[data-tour="settings"]` | "Connect Your Tools" | "Link your CRM, calendar, and email for the full experience. The more 60 sees, the smarter it gets." |
| 6 | `[data-tour="activation-checklist"]` | "Your Setup Checklist" | "Complete these items to unlock 60's full power. Each one makes your AI teammate smarter and more helpful." |
| 7 | `[data-tour="notification-bell"]` | "Stay in the Loop" | "60 sends you alerts when deals need attention, follow-ups are due, or meetings are approaching. Check here or get them in Slack." |
| 8 | (centered, no target) | "You're All Set!" | "60 is already working in the background. Your first morning briefing arrives tomorrow. For now, connect your notetaker and let's get your first meeting processed." |

### Design Updates

```typescript
// ProductTour tooltip theme — match design system
const tooltipStyles = {
  backgroundColor: 'rgba(17, 24, 39, 0.95)',  // gray-900/95
  backdropFilter: 'blur(12px)',
  textColor: '#d1d5db',           // gray-300
  primaryColor: '#7c3aed',        // violet-600 (NOT blue-600)
  overlayColor: 'rgba(0, 0, 0, 0.6)',
  width: 360,
  borderRadius: '1rem',
  boxShadow: '0 0 30px rgba(124, 58, 237, 0.15), 0 25px 50px -12px rgba(0,0,0,0.6)',
  border: '1px solid rgba(124, 58, 237, 0.2)' // subtle violet border
};
```

### Missing data-tour Targets to Add

| Target | Location | Element |
|--------|----------|---------|
| `data-tour="dashboard"` | AppLayout.tsx line 972 | Fix backslash → forward slash |
| `data-tour="activation-checklist"` | ActivationChecklist.tsx | Outer Card wrapper |
| `data-tour="notification-bell"` | NotificationBell.tsx | Bell button |

---

## Part 3: Activation Checklist Enhancement

### Animated Item Reveals

- Items stagger in on first render with `staggerChildren: 0.1`
- Completed items get a satisfying checkmark animation (scale 0 → 1.2 → 1 with bounce)
- Progress bar animates smoothly with `transition: { duration: 0.8, ease: 'easeOut' }`

### Celebration on Milestone

- At 50% (4/7): Confetti burst + "Halfway there!" toast
- At 100% (7/7): Full celebration overlay + "60 is fully activated!" message

### Contextual "Why" Tooltips

Each checklist item gets a hover tooltip explaining WHY it matters:

| Item | Why It Matters |
|------|---------------|
| Connect notetaker | "Without this, 60 can't process your meetings" |
| Sync first meeting | "60 needs at least one meeting to learn your style" |
| Experience Intelligence | "See what AI-powered meeting insights look like" |
| Integrate CRM | "Auto-updates your pipeline after every call" |
| Invite team | "Team insights unlock coaching and competitive intel" |

---

## Technical Architecture

### New Files

```
src/components/onboarding/
  InstantReplayPanel.tsx          — REWRITE (walkthrough replaces SSE)
  WalkthroughScene.tsx            — NEW: Individual scene renderer
  WalkthroughTimeline.tsx         — NEW: Progress indicator for acts
  useTypewriter.ts                — NEW: Typewriter animation hook
  walkthrough-data.ts             — NEW: Personalized demo data generator

src/components/
  ProductTour.tsx                 — REWRITE (enhanced tour + welcome splash)
  WelcomeSplash.tsx               — NEW: Full-screen welcome overlay
  dashboard/
    ActivationChecklist.tsx       — ENHANCE (animations + tooltips)
  AppLayout.tsx                   — FIX (data-tour bug + new targets)
  NotificationBell.tsx            — ADD data-tour attribute
```

### Key Dependencies

- `framer-motion` (already installed)
- `react-joyride` (already installed)
- No new packages needed

### Data Flow

```
onboardingV2Store
  ├── enrichment.company_name ──→ walkthrough-data.ts ──→ InstantReplayPanel
  ├── manualData.company_name ──┘                         (personalized scenes)
  ├── enrichment.products ──────┘
  └── enrichment.industry ──────┘

completeOnboarding()
  ├── localStorage.sixty_onboarding_completed_at ──→ WelcomeSplash
  └── localStorage.sixty_onboarding_completed_at ──→ ProductTour
       └── user.id ──→ localStorage.sixty_tour_completed_{userId}
```

---

## Story Breakdown

### Phase 1: Foundation (WOW-001 to WOW-003)
- Animation utilities, data layer, typewriter hook

### Phase 2: Instant Replay Rewrite (WOW-004 to WOW-008)
- 4 acts + orchestrator

### Phase 3: Dashboard Tour (WOW-009 to WOW-012)
- Fix targets, welcome splash, enhanced Joyride, personalization

### Phase 4: Checklist Enhancement (WOW-013 to WOW-014)
- Animations, celebrations, tooltips

### Phase 5: Polish (WOW-015)
- End-to-end flow testing, timing adjustments, edge cases

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| No company name (skipped enrichment) | Fall back to domain-derived name, then "your company" |
| No products extracted | Use generic "your solution" / "your product" |
| User refreshes during walkthrough | Resume from offer state (walkthrough restarts) |
| Tour targets not in DOM | Joyride auto-skips missing targets (built-in) |
| User dismisses tour immediately | ActivationChecklist serves as permanent reference |
| Mobile viewport | Walkthrough adapts to single-column, tour uses center positioning |

---

## Rejected Alternatives

1. **Keep SSE pipeline with better data** — Rejected. Network dependency = failure modes. Client-side is more reliable and controllable.
2. **Use real meeting data** — Rejected. User may not have meetings yet. Demo must always work.
3. **Skip walkthrough, just improve tour** — Rejected. The onboarding ending IS the wow moment. Tour alone can't carry it.
4. **Full-page cinematic (like demo-experience)** — Rejected for onboarding context. Too long. 18 seconds is the sweet spot.
5. **Lottie animations** — Rejected. Adds package dependency. Framer-motion already handles everything we need.

---

## References

- [Demo Experience PRD](.sixty/consult/demo-experience.md) — Full product vision with 22 scenes
- [Design Tokens](.claude/skills/sixty-design-system/tokens.md) — Colors, glassmorphism, animation patterns
- [Component Patterns](.claude/skills/sixty-design-system/components.md) — Card, badge, button standards
- [Onboarding V2 Store](src/lib/stores/onboardingV2Store.ts) — Company data access patterns
- [Current InstantReplayPanel](src/components/onboarding/InstantReplayPanel.tsx) — What we're replacing
- [Current ProductTour](src/components/ProductTour.tsx) — What we're enhancing
