---
name: gemini-svg-animator
description: |
  God-tier SVG animation generator powered by Gemini 3.1 Pro. Produces interactive, physics-based,
  production-ready animated SVGs by speaking the language of animation — spring physics, custom
  cubic-bezier curves, multi-element choreography, hover/click interactivity, and GPU-optimized
  CSS keyframes. Use when creating hero animations, section dividers, decorative motion, interactive
  illustrations, onboarding graphics, or any animated SVG asset.
metadata:
  author: sixty-ai
  version: "1"
  category: frontend
  skill_type: atomic
  is_active: true
  command_centre:
    enabled: true
    label: "/svg-animate"
    description: "Generate god-tier animated SVGs with Gemini 3.1 Pro"
    icon: "sparkles"
  agent_affinity:
    - frontend
    - design
    - landing
  requires_capabilities:
    - gemini_api
  triggers:
    - pattern: "SVG animation"
      intent: "svg_animation"
      confidence: 0.95
      examples:
        - "generate an SVG animation"
        - "create an animated SVG"
        - "make an SVG animation for the hero"
    - pattern: "animated SVG"
      intent: "animated_svg"
      confidence: 0.95
      examples:
        - "create an animated SVG illustration"
        - "build an animated SVG for the landing page"
        - "I need an animated SVG"
    - pattern: "SVG with Gemini"
      intent: "gemini_svg"
      confidence: 0.92
      examples:
        - "use Gemini to make an SVG"
        - "generate SVG with Gemini 3.1 Pro"
        - "Gemini SVG animation"
    - pattern: "interactive SVG"
      intent: "interactive_svg"
      confidence: 0.90
      examples:
        - "make an interactive SVG"
        - "SVG with hover effects"
        - "clickable SVG animation"
    - pattern: "isometric illustration"
      intent: "isometric_svg"
      confidence: 0.85
      examples:
        - "create an isometric SVG"
        - "3D isometric animation"
        - "isometric vector illustration"
    - pattern: "section divider animation"
      intent: "divider_svg"
      confidence: 0.88
      examples:
        - "animated section divider"
        - "decorative SVG divider"
        - "wave animation between sections"
    - pattern: "loading animation SVG"
      intent: "loading_svg"
      confidence: 0.88
      examples:
        - "create a loading animation"
        - "SVG spinner"
        - "animated loading state"
  keywords:
    - "svg"
    - "animation"
    - "animated"
    - "gemini"
    - "isometric"
    - "interactive"
    - "keyframes"
    - "motion"
    - "vector"
    - "illustration"
    - "divider"
    - "hero animation"
    - "hover"
    - "spring physics"
    - "cubic-bezier"
  inputs:
    - name: description
      type: string
      description: "What the SVG should depict and how it should animate"
      required: true
    - name: brand_colors
      type: object
      description: "Brand color map (e.g. { Primary: '#2563EB', Accent: '#8B5CF6' })"
      required: false
    - name: complexity
      type: string
      description: "Animation complexity: simple, medium, complex"
      required: false
      default: "medium"
    - name: interactivity
      type: string
      description: "Interaction type: none, hover, click, cursor-tracking"
      required: false
      default: "none"
    - name: style
      type: string
      description: "Visual style: isometric, flat, 3d, geometric, organic, minimal"
      required: false
  outputs:
    - name: svg_code
      type: string
      description: "Production-ready SVG markup with embedded CSS animations"
    - name: description
      type: string
      description: "What was generated and how it animates"
  priority: high
  tags:
    - "svg"
    - "animation"
    - "gemini"
    - "interactive"
    - "isometric"
    - "landing page"
    - "motion"
    - "illustration"
---

# Gemini SVG Animator

God-tier animated SVG generation powered by Gemini 3.1 Pro. This skill speaks the language of professional animation — spring physics, custom easing curves, multi-element choreography, and real interactivity — to produce SVGs that feel alive.

**The difference between average and god-tier:** Average prompts say "make it move." God-tier prompts specify spring physics, custom cubic-bezier curves, staggered choreography, and GPU-optimized rendering hints. This skill enforces the latter.

---

## ROUTE DETECTION

