# Sixty (use60) — Website Design Brief

**Document Version:** 1.0
**Prepared For:** Design Team
**Project:** use60.com Marketing Website
**Last Updated:** February 2026

---

## Table of Contents

1. Project Overview
2. Brand Identity
3. Design Inspirations
4. Website Architecture
5. Landing Page — Section-by-Section Breakdown
6. Demo Experiences
7. Copywriting Direction
8. Technical Requirements
9. Key Screens and Assets Needed

---

## 1. Project Overview

### What This Is

This brief covers the design and build of the primary marketing website for **Sixty** — a sales intelligence platform that automates the administrative work that follows every sales conversation. The website lives at **use60.com** and is entirely separate from the application itself (app.use60.com).

This is not an application interface. It is a marketing and education site whose sole job is to make a sales rep think: "I need this immediately."

### The Business Context

Sales reps lose 70% of their working week to admin — writing up meeting notes, chasing tasks they promised to complete, updating CRMs, drafting proposals. Sixty solves this by deploying an AI bot into every sales call, detecting every commitment made ("I'll send you a proposal by Friday"), and automatically executing the right workflow without the rep lifting a finger.

The product is in early access. The website must drive sign-ups from B2B sales professionals who are skeptical of AI hype but desperate for time back.

### Who This Website Is For

**Primary:** Quota-carrying Account Executives (AEs) and Sales Development Representatives (SDRs) at B2B companies with 5–200 people. They are 26–40 years old, live in their CRM and Slack, join 4–8 calls per day, and are constantly behind on follow-up.

**Secondary:** Sales managers and VP of Sales who want visibility into pipeline health and team performance without chasing reps for updates.

**Tertiary:** Founders of early-stage startups who are both the AE and the admin.

### What Success Looks Like

- A sales rep lands on the homepage, immediately understands what Sixty does, and signs up for early access within 90 seconds
- Bounce rate below 55%
- Average time on page above 2 minutes
- Early access form conversion rate above 8%
- No visitor needs to ask "but what does it actually do?" — the page shows them

### Design Mandate

The website must feel like it was built by the same intelligence that powers the product. It should feel fast, decisive, and slightly ahead of where the visitor expects a product at this stage to be. Not overproduced. Not undercooked. It should feel like meeting a very sharp salesperson who knows exactly what you need before you ask.

---

## 2. Brand Identity

### 2.1 Brand Name and Logo Treatment

**Brand Name:** Sixty

**Logo:** The brand uses "60" as its primary mark in certain contexts, with "Sixty" as the full wordmark. The logo should be displayed in white on dark backgrounds. A gradient version (brand blue to violet) is appropriate as an icon mark or favicon. Do not use the logo in isolation without testing against all background treatments used on the site.

**Favicon / App Icon:** A rounded square containing "60" in the primary gradient.

---

### 2.2 Color System

#### Primary Palette

| Name | Hex | Usage |
|---|---|---|
| Brand Blue | `#2A5EDB` | Primary buttons, active states, main links, the dominant brand color |
| Brand Violet | `#8129D7` | Gradient endpoints, premium accents, hover states, highlights |
| Brand Teal | `#03AD9C` | Success states, secondary CTAs, data validation icons, "live" indicators |

#### Background Palette (Dark Mode Primary)

| Name | Hex | Usage |
|---|---|---|
| Deep Background | `#030712` | Page backgrounds, hero sections |
| Surface Background | `#111827` | Cards, modals, section alternates |
| Elevated Surface | `#1F2937` | Input fields, secondary cards, nav background |
| Border Subtle | `rgba(255,255,255,0.08)` | Card borders, dividers |
| Border Default | `rgba(255,255,255,0.12)` | Inputs, table rows |

#### Text Palette

| Name | Hex | Usage |
|---|---|---|
| Text Primary | `#F9FAFB` | Headlines, primary body |
| Text Secondary | `#9CA3AF` | Subtext, meta labels, secondary body |
| Text Muted | `#6B7280` | Captions, disabled states, footnotes |
| Text Inverse | `#030712` | Text on light/gradient button backgrounds |

#### Gradient Definitions

| Name | Definition | Usage |
|---|---|---|
| Primary Gradient | `linear-gradient(135deg, #2A5EDB 0%, #8129D7 100%)` | Primary buttons, CTA elements, headline accents, dividers |
| Secondary Gradient | `linear-gradient(135deg, #03AD9C 0%, #2A5EDB 100%)` | Secondary accents, success states, feature highlights |
| Subtle Background Gradient | `radial-gradient(ellipse at top, rgba(42,94,219,0.12) 0%, transparent 60%)` | Ambient section backgrounds |
| Glow — Blue | `radial-gradient(circle, rgba(42,94,219,0.25) 0%, transparent 70%)` | Decorative orbs, card glows |
| Glow — Violet | `radial-gradient(circle, rgba(129,41,215,0.20) 0%, transparent 70%)` | Decorative orbs |
| Glow — Teal | `radial-gradient(circle, rgba(3,173,156,0.18) 0%, transparent 70%)` | Decorative orbs, success highlights |

#### Color Usage Rules

- The deep background `#030712` is the default page background. Never use pure black (`#000000`).
- Gradient text (background-clip technique) is permitted for single headline keywords or short phrases. Never apply gradient text to body copy or multi-line text.
- Brand Teal is not a primary button color. It is reserved for success, live status, and secondary accents.
- Avoid placing Brand Blue text on Brand Violet backgrounds and vice versa — insufficient contrast.

---

### 2.3 Typography

#### Font Stack

