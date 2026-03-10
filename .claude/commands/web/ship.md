---
name: web-ship
invoke: /web/ship
description: End-to-end web pipeline — reference → brief → design → copy → build → assets → polish with auto-advancing phases
---

# /web/ship — End-to-End Web Pipeline

**Purpose**: One command from idea to production-ready website/page. Auto-detects input, runs all phases, advances automatically. Human gates at DESIGN (approve style direction) and COPY (approve content before building). Produces pages at the quality level of spacebot.sh — not just visually, but in content depth, technical credibility, and information architecture.

**Input**: $ARGUMENTS

---

## CRITICAL RULES

1. **Content before code.** The words, data, and examples determine the layout — not the other way around. Never generate code with placeholder copy.
2. **Flow, don't gate.** Phases advance automatically unless blocked. Human approval at DESIGN (style direction) and COPY (content review) only.
3. **Auto-detect everything.** Input type, product type, style direction, content density — never ask what you can infer.
4. **Style guide is law.** Once locked in DESIGN phase, every downstream phase respects it.
5. **Talk like a human.** Never mention skills, tools, or internal processes. Just do the work.
6. **Complete output.** Every component is copy-pasteable. No TODOs, no placeholders, no partial snippets.
7. **Match the reference.** If a reference site was analyzed, match its content density, technical depth, and section variety — not just its visual style.

---

## INPUT AUTO-DETECTION

```
REFERENCE URL provided ("build like X", "aim for this") →
  Run REFERENCE analysis first → then BRIEF informed by analysis

URL of OWN site provided → REDESIGN mode (audit first, then improve)

FILE PATH provided → Read the file, classify:
  - Brief/strategy doc → Skip BRIEF, start at DESIGN
  - Design mockup/screenshot → Skip to BUILD with visual reference
  - Existing code → Skip to POLISH (audit + improve)

STRING provided → DESCRIPTION (start at BRIEF with discovery)

NOTHING provided → Ask: "What are we building?" then route

--resume flag → Read .web/pipeline.json, continue from current phase
```

---

## PIPELINE STATE: .web/pipeline.json

```json
{
  "version": 2,
  "project": "<Page/Site Name>",
  "description": "<one-liner>",
  "phase": "copy",
  "startedAt": "<ISO>",
  "lastUpdatedAt": "<ISO>",

  "input": {
    "type": "description|url|file|interactive",
    "source": "<what the user provided>",
    "productType": "<SaaS, dev tool, marketplace, etc.>",
    "industry": "<tech, finance, healthcare, etc.>",
    "referenceUrl": "<reference site URL, if provided>"
  },

  "phaseGates": {
    "reference": { "status": "complete", "completedAt": "<ISO>" },
    "brief":     { "status": "complete", "completedAt": "<ISO>" },
    "design":    { "status": "complete", "completedAt": "<ISO>" },
    "copy":      { "status": "in_progress", "completedAt": null },
    "build":     { "status": "pending", "completedAt": null },
    "assets":    { "status": "pending", "completedAt": null },
    "polish":    { "status": "pending", "completedAt": null }
  },

  "artifacts": {
    "reference": ".web/reference.md",
    "brief": ".web/brief.md",
    "styleGuide": ".web/style-guide.json",
    "copy": ".web/copy.md",
    "components": [],
    "assets": [],
    "polishReport": null
  },

  "styleGuide": {
    "locked": true,
    "direction": "A",
    "name": "Midnight Linear"
  },

  "contentProfile": {
    "density": "heavy",
    "technicalDepth": "deep",
    "codeExamples": 4,
    "dataTables": 3,
    "sectionCount": 12
  }
}
```

---

## PHASE EXECUTION

### Phase 0: REFERENCE (conditional)

Run `/web/reference` — see `reference.md`

**Triggers**: User provides a reference URL, says "like [site]", "aim for [site]", or "at this standard".

Fetch the reference site, deconstruct its information architecture, content patterns, visual approach, and technical depth. Produce `.web/reference.md` with replicable patterns and gap analysis.

