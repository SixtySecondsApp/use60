# SVG Prompt Templates — Copy-Paste Ready

God-tier prompt templates for every common SVG animation type. Fill in the bracketed values and send to Gemini 3.1 Pro.

---

## Template 1: Interactive Isometric Scene

The flagship template. Produces the highest-quality results.

```
Generate a single-file, interactive SVG animation of a 3D isometric [SUBJECT].
Use a crisp vector illustration style with [COLOR_1] and [COLOR_2] tones.

Logic & Animation:
1. [FIRST MOTION — e.g. "Base platform slides up from below with easeOutQuint over 500ms"]
2. [SECOND MOTION — e.g. "Main object scales up from center with spring overshoot, 400ms delay"]
3. [THIRD MOTION — e.g. "Detail elements pop in with 60ms stagger, cubic-bezier(0.34, 1.56, 0.64, 1)"]
4. [HOVER BEHAVIOR — e.g. "On hover, the lid opens and contents float up with opacity fade-in"]

Use custom cubic-bezier curves throughout — no default ease or linear.
Apply squash-and-stretch on any landing/impact moments.
Include will-change hints on all animated elements for GPU acceleration.

Technical:
- Pure CSS @keyframes, no SMIL, no <script>
- viewBox="0 0 600 400", no fixed width/height
- xmlns="http://www.w3.org/2000/svg"
- <title>[ACCESSIBLE NAME]</title>
- @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
- @media (prefers-color-scheme: dark) { [DARK COLOR OVERRIDES] }
- Self-contained, no external resources
```

### Example Fill:

```
Generate a single-file, interactive SVG animation of a 3D isometric cardboard box.
Use a crisp vector illustration style with warm orange and neutral grey tones.

Logic & Animation:
1. Box base slides up from y:40 with cubic-bezier(0.22, 1, 0.36, 1) over 500ms
2. Shadow expands beneath with opacity 0→0.2, 300ms delay, ease-out
3. Packing tape accent line draws on with stroke-dashoffset, 600ms delay
4. On hover: box drops 4px, flaps fold shut with rotateX at hinge point,
   tape slides across and morphs into a green checkmark

Use custom cubic-bezier(0.34, 1.56, 0.64, 1) for the hover squash effect.
Apply will-change: transform on the box body and flap groups.

Technical:
- Pure CSS @keyframes, no SMIL, no <script>
- viewBox="0 0 400 300", no fixed width/height
- xmlns="http://www.w3.org/2000/svg"
- <title>Interactive package delivery confirmation</title>
- @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
- @media (prefers-color-scheme: dark) { background: #1a1a2e; box-color: #D97706; }
- Self-contained, no external resources
```

---

## Template 2: Hero Accent Animation

Decorative motion for hero sections. Loops infinitely but subtly.

```
Generate a self-contained SVG animation for a hero section accent.
Style: [AESTHETIC — e.g. "modern SaaS, clean geometric shapes"].

The animation shows: [DESCRIPTION — e.g. "floating geometric shapes that orbit slowly"].

Motion:
- Primary motion: [MAIN LOOP — e.g. "3 circles orbit a center point at different radii and speeds"]
- Secondary motion: [ACCENT — e.g. "subtle scale pulse on each shape, 3s cycle, staggered starts"]
- Atmosphere: [AMBIENT — e.g. "gradient opacity breathing on background, 6s sine wave"]

All motion uses ease-in-out-sine for organic, breathing feel.
Total loop duration: [DURATION]s with no visible restart seam.

Colors:
- Primary: [HEX] — used for [WHAT]
- Secondary: [HEX] — used for [WHAT]
- Accent: [HEX] — used for [WHAT]
- Background: transparent

Technical:
- viewBox="0 0 800 400", no fixed dimensions
- CSS @keyframes only, will-change hints on orbiting elements
- @media (prefers-reduced-motion: reduce) halts all animation
- @media (prefers-color-scheme: dark) adjusts colors for dark backgrounds
- <title>[NAME]</title>
- Under 30KB total
```

---

## Template 3: Section Divider

Animated separator between page sections.

```
Generate a self-contained SVG animation for an animated section divider.
Full-width design, approximately 60-80px tall.

Visual: [DESCRIPTION — e.g. "a flowing wave with gradient that gently undulates"]

Animation:
- [MOTION — e.g. "wave path oscillates vertically ±8px with sine easing, 4s loop"]
- [ACCENT — e.g. "gradient shifts horizontally creating a shimmer effect, 6s loop"]

Colors: gradient from [COLOR_1] to [COLOR_2]

Technical:
- viewBox="0 0 1440 80", preserveAspectRatio="none" for full-width stretch
- CSS @keyframes, ease-in-out-sine for organic wave motion
- <title>Decorative section divider</title>
- @media (prefers-reduced-motion: reduce) freezes at midpoint
- Self-contained, under 10KB
```

---

## Template 4: Animated Icon

Small animated icon (24x24 or 48x48 viewport).