| Role | Font | Weight | Notes |
|---|---|---|---|
| Display Headlines (H1) | Urbanist | 800 (ExtraBold) | Large, impactful hero text |
| Section Headlines (H2–H3) | Urbanist | 700 (Bold) | All section titles |
| UI Labels / Eyebrows | Urbanist | 600 (SemiBold) | Small caps treatment, tag labels |
| Body Copy | Questrial | 400 (Regular) | All paragraph text |
| Subheadings / Callouts | Questrial | 400 (Regular) | Medium-weight visual contrast comes from size, not weight |
| Code / Technical | Fira Code | 400 | Inline code snippets if any |
| Fallback | Inter | — | System fallback for both fonts |

#### Type Scale (Desktop)

| Level | Font | Size | Line Height | Letter Spacing |
|---|---|---|---|---|
| Hero Headline | Urbanist 800 | 72–80px | 1.05 | -0.03em |
| H2 Section | Urbanist 700 | 48–56px | 1.1 | -0.02em |
| H3 Feature | Urbanist 700 | 32–36px | 1.15 | -0.01em |
| H4 Card Title | Urbanist 600 | 22–24px | 1.2 | 0 |
| Eyebrow Label | Urbanist 600 | 12–13px | 1.4 | 0.12em (uppercase) |
| Body Large | Questrial 400 | 18–20px | 1.65 | 0 |
| Body Default | Questrial 400 | 16–17px | 1.7 | 0 |
| Caption / Meta | Questrial 400 | 13–14px | 1.6 | 0 |

#### Typography Rules

- Eyebrow labels (short category labels above headlines, e.g., "MEETING AI" or "HOW IT WORKS") must be uppercase, letter-spaced, and coloured in Brand Teal or gradient text. Size 12–13px.
- Headlines should have a single keyword or short phrase highlighted in gradient text to break monotony without overusing the technique.
- Body text must never be smaller than 15px.
- Line lengths should be constrained to approximately 65–75 characters for body text columns.
- Use Urbanist for all UI element labels within demo mockups shown on the page.

---

### 2.4 Spacing and Layout

- **Max content width:** 1280px with 80px horizontal padding on desktop
- **Section vertical rhythm:** 120px top/bottom padding on major sections, 80px on lighter sections
- **Card border radius:** 16px default, 12px for inner/nested elements, 24px for large feature cards
- **Button border radius:** 12px (not fully rounded — confident and professional, not playful)
- **Grid:** 12-column grid with 24px gutters
- **Mobile breakpoint:** Treat 768px and below as mobile. Use single-column layouts.

---

### 2.5 Component Style

#### Buttons

**Primary CTA:**
- Background: Primary gradient (`#2A5EDB` → `#8129D7`)
- Text: White, Urbanist SemiBold, 15px
- Padding: 14px 28px
- Border radius: 12px
- Box shadow: `0 4px 24px rgba(42, 94, 219, 0.35)`
- Hover: Shadow intensifies, slight scale (1.02), gradient shifts slightly brighter
- Active: Scale down (0.98)

**Secondary CTA:**
- Background: transparent
- Border: 1px solid `rgba(255,255,255,0.15)`
- Text: White, Urbanist SemiBold, 15px
- Hover: Border becomes `rgba(42,94,219,0.5)`, background becomes `rgba(42,94,219,0.08)`

**Ghost / Link Button:**
- No border, no background
- Text: Brand Blue or white
- Hover: Underline or slight opacity shift

#### Cards

- Background: `rgba(255,255,255,0.04)` with `backdrop-filter: blur(12px)`
- Border: `1px solid rgba(255,255,255,0.08)`
- Border radius: 16px
- Hover state (interactive cards): Border transitions to `rgba(42,94,219,0.3)`, subtle blue glow in box-shadow
- Padding: 24–32px

#### Input Fields

- Background: `rgba(255,255,255,0.06)`
- Border: `1px solid rgba(255,255,255,0.12)`
- Border radius: 12px
- Text: `#F9FAFB`
- Placeholder: `#6B7280`
- Focus: Border becomes `rgba(42,94,219,0.6)`, box-shadow `0 0 0 3px rgba(42,94,219,0.15)`
- Padding: 12px 16px

#### Icons

- Library: **Lucide React exclusively**. No emojis, no other icon libraries.
- Size: 20px default in body contexts, 24px in feature headers, 16px in meta/label contexts
- Colour: Brand Teal for positive/active states, Brand Blue for neutral actions, `#9CA3AF` for secondary labels
- Icons on feature cards may appear inside a small rounded container: 48×48px, background `rgba(42,94,219,0.12)`, border `1px solid rgba(42,94,219,0.2)`

---

### 2.6 Decorative Elements

#### Background Orbs

Soft, blurred gradient circles positioned behind content to create depth. Rules:

- Maximum 3 orbs visible at any time in a single viewport
- Opacity: 12–18% — visible but never distracting
- Colours: Brand Blue, Brand Violet, Brand Teal only
- Blur: `filter: blur(80–120px)`, dimensions 400–600px
- Do not animate continuously — they may move slowly on scroll parallax but should not pulse or loop

#### Gradient Lines / Dividers

Thin horizontal rules using the primary gradient at 30–40% opacity can replace flat dividers between sections.

#### Noise Texture Overlay

A subtle grain/noise texture (SVG filter or PNG overlay at 3–5% opacity) applied to background areas adds tactile depth popular in premium dark-mode sites. Optional but recommended.

---

### 2.7 Motion Principles

Sixty is a fast, autonomous product. Animations must feel decisive — not decorative.

| Principle | Guideline |
|---|---|
| **Enter animations** | Elements enter from below (Y: 20–24px), fade in from 0, duration 0.5–0.6s, easing: `cubic-bezier(0.16, 1, 0.3, 1)` (expo out) |
| **Stagger** | When multiple items enter together (feature cards, logos), stagger by 80–100ms |
| **Hover feedback** | Always immediate — max 150ms transition |
| **Page transitions** | Fade-through, 250ms |
| **Demo animations** | Can be more expressive (0.8–1.2s) but must feel purposeful |
| **Never** | Infinite spinning, bouncing, or looping animations that run constantly in the background |
| **Respect prefers-reduced-motion** | All animations must have a static fallback |

