---
name: web-readme
invoke: web:README
description: Web Pipeline — unified website/page creation workflow
---

# /web — Web Design & Build Pipeline

One entry point for everything website. Strategy, design, code, assets, quality — unified.

## Commands

| Command | What It Does |
|---------|-------------|
| `/web/go` | Smart router — say what you want, it picks the right command |
| `/web/brief` | Strategic brief (audience, SEO, conversion, section stack) |
| `/web/design` | Visual direction (palette, fonts, moodboard, style guide lock) |
| `/web/build` | Code generation (React + TypeScript + Tailwind) |
| `/web/assets` | Visual assets (Nano Banana 2 images, Gemini 3.1 Pro SVGs, logos, banners) |
| `/web/polish` | Quality audit (accessibility, UX rules, craft pass, performance) |
| `/web/ship` | Full pipeline — brief → design → build → assets → polish |
| `/web/quick` | Fast-path — single section or component, skip the pipeline |

## Quick Start

```bash
# Full page from scratch
/web/ship "Landing page for an AI sales tool"

# Just build one section
/web/quick "dark hero with gradient text"

# Let the router decide
/web/go "I need a pricing page"
```

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

## Pipeline State

All state lives in `.web/`:

```
.web/
  pipeline.json      # Phase tracking (like .sixty/pipeline.json)
  brief.md           # Strategic brief
  style-guide.json   # Locked visual direction
  assets/            # Generated images, SVGs, logos
  moodboard/         # Style exploration images
```
