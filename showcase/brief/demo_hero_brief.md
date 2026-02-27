# use60 — Interactive Demo Experience Brief

**Project:** Website Demo / Lead Magnet → Waitlist & Account Activation
**Date:** 23 February 2026
**Author:** Andrew Bryce / Sixty Seconds Ltd
**Status:** Planning

---

## 1. Executive Summary

Build a website demo experience that takes visitors from "what is this?" to "I need this" in under 3 minutes. The user enters their website URL, watches multi-agent research run in real-time (~5 seconds), sees personalised bento box animations of what use60 agents would do for *their* business, completes Skills V3 onboarding, tests the Copilot with contextualised demo prompts, and signs up — all before we ask for a single piece of personal information.

The demo doubles as a lead magnet for the waitlist and a direct path to full account activation, with A/B testing between both conversion goals.

---

## 2. User Journey — Step by Step

### Step 1: Hero Landing

**What the user sees:**

A clean hero section (light mode or dark mode, matching the website theme) with a single compelling headline and one input field.

**Headline options (ranked):**

1. "Meet your AI sales team" — simple, bold, implies multiple agents
2. "Your sales agents are ready. Tell them who you are." — creates intrigue, implies personalisation
3. "Activate your AI sales agents" — action-oriented, multi-agent positioning
4. "What if you had 6 sales agents working 24/7?" — specific number ties to the 6 specialist agent types

**Input field:** "Enter your website URL" with placeholder text showing `yourcompany.com`

**Below the input:** A subtle text link: "Just exploring? Try with example.com →" — this loads a pre-built demo using a fictional but realistic SaaS company so nobody bounces because they don't want to share their URL.

**CTA button:** "Activate Agents" or "Go" — needs to feel immediate, not form-like.

**Design notes:**
- No navigation bar, no pricing, no feature list — just the headline, input, and button
- The page should feel like a product, not a marketing site
- Light mode default, dark mode available (user preference or system detection)
- Mobile: Full-width input, large tap target for the button


### Step 2: Value Bridge (Transition Text)

**What happens:** After the user enters their URL and hits the button, before the research kicks off, we show a brief animated text sequence that builds excitement and explains what's about to happen.

**Text sequence (appears line by line, ~0.5s between each):**

> "Right now, 6 AI agents are about to research your business..."
> "They'll find your ICP, understand your product, and identify opportunities..."
> "Then we'll show you exactly what they'd do for you — every day."

**Purpose:** This 2-3 second bridge prevents the user from feeling confused about why they're waiting. It builds anticipation and frames the research as impressive, not slow.

**Design notes:**
- Text fades in sequentially, each line appearing below the last
- Subtle animation — no spinning loaders or progress bars here
- On mobile, keep text concise (may need shorter copy)
- This transitions seamlessly into the agent research visual


### Step 3: Multi-Agent Research (Live Visual Demo)

**What happens:** The existing multi-agent visual demo kicks in. The agents run research on the user's website in real-time, completing in approximately 5 seconds.

**Live scoring / descriptive output:**

As the agents work, display real-time descriptive findings rather than abstract progress bars:

```
🔍 Research Agent — Scanning yourcompany.com...
   Found: B2B SaaS, project management vertical
   
👥 ICP Agent — Building ideal customer profile...
   Identified: Mid-market ops teams, 50-200 employees
   
📊 Signal Agent — Analysing market signals...
   Found: 3 competitor mentions, 2 hiring signals
   
📝 Content Agent — Learning your voice...
   Analysed: Product positioning, value propositions
   
🎯 Strategy Agent — Mapping opportunities...
   Identified: 12 actionable outreach angles
   
✅ All agents ready — 47 signals found, 12 actions queued
```

**The research must output structured JSON** that feeds directly into the bento box animation. The JSON schema should include:

```json
{
  "company": {
    "name": "Acme Corp",
    "domain": "acme.com",
    "vertical": "B2B SaaS",
    "product_summary": "Project management for construction teams",
    "value_props": ["Real-time scheduling", "Budget tracking", "Subcontractor management"],
    "icp": {
      "title": "Operations Manager",
      "company_size": "50-200",
      "industry": "Construction / Engineering"
    }
  },
  "demo_actions": {
    "cold_outreach": {
      "target_name": "Sarah Chen",
      "target_title": "VP Operations",
      "target_company": "BuildRight Construction",
      "personalised_hook": "Noticed BuildRight expanded to 3 new regions this quarter...",
      "email_preview": "Hi Sarah, I saw BuildRight's expansion into the Southeast..."
    },
    "proposal_draft": {
      "prospect_name": "James Wright",
      "prospect_company": "TechFlow Engineering",
      "proposal_title": "How Acme Corp streamlines project delivery for TechFlow",
      "key_sections": ["Current challenges", "Proposed solution", "ROI projection", "Timeline"]
    },
    "meeting_prep": {
      "attendee_name": "David Park",
      "attendee_company": "Zenith Builders",
      "context": "Follow-up from initial demo, interested in budget tracking module",
      "talking_points": ["Budget overrun reduction", "Real-time visibility", "Integration with existing tools"]
    },
    "pipeline_action": {
      "deal_name": "Meridian Group — Enterprise",
      "days_stale": 18,
      "risk_signal": "Champion hasn't opened last 3 emails",
      "suggested_action": "Re-engage via LinkedIn, reference their Q2 expansion plans"
    }
  },
  "stats": {
    "signals_found": 47,
    "actions_queued": 12,
    "contacts_identified": 8,
    "opportunities_mapped": 4
  }
}
```

**Edge case handling:**

- **Invalid URL / personal blog / non-business site:** Validate the URL immediately on submission. If it doesn't resolve, isn't a business site, or returns insufficient data, show a friendly message: "We couldn't find enough to personalise your demo. Try with example.com instead →" and auto-populate the example.com demo.
- **Competitor URL (e.g., gong.com, clari.com):** Run the demo normally — it's actually a great sales opportunity. The bento box will show how use60 differs from their current tool.
- **Very large company (e.g., google.com):** The demo still works, but the ICP/targeting will be broader. The example.com fallback isn't needed here.
- **example.com path:** Pre-built JSON with a fictional but compelling SaaS company (e.g., "Velocity CRM — Sales acceleration for mid-market teams"). This should feel just as real and impressive as a live result.


### Step 4: Bento Box Animation (Personalised Agent Actions)

**What the user sees:** An animated bento grid showing 4 simulated agent actions, all populated with data from the research JSON. Each box represents a different agent capability, with the user's business context woven throughout.

**The 4 bento boxes:**

| Box | Agent Action | Content Source |
|-----|-------------|---------------|
| 1 | **Cold Outreach** | Uses `demo_actions.cold_outreach` — shows a realistic email being composed in real-time with the prospect's name, personalised hook, and company context |
| 2 | **Proposal Draft** | Uses `demo_actions.proposal_draft` — shows a proposal outline being generated with section headers and the prospect's company name |
| 3 | **Meeting Prep Brief** | Uses `demo_actions.meeting_prep` — shows a pre-meeting brief appearing with attendee intel, talking points, and deal context |
| 4 | **Pipeline Action** | Uses `demo_actions.pipeline_action` — shows a stale deal alert with the risk signal and suggested re-engagement action |

**Animation behaviour:**

- **Desktop:** All 4 boxes visible in a 2×2 grid. Each box animates in sequence (box 1 starts, box 2 follows ~1s later, etc.) so the user's eye moves naturally across the capabilities.
- **Mobile:** Boxes stack vertically and animate one at a time as the user scrolls. Each box takes full width and shows its animation when it enters the viewport. This creates a "story" feel on mobile — scroll through each agent action like a feed.

**Animation details for each box:**

- Text appears character by character (typewriter effect) to simulate the AI writing in real-time
- Subtle UI chrome around each box to make it feel like a real product screen (not a marketing mockup)
- Each box has a small agent icon and label (e.g., "✉️ Outreach Agent" / "📋 Proposal Agent" / "🎯 Prep Agent" / "📊 Pipeline Agent")
- After the typing animation completes, a subtle "✓ Ready for review" badge appears

**Design notes:**
- The bento boxes should use the Sixty design system (glassmorphic dark mode aesthetic if dark mode, clean light if light mode)
- Each box should feel like a snapshot of the actual product UI — this is selling the experience, not just the concept
- Include realistic details: timestamps, contact avatars (generic/placeholder), deal stages, email formatting


### Step 5: Results Summary & Transition to Onboarding

**What the user sees:** After the bento box animation completes, the results consolidate into a summary card:

**"Your Sales Intelligence Report"**

