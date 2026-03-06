# 60 Website Strategy Brief

## Executive Summary

Rebuild www.use60.com as a **living interactive demo** — not a marketing site with a demo bolted on. The entire website IS the product experience. Visitors don't read about 60, they USE it. Every section demonstrates a real capability with real (or personalised) data. The existing demo-v2 becomes the "Get Started" flow for visitors who've already seen the site.

For LinkedIn/email campaigns, ultra-short personalised `/t/{code}` links (just 21 characters) drop visitors straight into a **personal command center** pre-loaded with their company data. Full interaction tracking feeds into Slack for real-time lead intelligence.

**Who it's for:** Solo founders and small sales teams (1-5 reps) drowning in sales admin. They arrive from LinkedIn DMs, cold emails, or organic search.

**What it must achieve:** Stop the scroll. Show the magic. Convert to signup. Feed qualified leads into 60's own pipeline.

---

## Audience & Awareness

### Primary Persona
- **Title:** Founder, Head of Sales, Solo AE
- **Company:** 5-50 employees, B2B SaaS or services
- **Pain level:** High. They know they're dropping follow-ups and losing deals. They just don't have time to fix it.
- **Current stack:** Fragmented — Calendly + HubSpot/Pipedrive + Google Calendar + Notion + Gmail. Nothing talks to anything.

### Awareness Levels by Channel
| Channel | Awareness | What they need |
|---------|-----------|---------------|
| LinkedIn /t/ link | Problem-aware | Show them their data, blow their mind |
| Email campaign | Problem-aware | Personalised proof it works for THEM |
| Google organic | Solution-aware | Why 60 vs competitors |
| LLM referral | Most-aware | Fast path to signup |
| Direct / word-of-mouth | Most-aware | Confirm the hype, sign up |

---

## Competitive Landscape

### Key Competitors
| Competitor | Hero Pattern | Weakness (our opportunity) |
|-----------|-------------|---------------------------|
| Gong | Video-led, enterprise feel | No self-serve demo. Heavy. Expensive. |
| Apollo | Feature-list homepage | Overwhelming. Data tool, not an assistant. |
| Instantly | Clean, dark, metric-led | Email only. No meeting intelligence. |
| Attio | Minimal, design-forward | CRM only. No automation, no AI action. |
| Clay | Product-as-hero (spreadsheet) | Technical. Not for non-technical founders. |

### Our Positioning Gap
Nobody in the space lets you **experience the product with your own data before signing up**. Every competitor gates the experience behind signup + onboarding + data import. 60's demo-as-website is the differentiator itself.

**Positioning statement:** "One place that knows everything about your deals and actually does something about it."

---

## Site Architecture

### The Demo-as-Website Flow

The site is a **continuous interactive experience** with 8 sections. No traditional "landing page sections" — every section is a working demo of a capability.

