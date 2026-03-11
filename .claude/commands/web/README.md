---
name: web-readme
invoke: web:README
description: Web Pipeline — unified website/page creation workflow
---

# /web — Web Design & Build Pipeline

One entry point for everything website. Reference analysis, strategy, design, content, code, assets, quality — unified.

## Commands

| Command | What It Does |
|---------|-------------|
| `/web/go` | Smart router — say what you want, it picks the right command |
| `/web/reference` | Analyze a reference site — extract patterns, content architecture, visual approach |
| `/web/brief` | Strategic brief (audience, SEO, conversion, section stack, content density target) |
| `/web/design` | Visual direction (palette, fonts, moodboard, style guide lock) |
| `/web/copy` | Content generation (headlines, body, code examples, tables, CTAs) — content before code |
| `/web/build` | Code generation (React + TypeScript + Tailwind) using approved copy + locked style |
| `/web/assets` | Visual assets (Nano Banana 2 images, Gemini 3.1 Pro SVGs, logos, banners) |
| `/web/polish` | Quality audit (accessibility, UX rules, craft pass, content completeness, performance) |
| `/web/ship` | Full pipeline — reference → brief → design → copy → build → assets → polish |
| `/web/quick` | Fast-path — single section or component, skip the pipeline |

## Quick Start

```bash
# Full page with a quality reference
/web/ship "Build a product page like spacebot.sh for our AI sales tool"

# Analyze a reference site first
/web/reference "https://spacebot.sh"

# Full page from scratch
/web/ship "Landing page for an AI sales tool"

# Just the content
/web/copy "write all copy for the features + pricing sections"

# Just build one section
/web/quick "dark hero with gradient text"

# Let the router decide
/web/go "I need a pricing page"
```

## Pipeline: Content Before Code

The key insight: **content determines layout, not the other way around**. The old pipeline (brief → design → build) produced generic pages because code and copy were written simultaneously. The new pipeline separates them:

```
REFERENCE (optional) → BRIEF → DESIGN → COPY → BUILD → ASSETS → POLISH
                                         ^^^^
                              This is the phase that makes
                              the difference between generic
                              and spacebot.sh-quality output
```

### Human Gates

| Gate | Phase | Why |
|------|-------|-----|
| Style approval | DESIGN | Pick visual direction A/B/C |
| Content approval | COPY | Review all copy, code examples, and data before building |

Everything else auto-advances.

## What Powers It

| Engine | Used By | Generates |
|--------|---------|-----------|
| `/website-strategist` | brief | Strategy blueprints, SEO architecture |
| `/frontend-design` | build, quick | React/Tailwind components, animation tiers |
| `ui-ux-pro-max` (global) | brief, design, build, polish | 161 palettes, 57 fonts, 99 UX rules |
| `ui-styling` (global) | design, build | shadcn/ui components, Tailwind theming |
| `design` (global) | assets | Logos, banners, icons, social photos |
| `/nano-banana-image` | assets | Raster images (Gemini 3 Pro via OpenRouter) |
| `/gemini-svg-animator` | assets | Animated SVGs (Gemini 3.1 Pro) |
| `/visual-assets-generator` | design, assets | Moodboards, style-consistent batches |

## Section Type Vocabulary

The pipeline knows 17 section types — not just "hero + features + CTA":

| Type | What It Builds |
|------|---------------|
| `hero` | Opening hook with value prop |
| `architecture` | System diagram with labeled components |
| `deep-dive` | Technical feature breakdown with code |
| `integration-grid` | Supported tools/platforms grid |
| `feature-matrix` | Bento grid or spotlight cards |
| `code-example` | Syntax-highlighted usage examples |
| `comparison-table` | Side-by-side feature/pricing comparison |
| `pricing` | Tier cards with features and CTAs |
| `process-flow` | Step-by-step how it works |
| `tech-stack` | Technology choices with rationale |
| `deployment` | Setup/install with code blocks |
| `taxonomy` | Categorized feature list |
| `narrative` | Story-driven explanation |
| `social-proof` | Testimonials, logos, stats |
| `data-table` | Structured specs/limits/values |
| `faq` | Accordion Q&A |
| `cta` | Final conversion section |

## Pipeline State

All state lives in `.web/`:

```
.web/
  pipeline.json      # Phase tracking (7 phases)
  reference.md       # Reference site analysis
  brief.md           # Strategic brief
  style-guide.json   # Locked visual direction
  copy.md            # Approved page content
  assets/            # Generated images, SVGs, logos
  moodboard/         # Style exploration images
```