- 47 signals found across your market
- 12 actions your agents could take today
- 8 key contacts identified
- 4 opportunities ready to pursue

**Below the summary:**

> "Want to see what your agents can really do? Let's set them up."

**CTA:** "Set Up My Agents →"

This transitions the user into the Skills V3 onboarding flow. The key insight is that the user is already excited — they've seen the personalised output — so the onboarding doesn't feel like a chore, it feels like unlocking what they've just previewed.

**The Sales Intelligence Report is saved** and will be emailed to the user once they provide their email at signup. This serves as both a lead magnet deliverable and a re-engagement hook.


### Step 6: Skills V3 Onboarding

**What happens:** The user goes through the existing Skills V3 onboarding flow. Because the multi-agent research has already gathered company context, some onboarding fields can be pre-populated:

- Company name → pre-filled from research
- Industry/vertical → pre-filled from research
- ICP description → suggested from research (user can edit)
- Product description → suggested from research (user can edit)

**Key principle:** The onboarding should feel like it's refining what the agents already know, not starting from scratch. Frame the questions as "We found X — is this right?" rather than "Tell us about your business."

**What's NOT collected here:** Email, name, password, payment info — none of that yet. The user is still anonymous. This is purely product configuration.


### Step 7: Copilot Demo Screen

**What the user sees:** A Copilot interface (matching the real product UI) with 4 contextualised demo prompts. These are populated using the research JSON and the onboarding data.

**The 4 demo prompts:**

1. **"Write cold outreach to [Target Name] at [Target Company]"** — Uses the cold outreach data from the research. The Copilot generates a full personalised email using the user's product context and the target's profile.

2. **"Draft a proposal for [Prospect Company]"** — Uses the proposal data. Generates a structured proposal outline with personalised sections based on the prospect's industry and pain points.

3. **"Prepare me for my meeting with [Attendee Name]"** — Uses the meeting prep data. Generates a full pre-meeting brief with company intel, previous interactions (simulated), talking points, and potential objections.

4. **"What should I do about the [Deal Name] deal?"** — Uses the pipeline action data. Generates a deal risk analysis with the stale signal, suggested next steps, and a re-engagement message draft.

**Behaviour:**

- User clicks a prompt → Copilot generates the response in the chat interface (streaming, like the real product)
- The response uses all the context from the research + onboarding
- After each response, the user can try another prompt
- Each response includes a subtle "This is a demo — sign up to use with your real data" footer

**Design notes:**
- This should look and feel exactly like the real Copilot — same UI, same streaming behaviour, same formatting
- The demo prompts should be large, clickable cards above the chat input
- The chat input itself should be disabled or show "Sign up to type your own prompts"


### Step 8: Signup / Conversion

**What the user sees:** After testing at least 1 Copilot demo prompt (or after scrolling past them), a signup modal or section appears:

**Primary path (Account Activation):**

> "Your agents are ready. Create your account to start."
>
> [Email input] → "Send Magic Link"
>
> "We'll send you a login link — no password needed."

**Secondary path (Waitlist — for A/B testing):**

> "Your agents are almost ready. Join the waitlist for early access."
>
> [Email input] → "Join Waitlist"
>
> "We'll let you know when your account is ready."

**Post-email capture flow:**

1. **Check email enrichment** — Hit Apollo or AI Ark with the email to try to get the user's name, title, company (for CRM and personalisation)
2. **If enrichment succeeds:** Skip the name collection step, go straight to magic link delivery
3. **If enrichment fails:** After they click the magic link and land in the app, show a simple "What's your name?" screen before they hit the dashboard
4. **Skills onboarding is already complete** — they did it in Step 6, so there's no additional setup required. They land in the product ready to go.

**What gets saved:**
- All research JSON from Step 3
- Onboarding data from Step 6
- Demo interaction data from Step 7 (which prompts they tried, how long they spent)
- The Sales Intelligence Report from Step 5

**What gets sent:**
- The Sales Intelligence Report is emailed to the user immediately after email capture (for both waitlist and activation paths)
- For activation: magic link email
- For waitlist: confirmation email with the report attached and a "you're #X on the list" message


---

## 3. Conversion Strategy

### A/B Test: Activation vs. Waitlist