```
SECTION STACK
=============

Section 1: HERO — Product-as-hero (HOOK)
  Pattern: Full-width immersive hero with a live URL input
  Content: "Finally, a sales tool that actually gets it."
  Subhead: One place for everything before and after the call.
  Action: Enter your website URL → triggers live research demo
  Animation: Physics-based particle system — data points orbiting a central node,
             representing scattered sales tools converging into one
  Proof: Subtle stats bar (15h saved/week · 41% more deals · 0 dropped follow-ups)
  CTA: URL input IS the CTA. Secondary: "See how it works" (scrolls to section 2)

Section 2: LIVE RESEARCH DEMO — Show the AI working (SHOW)
  Content: 6 AI agents researching the entered company in real-time
  What visitors see: Their company being analysed — signals found, contacts identified,
                     deal context built. This is the existing AgentResearch step, elevated.
  Animation: Agent grid with status progression. Radial progress ring.
             Data streams flowing between agent nodes (SVG animated paths).
  Transition: Smooth morph into the product showcase

Section 3: PRODUCT SHOWCASE — Interactive feature walkthrough (SHOW)
  Content: 5-panel interactive product tour showing what 60 created from their data:
    Panel 1: Meeting Intelligence — prep doc, talking points, risk signals
    Panel 2: Deal Command Center — health score, relationship map, next actions
    Panel 3: AI-Written Email — follow-up drafted in their tone, ready to send
    Panel 4: Slack Integration — real-time notifications, deal alerts
    Panel 5: Full Dashboard — everything in one view
  Navigation: Segmented progress bar + swipe + keyboard arrows
  Animation: Panel transitions with micro-interactions. Each panel has a subtle
             entrance animation specific to its content type.

Section 4: THE COORDINATION LAYER — Differentiation (DIFFERENTIATE)
  Headline: "One tool talking to twelve others."
  Content: Interactive integration map showing 60 connected to their actual stack
           (Gmail, Calendar, HubSpot/Pipedrive, Slack, Zoom, etc.)
  Visual: SVG animated connection diagram — data flowing between nodes
          Click an integration to see what 60 does with it
  Animation: Physics-based — nodes have gravity, connections pulse with data flow.
             Hover to highlight specific data paths.
  Nano Banana accent: Abstract AI-generated background texture (subtle, atmospheric)

Section 5: YOUR WEEK WITH 60 — Emotional peak (SHOW + PROVE)
  Content: Animated weekly recap personalised to their company
  Stats: Emails drafted, meetings prepped, follow-ups sent, deals tracked
  Animation: Counter animations, timeline visualisation of a week
  Tone: "Here's what your first week looks like."
  This is the existing WeekRecap step, refined with better animations

Section 6: SOCIAL PROOF LAYER — Trust (PROVE)
  Content: Real testimonials, company logos, key metrics
  Pattern: NOT a traditional testimonial carousel. Instead:
    - Logo bar (always visible, subtle)
    - 3 contextual quote cards with headshots and titles
    - Metric callouts: "Saved 127 hours in Q1" type specifics
  Animation: Gentle parallax on scroll. Cards fade in staggered.

Section 7: HOW IT GETS SMARTER — The trust flywheel (DIFFERENTIATE)
  Headline: "It learns you. Then it becomes you."
  Content: 3-step visual showing the autonomy progression:
    Week 1: 60 drafts, you approve everything
    Month 1: 60 handles routine, asks about edge cases
    Month 3: 60 runs your sales ops, you focus on conversations
  Visual: SVG animated timeline/progression with confidence meter
  Animation: Scroll-triggered progression. Each stage morphs into the next.

Section 8: SIGNUP — Convert (CONVERT)
  Headline: "Ready to stop dropping the ball?"
  Content: Account creation form (name, email, password)
  Pre-seeds: All demo research data carries into their account
  Social proof: "Join 500+ founders who got their evenings back"
  Animation: Subtle confetti/celebration on successful signup

FOOTER:
  Links: Privacy, Terms, Blog, Changelog
  Social: LinkedIn, Twitter/X
  Status: System status indicator
```

### /t/{code} — Ultra-Short Personalised Campaign Links

**URL structure:** `use60.com/t/{code}` (e.g. `use60.com/t/a7Kx9B`)

**Why /t/ and not /trynow/:**
- LinkedIn DMs have character pressure — every character counts
- `use60.com/t/a7Kx9B` = **21 characters** vs `use60.com/trynow/x8kP2mQ9aB1c` = 35 characters
- Shorter links get **higher CTR** — they look cleaner, less suspicious, more trustworthy
- `/t/` is unambiguous and won't conflict with other routes

**Code generation (server-side lookup, NOT encryption):**
- **6-character base62 code** (a-z, A-Z, 0-9) = 56.8 billion unique combinations
- Generated randomly via `crypto.randomBytes(6)` → base62 encode
- Stored as a lookup in `campaign_visitors` table: `code → visitor record`
- **No encryption/decryption needed** — simpler, faster, more secure
- Collision check on generation (astronomically unlikely at 10K scale)
- Fallback: Invalid/expired code → redirect to homepage with UTM preserved

**Why lookup beats encryption:**
| | Encrypted hash | Random lookup code |
|--|---------------|-------------------|
| URL length | 27-35 chars | **21 chars** |
| Server load | Decrypt per request | Simple DB lookup |
| Security | Decrypt key = single point of failure | Nothing to reverse-engineer |
| Flexibility | Fixed to email/domain | Can attach any metadata |
| Expiry | Must encode expiry or check separately | TTL column in DB |
| Analytics | Must decrypt first | Code IS the tracking ID |

