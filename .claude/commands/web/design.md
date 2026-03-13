---
name: web-design
invoke: /web/design
description: Visual direction — palette, typography, moodboard, style guide locked with ui-ux-pro-max intelligence + visual-assets-generator
---

# /web/design — Visual Direction

**Purpose**: Lock in the visual direction for a website/page. Queries ui-ux-pro-max databases for data-backed recommendations, generates a moodboard via visual-assets-generator, and produces a locked style guide that all downstream phases consume.

**Input**: $ARGUMENTS

---

## EXECUTION

### Step 1: Read the Brief

If `.web/brief.md` exists, read it for:
- Product type and industry
- Target audience
- Competitive landscape (what competitors look like)
- Design direction notes
- Dark/light mode decision

If no brief exists, ask 3 quick questions:
1. What are you building? (SaaS landing, dev tool, marketplace, portfolio, etc.)
2. What's the vibe? (premium dark, clean minimal, bold experimental, warm friendly)
3. Any reference sites you love?

### Step 2: Query Design Intelligence

Use the ui-ux-pro-max databases for product-type-matched recommendations:

```bash
# Get style recommendations for product type
python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py "$PRODUCT_TYPE" --domain style

# Get color palette recommendations
python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py "$INDUSTRY $MOOD" --domain color

# Get font pairing recommendations
python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py "$AESTHETIC" --domain typography
```

Also query the ui-styling skill's reference data:
- `~/.claude/skills/ui-styling/references/shadcn-theming.md` — for component theming tokens
- `~/.claude/skills/ui-styling/references/tailwind-customization.md` — for Tailwind config patterns

Cross-reference with `/frontend-design` aesthetics reference:
- Font recommendations by aesthetic (Premium SaaS, Editorial, Bold, Startup)
- Color palette presets (Linear Dark, Vercel Mono, Stripe Warm, Sixty Product)
- Anti-convergence rules (BANNED fonts, required spatial surprises)

### Step 3: Present Style Directions

Present **3 style directions** with clear differentiation:

```
DIRECTION A: [Name] — [1-line description]
  Style:      [e.g., Glassmorphism + Dark]
  Palette:    [Primary, accent, secondary — with hex codes]
  Typography: [Display font + Body font + rationale]
  Mood:       [2-3 adjectives]
  Reference:  [Closest real-world site]

DIRECTION B: [Name] — [1-line description]
  ...bolder interpretation...

DIRECTION C: [Name] — [1-line description]
  ...contrasting alternative...
```

For each direction, explain WHY it suits the product type and audience (backed by ui-ux-pro-max rules).

### Step 4: Generate Moodboard

After user picks a direction (or says "A" / "B" / "C"), generate visual references using the `/visual-assets-generator` workflow:

1. **Raster moodboard** — Generate 2-3 images via Nano Banana 2 showing the aesthetic applied:
   - Hero section atmosphere (radial glow, gradient, texture)
   - Color palette in context (UI mockup feel)
   - Typography specimen with the chosen fonts

2. **SVG accent** — Generate 1 animated SVG via Gemini 3.1 Pro that captures the motion language:
   - Subtle: micro-interactions, hover states
   - Standard: scroll reveals, entrance sequences
   - Cinematic: parallax, aurora, spotlight effects

Present the moodboard and wait for approval.

### Step 5: Lock Style Guide

Once approved, save the locked style guide:

```json
// .web/style-guide.json
{
  "version": 1,
  "lockedAt": "<ISO>",
  "direction": "A",
  "name": "Midnight Linear",

  "palette": {
    "background": { "value": "#09090b", "tailwind": "zinc-950" },
    "surface": { "value": "rgba(255,255,255,0.05)", "tailwind": "white/5" },
    "border": { "value": "rgba(255,255,255,0.1)", "tailwind": "white/10" },
    "textPrimary": { "value": "#ffffff", "tailwind": "white" },
    "textSecondary": { "value": "#a1a1aa", "tailwind": "zinc-400" },
    "accent1": { "value": "#8b5cf6", "tailwind": "violet-500" },
    "accent2": { "value": "#22d3ee", "tailwind": "cyan-400" },
    "cta": { "bg": "#ffffff", "text": "#000000" }
  },

  "typography": {
    "display": { "family": "Clash Display", "weights": [400, 600, 700], "source": "google-fonts" },
    "body": { "family": "Inter", "weights": [400, 500, 600], "source": "google-fonts" },
    "mono": { "family": "JetBrains Mono", "weights": [400, 700], "source": "google-fonts" }
  },

  "animation": {
    "tier": 2,
    "approach": "Framer Motion whileInView + staggered reveals",
    "heroTier": 3
  },

  "mode": "dark",
  "style": "glassmorphism",

  "antiConvergence": {
    "bannedFonts": ["Inter as display", "Roboto", "Space Grotesk", "Open Sans"],
    "requiredSurprises": ["asymmetric hero layout", "gradient text on heading"],
    "atmosphereEffects": ["radial glow", "grid pattern", "noise texture"]
  },

  "nanobananaPrefix": "Premium dark SaaS interface, zinc-950 background, violet accent lighting, glass morphism cards with subtle blur, clean modern typography, professional tech aesthetic",

  "geminiSvgStyle": "Minimal geometric, smooth easing, violet-500 accent, dark background, professional motion design"
}
```

### Step 6: Update Pipeline State

```json
// .web/pipeline.json — update
{
  "phase": "design",
  "phaseGates": {
    "brief": { "status": "complete" },
    "design": { "status": "complete", "completedAt": "<ISO>" },
    "build": { "status": "pending" },
    "assets": { "status": "pending" },
    "polish": { "status": "pending" }
  }
}
```

---

## V8 LEARNINGS: LIGHT/DARK MODE & VISUAL POLISH

### Light/Dark Mode Toggle
- Use Tailwind's class-based dark mode: `darkMode: ['class']` in tailwind config
- Toggle via `document.documentElement.classList.add/remove('dark')` — do NOT use a wrapper `<div className="dark">` as it conflicts with HTML-level theme scripts that run before React hydration
- Accent colors can differ per theme for better contrast: e.g., blue in light mode, emerald/green in dark mode. Use `text-blue-600 dark:text-emerald-500` pattern throughout

### Fixing "Washed Out" Feel
- Borders: use `border-gray-200` not `border-gray-100` (too subtle reads as no border)
- Alternate section backgrounds: white vs `gray-50` in light mode, `#0a0a0a` vs `#111` in dark mode
- Add subtle shadows on product mockup images (`shadow-lg` or `shadow-xl`) to lift them off the page
- Input styling: use `bg-gray-50` not plain white in light mode, `bg-white/5` in dark mode — gives fields visual weight

### Style Guide Additions for Dual-Mode Pages
When locking a style guide for a page with both light and dark modes, include per-mode tokens:

```json
{
  "palette": {
    "accent1": {
      "light": { "value": "#2563eb", "tailwind": "blue-600" },
      "dark": { "value": "#10b981", "tailwind": "emerald-500" }
    },
    "sectionAlt": {
      "light": { "value": "#f9fafb", "tailwind": "gray-50" },
      "dark": { "value": "#111111", "tailwind": "[#111]" }
    }
  }
}
```

---

## ANTI-CONVERGENCE ENFORCEMENT

These rules from `/frontend-design` are non-negotiable:

**NEVER recommend for landing pages:**
- Inter, Roboto, Arial, Open Sans, Lato as display fonts
- Purple gradients on white backgrounds (without deliberate contrast)
- Predictable 3-column card grids
- Generic hero → 3 features → testimonials → CTA without spatial variety

**ALWAYS include:**
- A distinctive display font
- One dominant color with sharp accents
- At least one spatial surprise (asymmetry, overlap, diagonal flow)
- Atmosphere (gradient meshes, noise, radial glows, layered transparencies)
- Dramatic typography (extreme weight contrasts, 3x+ size jumps)

---

## STANDALONE USE

`/web/design` can run without a brief. It will ask discovery questions inline, produce the style guide, and save it. Later phases (`/web/build`, `/web/assets`) will consume the locked style guide.

---

## OUTPUT

```
Style guide locked → saved to .web/style-guide.json
Moodboard: 3 images + 1 animated SVG saved to .web/moodboard/

Next: /web/build to generate the page code
  or: /web/assets to generate images, logos, and SVG animations first
```