**Variant A — Direct Activation:**
- User enters email → receives magic link → logs in → lands in the product with their onboarding already complete
- Pros: Immediate conversion, user is in the product while excitement is high
- Cons: Higher infrastructure commitment per user, may attract low-intent signups
- Measure: Activation rate, Day 1 retention, first meeting processed within 7 days

**Variant B — Waitlist:**
- User enters email → receives confirmation + Sales Intelligence Report → enters nurture sequence → receives invite when ready
- Pros: Builds anticipation, allows batch onboarding, filters for intent
- Cons: Longer time to activation, drop-off risk during wait
- Measure: Waitlist-to-activation conversion rate, email open rates, eventual Day 1 retention

**Split:** 50/50 initially, then shift toward whichever produces better 7-day retention (not just signup rate).


### Lead Scoring from Demo Behaviour

Track these signals during the demo to score leads:

| Signal | Score Weight |
|--------|-------------|
| Entered their own URL (vs. example.com) | High |
| Completed onboarding in full | High |
| Tried 3+ Copilot prompts | High |
| Spent >2 minutes on bento box section | Medium |
| Tried 1 Copilot prompt | Medium |
| Used example.com demo | Low |
| Bounced before bento box | Disqualify |

This scoring feeds into the email nurture sequence — high-intent leads get fast-tracked, low-intent get more education.


---

## 4. Technical Requirements

### 4.1 Multi-Agent Research Backend

**Endpoint:** POST `/api/demo/research`
**Input:** `{ url: "yourcompany.com" }`
**Output:** Structured JSON (schema in Step 3 above)
**Target latency:** <5 seconds
**Error handling:** If research fails or returns insufficient data, return a flag that triggers the example.com fallback on the frontend.

**What the research actually does:**
1. Scrape the website (homepage + key pages) for company info, product description, positioning
2. Identify the vertical/industry
3. Generate a plausible ICP based on the product and market
4. Create realistic demo actions (outreach targets, proposal prospects, meeting attendees, pipeline deals) using the company context
5. Package everything as JSON

**Note:** The demo actions don't need to be real companies — they should be plausible and industry-appropriate. The point is to show the *kind* of personalisation, not to provide actual lead data before signup.


### 4.2 Frontend Architecture

- **Framework:** React (matches existing use60 platform)
- **Routing:** Single-page scroll experience, no page transitions
- **State:** Research JSON flows through all subsequent components
- **Animation:** Framer Motion or similar for bento box animations
- **Responsive:** Mobile-first with specific mobile breakpoints for bento box (stack vs. grid)
- **Theme:** Light/dark mode toggle, defaulting to system preference, using Sixty design system tokens


### 4.3 Data Persistence (Pre-Signup)

Before the user provides an email, we need to persist their data locally:

- **localStorage:** Research JSON, onboarding data, demo interaction log
- **Session identifier:** Anonymous UUID generated on first visit, used to link pre-signup data to the eventual account
- **On signup:** All localStorage data is sent to the backend and associated with the new user record. localStorage is cleared.


### 4.4 Enrichment Pipeline (Post-Email Capture)

1. User provides email
2. **Parallel calls:**
   - Apollo: lookup by email → name, title, company, LinkedIn
   - AI Ark: supplementary enrichment if Apollo returns incomplete data
3. **If name found:** Skip name collection, proceed to magic link or waitlist confirmation
4. **If name not found:** Flag for post-login name collection
5. **Store enrichment data** against the user record for personalisation


---

## 5. Mobile Experience

The experience must be excellent on mobile. Sales teams browse on phones constantly.

**Key mobile adaptations:**

- **Hero:** Full-width input, large "Activate" button, keyboard-friendly URL input
- **Value bridge text:** Shorter copy, same sequential reveal
- **Agent research:** Same live scoring display, but in a single column
- **Bento box:** Breaks into 4 stacked full-width cards. Each card animates when it scrolls into view (intersection observer). This creates a "story" feel — swipe through each agent action
- **Results summary:** Compact card format
- **Onboarding:** Already mobile-optimised (Skills V3)
- **Copilot demo:** Full-width prompt cards, stacked vertically. Chat interface adapts to mobile viewport
- **Signup:** Sticky bottom CTA that becomes more prominent after the user engages with demos


---

## 6. Content & Copy Requirements

### Hero Variants (for A/B testing)