**Experience flow:**
```
1. PERSONAL COMMAND CENTER (immediate)
   - "Welcome, {First Name}."
   - "{Company} at a glance" — shows pre-researched company data
   - Mock 60 dashboard pre-loaded with:
     * Their company as a deal
     * 3 simulated upcoming meetings with realistic contacts
     * AI-generated follow-up email draft mentioning their product
     * Deal health score and relationship signals
   - Physics-based animation: Their company logo/data assembling from particles

2. INTERACTIVE DEMO (scroll or click)
   - Same 5-panel showcase but with THEIR data in every panel
   - "Here's the follow-up we'd write for you" — actual AI-generated email
   - "Here's how we'd prep for your next meeting" — real prep doc

3. THE WEEK PROJECTION
   - "Your first week with 60" — personalised stats
   - Based on their company size, industry, and typical sales cycle

4. SIGNUP
   - "This is real. Want it?"
   - Pre-filled email, one-click account creation
   - All personalised data seeds into their account
```

**Pre-enrichment pipeline (runs before campaign send):**
1. Take email list (up to 10,000 contacts)
2. For each: extract domain → run enrichment (company data, contacts, signals)
3. Generate random 6-char code → store mapping in `campaign_visitors` table
4. Generate short link: `use60.com/t/{code}`
5. Feed links into email campaign / LinkedIn outreach

**campaign_visitors table schema:**
```sql
code         TEXT PRIMARY KEY,      -- 6-char base62 (e.g. 'a7Kx9B')
email        TEXT,                  -- original contact email
domain       TEXT,                  -- extracted company domain
first_name   TEXT,
last_name    TEXT,
company_name TEXT,
enrichment   JSONB,                -- pre-enriched company/contact data
campaign_id  UUID REFERENCES campaigns(id),
created_at   TIMESTAMPTZ DEFAULT now(),
expires_at   TIMESTAMPTZ DEFAULT now() + interval '30 days',
first_visit  TIMESTAMPTZ,          -- NULL until they click
visit_count  INTEGER DEFAULT 0,
engagement   JSONB DEFAULT '{}',   -- interaction heatmap data
score        INTEGER DEFAULT 0     -- computed engagement score
```

---

## Tracking & Lead Intelligence

### Full Interaction Heatmap

Every visitor interaction is tracked and scored:

| Event | Weight | What it tells us |
|-------|--------|-----------------|
| Page visit | 1 | They clicked. Alive. |
| Scroll depth (25/50/75/100%) | 1-3 | Engagement level |
| Time per section (>10s) | 2 | What they care about |
| Demo step completed | 5 | Invested in the experience |
| URL input submitted | 10 | High intent — they want to see it work |
| Product panel viewed (each) | 3 | Feature interest mapping |
| Integration node clicked | 3 | Stack intelligence |
| Signup form started | 15 | Near-conversion |
| Signup completed | 25 | Converted |
| Email link hovered | 2 | Considering outreach features |
| Return visit | 10 | Multi-session interest |

**Engagement score:** Sum of weights → Low (1-10), Medium (11-30), High (31-50), Hot (51+)

### Slack Integration

**Channel:** `#website-leads` (or configurable)

**Alert format:**
```
🔥 Hot Lead — Sarah Chen from Acme Corp
Score: 47 (High) | Source: LinkedIn /t/ campaign
Time on site: 3m 42s | Demo completed: 4/5 panels
Top interest: Email automation, Meeting prep
→ View in 60: [link] | Send follow-up: [link]
```

**Alert triggers:**
- Immediate: Score hits "Hot" (51+) or signup completed
- Batched (hourly): Medium/High score visitors
- Daily digest: All visitors with engagement summary

### Data Flow
```
Visitor interaction → Supabase edge function (track-visitor)
  → campaign_visitors table (update engagement score)
  → If score threshold met → Slack webhook
  → visitor also appears in 60 app as a lead
  → Rep can follow up directly from 60
```

---

## Animation Strategy

### REVISED: Product UI IS the Animation

~~Abstract SVG animations~~ — replaced with **actual product components animated to life**.

The wow factor is the product itself. Every animation on the website is a real UI component from the 60 app, rendered with the same design system, showing real (or personalised) data flowing through real workflows.

### Design Language (from the app)

The website uses the EXACT same design system as the product:

- **Background**: `bg-gray-900` (warm dark, not pitch black `#0a0a0a`)
- **Cards**: `bg-gray-900` with `border border-gray-800` or `border-gray-700/50`, `rounded-xl` to `rounded-2xl`
- **Accent**: Violet/purple gradient `from-violet-500 to-purple-600`, accent color `#6C5CE7`
- **Text**: `text-white` primary, `text-gray-400/500` secondary, monospace for data/labels
- **Inputs**: `bg-gray-800/50` with `border-gray-700/50`, `focus:border-violet-500/50`
- **Buttons**: Primary `bg-violet-600 hover:bg-violet-500`, ghost `text-gray-400 hover:text-gray-200`
- **Shadows**: `shadow-2xl shadow-black/50` on elevated elements
- **Glassmorphism**: `backdrop-blur-sm` on overlays
- **Icons**: Lucide React only. Color-coded category badges at 10% opacity (`bg-blue-500/10 text-blue-400`)
- **Left accent bars**: 3px solid `#6C5CE7` on notification cards (Slack style)
- **Field grids**: 2-column key-value layouts for metrics
- **Score bars**: Block character progress (`████░░░░░░`)

### The 5 Product Animations (replacing abstract SVGs)

1. **Hero: Quick Add → AI Cascade** (Section 1)
   Pattern: User types a command in the Quick Add modal → AI processes in real-time → cascade of results appears
   - The Quick Add modal slides up (spring physics: damping 30, stiffness 300)
   - User types: "Prepare for my meeting with Acme Corp tomorrow"
   - 60 responds with a stepped wizard (like the proposal scene):
     Step 1: "Searching meetings..." → "Meeting found: Acme Corp Demo, 2pm"
     Step 2: "Pulling deal context..." → "$95K, Stage: Negotiation"
     Step 3: "Researching contacts..." → "3 attendees identified"
     Step 4: "Generating prep doc..." → "Talking points, risks, objectives ready"
   - Each step has loading spinner → green checkmark, staggered 600ms
   - Result: A meeting prep card appears below with real data layout
   - **This IS the product. Visitors see it work before they sign up.**

2. **Research Agents at Work** (Section 2)
   Pattern: 6 agent cards in a 2x3 grid, each showing AI analyzing in real-time
   - Uses the app's card design (`bg-gray-900 border-gray-800 rounded-xl`)
   - Each card: agent name (monospace), Lucide icon, status text, progress bar
   - Cards activate sequentially with border color flash
   - Status: "IDLE" → "SCANNING..." (blink) → "FOUND 12" → checkmark
   - Summary bar below with total counts
   - **Exactly like the app's actual agent UI, not a sci-fi grid**

3. **Slack Notification Cascade** (Section 4: Coordination)
   Pattern: Real Slack Block Kit messages arriving one after another
   - Uses `SlackMessagePreview` component style (white card, left accent bar)
   - Message 1: Pre-meeting brief (header → fields → talking points → actions)
   - Message 2: Follow-up email draft for approval (HITL pattern)
   - Message 3: Deal risk alert with score bars
   - Messages slide in from bottom with spring physics, staggered 1.5s
   - Shows 2-column field grids, action buttons, context footers
   - **This is the exact Slack experience users will get**

4. **Proposal Generation Wizard** (Section 5: Week Recap context)
   Pattern: The actual proposal scene animation
   - Copilot command: "Write a proposal for [Company] based on today's call"
   - 6-step wizard with icons, loading states, completion checkmarks
   - Proposal preview card appears: sections list, pricing tiers, export buttons
   - Recommended tier highlighted with purple accent
   - **Users see exactly what the AI builds for them**

5. **Autonomy Timeline** (Section 7)
   Pattern: 3-stage progression shown as product screenshots at each stage
   - Week 1: Quick Add modal with "Approve" button prominent, AI suggestions with manual review
   - Month 1: Dashboard with fewer pending items, AI handling routine automatically
   - Month 3: Clean dashboard, AI running everything, user just has conversations
   - Each stage is a real (simplified) product screenshot in the app's design system
   - Transition: Smooth crossfade between stages on scroll
   - **Not abstract shapes — actual product states**

### Micro-Animations (Framer Motion, matching the app)