Recommended libraries: **Framer Motion** (already in the main app stack), or GSAP ScrollTrigger for scroll-driven sequences.

---

### 2.8 Tone of Voice

Sixty's voice is that of a brilliant sales colleague who also happens to be an AI. It is:

**Confident, not arrogant.** It states facts about what it does. It doesn't need to oversell.
**Precise, not technical.** It explains complex AI behaviour in plain language that a sales rep will immediately understand.
**Action-oriented, not aspirational.** Every sentence implies movement. Not "imagine a world where..." but "after every call, Sixty..."
**Dry wit is permitted, sparingly.** A single line that makes someone smirk is valuable. Three lines and it becomes a gimmick.

**Never:**
- Buzzword soup ("leverage synergies", "paradigm-shifting", "revolutionary AI")
- Passive voice where active voice is possible
- Conditional phrasing ("could help you", "might reduce") — state outcomes as facts
- Sentence fragments used as full paragraphs throughout (one or two are fine for effect; a page of them is exhausting)

---

### 2.9 Photography and Imagery Direction

- **No generic stock photography.** No smiling people on phones, no handshakes, no conference rooms with whiteboards.
- **Product UI is the hero visual.** The most powerful imagery on this site is a dark-mode screenshot or mockup of the actual Sixty interface — the pipeline view, the copilot chat, the meeting recording screen.
- **Abstract data visualisation** is permitted as decorative background elements — thin network graphs, flowing connection lines, node clusters — in very low opacity to suggest intelligence without being literal.
- **If human faces appear**, they should be in the context of video call thumbnails within product mockups (i.e., showing the product UI with simulated meeting attendees visible), not as editorial photography.
- **Illustrations over icons for complex concepts** — if a feature requires an explanatory diagram (e.g., the workflow automation chain), use a clean line-art diagram in the brand colour palette rather than a clipart-style illustration.

---

## 3. Design Inspirations

### 3.1 Reference: sendr.ai

**What we love and why:**

**Premium restraint.** Sendr.ai earns authority by showing less. White space is used as a signal of confidence — the product does not need to fight for attention. Sixty should apply this same restraint: never fill space for the sake of it.

**Typography as a design element.** On sendr.ai, large, bold headlines in a geometric font (Space Grotesk) are the primary design element on key sections. The type itself creates visual interest. Apply this to Sixty by letting Urbanist 800 do the work on section titles — large, slightly tight letter spacing, with a single gradient word as the accent.

**Animated gradient text.** Sendr.ai uses a CSS animation to cycle a headline through a gradient sweep, creating the impression of a word that is alive. For Sixty, apply this to one specific phrase in the hero — a word like "automatically" or "instantly" — where the gradient sweeps left to right on a 3-second loop. Use sparingly: one instance maximum on the hero.

**Semi-transparent card treatment.** Sendr.ai's feature cards sit on a light base with subtle 1px borders and very slight background fills. Translate this directly to Sixty's dark palette: `rgba(255,255,255,0.04)` fill, `rgba(255,255,255,0.08)` border, 16px radius, backdrop blur.

**Client logo strip at reduced opacity.** Sendr.ai places integration/client logos at 40–50% opacity as a social proof band. For Sixty, the integrations strip (Salesforce, HubSpot, Slack, Zoom, etc.) should use this treatment — logos in white at reduced opacity, with a subtle gradient fade on left and right edges.

**Scroll-based reveals.** Each new section enters as the user scrolls. On sendr.ai this is smooth and subtle — elements don't dramatically fly in, they simply appear with a fade+rise. Sixty should match this restraint.

**What to translate differently:**

Sendr.ai uses a light beige/cream base. Sixty is dark mode first. The same principles of restraint, typography-led design, and clean card layouts apply — but executed against the deep background palette. The overall mood shifts from "editorial magazine" to "intelligent cockpit."

---

### 3.2 Reference: farmminerals.com/products/croptab

**What we love and why:**

**Narrative vertical progression.** The CropTab page tells a story. You don't arrive on a features list — you arrive on a journey. Section 1 establishes the problem. Section 2 introduces the hero. Section 3 shows how it works. Section 4 validates with data. This is exactly the structure Sixty needs.

**GSAP character-by-character text reveals.** CropTab uses GSAP to animate headline text character by character as sections enter the viewport. For Sixty, apply this to H2 section headlines — the letters stagger into place over 0.6–0.8 seconds. This creates a sense of "the AI thinking" that is tonally appropriate.

**"How it works" with three distinct pathways.** CropTab has a clean three-step "how it works" section with icons, short titles, and concise descriptions. Sixty needs an equivalent — the three-step workflow (call joins → AI detects commitments → workflows execute automatically).

**Data-driven validation.** CropTab uses real numbers to prove claims. Sixty should do the same: "70% of a sales rep's week is admin", "2–3 hours to write a proposal". These appear as large, impactful callout numbers in a dedicated proof section.

**Smooth scrolling (Lenis).** CropTab uses Lenis for buttery smooth scroll behaviour. Sixty should implement Lenis for the same effect.

**Dynamic header colour shift on scroll.** For Sixty, the navigation bar should start transparent and transition to `rgba(3,7,18,0.85)` with `backdrop-filter: blur(16px)` once the user scrolls 80px.

**Early access application form.** CropTab uses a multi-field form for early access rather than a single email field. For Sixty, collect: First name, Last name, Work email, Company, Team size, and an optional "What's your biggest sales challenge?" text field.

