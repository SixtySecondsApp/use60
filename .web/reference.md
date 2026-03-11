# Reference Analysis: Spacebot.sh

Source: https://spacebot.sh
Analyzed: 2026-03-10

## Section Map

| # | Section Type | Purpose | Content Density | Interactive |
|---|-------------|---------|-----------------|-------------|
| 1 | `hero` | Value prop + deploy CTAs | Light | Animated orb canvas |
| 2 | `architecture` (conversation showcase) | Show product working live | Heavy | Multi-panel chat display |
| 3 | `architecture` (philosophy) | Explain 3-tier architecture | Medium | Diagrams |
| 4 | `deep-dive` (Workers) | Technical feature explanation | Medium | Status badges, tool icons |
| 5 | `deep-dive` (Branches) | Technical feature explanation | Medium | Memory search visualization |
| 6 | `deep-dive` (Nothing blocks) | Compare all 3 concepts | Medium | 3-column layout |
| 7 | `deep-dive` (Workflow case study) | Show real conversation flow | Heavy | Threaded dialogue |
| 8 | `feature-matrix` (6 features) | Feature overview grid | Medium-Heavy | Cards with sub-items |
| 9 | `deep-dive` (Cortex/Memory) | Memory system explanation | Medium | Animated canvas, data display |
| 10 | `process-flow` (Ingestion) | File → memory pipeline | Medium | File type list, diagram |
| 11 | `social-proof` (Testimonials) | 12 user quotes | Heavy | Carousel |
| 12 | `tech-stack` | Built in Rust rationale | Medium | Tech logos |
| 13 | `integration-grid` (LLM providers) | 10 providers listed | Light | Logo grid |
| 14 | `pricing` (8 tiers) | Cloud + self-hosted plans | Heavy | Toggle, modals |
| 15 | `deployment` (self-host) | Docker command + links | Light | Code block |
| 16 | `cta` / footer | Links + license | Light | Navigation |

**Total: 16 sections, 14 substantive**

## Content Patterns

```
CONTENT ANALYSIS
================
Tone:           Technical-authoritative, confident, terse
Reading Level:  Technical (developer/team-lead audience)
Headline Style: Short declarative statements ("Workers work.", "It already knows.", "Drop files. Get memories.")
Body Style:     Concise paragraphs (1-3 sentences max) + structured sub-items
Code Presence:  Light (1 Docker command, cron syntax examples)
Data Density:   Heavy (pricing matrices, feature specs, memory types, provider lists)
Technical Depth: Deep (explains architecture decisions, names specific technologies, shows real workflows)

Copy Examples:
  Headlines: "Workers work.", "Branches think.", "Nothing blocks.", "It already knows.", "Built in Rust, for the long run."
  Body:      "Workers get a fresh prompt and the right tools. No conversation context — just focused execution."
  CTAs:      "Deploy on spacebot.sh", "Self-host", "Get Started", "View on GitHub"
```

**Key copy pattern**: Headlines are 2-4 word declarative statements. Body copy explains the "why" in 1-2 sentences. Technical specifics (memory types, tool names, provider counts) build credibility through precision, not claims.

## Visual Patterns

```
VISUAL ANALYSIS
===============
Mode:          Dark (near-black background)
Color Strategy: Monochrome + accent (white text, colored accents per section)
Typography:     Clean sans-serif, mono for code/technical elements
Spacing:        Generous (large section padding, breathing room)
Section Rhythm: Varied — alternates between explanation blocks and visual showcases
Visual Weight:  Balanced (text + diagrams + interactive panels)
Diagrams:       Complex — conversation panels, memory graphs, architecture flows
Code Styling:   Terminal-style with syntax highlighting
Animation:      Moderate — canvas animations, carousel, subtle hover states
Atmosphere:     Dark-glow, particle effects, clean geometric
```

## Replicable Patterns

### 1. Section Flow
```
Hero (light) → Product showcase (heavy) → Architecture philosophy (medium) →
Deep-dives x3 (medium each) → Workflow case study (heavy) →
Feature grid (medium) → System deep-dive (medium) → Process flow (medium) →
Social proof (heavy) → Tech credibility (medium) → Integrations (light) →
Pricing (heavy) → Deployment (light) → Footer
```

### 2. Content Rhythm
Alternates between:
- **Explanation blocks**: Headline + 1-2 paragraphs + sub-items
- **Visual showcases**: Interactive panels, diagrams, animations
- **Proof points**: Testimonials, tech stack, specific numbers

Never more than 2 explanation blocks without a visual break.

### 3. Progressive Disclosure
1. Hero gives the 1-sentence pitch
2. Conversation showcase SHOWS the product working
3. Architecture section explains the mental model (3 concepts)
4. Deep-dives go technical on each concept
5. Feature grid provides breadth
6. Cortex/memory provides depth on the clever part
7. Social proof validates
8. Tech stack builds engineering credibility
9. Pricing converts

**Key**: Overview → Demo → Architecture → Details → Proof → Convert

