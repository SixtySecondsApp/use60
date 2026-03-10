---
name: web-ship
invoke: /web/ship
description: End-to-end web pipeline — brief → design → build → assets → polish with auto-advancing phases
---

# /web/ship — End-to-End Web Pipeline

**Purpose**: One command from idea to production-ready website/page. Auto-detects input, runs all phases, advances automatically. Human gates at DESIGN (approve style direction) and BUILD (approve before polish).

**Input**: $ARGUMENTS

---

## CRITICAL RULES

1. **Flow, don't gate.** Phases advance automatically unless blocked. Human approval at DESIGN (moodboard) and end of BUILD only.
2. **Auto-detect everything.** Input type, product type, style direction — never ask what you can infer.
3. **Style guide is law.** Once locked in DESIGN phase, every downstream phase respects it.
4. **Talk like a human.** Never mention skills, tools, or internal processes. Just do the work.
5. **Complete output.** Every component is copy-pasteable. No TODOs, no placeholders, no partial snippets.

---

## INPUT AUTO-DETECTION

```
URL provided → Fetch and analyze existing site → REDESIGN mode (audit first, then improve)

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
  "version": 1,
  "project": "<Page/Site Name>",
  "description": "<one-liner>",
  "phase": "build",
  "startedAt": "<ISO>",
  "lastUpdatedAt": "<ISO>",

  "input": {
    "type": "description|url|file|interactive",
    "source": "<what the user provided>",
    "productType": "<SaaS, dev tool, marketplace, etc.>",
    "industry": "<tech, finance, healthcare, etc.>"
  },

  "phaseGates": {
    "brief":  { "status": "complete", "completedAt": "<ISO>" },
    "design": { "status": "complete", "completedAt": "<ISO>" },
    "build":  { "status": "in_progress", "completedAt": null },
    "assets": { "status": "pending", "completedAt": null },
    "polish": { "status": "pending", "completedAt": null }
  },

  "artifacts": {
    "brief": ".web/brief.md",
    "styleGuide": ".web/style-guide.json",
    "components": [],
    "assets": [],
    "polishReport": null
  },

  "styleGuide": {
    "locked": true,
    "direction": "A",
    "name": "Midnight Linear"
  }
}
```

---

## PHASE EXECUTION

### Phase 1: BRIEF

Run `/web/brief` — see `brief.md`

**Discovery** (3-5 questions max):
1. What are we building? (page type, product type)
2. Who's the audience? (persona, awareness level)
3. What's the primary conversion action? (signup, demo, trial)
4. Any reference sites or competitors?
5. What's the aha moment? (how quickly can users experience value?)

**Output**: `.web/brief.md` with section stack, conversion strategy, SEO architecture, product-type intelligence from ui-ux-pro-max.

→ Auto-advance to DESIGN

---

### Phase 2: DESIGN

Run `/web/design` — see `design.md`

**Query databases** → present 3 style directions → generate moodboard.

**>>> HUMAN GATE: Approve style direction <<<**

Present 3 directions with visual moodboard. Wait for user to pick A/B/C or request changes.

**Output**: `.web/style-guide.json` locked with palette, typography, animation tier, Nano Banana prompt prefix, Gemini SVG style descriptor.

→ Auto-advance to BUILD

---

### Phase 3: BUILD

Run `/web/build` — see `build.md`

Generate all page components using locked style guide + brief section stack. Apply craft pass inline.

**Output**: Complete React + TypeScript + Tailwind components, assembled page.

→ Auto-advance to ASSETS

---

### Phase 4: ASSETS

Run `/web/assets` — see `assets.md`

Inventory needed assets from brief and built components. Generate:
- Hero image (Nano Banana 2)
- Feature illustrations (Nano Banana 2 — consistent batch)
- Animated SVGs (Gemini 3.1 Pro)
- Logo (Design skill — if requested)
- OG/social images (Nano Banana 2)

Wire generated assets into built components.

**Output**: `.web/assets/` populated, components updated with real asset references.

→ Auto-advance to POLISH

---

### Phase 5: POLISH

Run `/web/polish` — see `polish.md`

Full audit: ui-ux-pro-max UX rules (10 categories), `/frontend-design` craft checklist, accessibility, performance, anti-convergence. Auto-fix everything fixable.

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
   Phase: BUILD (brief + design done, style guide locked)
   ```
4. Continue from current phase

---

## PREVIEW MODE

```bash
/web/ship --preview "SaaS landing page for AI sales tool"
```

Runs BRIEF + DESIGN but stops before BUILD. Presents:

```
PREVIEW: "AI Sales Tool Landing Page"

  Style: Midnight Linear (dark, violet accent, Clash Display)
  Sections: 7 (hero, social proof, features, how it works, pricing, testimonials, CTA)
  Animation: Tier 2 (scroll reveals) + Tier 3 hero
  Assets needed: 8 (1 hero, 3 features, 3 illustrations, 1 OG)

  [P]roceed to build  [E]dit brief  [C]hange style  [X] Cancel
```

---

## FULL FLOW SUMMARY

```
/web/ship "Build a landing page for 60 — AI sales command center"
  |
  v
BRIEF
  Discovery → competitive intel → section stack → product-type intelligence
  |
  v (auto-advance)
DESIGN
  ui-ux-pro-max databases → 3 style directions → moodboard
  >>> HUMAN GATE: Pick style direction <<<
  → Lock style-guide.json
  |
  v (auto-advance)
BUILD
  frontend-design code gen → style guide tokens → craft pass
  |
  v (auto-advance)
ASSETS
  Nano Banana 2 images → Gemini 3.1 Pro SVGs → Design skill logos/banners
  → Wire into components
  |
  v (auto-advance)
POLISH
  ui-ux-pro-max audit (99 rules) → accessibility → performance → anti-convergence
  → Auto-fix → Report
  |
  v
DONE — Production-ready page with all assets
```

---

## ERROR HANDLING

| Error | Action |
|-------|--------|
| Nano Banana 2 unavailable | Skip raster assets, log warning, use placeholder references |
| Gemini 3.1 Pro unavailable | Skip animated SVGs, use CSS-only animations |
| ui-ux-pro-max scripts fail | Fall back to SKILL.md rule categories inline |
| Style guide missing on BUILD | Ask user to pick quick style or infer from context |
| User rejects all 3 style directions | Ask what they want different, generate 3 new directions |
| Component > 200 lines | Auto-extract sub-components during POLISH |

---

## NEXT STEPS AFTER SHIP

```
After /web/ship completes:

  - All components are production-ready
  - Assets are generated and wired in
  - Accessibility audit passed
  - Performance targets checked

  Deploy with /vercel/deploy or commit with /60/quick
```