**What to translate differently:**

CropTab uses a deep forest green with organic cream tones. Sixty is technological and sharp. Retain the narrative structure, scroll-based reveals, and data validation approach — replace organic textures with precision dark palette, brand-colour glows, and geometric UI elements.

---

## 4. Website Architecture

### 4.1 Sitemap

```
use60.com/
├── / (Homepage — primary focus of this brief)
├── /features
│   ├── /features/meeting-ai
│   ├── /features/copilot
│   ├── /features/workflows
│   └── /features/pipeline
├── /integrations
├── /pricing
├── /blog (future)
├── /about
├── /early-access (dedicated sign-up page)
└── Legal
    ├── /privacy
    └── /terms
```

### 4.2 Page Priority

This brief focuses on the **homepage** in full detail. Other pages share the visual language established here.

**Feature subpages** (Phase 2): Deeper dives into each feature for paid ad traffic with specific intent.

**Integrations page:** A grid of integration cards (logos, short description, status badge: Live / Coming Soon).

**Pricing page:** Simple, three-tier layout. One prominent tier highlighted. Early access pricing with original price struck through.

---

## 5. Landing Page — Section-by-Section Breakdown

The homepage is a single long-scroll page organised as a narrative. Every section earns the right to exist by either proving a claim or moving the visitor closer to signing up.

---

### Section 1: Navigation

**Purpose:** Persistent wayfinding. Transparent until scroll, then locked with blur.

**Content:**
- Left: Sixty logo / wordmark (white)
- Centre: Nav links — Features, Integrations, Pricing, Blog (Questrial 15px, white at 80% opacity, hover to 100%)
- Right: "Early Access" primary gradient button + "Sign in" ghost link

**Visual treatment:**
- Initial state: `background: transparent`
- Scrolled state (after 80px): `background: rgba(3,7,18,0.85)`, `backdrop-filter: blur(16px)`, `border-bottom: 1px solid rgba(255,255,255,0.08)`
- Transition: 300ms ease
- Mobile: Hamburger menu, full-screen drawer with same links in large Urbanist type

**Layout:** Full-width, 80px horizontal padding, max-width 1280px centred, fixed position

---

### Section 2: Hero

**Purpose:** Establish the product, the promise, and drive the first CTA click. This is the most important 4 seconds on the site.

**Suggested headline copy:**

Primary (H1):
> Your calls close deals.
> Let Sixty handle everything else.

Subheadline (Questrial, 20px, text-secondary):
> Sixty joins your sales meetings, detects every promise you make, and executes the follow-up automatically. No notes. No admin. No missed deals.

**CTA buttons:**
- Primary: "Join Early Access — 50% Off for Life"
- Secondary: "Watch a 2-min demo" (with a play icon from Lucide)

**Social proof micro-line** (immediately below CTAs, 13px, text-muted):
> Trusted by 400+ sales teams in early access — Salesforce, HubSpot, Slack and Zoom ready.

**Visual treatment:**

The hero visual is the most critical design decision on the page. A large (80% of viewport width on desktop) 3D-perspective tilted mockup of the Sixty app interface — specifically the **Post-Meeting View** showing:
- A completed meeting entry with a call recording
- A row of auto-detected commitments with teal checkmarks
- A generated follow-up email draft
- A Slack notification preview in the bottom corner

This mockup should sit at approximately 8–12 degrees of tilt (perspective transform) as if a physical screen is tilted toward the viewer — the same treatment used by Linear, Vercel, and Notion on their marketing sites. The mockup should be wrapped in a subtle glow (brand blue radial gradient at 20% opacity behind it).

**Background treatment:**
- Deep background `#030712`
- Three decorative orbs: one large blue (top-left, 500px, 15% opacity), one violet (centre-right, 400px, 12% opacity), one teal (bottom-left, 300px, 10% opacity)
- Extremely subtle noise texture at 4% opacity over everything

**Animations:**
- Hero text: Fade up with stagger (headline, subheadline, CTAs, social proof — 80ms between each)
- Mockup: Fades in after a 300ms delay, with a slow rise (Y: 30px → 0, duration 0.8s)
- After the page loads, a small "bot joining call" notification appears in the top-right of the mockup as an animated card sliding in from the right after 1.5s

**Layout:** Centred content, headline and CTAs left-aligned or centred (test both), mockup to the right on desktop, below on mobile.

---

### Section 3: Social Proof / Integrations Strip

**Purpose:** Rapid trust establishment. Show Sixty connects to tools the visitor already uses.

**Suggested eyebrow:** WORKS WITH YOUR EXISTING STACK

**Suggested headline:** Already inside the tools your team runs on.

**Content:**
Logo strip: Salesforce, HubSpot, Slack, Google Meet, Microsoft Teams, Zoom, Google Calendar, Fathom

**Visual treatment:**
- Logos in white at 45% opacity
- On hover: opacity increases to 85%, label appears below in 12px Questrial
- Left and right edges fade to transparent via CSS mask gradient
- Strip auto-scrolls infinitely and slowly (marquee-style) on mobile — static on desktop
- Below the logo strip: "Set up in 5 minutes. No IT ticket required."

---

### Section 4: Problem Statement ("The Cost of Admin")

**Purpose:** Name the pain before offering the cure. The visitor should read this and feel personally understood.

**Suggested eyebrow:** THE PROBLEM

**Suggested headline:**
> Every deal you're losing isn't going to a better product.
> It's going to a faster follow-up.

**Content — three pain cards:**

**Card 1 — The Time Problem**
Icon: `Clock` (Lucide)
Stat: **70%**
Label: "of a sales rep's week lost to admin — notes, emails, CRM updates, proposals."