| Variant | Headline | Subtext |
|---------|----------|---------|
| A | "Meet your AI sales team" | "Enter your website. Watch them go to work." |
| B | "Your sales agents are ready" | "Tell them who you are." |
| C | "6 AI agents. Zero admin." | "See what they'd do for your business." |
| D | "What happens when AI runs your sales ops?" | "Enter your URL to find out." |

### Example.com Fallback Copy

The fictional company for the example.com path:

- **Company:** "Velocity CRM"
- **Product:** "Sales acceleration platform for mid-market SaaS teams"
- **Vertical:** B2B SaaS
- **ICP:** VP Sales / Head of Revenue at 50-200 person SaaS companies
- Demo actions use fictional but realistic targets in the SaaS space

### Signup Copy Variants

| Variant | Headline | CTA |
|---------|----------|-----|
| Activation | "Your agents are ready. Let's go." | "Send me a login link" |
| Waitlist | "You're early. We like that." | "Join the waitlist" |


---

## 7. Success Metrics

| Metric | Target | Notes |
|--------|--------|-------|
| Hero → Research start | >80% | URL submission rate |
| Research → Bento box completion | >70% | Did they watch the whole demo? |
| Bento box → Onboarding start | >50% | Clicked "Set Up My Agents" |
| Onboarding → Copilot demo | >80% | Onboarding completion |
| Copilot demo → Signup | >40% | Email capture rate |
| Signup → Account activation (Variant A) | >60% | Magic link click rate |
| Waitlist → Eventual activation (Variant B) | >20% | Long-term conversion |
| Overall visitor → Email captured | >15% | End-to-end conversion |
| Average time on demo | 2-4 min | Sweet spot — fast enough to not bore, long enough to build excitement |
| Mobile completion rate | Within 80% of desktop | Mobile parity target |


---

## 8. Open Questions & Decisions Needed

1. **Credit budget per demo visitor:** The multi-agent research consumes API calls. What's the acceptable cost per anonymous demo run? (Affects how rich the research can be.)

2. **Rate limiting:** How do we prevent abuse (e.g., scraping competitor sites via our demo, or running hundreds of demos to burn our API budget)?

3. **Demo Copilot backend:** Does the Copilot demo hit the real AI backend (with a demo-mode flag), or do we pre-generate responses based on the research JSON? Real backend = more impressive but more expensive per visitor. Pre-generated = cheaper but less dynamic.

4. **Onboarding scope:** How much of Skills V3 onboarding do we expose in the demo? Full flow, or a trimmed version that covers the essentials?

5. **Analytics tooling:** What are we using to track the funnel? (Posthog, Mixpanel, custom?) Need event tracking at each step transition.

6. **SEO / sharing:** Should the demo experience be at use60.com or a separate domain (e.g., demo.use60.com)? Does the demo URL need to be shareable (e.g., "see what use60 found for acme.com")?

7. **Returning visitors:** If someone comes back to the demo page after already completing it, do we show them their previous results, let them re-run, or push them straight to signup?


---

## 9. Implementation Phases

### Phase 1: Core Demo Flow (Week 1-2)
- Hero with URL input and example.com fallback
- Multi-agent research endpoint returning structured JSON
- Value bridge text animation
- Agent research visual with live descriptive output
- Edge case handling (invalid URL, non-business sites)

### Phase 2: Bento Box & Results (Week 2-3)
- Bento box component with 4 personalised agent action panels
- Desktop 2×2 grid with sequenced animation
- Mobile stacked scroll-reveal variant
- Results summary card with stats
- Sales Intelligence Report generation

### Phase 3: Onboarding & Copilot Demo (Week 3-4)
- Skills V3 integration with pre-populated fields from research
- Copilot demo interface with 4 contextualised prompts
- Demo response generation (real or pre-generated — depends on decision above)
- Demo interaction tracking

### Phase 4: Signup & Enrichment (Week 4-5)
- Email capture with magic link flow (activation variant)
- Waitlist variant with confirmation flow
- Apollo / AI Ark enrichment pipeline
- Post-login name collection fallback
- A/B test infrastructure
- Sales Intelligence Report email delivery

### Phase 5: Polish & Analytics (Week 5-6)
- Full analytics event tracking
- A/B test variants for headlines, CTAs
- Performance optimisation (target: <3s initial load)
- Mobile QA across devices
- Rate limiting and abuse prevention
- Light/dark mode final polish

---

*This demo should make someone feel like they've already started using the product before they've even signed up. That's the goal.*/