**Output**: `.web/reference.md` with section map, content analysis, visual analysis, replicable patterns.

→ Auto-advance to BRIEF

**Skip when**: No reference URL provided. Start directly at BRIEF.

---

### Phase 1: BRIEF

Run `/web/brief` — see `brief.md`

**Discovery** (3-5 questions max):
1. What are we building? (page type, product type)
2. Who's the audience? (persona, awareness level)
3. What's the primary conversion action? (signup, demo, trial)
4. Any reference sites or competitors? (if not already analyzed)
5. What's the aha moment? (how quickly can users experience value?)

**Reference-informed**: If `.web/reference.md` exists, the brief uses it as a quality benchmark. Section count, content density, and technical depth should match or exceed the reference.

**Output**: `.web/brief.md` with section stack, conversion strategy, SEO architecture, content density target, product-type intelligence from ui-ux-pro-max.

→ Auto-advance to DESIGN

---

### Phase 2: DESIGN

Run `/web/design` — see `design.md`

**Query databases** → present 3 style directions → generate moodboard.

**>>> HUMAN GATE: Approve style direction <<<**

Present 3 directions with visual moodboard. Wait for user to pick A/B/C or request changes.

**Output**: `.web/style-guide.json` locked with palette, typography, animation tier, Nano Banana prompt prefix, Gemini SVG style descriptor.

→ Auto-advance to COPY

---

### Phase 3: COPY

Run `/web/copy` — see `copy.md`

Write ALL page content before any code. Headlines, body copy, feature descriptions, technical explanations, code examples, comparison tables, pricing data, CTAs.

**This is the phase that separates good pages from great ones.** A spacebot.sh-quality page has:
- Headlines that are specific, not generic
- Technical content with real code examples and architecture explanations
- Data tables with complete, accurate information
- Progressive disclosure — overview first, depth second
- Copy that demonstrates expertise, not just claims it

**Reference-informed**: If `.web/reference.md` exists, the copy matches the reference's tone, density, and technical depth. A density check compares section count, code blocks, data tables, and specificity level.

**>>> HUMAN GATE: Approve content <<<**

Present the complete copy document. Wait for user to approve or request changes.

**Output**: `.web/copy.md` with all section content, code examples, table data, and CTAs.

→ Auto-advance to BUILD

---

### Phase 4: BUILD

Run `/web/build` — see `build.md`

Generate all page components using:
- **Locked style guide** for visual tokens
- **Approved copy** for actual content (no placeholder text)
- **Brief section stack** for architecture

The build phase is now a LAYOUT + CODE phase, not a content phase. All words come from `.web/copy.md`.

**Output**: Complete React + TypeScript + Tailwind components with real content, assembled page.

→ Auto-advance to ASSETS

---

### Phase 5: ASSETS

Run `/web/assets` — see `assets.md`

Inventory needed assets from brief and built components. Generate:
- Hero image (Nano Banana 2)
- Feature illustrations (Nano Banana 2 — consistent batch)
- Animated SVGs (Gemini 3.1 Pro)
- Architecture diagrams (SVG or code-generated)
- Logo (Design skill — if requested)
- OG/social images (Nano Banana 2)

Wire generated assets into built components.

**Output**: `.web/assets/` populated, components updated with real asset references.

→ Auto-advance to POLISH

---

### Phase 6: POLISH

Run `/web/polish` — see `polish.md`

Full audit: ui-ux-pro-max UX rules (10 categories), `/frontend-design` craft checklist, accessibility, performance, anti-convergence, **content completeness check**. Auto-fix everything fixable.