**Card 2 — The Memory Problem**
Icon: `AlertCircle` (Lucide)
Stat: **1 in 3**
Label: "follow-ups never happen. The promise got made. The task never got created."

**Card 3 — The Speed Problem**
Icon: `Zap` (Lucide)
Stat: **2–3 hours**
Label: "to write a proposal. By the time you hit send, the prospect has moved on."

**Closing line:**
> The best reps aren't better at sales. They're faster at everything around it.

**Visual treatment:**
- Stat numbers in Urbanist 800, 56px, gradient text (blue to violet)
- Cards have a very subtle red/amber left border accent (3px, `rgba(239,68,68,0.4)`) — this is the only use of a non-brand colour on the page
- Cards stagger in from below on scroll, 100ms apart

---

### Section 5: Product Introduction ("Meet Sixty")

**Purpose:** The bridge from pain to solution.

**Suggested eyebrow:** THE SOLUTION

**Suggested headline:**
> Sixty joins every call.
> Then Sixty handles everything that comes after.

**Subheadline:**
> An AI teammate that listens, understands, and acts — so you can stay focused on the conversation, not the paperwork.

**Three-step visual flow:**

**Step 1:** `Bot` icon — "Sixty joins your meeting" — "Sixty sends a notetaker bot to your call — just like Otter or Fathom, but what comes next is completely different."

**Step 2:** `Brain` icon — "Detects commitments and intent" — "As the conversation unfolds, Sixty identifies every promise, every next step, every buying signal — in real time."

**Step 3:** `Zap` icon — "Workflows fire automatically" — "Before the call ends, the proposal is drafting. The task is created. The Slack alert is sent. The CRM is updated. You did nothing."

**Visual treatment:**
- Three steps connected by a flowing animated gradient line (teal → blue → violet) that draws itself left to right when the section enters the viewport
- The Interactive Workflow Demo sits below (detailed in Section 6)

---

### Section 6: Feature Deep-Dive — Meeting AI

**Purpose:** Sell the first and most tangible feature.

**Suggested eyebrow:** MEETING INTELLIGENCE

**Suggested headline:**
> Your second brain was in the room.
> You just didn't know it.

**Content — left/right split:**

**Left side (text):**
Feature list with Lucide icons:
- `Mic` — Automatic bot joins via Google Meet, Zoom, and Teams
- `FileText` — Full transcript with speaker diarisation
- `Target` — Commitment detection: "I'll send that", "Let me check and get back to you"
- `TrendingUp` — Buying signal identification: urgency language, competitor mentions, budget signals
- `BookOpen` — Pre-meeting brief auto-generated from CRM history and past conversations
- `Send` — Post-meeting follow-up pack: buyer email draft + internal Slack summary

**Right side (visual):**
A stacked layered deck of three interface elements:
1. Meeting recording view (waveform, speaker labels, transcript snippet)
2. Commitment detection panel (2–3 detected commitments with workflow trigger indicators)
3. Pre-meeting brief card (contact name, deal stage, last interaction, suggested talking points)

---

### Section 7: Feature Deep-Dive — Autonomous AI Copilot

**Purpose:** Showcase the conversational AI that knows the full pipeline.

**Suggested eyebrow:** AI COPILOT

**Suggested headline:**
> Ask it anything about your pipeline.
> It already knows the answer.

**Subheadline:**
> The Sixty copilot has persistent memory across every deal, every contact, every conversation. It doesn't need context. It has context.

**Capability card grid (2 rows × 3):**

1. `Search` — "Who needs attention today?" — Surfaces deals that have gone quiet, contacts without recent activity, follow-ups due today.
2. `FileEdit` — "Draft a proposal for Acme" — Generates a full proposal draft using deal context, product details, and conversation history.
3. `Mail` — "Write my follow-up to Sarah" — Drafts a personalised follow-up email referencing what was discussed on the last call.
4. `PieChart` — "What's our win rate on Enterprise deals?" — Queries pipeline data and returns an answer with specifics.
5. `Calendar` — "What do I need to know before my 2pm?" — Generates a pre-meeting brief with history, context, and suggested talking points.
6. `Layers` — "Update the Acme deal to Proposal Sent" — Takes direct CRM actions via natural language.

Below the grid: the **Copilot Chat Demo** (see Section 6: Demo Experiences).

---

### Section 8: Feature Deep-Dive — Workflow Automation

**Purpose:** Show the "no-click required" automation layer.

**Suggested eyebrow:** SMART WORKFLOWS

**Suggested headline:**
> You said "I'll send the proposal."
> Sixty heard "draft the proposal."

**Subheadline:**
> Every promise you make in a call can trigger an automated workflow. Not a reminder. Not a task. The actual work — done.

**Three workflow examples (static rows or expandable accordion):**

**"I'll send the proposal"**
Triggers: Draft proposal using deal context + templates → attach to email draft → create task "Send proposal" due in 48 hours → notify Slack deal channel

**"Let me check availability for a call"**
Triggers: Generate available times from calendar → draft scheduling email with Calendly link → create follow-up task

**"I'll loop in our technical team"**
Triggers: Draft introduction email → notify technical contact on Slack → create deal stakeholder record in CRM

**Closing line:** "You define the workflows once. Sixty fires them forever."

---

### Section 9: Pipeline Intelligence

**Purpose:** Appeal to sales managers and reps who want deal visibility without manual CRM hygiene.

**Suggested eyebrow:** PIPELINE INTELLIGENCE

**Suggested headline:**
> See every deal. Know which ones need you.

**Subheadline:**
> Sixty scores relationship health on every open deal — surfacing which are slipping, which are warming, and which need action today.

**Large pipeline mockup** (full-width, breaking slightly out of the content container):
- Deal cards in a kanban or list layout
- Relationship health indicators (green/amber/red dot with label: Healthy / At Risk / Slipping)
- Small activity timeline per card ("last contact: 3 days ago")
- A "Sixty recommends:" tooltip overlay: "Last contact was 8 days ago. Draft a check-in?"