- Modal entry: `y: '100%' → 0`, spring (damping: 30, stiffness: 300, mass: 0.8)
- Card reveals: `opacity: 0, y: 16 → opacity: 1, y: 0`, duration 0.5s
- Step completion: Scale spring `cubic-bezier(0.34, 1.56, 0.64, 1)` for checkmarks
- Status text: Clip-path reveal (`inset(0 100% 0 0) → inset(0 0% 0 0)`)
- Button hover: `transition-all duration-200`, subtle bg shift
- Scroll-triggered: Intersection observer + framer-motion `whileInView`
- Section transitions: Staggered children with 0.1s delay per item

### Performance Budget

- React components (not SVG files) — rendered as part of the page
- Framer Motion for all animations (already in the stack)
- GPU-accelerated: transform + opacity only
- Lazy-load below-fold sections
- `prefers-reduced-motion` fully respected — instant transitions
- Mobile: Same components, simplified animation timing (fewer staggers)

---

## Nano Banana 2 AI Imagery

### Usage: Minimal Accent Pieces (2 images)

1. **Integration map background** (Section 4) — Abstract, atmospheric texture. Dark mode: deep indigo/violet nebula. Light mode: soft gradient wash. Very low opacity (0.1-0.15). The SVG animation sits on top.

2. **Signup celebration** (Section 8) — Small illustrative accent near the signup form. Warm, human feeling — abstract representation of "everything clicking into place." Not a stock photo. Not a character. An emotion rendered as art.

**Generation prompt direction:**
- Style: Abstract, atmospheric, minimal
- Palette: Matches 60 brand (indigo, violet, teal accents on dark/light backgrounds)
- Resolution: 2x for retina, WebP/AVIF format
- File size: < 200KB each after optimisation

---

## Dark/Light Mode Strategy

### System-Aware Default

- Detect `prefers-color-scheme` on first visit
- Provide toggle in navbar (sun/moon icon)
- Persist preference in localStorage
- Both modes must be **equally polished** — light is not an afterthought

### Color Tokens

| Token | Dark | Light |
|-------|------|-------|
| `--bg-primary` | `#0a0a0a` (zinc-950) | `#ffffff` |
| `--bg-secondary` | `#111111` | `#f8fafc` (slate-50) |
| `--bg-tertiary` | `#1a1a1a` | `#f1f5f9` (slate-100) |
| `--border` | `rgba(255,255,255,0.06)` | `rgba(0,0,0,0.08)` |
| `--text-primary` | `#ededed` | `#0f172a` (slate-900) |
| `--text-secondary` | `#a0a0a0` | `#475569` (slate-600) |
| `--accent-primary` | `#6366f1` (indigo-500) | `#4f46e5` (indigo-600) |
| `--accent-secondary` | `#8b5cf6` (violet-500) | `#7c3aed` (violet-600) |
| `--accent-teal` | `#06b6d4` (cyan-500) | `#0891b2` (cyan-600) |
| `--success` | `#22c55e` | `#16a34a` |
| `--warning` | `#f59e0b` | `#d97706` |
| `--surface-glow` | `rgba(99,102,241,0.1)` | `rgba(79,70,229,0.06)` |

### Mode-Specific Adjustments
- Dark: SVG animations can glow (box-shadow, filter: blur). More dramatic.
- Light: Animations rely on color contrast and shadow. Subtler but equally polished.
- Nano Banana images: Generate BOTH dark and light variants. Swap with `<picture>` + media query.
- Physics animations: Same behaviour, different particle colors per mode.

---

## SEO Architecture

### Priority Pages (Phase 1)

| Page | URL | Purpose |
|------|-----|---------|
| Homepage | `/` | Demo-as-website, primary conversion |
| Pricing | `/pricing` | Conversion, comparison shopping |
| /t/ | `/t/{code}` | Campaign personalisation (ultra-short links) |
| Demo standalone | `/demo-v2` | Direct demo link for existing traffic |

### Phase 2 (Post-Launch)

| Page Type | URL Pattern | Volume |
|-----------|-------------|--------|
| Comparison | `/vs/{competitor}` | 5-10 pages |
| Alternative | `/alternative-to/{competitor}` | 5-10 pages |
| Use case | `/for/{persona}` | 5-8 pages |
| Integration | `/integrations/{tool}` | 10-15 pages |