**Content completeness check** (new):
- No placeholder or TODO text anywhere
- All code examples are syntactically valid
- All data tables have complete rows
- All links point somewhere (even if # for now)
- Copy tone is consistent across sections

**Output**: Polish report with all checks passing.

---

## RESUME SUPPORT

```bash
/web/ship --resume
```

1. Read `.web/pipeline.json`
2. Determine current phase
3. Print 2-line summary:
   ```
   Resuming: "60 Landing Page" (started 2h ago)
   Phase: COPY (brief + design done, style guide locked, writing content)
   ```
4. Continue from current phase

---

## PREVIEW MODE

```bash
/web/ship --preview "SaaS landing page for AI sales tool"
```

Runs REFERENCE (if URL) + BRIEF + DESIGN but stops before COPY. Presents:

```
PREVIEW: "AI Sales Tool Landing Page"

  Reference: spacebot.sh (12 sections, heavy content, deep technical)
  Style: Midnight Linear (dark, violet accent, Clash Display)
  Sections: 12 (hero, architecture, deep-dive x3, integrations, code examples, pricing, deployment, tech stack, FAQ, CTA)
  Content density: Heavy (matching reference)
  Animation: Tier 2 (scroll reveals) + Tier 3 hero
  Assets needed: 14 (1 hero, 4 features, 3 diagrams, 2 SVGs, 2 social, 1 logo, 1 OG)

  [P]roceed to copy  [E]dit brief  [C]hange style  [X] Cancel
```

---

## FULL FLOW SUMMARY

```
/web/ship "Build a product page like spacebot.sh for 60 — AI sales command center"
  |
  v
REFERENCE (conditional)
  Fetch reference → section map → content patterns → visual analysis → replicable patterns
  |
  v (auto-advance)
BRIEF
  Discovery → competitive intel → reference-informed section stack → content density target
  |
  v (auto-advance)
DESIGN
  ui-ux-pro-max databases → 3 style directions → moodboard
  >>> HUMAN GATE: Pick style direction <<<
  → Lock style-guide.json
  |
  v (auto-advance)
COPY
  Tone calibration → section-by-section content → code examples → data tables → CTA copy
  >>> HUMAN GATE: Approve content <<<
  → Lock copy.md
  |
  v (auto-advance)
BUILD
  Style tokens + approved copy → React/TS/Tailwind code → section components → assembled page
  |
  v (auto-advance)
ASSETS
  Nano Banana 2 images → Gemini 3.1 Pro SVGs → architecture diagrams → wire into components
  |
  v (auto-advance)
POLISH
  UX audit (99 rules) → accessibility → performance → anti-convergence → content completeness
  → Auto-fix → Report
  |
  v
DONE — Production-ready page with real content, all assets, and quality at reference level
```

---

## CONTENT-FIRST QUALITY GATES

These are the gates that prevent shipping a mediocre page:

| Gate | Phase | What It Checks |
|------|-------|----------------|
| Reference density match | BRIEF | Section count and content types match reference |
| Style direction approval | DESIGN | Human approves visual direction |
| Content approval | COPY | Human approves all copy, code examples, and data |
| No placeholder text | BUILD | Zero TODOs, zero "Lorem ipsum", zero generic headlines |
| Content completeness | POLISH | All code examples valid, all tables complete, tone consistent |

---

## ERROR HANDLING

| Error | Action |
|-------|--------|
| Reference site unreachable | Skip REFERENCE phase, proceed with BRIEF discovery |
| Nano Banana 2 unavailable | Skip raster assets, log warning, use placeholder references |
| Gemini 3.1 Pro unavailable | Skip animated SVGs, use CSS-only animations |
| ui-ux-pro-max scripts fail | Fall back to SKILL.md rule categories inline |
| Style guide missing on BUILD | Ask user to pick quick style or infer from context |
| Copy missing on BUILD | Run COPY phase first — never build without content |
| User rejects all 3 style directions | Ask what they want different, generate 3 new directions |
| User rejects copy | Ask what to change, iterate on specific sections |
| Component > 200 lines | Auto-extract sub-components during POLISH |

---

## NEXT STEPS AFTER SHIP

```
After /web/ship completes:

  - All components are production-ready with REAL content
  - Assets are generated and wired in
  - Accessibility audit passed
  - Performance targets checked
  - Content completeness verified

  Deploy with /vercel/deploy or commit with /60/quick
```