**Three capability callouts below:**

1. `Activity` — **Automatic Relationship Scoring** — Calculated from last contact date, response times, meeting frequency, and sentiment analysis of recent conversations.
2. `Bell` — **Proactive Alerts** — Slack and in-app alerts when deals go cold, proposals go unread, or key stakeholders go quiet.
3. `BarChart2` — **Pipeline in Plain English** — Ask the copilot "what's my pipeline looking like this week?" and get a clear, honest summary.

---

### Section 10: Proof / Numbers Section

**Purpose:** Validate claims with specifics before asking for commitment.

**Suggested eyebrow:** BY THE NUMBERS

**Suggested headline:** The math is simple.

**Four large stat callouts:**

| Stat | Label |
|---|---|
| 70% | "Of a rep's week lost to admin — recovered when Sixty handles it" |
| 5 min | "Average time from call end to follow-up sent with Sixty. Industry average: 26 hours." |
| 3× | "More proposals sent per rep per week in the first month" |
| 50% | "Lifetime discount for early access members — locked in, forever" |

**Optional testimonial pull quote below:**
> "I sent the follow-up email before the prospect even closed their Zoom window. They replied in 8 minutes. We closed the deal that week."
> — *Account Executive, Series B SaaS*

*(Replace with real testimonial when available. If none available, omit rather than fabricate.)*

**Visual treatment:**
- Stat numbers: Urbanist 800, 72px, gradient text (blue to violet)
- Stats animate by counting up from zero when section enters viewport
- Section has full-width subtle gradient background: `radial-gradient(ellipse at centre, rgba(42,94,219,0.08) 0%, transparent 70%)`

---

### Section 11: Early Access Sign-Up Form

**Purpose:** The primary conversion moment.

**Suggested eyebrow:** EARLY ACCESS

**Suggested headline:**
> Get early access.
> Lock in 50% off for life.

**Subheadline:**
> We're onboarding sales teams in batches. Apply now and we'll reach out within 48 hours with your access link.

**Form fields:**

1. First Name
2. Last Name
3. Work Email (validate domain, flag free email addresses with: "We notice you're using a personal email — a work email helps us set up your team workspace")
4. Company Name
5. Team Size (dropdown: Just me / 2–10 / 10–50 / 50–200 / 200+)
6. What integrations do you use? (multi-select pills: Salesforce / HubSpot / Slack / Zoom / Teams / Google Calendar / Other)
7. What's your biggest sales challenge? (optional textarea, 140 char limit)

**CTA button:** "Apply for Early Access →"

**Below form:**
- Lock icon + "No credit card required. No spam. Cancel anytime."
- "Join 400+ sales teams already on the waitlist" with three small avatar placeholders

**Visual treatment:**
- Form inside a card: `rgba(255,255,255,0.04)` background, `1px solid rgba(42,94,219,0.2)` border, 24px radius
- Subtle blue glow: `box-shadow: 0 0 80px rgba(42,94,219,0.15)`
- On submit: in-page success state with teal checkmark animation — do NOT redirect to a new page

---

### Section 12: Footer

**Content:**

Left: Logo, "The AI teammate for every sales call.", copyright.
Centre: Two link columns — Product (Features, Integrations, Pricing, Changelog) and Company (About, Blog, Privacy, Terms).
Right: Social links (LinkedIn, Twitter/X via Lucide icons).

**Visual treatment:**
- Footer background: `#030712` with top border `rgba(255,255,255,0.06)`
- Link text: text-muted with hover to text-secondary
- 60px vertical padding

---

## 6. Demo Experiences

These are interactive or animated moments embedded in the landing page — the primary "show, don't tell" proof of the product.

---

### Demo 1: The Workflow Trigger Demo
**Embedded in:** Section 8 (Workflow Automation)
**Dimensions:** ~480×360px, self-contained animated card, looping with "Replay" button

**Animation sequence (8 seconds, then restart):**

1. **(0–1.0s)** A simulated conversation transcript types out word by word:
   - Rep: "I'll get the proposal over to you by end of day Friday."
   - Prospect: "Perfect, looking forward to it."

2. **(1.0–1.8s)** The words "get the proposal over to you" pulse with a blue underline glow. A tag appears: "Commitment detected" with a teal dot.

3. **(1.8–2.4s)** A new panel slides up: "Sixty is executing your workflow..." with a progress bar in the primary gradient.

4. **(2.4–6.5s)** Four workflow steps appear one by one, each transitioning from "pending" (grey) to "done" (teal checkmark), staggered 1 second apart:
   - `FileText` — Draft proposal generated (from Acme deal context)
   - `Mail` — Email draft ready with proposal attached
   - `CheckSquare` — Task created: "Send proposal to Acme" due Friday
   - `Hash` — Slack alert sent to #deals channel

5. **(6.5–8.0s)** All four steps show teal checkmarks. Summary: "All done. You haven't left the call." Brief pause, then loop.

---

### Demo 2: The Copilot Chat Demo
**Embedded in:** Section 7 (AI Copilot)
**Dimensions:** ~420×480px chat interface mockup with "Try another question" button

**Demo conversation sequence 1 (default):**

User message (types character by character):
> Who needs attention in my pipeline today?

Copilot response (types out after 800ms thinking indicator):
> You have 3 deals that need attention today:
>
> **Acme Corp** — No contact in 9 days. Proposal was opened twice but not replied to. Suggest a follow-up.
>
> **Meridian Finance** — Sarah went quiet after the demo. Her last message asked about pricing. Draft a check-in?
>
> **TechFlow** — Contract was sent 6 days ago. No signature. Legal team may be reviewing — worth a nudge.
>
> Want me to draft follow-ups for any of these?