### 4. Technical Credibility Signals
- **Named components**: "Channels, Branches, Workers" (not "our AI agents")
- **Specific numbers**: "8 memory types", "10 LLM providers", "3 consecutive failures" (circuit breaker)
- **Real code**: Docker command is copy-pasteable
- **Real workflows**: The Stripe webhook conversation is a complete, realistic example
- **Technology names**: Rust, Tokio, SQLite, LanceDB, redb, FastEmbed, Serenity, Chromiumoxide
- **Architecture diagrams**: Shows the actual system design, not marketing abstractions

### 5. Conversion Architecture
- Hero: 2 CTAs (Deploy cloud, Self-host) — identifies user type immediately
- No mid-page CTA spam — trusts the content to build conviction
- Pricing: comprehensive (8 tiers!) with toggle between cloud/self-host
- Self-host section: single Docker command removes friction
- Social proof near bottom validates the decision right before pricing

### 6. Information Density Handling
- Tables for pricing comparison
- Cards for feature overviews
- Conversation panels for product demos
- Diagrams for architecture
- Code blocks for deployment
- Icons + short text for tech stack
- Carousel for testimonials (prevents page length explosion)

### 7. Distinctive Elements
- **Conversation showcase**: Multi-panel live chat display showing the product in action
- **Architecture as narrative**: "Workers work. Branches think. Nothing blocks." — the architecture IS the story
- **Workflow case study**: A complete user interaction from request to delivery
- **Cortex animation**: Particle/node animation showing the memory system working
- **Pricing toggle**: Cloud vs self-host is a first-class choice, not an afterthought

## Gap Analysis: V6 Landing Page vs. Spacebot.sh

### Reference has, we lack:
1. **Architecture explanation** — Spacebot explains HOW it works at a systems level. V6 only shows WHAT it does.
2. **Product showcase panels** — Spacebot shows the product in action via conversation panels. V6 has the URL demo (good!) but nothing else showing the product working.
3. **Workflow case study** — A complete, realistic example from start to finish. V6 has none.
4. **Feature depth** — Spacebot's features have sub-items, code examples, and technical specifics. V6's features are 1-sentence descriptions.
5. **Tech credibility** — Spacebot names every technology. V6 doesn't mention its stack.
6. **Pricing** — Spacebot has comprehensive pricing. V6 has no pricing section.
7. **Deployment section** — Spacebot has a code block for self-hosting. V6 has no "get started" technical path.
8. **Content density** — Spacebot: 14 heavy sections. V6: 9 light-medium sections.
9. **Section type variety** — V6 uses the same hero → proof → problem → solution → features → CTA pattern. Spacebot mixes architecture, deep-dives, showcases, code, pricing.

### We have, reference lacks:
1. **Interactive demo** — The URL input + live research demo is more powerful than anything Spacebot has. This is our best conversion mechanism. KEEP THIS.
2. **Problem/solution framing** — V6's pain-point cards + solution section is emotionally compelling. Spacebot doesn't do pain.
3. **Micro-copy** — "30 seconds. No signup required." is excellent friction reduction.

### Priority improvements:
1. **Add architecture section** — explain 60's command center model (how agents see everything + act)
2. **Add product showcase** — show 60 working on real tasks (follow-up email, meeting brief, deal update)
3. **Add workflow case study** — a complete example: meeting happens → 60 listens → follow-up sent → pipeline updated
4. **Deepen feature descriptions** — add sub-items, specific capabilities, real examples
5. **Add tech credibility section** — integrations (CRM, calendar, email), what powers 60
6. **Add pricing section** — if applicable, or at minimum a "get started" section
7. **Expand section count** — target 12-14 sections to match reference density

## Recommendations for /web/brief

- Target 12-14 sections (up from 9)
- Add section types: `architecture`, `deep-dive`, `product-showcase`, `integration-grid`, `pricing`
- Keep: URL demo (hero + demo gate), problem/solution framing, proof bar
- Content density target: Medium-Heavy (matching reference)
- The hero URL demo should remain the primary conversion mechanism

## Recommendations for /web/copy

- **Tone**: Bold-confident, technically specific but approachable (not developer-only like Spacebot)
- **Headline style**: Short declarative ("You sell. 60 does the rest." is already perfect — maintain this)
- **Body style**: Concise, specific. Name real features, real integrations, real numbers
- **Add**: Workflow case study showing a complete 60 interaction
- **Add**: Architecture description (how the command center model works)
- **Add**: Feature sub-items with specific capabilities
- **Avoid**: Pure marketing claims without backing ("41% more deals" needs source or context)

## Recommendations for /web/build

- New section types needed: `architecture` (command center diagram), `product-showcase` (multi-panel showing 60 outputs), `deep-dive` (for features like meeting prep, follow-ups), `integration-grid` (CRM/calendar/email connections)
- Keep existing: `hero` (URL demo), `social-proof` (proof bar + testimonials), `process-flow` (how it works)
- Interactive elements: product showcase panels showing real 60 outputs (follow-up email, meeting brief, pipeline update)
- Maintain "Electric Depth" visual direction — the gap is content, not design