### LLM Optimisation
- Structured data (JSON-LD) on every page
- Clear, concise answers to "what is 60?" in the first 200 words
- FAQ schema markup
- Comparison content that's honest (LLMs reward balanced takes)

---

## Performance Targets

| Metric | Target | Hard Limit |
|--------|--------|------------|
| LCP | < 1.5s | 2.0s |
| INP | < 100ms | 150ms |
| CLS | < 0.03 | 0.05 |
| Total page weight | < 800KB initial | 1MB |
| Time to interactive | < 2.5s | 3.0s |
| Lighthouse score | 95+ | 90 |

### Technical Requirements
- SSR/SSG for above-fold content (Vite SSR or Next.js)
- Image: WebP/AVIF with responsive srcsets, lazy load below fold
- Fonts: Inter (variable), preloaded, `font-display: swap`
- SVG animations: Inline SVG, not img tags. Lazy-initialise below fold.
- Third-party scripts: Defer all analytics. No render-blocking scripts.
- CDN: Vercel Edge or Cloudflare for static assets

---

## Conversion Strategy Summary

### Homepage (organic/direct traffic)
```
Hero URL input → Research demo → Product showcase → Week recap → Signup
```
No gates. No interruptions. The demo sells itself.

### /t/{code} (campaign traffic)
```
Personal command center → Interactive demo (their data) → Week projection → Signup
```
Pre-loaded. Pre-enriched. One-click to real account. 21-character links.

### Target Metrics
| Metric | Target |
|--------|--------|
| Homepage → demo started | 40%+ |
| Demo started → completed | 60%+ |
| Demo completed → signup | 25%+ |
| Overall homepage conversion | 6-10% |
| /t/ link conversion | 15-20% |
| /t/ engagement score avg | 35+ |

---

## Implementation Roadmap

### Phase 1: Core Website (Weeks 1-3)
- [ ] Rebuild homepage as demo-as-website experience
- [ ] 8-section layout with interactive demos
- [ ] System-aware dark/light mode
- [ ] 3 physics-based SVG showcase animations
- [ ] Mobile-optimised responsive design
- [ ] Signup flow with demo data seeding

### Phase 2: Personalisation Engine (Weeks 3-5)
- [ ] /t/{code} routing + DB lookup resolver
- [ ] Pre-enrichment pipeline (batch process email lists)
- [ ] Personal command center template
- [ ] Campaign visitor tracking table + edge functions
- [ ] Slack webhook integration for lead alerts

### Phase 3: Tracking & Intelligence (Weeks 5-6)
- [ ] Full interaction heatmap implementation
- [ ] Engagement scoring algorithm
- [ ] Slack alert formatting + trigger rules
- [ ] Lead flow into 60 app pipeline
- [ ] Analytics dashboard for campaign performance

### Phase 4: SEO & Scale (Weeks 6-8)
- [ ] Comparison pages (top 5 competitors)
- [ ] Integration pages
- [ ] Structured data / JSON-LD
- [ ] Blog infrastructure
- [ ] A/B testing framework for hero + CTAs

---

## Handoff Notes

### For `/frontend-design`
- Demo-as-website pattern — every section must be interactive, not static
- 3-5 physics-based SVG animations (specifications above)
- System-aware dark/light mode with full token table
- Mobile: Simplified animations, same content flow, touch-optimised panels
- Performance budget is strict: < 1.5s LCP, < 800KB initial load
- Framer Motion for all transitions. Spring physics for showcase pieces.
- Reference the existing demo-v2 components — they're solid, elevate don't rebuild

### For `/copywriter`
- Tone: Warm & human. "Finally, a sales tool that actually gets it."
- Short sentences. Benefit-first. Specific numbers > vague claims.
- Headlines should feel like a friend who gets it, not a corporation selling.
- Every section needs a headline + 1-2 sentence subhead. No paragraphs.
- CTAs: Action verbs, first person. "Show me my week" > "Learn more"
- Microcopy matters: Loading states, empty states, transitions all need personality
- Reading level: 5th-7th grade. If a word has 4+ syllables, find a simpler one.

---

*Brief created: March 2026*
*Strategy by: 60 Website Strategist*
*Next step: `/frontend-design` for visual design + component architecture*
