---
name: web-assets
invoke: /web/assets
description: Generate visual assets — hero images (Nano Banana 2), animated SVGs (Gemini 3.1 Pro), logos, banners, icons, social graphics
---

# /web/assets — Visual Asset Generation

**Purpose**: Generate all visual assets for a website/page using AI. Combines Nano Banana 2 (raster images), Gemini 3.1 Pro (animated SVGs), and the global design skill (logos, banners, icons, social photos). All output respects the locked style guide.

**Input**: $ARGUMENTS

---

## ENGINES

| Engine | Skill | What It Generates |
|--------|-------|-------------------|
| **Nano Banana 2** | `/nano-banana-image` | Hero images, product shots, backgrounds, social graphics, OG images |
| **Gemini 3.1 Pro** | `/gemini-svg-animator` | Animated SVGs, section dividers, loading animations, interactive illustrations |
| **Design (global)** | `~/.claude/skills/design/` | Logos, CIP mockups, banners, icons, social photos |
| **Visual Assets Generator** | `/visual-assets-generator` | Moodboards, style-consistent batches (orchestrates Nano Banana + Gemini) |

---

## EXECUTION

### Step 1: Load Style Context

Read `.web/style-guide.json` for:
- **`nanobananaPrefix`** — locked prompt prefix for raster image consistency
- **`geminiSvgStyle`** — locked style descriptor for SVG animations
- **`palette`** — brand colors to reference in prompts
- **`mode`** — dark/light affects image generation context

Read `.web/brief.md` for:
- Section stack (what images are needed where)
- Product type (affects image subject matter)
- Brand context

### Step 2: Route by Asset Type

Classify the request and route to the right engine:

| Request | Engine | Workflow |
|---------|--------|----------|
| "hero image", "background", "product shot" | Nano Banana 2 | 7-layer prompt framework |
| "animated SVG", "section divider", "loading animation" | Gemini 3.1 Pro | 5-pillar prompt engineering |
| "logo", "brand mark" | Design skill (logo) | Search styles → generate with Gemini |
| "banner", "social cover", "ad creative" | Design skill (banner) | 22 art direction styles |
| "icon", "icon set" | Design skill (icon) | 15 styles, SVG output |
| "social photos", "Instagram post", "LinkedIn graphic" | Design skill (social photos) | HTML→screenshot, multi-platform |
| "moodboard", "style exploration" | Visual Assets Generator | 3 directions x 2 images |
| "all assets for this page" | Full inventory | See Step 3 |

### Step 3: Full Asset Inventory (for `/web/ship` pipeline)

When generating all assets for a page, inventory what's needed from the brief:

```
ASSET INVENTORY
===============
Section: Hero
  - [ ] Hero background image (Nano Banana 2 — landscape)
  - [ ] Animated accent SVG (Gemini 3.1 Pro — radial glow or geometric)

Section: Social Proof
  - [ ] Logo images (if not using inline SVGs)

Section: Features
  - [ ] Feature illustration x3-4 (Nano Banana 2 — square, consistent style)
  - [ ] Animated feature icon SVG (Gemini 3.1 Pro — hover interactive)

Section: How It Works
  - [ ] Step illustration x3 (Nano Banana 2 — consistent batch)

Section: CTA
  - [ ] Background image or animated SVG

Brand:
  - [ ] Logo (if needed — Design skill)
  - [ ] Favicon / app icon (Design skill — icon)

Social / OG:
  - [ ] OG image 1200x630 (Nano Banana 2)
  - [ ] Twitter card 1200x600 (Nano Banana 2)
```

### Step 4: Generate with Locked Style

**Raster images (Nano Banana 2):**

Use the 7-layer prompt framework from `/nano-banana-image`:
1. Subject — hyper-specific
2. Action/Pose
3. Composition — camera angle, framing
4. Environment — setting
5. Lighting — THE MOST IMPORTANT LAYER
6. Style/Medium
7. Technical Gloss

Prepend the locked `nanobananaPrefix` from style-guide.json to every prompt for visual consistency.

```
# Example prompt construction:
"{nanobananaPrefix}, {subject}, {composition}, {lighting}, {style}"
```

**Animated SVGs (Gemini 3.1 Pro):**

Use the 5 Pillars from `/gemini-svg-animator`:
1. Speak the Language of Animation (spring physics, easing curves)
2. Multi-Element Choreography (sequenced reveals)
3. Context-Aware Motion (object physics)
4. Demand Interactivity (hover, click, cursor tracking)
5. Specify the Tech Stack (pure CSS @keyframes, no JS/SMIL)

Apply `geminiSvgStyle` from style-guide.json. Set thinking budget by complexity:
- Simple: 2048 tokens
- Medium: 8192 tokens
- Complex: 16384 tokens

