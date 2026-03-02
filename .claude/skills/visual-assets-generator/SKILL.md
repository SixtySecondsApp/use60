---
name: visual-assets-generator
description: |
  Creative visual asset generator combining AI image generation (Nano Banana 2 / Gemini 3 Pro Image via OpenRouter)
  with animated SVG creation (Gemini 3.1 Pro). Follows a consultative 4-phase workflow — style discovery, moodboard,
  approval gate, production — to ensure visual consistency before bulk generation. Use when creating hero images,
  social media graphics, illustrations, moodboards, brand visuals, or animated SVGs.
metadata:
  author: sixty-ai
  version: "1"
  category: frontend
  skill_type: atomic
  is_active: true
  command_centre:
    enabled: true
    label: "/visual-assets"
    description: "Generate images, moodboards, and animated SVGs"
    icon: "image"
  agent_affinity:
    - frontend
    - design
    - landing
    - outreach
  requires_capabilities:
    - openrouter_api
    - gemini_api
  triggers:
    - pattern: "generate images"
      intent: "image_generation"
      confidence: 0.92
      examples:
        - "generate images for the landing page"
        - "create images for the campaign"
        - "make me some visuals"
    - pattern: "visual assets"
      intent: "visual_assets"
      confidence: 0.90
      examples:
        - "create visual assets"
        - "I need visual assets for"
        - "generate visual assets"
    - pattern: "moodboard"
      intent: "moodboard"
      confidence: 0.95
      examples:
        - "create a moodboard"
        - "make a moodboard for"
        - "style exploration"
    - pattern: "brand visuals"
      intent: "brand_visuals"
      confidence: 0.88
      examples:
        - "generate brand visuals"
        - "brand imagery"
        - "visual identity"
    - pattern: "SVG animation"
      intent: "svg_animation"
      confidence: 0.92
      examples:
        - "generate an SVG animation"
        - "create an animated SVG"
        - "make an SVG"
    - pattern: "illustration"
      intent: "illustration"
      confidence: 0.85
      examples:
        - "create an illustration"
        - "generate illustrations"
        - "illustrated graphic"
    - pattern: "social media graphics"
      intent: "social_graphics"
      confidence: 0.85
      examples:
        - "social media images"
        - "create social graphics"
        - "Instagram visuals"
    - pattern: "hero image"
      intent: "hero_image"
      confidence: 0.88
      examples:
        - "generate a hero image"
        - "hero section image"
        - "landing page hero"
    - pattern: "nano banana"
      intent: "nano_banana"
      confidence: 0.95
      examples:
        - "use nano banana"
        - "nano banana image"
        - "generate with nano banana"
  keywords:
    - "image"
    - "visual"
    - "moodboard"
    - "illustration"
    - "hero"
    - "graphic"
    - "brand"
    - "social media"
    - "nano banana"
    - "generate"
    - "svg"
    - "animation"
    - "style"
    - "assets"
  inputs:
    - name: asset_type
      type: string
      description: "Type of asset (hero, social, illustration, icon, background, moodboard, svg-animation)"
      required: false
    - name: style_direction
      type: string
      description: "Style keywords or references (e.g. 'minimal tech', 'warm organic', 'bold gradient')"
      required: false
    - name: aspect_ratio
      type: string
      description: "Aspect ratio for image generation: square, portrait, landscape"
      required: false
    - name: color_scheme
      type: string
      description: "Optional color override (e.g. 'brand', 'monochrome', 'custom:#FF6B00')"
      required: false
  outputs:
    - name: images
      type: array
      description: "Generated image URLs or data URIs from Nano Banana 2"
    - name: svg_code
      type: string
      description: "Raw SVG markup for animated SVG assets"
    - name: style_guide
      type: string
      description: "Locked style parameters for production consistency"
---

# Visual Assets Generator

Creative visual asset generator that combines AI image generation with animated SVG creation. Every visual project follows a consultative workflow to ensure style consistency before bulk production.

**Two engines:**
- **Nano Banana 2** (Gemini 3 Pro Image via OpenRouter) — raster images: hero sections, social graphics, illustrations, backgrounds
- **Gemini 3.1 Pro** — animated SVGs: icons, decorative motion, illustrations with CSS animation

---

## ROUTE DETECTION

Determine the entry point before starting:

| Scenario | Entry Point |
|----------|-------------|
| Wants moodboard or "generate images" with no style defined | **Phase 1** — Style Discovery |
| Provides detailed style + says "generate" | **Phase 3** — skip to First Assets |
| "Make more like this" with prior approved assets | **Phase 4** — Production |
| Asks for SVG animation specifically | **SVG Route** |
| Wants a single quick image | **Express Route** (1 call) |

---

## PHASE 1: STYLE DISCOVERY

**Read `references/style-discovery-questions.md` for the full question bank.**

Ask 3-5 targeted questions to establish visual direction:

1. **Inspiration** — What brands, websites, or visual styles do you admire?
2. **Feeling** — Which best describes the vibe: premium/clean, bold/energetic, warm/approachable, dark/techy?
3. **Colors** — Specific colors to use or avoid?
4. **Context** — What is this for? (landing page, social media, email, presentation, pitch deck)
5. **References** — Any screenshots, competitor examples, or existing brand assets?

**Skip when:**
- User already provided 3+ style signals in their request
- User says "surprise me" or "just do it"
- Continuing from a previous session with locked style

---

## PHASE 2: MOODBOARD

**Read `references/moodboard-workflow.md` for methodology.**

### Step 1: Synthesize 3 Style Directions

From the user's answers, create 3 distinct visual directions:

- **Direction A** — Closest interpretation of what they described
- **Direction B** — Bolder, more ambitious take
- **Direction C** — Contrasting alternative they might not have considered

Each direction gets a short name and 1-line description.

### Step 2: Generate Moodboard Images

Generate **2 images per direction** (6 total) via Nano Banana 2:

```typescript
import { nanoBananaService } from '@/lib/services/nanoBananaService';

// For each direction, call:
const result = await nanoBananaService.generateImage({
  prompt: "<direction-specific prompt>",
  aspect_ratio: "landscape",  // or match intended use
  num_images: 2,
});
```

### Step 3: Present for Selection

Present as labeled groups:

```
**Direction A: [Name]** — [1-line description]
[Image 1] [Image 2]

**Direction B: [Name]** — [1-line description]
[Image 1] [Image 2]

**Direction C: [Name]** — [1-line description]
[Image 1] [Image 2]
```

Ask: "Which direction resonates? You can also blend elements from multiple directions."

---

## PHASE 3: FIRST ASSETS (APPROVAL GATE)

### Step 1: Lock Style Parameters

Document the locked style as a reusable prompt prefix:

```
Style Lock:
- Palette: [hex codes]
- Style: [descriptors — e.g. "flat illustration, soft gradients, rounded shapes"]
- Composition: [framing — e.g. "centered subject, negative space, depth layers"]
- Typography: [if applicable — e.g. "geometric sans-serif, bold headlines"]
- Mood: [1-2 words]
```

### Step 2: Generate First Assets

- Generate **2-3 images** via Nano Banana 2 using the locked style prefix
- Generate **1 animated SVG** (if applicable) via Gemini 3.1 Pro using `references/gemini-svg-guide.md`

### Step 3: Present with Prompts

Show each asset alongside the prompt used to generate it. This lets the user refine the prompt language.

### Step 4: Approval or Iteration

- **Approved** → proceed to Phase 4
- **Iterate** → adjust style lock, regenerate specific assets
- **Start over** → return to Phase 1

---

## PHASE 4: PRODUCTION

### Step 1: Build Prompt Template

From the approved style lock and successful prompts, build a template:

```
[STYLE PREFIX from Phase 3]
[SUBJECT: varies per asset]
[COMPOSITION: varies per asset]
[ASPECT RATIO: varies per asset]
```

### Step 2: Batch Generate

Generate all requested assets using the template. For each:

```typescript
const result = await nanoBananaService.generateImage({
  prompt: templateWithSubject,
  aspect_ratio: assetAspectRatio,
  num_images: 1,
});
```

### Step 3: Quality Check

Verify each asset against the style lock:
- [ ] Colors match locked palette
- [ ] Style is consistent with approved direction
- [ ] Composition matches intended use (hero, social, etc.)
- [ ] No artifacts or quality issues

### Step 4: Deliver

Present all assets organized by type/use case.

---

## SVG ROUTE

For animated SVG requests, use the Gemini 3.1 Pro pipeline. This is unchanged from the original animation workflow.

**Read `references/gemini-svg-guide.md` before generating any SVG.**

### Workflow

1. **Load design tokens** from `references/animation-tokens.md`
2. **Craft the Gemini prompt** following templates in `references/gemini-svg-guide.md`
3. **Call Gemini 3.1 Pro** — or use the CLI helper:
   ```
   npx tsx .claude/skills/visual-assets-generator/generate-svg.ts \
     --name "asset-name" \
     --description "..." \
     --output path/to/output.svg
   ```
4. **Validate** — viewBox, xmlns, CSS @keyframes (not SMIL), prefers-reduced-motion, no scripts
5. **Wrap in React component** if needed (see `references/gemini-svg-guide.md`)

### Quality Checklist
- [ ] Uses CSS `@keyframes` only (no SMIL)
- [ ] Has `viewBox`, no fixed width/height
- [ ] `prefers-reduced-motion` media query included
- [ ] `<title>` element for accessibility
- [ ] No `<script>` tags, no external resources
- [ ] Under 50KB total SVG size
- [ ] Colors match design system or user override

**Read `references/performance-rules.md` for GPU optimization and bundle budgets.**

---

## EXPRESS ROUTE

For quick single-image requests with no style exploration needed:

1. Infer style from context (user's request, existing brand if known)
2. Generate 1 image via Nano Banana 2
3. Present with the prompt used
4. Offer: "Want variations, or is this good?"

---

## NANO BANANA 2 API REFERENCE

**Read `references/nano-banana-guide.md` for full API docs, prompt best practices, and templates.**

Quick reference:
- **Service**: `nanoBananaService.generateImage()` from `src/lib/services/nanoBananaService.ts`
- **Model**: `google/gemini-3-pro-image-preview` via OpenRouter
- **Params**: `prompt` (string), `aspect_ratio` ('square'|'portrait'|'landscape'), `num_images` (number)
- **Auth**: user_settings.ai_provider_keys.openrouter

---

## REFERENCE FILES

| File | Contents |
|------|----------|
| `references/nano-banana-guide.md` | Nano Banana 2 API, prompt best practices, style consistency tips, templates |
| `references/moodboard-workflow.md` | 3-direction methodology, prompt variation, presentation format |
| `references/style-discovery-questions.md` | Question bank by category, skip conditions |
| `references/gemini-svg-guide.md` | Gemini 3.1 Pro API, SVG prompt templates, validation checklist |
| `references/animation-tokens.md` | Springs, easing curves, durations, stagger patterns |
| `references/performance-rules.md` | GPU optimization, blur limits, bundle budgets, accessibility |