**Alternative conversation (via "Try another" button):**

User: "Draft a follow-up email to James at Meridian after yesterday's demo."

Copilot: Generates a personalized follow-up email draft with [Send] [Edit] [Copy] action buttons.

---

### Demo 3: The Before/After Pipeline Demo
**Embedded in:** Section 9 (Pipeline Intelligence)

A toggle switch: "Without Sixty" / "With Sixty"

**Without Sixty:** Deal cards with 14+ day old last-contact labels in red/amber, missing tasks, "At Risk" badges, no relationship health scores.

**With Sixty:** Same deals with relationship health indicators, "Check-in sent 2h ago — by Sixty" labels in teal, upcoming tasks, and a "Sixty Insights" sidebar.

**Toggle transition:** Smooth 400ms cross-fade with subtle scale animation.

---

### Demo 4: The Meeting Bot Joining Animation
**Embedded in:** Section 6 (Meeting AI)
**Dimensions:** ~400×320px, within the visual panel of the Meeting AI section

A simulated video call UI:
- 4 video tile placeholders (grey avatars with initials: "JM", "SR", "KB" + "Sixty Bot" with the Sixty logo avatar and blue border glow)
- Bottom notification slides in: "Sixty joined. Recording and transcribing."

After 1.5s, a sidebar panel slides in from the right — "Live Intelligence":
- "Buying signal detected: 'We need this before end of Q1'" — amber badge
- "Commitment: 'I'll send the technical spec over' — Rep" — blue badge

After another 1s, bottom bar: "Post-meeting pack will be ready in ~2 min after the call. Proposal draft will start automatically."

---

## 7. Copywriting Direction

### 7.1 Core Messages (in priority order)

1. **Sixty handles the work after the call automatically.** Not "helps you do it faster." Actually does it.
2. **The AI knows your entire pipeline.** Context, history, memory — it's not a blank-slate chatbot.
3. **The product exists today.** Real teams. Real early access. Not vapourware.
4. **Time is the real product.** Every feature maps back to returning hours to a sales rep's day.
5. **Getting started is fast.** No IT ticket. No 6-month implementation. Connect your calendar and you're live.

---

### 7.2 Good vs Bad Copy Examples

**Feature description:**
- Bad: "Leverage our cutting-edge AI to revolutionize your post-call workflow synergies."
- Good: "After every call, Sixty drafts the follow-up, creates the tasks, and updates your CRM. You close your laptop. The work is done."

**Pain statement:**
- Bad: "Many sales professionals struggle to find time for administrative duties."
- Good: "You made five promises in that call. You can remember three of them. Sixty remembers all five."

**Product introduction:**
- Bad: "Sixty is an innovative AI-powered sales intelligence platform that leverages machine learning."
- Good: "Sixty is an AI teammate that joins your calls, detects every commitment you make, and executes the follow-up before you've even said goodbye."

**CTA buttons:**
- Bad: "Get Started Today" / "Learn More" / "Sign Up Free"
- Good: "Join Early Access — 50% Off for Life" / "See Sixty in Action" / "Apply for Early Access"

---

### 7.3 Writing Rules

- **Lead with outcomes, not features.** Not "transcript with speaker diarisation" but "know exactly who said what, forever."
- **Use "you" and "your" constantly.** This is about the rep's life, not the product's capabilities.
- **Numbers are concrete.** "Saves hours" is weak. "Returns 12+ hours per week" is strong.
- **"Automatically" is the most important adverb on the site.** Use intentionally, sparingly — never more than twice in any given section.
- **Never say "AI-powered."** Say what the AI does: "detects", "drafts", "understands", "remembers", "executes".
- **Short sentences are fine. Very short sentences are often better.**

---

### 7.4 Section-Specific Copy Direction

**Hero:** The headline must work without the subheadline. Test it in isolation.

**Problem section:** Second person present tense — "You made five promises." Not "Sales reps make promises." Make the visitor feel directly addressed.

**How it works:** Short, active, sequential. Each step is a verb phrase. Simple subject-verb-object.

**Feature sections:** Each headline should have a light/shade dynamic — one literal line and one surprising line. "You said 'I'll send the proposal.' Sixty heard 'draft the proposal.'"

**Sign-up form:** "No credit card required. No spam." must be there. "We're onboarding in batches" creates urgency without fake countdown timers.

---

## 8. Technical Requirements

### 8.1 Framework and Stack

- **Framework:** React 18 with TypeScript
- **Build tool:** Vite
- **Styling:** Tailwind CSS
- **Animation:** Framer Motion (primary), GSAP ScrollTrigger (optional, for character text reveals)
- **Smooth scroll:** Lenis
- **Font loading:** Google Fonts (Urbanist + Questrial) with `font-display: swap` and preload hints
- **Form handling:** React Hook Form + Zod validation, POST to Supabase edge function
- **Routing:** React Router

The landing site lives in `/packages/landing` in the monorepo — this is the build target.

---

### 8.2 Performance Targets

| Metric | Target |
|---|---|
| Lighthouse Performance Score | 90+ |
| First Contentful Paint (FCP) | < 1.5s |
| Largest Contentful Paint (LCP) | < 2.5s |
| Cumulative Layout Shift (CLS) | < 0.1 |
| Total page weight | < 1.5MB gzipped |

**Performance notes:**
- All UI mockup images: WebP with AVIF fallback
- Mockup images: lazy-loaded with explicit width and height attributes
- Animation JS: code-split, loaded after initial render
- Lenis: ~12KB gzipped — acceptable
- Fonts: Load Latin character sets only
- Analytics: deferred, never render-blocking

---

### 8.3 Responsiveness