**Logos (Design skill):**

```bash
# Search matching styles
python3 ~/.claude/skills/design/scripts/logo/search.py "$BRAND_STYLE" --domain style

# Search matching color palettes
python3 ~/.claude/skills/design/scripts/logo/search.py "$INDUSTRY" --domain color

# Generate
python3 ~/.claude/skills/design/scripts/logo/generate.py --name "$BRAND" --style "$STYLE" --colors "$COLORS"
```

**Banners / Social (Design skill):**

Route to the banner-design or social photos sub-skills from `~/.claude/skills/design/`. Use platform-specific dimensions:

| Platform | Size |
|----------|------|
| OG Image | 1200x630 |
| Twitter Card | 1200x600 |
| LinkedIn Cover | 1584x396 |
| Instagram Post | 1080x1080 |
| Facebook Cover | 820x312 |

**Icons (Design skill):**

```bash
python3 ~/.claude/skills/design/scripts/icon/generate.py --style "$STYLE" --description "$DESCRIPTION"
```

### Step 4b: Integration Logos (logo.dev)

For integration grids, partner logos, or trust bars, use logo.dev CDN — NOT raw S3 bucket URLs (blocked by ad blockers):

```
https://img.logo.dev/{domain}?token=pk_X-1ZO13GSgeOoUrIuJ6GMQ&size=128&format=png
```

Example: `https://img.logo.dev/slack.com?token=pk_X-1ZO13GSgeOoUrIuJ6GMQ&size=128&format=png`

Always implement a fallback (first letter of company name in a styled circle) with loading/error states:

```tsx
const [imgError, setImgError] = useState(false);
const logoUrl = `https://img.logo.dev/${domain}?token=pk_X-1ZO13GSgeOoUrIuJ6GMQ&size=128&format=png`;

return imgError ? (
  <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-white/10 flex items-center justify-center text-sm font-medium">
    {companyName[0]}
  </div>
) : (
  <img src={logoUrl} alt={companyName} onError={() => setImgError(true)} className="w-8 h-8" />
);
```

### Step 4c: use60 Brand Assets

Official brand assets for 60/use60 pages:

| Asset | URL |
|-------|-----|
| Icon | `https://ygdpgliavpxeugaajgrb.supabase.co/storage/v1/object/public/Logos/ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459/Icon.png` |
| Light mode logo | `https://ygdpgliavpxeugaajgrb.supabase.co/storage/v1/object/public/Logos/ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459/Light%20Mode%20Logo.png` |
| Dark mode logo | `https://ygdpgliavpxeugaajgrb.supabase.co/storage/v1/object/public/Logos/ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459/Dark%20Mode%20Logo.png` |

Branding utility: `src/lib/utils/sixtyBranding.ts`
SVG assets for landing pages: `packages/landing/src/svg/` (hero-orbital, brand-constellation, feature-*, step-*)

### Step 5: Save Assets

Save all generated assets to `.web/assets/`:

```
.web/assets/
  hero/
    hero-bg.png
    hero-accent.svg
  features/
    feature-1.png
    feature-2.png
    feature-3.png
    feature-icon.svg
  brand/
    logo.svg
    favicon.svg
  social/
    og-image.png
    twitter-card.png
  moodboard/
    direction-a-1.png
    direction-a-2.png
```

### Step 6: Update Pipeline State

```json
{
  "phase": "assets",
  "phaseGates": {
    "brief": { "status": "complete" },
    "design": { "status": "complete" },
    "build": { "status": "complete" },
    "assets": { "status": "complete", "completedAt": "<ISO>" },
    "polish": { "status": "pending" }
  }
}
```

---

## STANDALONE USE

`/web/assets` works independently for any asset request:

```
/web/assets "generate a logo for a fintech startup called Payflow"
/web/assets "hero image for a dark mode SaaS landing page about AI sales"
/web/assets "animated SVG loading spinner with violet accent"
/web/assets "social media graphics pack for product launch"
```

When running standalone without a style guide, it will ask for style context or use the visual-assets-generator's style discovery flow (3 questions → moodboard → lock → generate).

---

## OUTPUT

```
Assets generated:
  - .web/assets/hero/hero-bg.png (Nano Banana 2)
  - .web/assets/hero/hero-accent.svg (Gemini 3.1 Pro — animated)
  - .web/assets/features/feature-1.png (Nano Banana 2)
  - .web/assets/features/feature-2.png (Nano Banana 2)
  - .web/assets/features/feature-3.png (Nano Banana 2)
  - .web/assets/brand/logo.svg (Design skill)
  - .web/assets/social/og-image.png (Nano Banana 2)

All assets match locked style guide. Ready to wire into /web/build components.

Next: /web/polish for final quality audit
```