| Scenario | Entry Point |
|----------|-------------|
| Quick single SVG, clear description | **Express** — single call |
| Multiple SVGs for a page (hero, divider, accent) | **Batch** — parallel generation |
| Interactive SVG with hover/click/cursor | **Interactive** — enhanced prompt |
| Complex narrative animation (multi-stage) | **Cinematic** — sequenced prompt |
| Refining/regenerating an existing SVG | **Iterate** — tweak and regenerate |

---

## THE FIVE PILLARS OF GOD-TIER SVG PROMPTS

**Read `references/prompt-engineering.md` for the complete framework.**

Every prompt to Gemini 3.1 Pro must address these five pillars:

### Pillar 1: Speak the Language of Animation

Use professional animation terminology. Gemini 3.1 Pro is highly responsive to specific terms:

| Instead of... | Say... |
|---------------|--------|
| "make it move" | "apply spring physics with squash-and-stretch on landing" |
| "smooth animation" | "custom cubic-bezier(0.22, 1, 0.36, 1) easing with 300ms duration" |
| "bounce effect" | "overshoot-and-settle with cubic-bezier(0.34, 1.56, 0.64, 1)" |
| "fade in" | "opacity 0 to 1 over 400ms with ease-out deceleration curve" |
| "slide up" | "translateY from 24px to 0 with easeOutQuint timing" |

### Pillar 2: Multi-Element Choreography

Detail the exact sequence. Gemini keeps track of multiple moving parts:

```
Create a 4-stage reveal over 3 seconds:
1. Background circle scales up from 0 with spring physics (0-0.6s)
2. 200ms pause
3. Five UI icons pop in sequentially with 80ms stagger (0.8-1.6s)
4. Connecting lines draw on with stroke-dashoffset animation (1.6-2.4s)
```

### Pillar 3: Context-Aware Motion

Tell Gemini exactly what the object IS — it adjusts physics accordingly:

- "Heavy mechanical gear" = rigid, continuous rotation, no easing
- "Organic plant vine" = gentle, randomized sway, ease-in-out-sine
- "Floating data particle" = weightless drift, linear with subtle oscillation
- "Notification bell" = quick pendulum swing with damping decay

### Pillar 4: Demand Interactivity

Don't settle for looping animations. Gemini writes real code:

- **Hover states:** "Make the backpack smoothly open and tools float out on hover"
- **Cursor tracking:** "Make the robot's eyes follow the user's cursor"
- **Click events:** "Add a trigger button that activates the sequence using CSS `:checked` states"
- **Scroll-linked:** "Progress bar fills as the user scrolls down"

### Pillar 5: Specify the Tech Stack

Be explicit about implementation:

```
TECHNICAL REQUIREMENTS:
- Pure CSS @keyframes animations (no JavaScript, no SMIL)
- Include will-change hints for GPU acceleration on animated elements
- Use cubic-bezier curves, not default ease/linear
- Include @media (prefers-reduced-motion: reduce) to halt all animation
- Self-contained: no external fonts, no external resources
- Include <title> for accessibility
```

---

## PROMPT CONSTRUCTION

**Read `references/prompt-templates.md` for copy-paste templates.**

### The God-Tier Prompt Formula

```
Generate a single-file, [INTERACTIVITY] SVG animation of [SUBJECT].
Use a [STYLE] illustration style with [COLOR DESCRIPTION] tones.

Logic & Animation:
[CHOREOGRAPHY — numbered steps with exact timing]

Physics:
[EASING CURVES — specific cubic-bezier values for each motion type]

Technical:
- Pure CSS @keyframes with will-change hints for optimal performance
- viewBox="[DIMENSIONS]", no fixed width/height
- xmlns="http://www.w3.org/2000/svg"
- <title>[ACCESSIBLE NAME]</title>
- @media (prefers-reduced-motion: reduce) stops all animation
- @media (prefers-color-scheme: dark) remaps colors
- No <script> tags, no external resources
- Self-contained and ready to drop into a browser
```

---

## API REFERENCE

### Frontend Service