| Breakpoint | Width | Primary Layout |
|---|---|---|
| Mobile | 320–767px | Single column, full-width sections |
| Tablet | 768–1023px | Two columns where applicable |
| Desktop | 1024–1440px | Full multi-column layouts |
| Wide | 1441px+ | Max 1280px content, background fills edge |

**Mobile notes:**
- Demo experiences: simplified static end-states acceptable on mobile
- Navigation: Full-screen drawer, 44px minimum touch targets
- Hero mockup: Cropped portrait version, not the full tilted desktop view
- Form: All fields single-column, 48px minimum input height

---

### 8.4 Accessibility

- All interactive elements: visible focus styles (2px brand blue outline, 2px offset — never remove)
- Colour contrast: WCAG AA minimum throughout. Test gradient buttons specifically.
- Animated demos: `prefers-reduced-motion` fallback showing final static state
- Form validation errors: announced via `aria-live` regions
- All images: descriptive `alt` attributes. Decorative elements: `alt=""`
- Custom interactive components (toggle, chat demo): keyboard navigable

---

### 8.5 Browser Support

Chrome 110+, Firefox 110+, Safari 16+ (including iOS Safari — test `backdrop-filter` carefully), Edge 110+. No IE required.

---

### 8.6 Domain and Routing

- Site: `www.use60.com` (with redirect from `use60.com`)
- Application: `app.use60.com`
- "Sign in" nav link: `app.use60.com/login`
- "Early Access" and CTA buttons: In-page anchor `#early-access` or `app.use60.com/signup`

---

## 9. Key Screens and Assets Needed

The following UI mockups must be produced from the actual Sixty application or faithfully recreated as static mockups using the production design system. These are the most time-consuming asset requirement of the project.

---

### 9.1 Hero Asset — Post-Meeting Overview Screen

**Used in:** Section 2 (Hero)
**Must include:**
- Meeting title and date
- Recording playback UI (waveform or timeline)
- 3–4 detected commitments with trigger status (e.g., "Proposal draft — In progress", "Task created — Done", "Slack sent — Done")
- Generated follow-up email preview (partially visible)
- Small Slack notification card overlaid in the bottom corner
**Output:** PNG + WebP, 2400px wide, dark background `#030712`. Also as Figma frame for 3D perspective tilt treatment.
**Notes:** Realistic but anonymised data. Deal names: "Acme Corp", "Meridian Finance". Plausible but clearly fictional contact names.

---

### 9.2 Meeting Intelligence Screen Set

**Used in:** Section 6 (Meeting AI), Demo 4
**Three separate files to be composited as a layered deck:**
1. Transcript view — 6–8 lines of conversation, one line highlighted in blue (the detected commitment)
2. Commitment detection panel — 3 detected commitments with verbatim quotes and "workflow triggered" indicators
3. Pre-meeting brief card — Contact name, role, company, deal stage, last interaction summary, 3 suggested talking points
**Output:** Three individual PNG/WebP files at 800×600px on dark background.

---

### 9.3 AI Copilot Chat Interface

**Used in:** Section 7 (Copilot), Demo 2
**Must include:**
- At minimum 2 exchanges (user question + copilot response)
- One response containing a formatted email draft with Send / Edit / Copy action buttons
- Input field at the bottom with send button
- Copilot branding (avatar or icon)
**Output:** PNG/WebP at 800×900px, dark mode.

---

### 9.4 Pipeline / Deals View (Two Versions)

**Used in:** Section 9 (Pipeline Intelligence), Demo 3
**Version A (Without Sixty):** 5–6 deal cards with outdated last-contact dates, missing tasks, "At Risk" badges, no relationship health scores.
**Version B (With Sixty):** Same deals with relationship health scores, "Check-in sent 2h ago — by Sixty" labels in teal, upcoming tasks, "Sixty Insights" sidebar.
**Output:** Two PNG/WebP files at 1200×700px each.

---

### 9.5 Workflow Builder / Automation View

**Used in:** Section 8 (Workflow Automation)
**Must show one workflow:**
- Trigger: "Commitment detected: proposal"
- Four connected action steps: Generate proposal → Create email draft → Create task → Send Slack notification
- Each step as a connected card with icon, title, and "configured" status
**Output:** PNG/WebP at 800×700px.

---

### 9.6 Mobile App Screenshots (Phase 2)

Two portrait-orientation screenshots at 390×844px (iPhone 14 standard):
1. Copilot chat view on mobile
2. Post-meeting notifications view on mobile

These may be placed inside a device frame for use on the website.

---

### 9.7 Integration Logos

**Used in:** Section 3 (Integrations strip)
**Required (all in SVG, white/monochrome versions):**
Salesforce, HubSpot, Slack, Google Meet, Microsoft Teams, Zoom, Google Calendar, Fathom

Source from official brand asset pages / press kits. Verify usage rights for white/monochrome treatment per each brand's guidelines.

---

### 9.8 Favicon and Open Graph Image

**Favicon:**
- 32×32px and 16×16px ICO
- 180×180px Apple touch icon (PNG)
- SVG favicon for modern browsers
- Treatment: Rounded square, gradient background (brand blue `#2A5EDB` → brand violet `#8129D7`), "60" in white Urbanist 800

**Open Graph / Social Share Image:**
- 1200×630px
- Dark background, centred "sixty" wordmark, tagline "Turn your sales calls into instant action.", subtle gradient orb background
- Appears as preview card when URL shared on LinkedIn, Slack, or Twitter/X

---

*End of Design Brief*

**Document prepared by:** Sixty Product Team
**For questions on product features or access to the application for screen capture:** Contact the product team.
**Brand asset source:** All colours, typography, and guidelines defined in this document are authoritative. If anything conflicts with existing materials, this document takes precedence.