```
Generate a self-contained animated SVG icon of: [DESCRIPTION]

Style:
- Stroke-based line art, stroke-width="2", stroke-linecap="round"
- Color: currentColor (inherits from parent)
- viewBox="0 0 24 24"

Animation:
- [MOTION — e.g. "draw-on effect using stroke-dasharray/stroke-dashoffset, 800ms"]
- [EASING — e.g. "cubic-bezier(0.22, 1, 0.36, 1)"]
- animation-fill-mode: forwards (plays once, stays drawn)

Keep it simple: max 10 path elements.
<title>[ICON NAME]</title>
@media (prefers-reduced-motion: reduce) shows static final state.
```

---

## Template 5: Multi-Stage Narrative

Storytelling animation with sequenced stages.

```
Generate a self-contained SVG animation that tells a visual story: [STORY CONCEPT]

Stages:
Stage 1 (0-[T1]s): [DESCRIBE — what appears, how it moves, what easing]
Stage 2 ([T1]-[T2]s): [DESCRIBE — transition, new elements, timing]
Stage 3 ([T2]-[T3]s): [DESCRIBE — climax/resolution, final state]
[Optional: Stage 4, etc.]

Physics for each element type:
- [ELEMENT A]: [HOW IT MOVES — e.g. "drops with gravity, bounces with decay"]
- [ELEMENT B]: [HOW IT MOVES — e.g. "floats up weightlessly, sine oscillation"]
- [ELEMENT C]: [HOW IT MOVES — e.g. "snaps in with spring overshoot"]

Use animation-delay to sequence stages.
Total duration: [TOTAL]s. Then [LOOP BEHAVIOR — e.g. "loop with 2s pause" or "hold final state"].

Style: [AESTHETIC]
Colors: [PALETTE]

Technical:
- viewBox="0 0 600 400"
- CSS @keyframes with custom cubic-bezier per element type
- will-change hints on all animated elements
- <title>[STORY NAME]</title>
- @media (prefers-reduced-motion: reduce) shows final state only
- Self-contained, under 50KB
```

---

## Template 6: Loading/Progress Animation

Branded loading states.

```
Generate a self-contained SVG loading animation.

Concept: [DESCRIPTION — e.g. "three dots that bounce in sequence with spring physics"]

Animation:
- Loop duration: [1-2]s, infinite
- Each element: [MOTION — e.g. "translateY -12px and back with cubic-bezier(0.34, 1.56, 0.64, 1)"]
- Stagger between elements: [DELAY]ms
- Overall feel: [MOOD — e.g. "energetic but not frantic"]

Colors:
- Active: [HEX]
- Muted: [HEX] at 40% opacity

Technical:
- viewBox="0 0 80 40" (compact)
- CSS @keyframes, will-change: transform
- <title>Loading</title>
- @media (prefers-reduced-motion: reduce) shows static dots
- Under 5KB
```

---

## Template 7: Cursor-Tracking Interactive

SVG that responds to mouse position.

```
Generate a self-contained SVG with cursor tracking.

Scene: [DESCRIPTION — e.g. "a friendly robot face with eyes that follow the cursor"]

Interactivity:
- [TRACKING ELEMENT] follows cursor position within constrained bounds
- Max travel: [X]px horizontal, [Y]px vertical from center
- Apply 0.1 lerp factor for smooth trailing (not instant snap)
- Use embedded JavaScript: addEventListener('mousemove') on the SVG element
- Calculate angle from [ELEMENT] center to cursor, apply constrained translate

Resting animation (when cursor is outside SVG):
- [IDLE MOTION — e.g. "eyes slowly scan left-right with sine easing, 4s loop"]

Style: [AESTHETIC]
Colors: [PALETTE]

Technical:
- viewBox="0 0 400 400"
- CSS @keyframes for idle state
- JavaScript only for cursor math (minimal, <20 lines)
- <title>[NAME]</title>
- @media (prefers-reduced-motion: reduce) disables tracking, shows resting state
```

---

## Quick Reference: Prompt Quality Levels

### Level 1: Basic (Vague) — Avoid
```
Make an animated SVG of a rocket.
```

### Level 2: Intermediate (Descriptive) — Okay
```
Create an animated SVG of a rocket launching upward with flame particles,
using blue and orange colors, smooth animation.
```

### Level 3: God Tier (Technical Director) — Target
```
Generate a single-file, interactive SVG animation of a sleek rocket ship
in a flat geometric illustration style with deep navy #1a1a2e body
and vivid orange #FF6B35 flame accents.

Logic & Animation:
1. Rocket sits at rest (0-0.5s), subtle hover oscillation ±2px translateY
   with ease-in-out-sine, 2s loop
2. On hover: exhaust flame scales from 0 to 1 with spring physics
   cubic-bezier(0.34, 1.56, 0.64, 1), 300ms
3. Rocket translates Y from 0 to -200 over 1.5s with easeOutExpo
   cubic-bezier(0.16, 1, 0.3, 1)
4. 6 particle circles burst from exhaust point with staggered 50ms delay,
   each: scale 0→1→0, translateY 0→80, opacity 1→0, 800ms duration
5. Star field (15 small circles) parallax-scrolls downward at 0.3x speed

Include will-change: transform on rocket body and all particles.
Pure CSS @keyframes, no SMIL, no JavaScript.
viewBox="0 0 400 600", <title>Rocket launch animation</title>.
@media (prefers-reduced-motion: reduce) shows static rocket.
@media (prefers-color-scheme: dark) inverts background tones.
Under 40KB. Self-contained.
```