```typescript
import { geminiSvgService } from '@/lib/services/geminiSvgService';

// Single generation
const result = await geminiSvgService.generate({
  description: string,                           // Required — the god-tier prompt
  brand_colors?: Record<string, string>,         // { "Primary": "#2563EB" }
  complexity?: 'simple' | 'medium' | 'complex',  // Controls thinking budget
  viewbox?: string,                              // Default: '0 0 600 400'
});

// Batch generation (parallel)
const results = await geminiSvgService.generateBatch([
  { description: "Hero accent...", complexity: 'complex' },
  { description: "Section divider...", complexity: 'simple' },
  { description: "Background pattern...", complexity: 'medium' },
]);
```

### Thinking Budgets

| Complexity | Budget | Use For |
|-----------|--------|---------|
| `simple` | 2048 | Single-element: spinners, checkmarks, simple icons |
| `medium` | 8192 | Multi-element: scenes, illustrations, onboarding steps |
| `complex` | 16384 | Narrative sequences, isometric scenes, interactive elements |

### Return Type

```typescript
interface GenerateSvgResult {
  svg_code: string;      // Raw SVG markup — validated, safe, production-ready
  description: string;   // What was generated
}
```

### Edge Function

The `generate-svg` edge function handles:
- Gemini 3.1 Pro API call with thinking budgets
- Response extraction (strips markdown fences, handles thinking blocks)
- SVG validation (structure, security, size)
- Cost tracking to `ai_cost_events` table
- Returns 422 with `validation_errors` array on bad SVG

---

## VALIDATION CHECKLIST

Run on every generated SVG before delivering:

### Structure
- [ ] Root `<svg>` has `viewBox` attribute
- [ ] Root `<svg>` has `xmlns="http://www.w3.org/2000/svg"`
- [ ] No fixed `width` or `height` on root (responsive)
- [ ] Contains `<title>` element for accessibility
- [ ] Total file size < 50KB

### Animation Quality
- [ ] Uses CSS `@keyframes` inside `<style>` (no SMIL)
- [ ] Custom `cubic-bezier` curves (no bare `ease` or `linear`)
- [ ] `will-change` hints on animated elements
- [ ] Reasonable duration (< 5s for loops, < 3s for one-shot)
- [ ] `animation-fill-mode: forwards` for one-shot animations

### Performance
- [ ] Animates only `transform` and `opacity` where possible
- [ ] No excessive blur filters (max `stdDeviation="4"`)
- [ ] Reasonable element count (< 100 elements)
- [ ] `will-change` removed after animation completes (for one-shot)

### Accessibility & Theming
- [ ] `@media (prefers-reduced-motion: reduce)` stops all animation
- [ ] `@media (prefers-color-scheme: dark)` adjusts colors
- [ ] `<title>` provides meaningful description

### Security
- [ ] No `<script>` tags
- [ ] No `javascript:` URIs
- [ ] No external resource loads
- [ ] No `onclick` or event handler attributes

---

## DESIGN TOKENS

**Read `references/animation-tokens.md` for the complete token library.**

Quick reference for prompt construction:

| Motion Type | Easing | Duration |
|-------------|--------|----------|
| Entrance (fade up) | `cubic-bezier(0.22, 1, 0.36, 1)` | 400-600ms |
| Dramatic entrance | `cubic-bezier(0.16, 1, 0.3, 1)` | 500-700ms |
| Bounce/overshoot | `cubic-bezier(0.34, 1.56, 0.64, 1)` | 300-500ms |
| Exit | `cubic-bezier(0.3, 0, 0.8, 0.15)` | 200ms |
| Gentle loop | `cubic-bezier(0.37, 0, 0.63, 1)` | 2000-4000ms |
| Stagger per item | 30-80ms | Budget: 300-500ms total |

---

## REFERENCE FILES

| File | Contents |
|------|----------|
| `references/prompt-engineering.md` | The 5 pillars deep dive, context-aware motion physics, choreography patterns |
| `references/prompt-templates.md` | Copy-paste god-tier prompt templates for every SVG type |
| `references/animation-tokens.md` | Springs, easing curves, durations, stagger patterns (shared with visual-assets-generator) |
| `references/interactivity-patterns.md` | Hover, click, cursor-tracking, scroll-linked CSS patterns |
