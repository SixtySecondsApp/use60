# Web Brief: 60 Landing Page (V6)

## Executive Summary
Redesign the 60 landing page to convert solo founders and small sales teams into signups. 60 is an AI sales command center that automates everything around the sales call — lead finding, meeting prep, follow-ups, pipeline management. The hero is product-as-hero (interactive demo input) which is the proven conversion mechanism. This is an evolution of V5, not a rebuild.

## Audience & Awareness

**Primary persona**: Solo founder or small sales team lead (1-5 reps). Revenue under $5M. Doing founder-led sales. Lives in their calendar. Neglects follow-ups, pipeline hygiene, and meeting prep because they're too busy with "founder stuff."

**Awareness level**: Problem-aware to Solution-aware. They KNOW follow-ups are dropping and pipeline is stale. They may have tried point tools (CRM, notetaker, email tool) but nothing connects.

**Traffic sources**:
- Direct (word of mouth, early access referrals)
- Google organic ("AI sales tool", "automated follow-ups", "meeting prep AI")
- LLM referrals (ChatGPT/Claude recommendations — 15.9% conversion rate)
- LinkedIn (founder content, thought leadership)

## Competitive Landscape

**Category**: AI sales tools / revenue intelligence / sales automation

| Competitor | Positioning | Gap |
|-----------|------------|-----|
| Clay | Data enrichment + outreach automation | Complex, technical, enterprise-priced |
| Apollo | Sales intelligence + engagement | Broad platform, overwhelming for solo founders |
| Instantly | Cold email at scale | Only does outreach — no meeting prep, no pipeline, no follow-ups |
| Attio | Modern CRM | Still a CRM — you have to do the work |
| Gong | Revenue intelligence from calls | Call recording only — nothing before or after the call |

**60's gap**: None of these are a **command center**. They each do one thing. 60 sees everything and acts on it. The tagline captures it: "You sell. 60 does the rest."

**Competitive positioning**: 60 is NOT a CRM, NOT an outreach tool, NOT a notetaker. It's the AI teammate that handles everything around the conversation so the rep focuses on the conversation itself.

## Section Stack (Conversion Hierarchy)

```
1. HERO — Product-as-hero (URL input → instant demo)
   Purpose: HOOK + SHOW
   The page IS the product. Enter a website, watch 60 research it in 30 seconds.
   CTA: URL input field (primary), "Try it free" (secondary)

2. PROOF BAR — Metrics strip
   Purpose: PROVE
   15h back/week, 41% more deals, 0 dropped follow-ups
   Credibility gate immediately after hero

3. PROBLEM — "Five tools. Zero awareness."
   Purpose: HOOK (pain)
   Pain cards: forgotten follow-ups, meeting prep hours, stale pipeline, scattered context
   Animated SVG showing disconnected tool chaos

4. SOLUTION — "One place. Full context. AI that acts."
   Purpose: DIFFERENTIATE
   The command center positioning. Benefits list with convergence hub SVG.

5. DEMO GATE — Second chance to try
   Purpose: CONVERT (re-engage)
   For cautious visitors who scrolled past the hero. Same URL input.

6. HOW IT WORKS — 3-step process
   Purpose: SHOW
   Connect → 60 learns → You close. Simple mental model.

7. FEATURES — "Everything before and after the call"
   Purpose: SHOW
   Follow-ups, meeting prep, pipeline automation. Bento or card grid.

8. TESTIMONIALS — Early user quotes
   Purpose: PROVE
   Real quotes about follow-ups, meeting prep, deal saves.

9. FINAL CTA — "Your next follow-up is 60 seconds away"
   Purpose: CONVERT
   Strong closing with "Try it free" button → scrolls to hero input
```

## Conversion Strategy

**Hero pattern**: Product-as-hero. The URL input in the hero IS the aha moment. Enter a website, watch AI research it live, see your first follow-up email — all before signing up. This is the proven mechanism from V5 and must not change.

**CTA strategy**: Single primary (URL input). Secondary "Try it free" buttons scroll to hero input. No demo booking, no contact sales. Pure PLG.

**Social proof**: Metric-led proof bar below hero. Testimonial cards near bottom. No logo bar yet (early stage).

**Demo strategy**: Interactive — the demo IS the product. No video, no screenshots, no tour. You experience 60 live.

## SEO Architecture

**Primary page**: Homepage (use60.com)
**Future pages** (not this build):
- /vs/clay, /vs/apollo, /vs/instantly — comparison pages
- /use-cases/follow-ups, /use-cases/meeting-prep — use-case pages
- /for/founders, /for/sales-teams — persona pages

**LLM optimization**: Structure content with clear headings and concise answers. "What is 60?" should be answerable from the hero + solution section.

## Product-Type Intelligence

**Style match**: AI SaaS command center → dark mode, premium, technical but approachable. Not developer-tool austere (Vercel), not enterprise-heavy (Salesforce). Closer to Linear's clarity with Notion's approachability.

**Color direction**: Dark base (zinc-950). Violet primary accent (brand). Teal/cyan secondary. White CTAs on dark.

**Typography direction**: Distinctive display font (NOT Inter for headlines). Clean body font. Mono for data/code elements.

**UX patterns**:
- Single-page scroll with section anchors
- Sticky navbar with CTA
- Mobile: full-width sections, stacked cards
- Animation: Tier 2 scroll reveals (sections) + Tier 3 hero entrance

## Performance Targets

| Metric | Target |
|--------|--------|
| LCP | < 2.0s |
| INP | < 150ms |
| CLS | < 0.05 |
| Page weight | < 1MB initial |
| TTI | < 3s |

## Design Direction Notes

V5 is already well-built with dark mode, violet accent, gradient text, animated SVGs, and Framer Motion scroll reveals. The visual system is solid. For V6, the opportunity is:

1. **Stronger typography** — V5 uses system-weight gradients. V6 should use a distinctive display font with more dramatic size jumps.
2. **Better spatial composition** — V5 sections are consistently centered. V6 should break the grid with asymmetric layouts, bento grids, and overlapping elements.
3. **Richer atmosphere** — V5 has subtle glows and borders. V6 should layer noise textures, grid patterns, and depth effects.
4. **Upgraded social proof** — Move beyond "Early access user" to real names and companies as they become available.
5. **Animation polish** — V5 has good scroll reveals. V6 should add micro-interactions on cards, hover states on features, and a more cinematic hero entrance.

## Build Notes

- Stack: React 18 + TypeScript + Tailwind CSS + Framer Motion (existing)
- Package: `packages/landing/` (existing monorepo package)
- Existing components in `components/landing-v5/` — can extend or rebuild as V6
- SVG animations via `SvgWrapper` component (inline SVG with raw imports)
- Demo flow (`demo-v2/`) is UNCHANGED — proven conversion mechanism
- Animation tokens in `lib/animation-tokens.ts`
- Force dark mode via `useForceDarkMode()` hook
