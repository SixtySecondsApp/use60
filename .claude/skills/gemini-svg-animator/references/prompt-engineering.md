# SVG Prompt Engineering — The 5 Pillars Deep Dive

How to craft prompts that make Gemini 3.1 Pro produce god-tier animated SVGs instead of generic clipart.

---

## Pillar 1: Speak the Language of Animation

Gemini 3.1 Pro is trained on professional animation documentation. Using precise terminology triggers higher-quality output because the model activates the right knowledge domains.

### Physics Vocabulary

| Term | What It Means | When to Use |
|------|--------------|-------------|
| **Spring physics** | Motion governed by stiffness/damping/mass, not duration | Interactive elements, things that respond to user input |
| **Squash and stretch** | Object compresses on impact, elongates on release | Bouncing balls, landing objects, playful UI |
| **Overshoot and settle** | Goes past target then snaps back | Button presses, toggle switches, confirmations |
| **Ease-out deceleration** | Fast start, gradual stop (object arriving) | Elements entering the screen |
| **Ease-in acceleration** | Slow start, fast finish (object departing) | Elements exiting the screen |
| **Damping decay** | Oscillation that gradually reduces to zero | Pendulum swings, notification bells, spring bounces |
| **Velocity transfer** | One element's motion inherits from another's | Chain reactions, domino effects |

### Easing Curve Cheat Sheet

Always specify custom `cubic-bezier` curves. Never accept default `ease` or `linear`:

```
ENTRANCES — Fast attack, long settle:
  cubic-bezier(0.22, 1, 0.36, 1)   — easeOutQuint (the modern SaaS standard)
  cubic-bezier(0.16, 1, 0.3, 1)    — easeOutExpo (dramatic snap)
  cubic-bezier(0.0, 0, 0, 1)       — pure deceleration

EXITS — Accelerating departure:
  cubic-bezier(0.3, 0, 0.8, 0.15)  — emphasized exit
  cubic-bezier(0.55, 0, 1, 0.45)   — standard exit

BOUNCES — Playful overshoot:
  cubic-bezier(0.34, 1.56, 0.64, 1) — single overshoot
  cubic-bezier(0.68, -0.55, 0.27, 1.55) — dramatic bounce

LOOPS — Breathing, pulsing:
  cubic-bezier(0.37, 0, 0.63, 1)   — sine wave (symmetric)
  cubic-bezier(0.45, 0, 0.55, 1)   — gentle sine

ON-SCREEN REPOSITIONING:
  cubic-bezier(0.2, 0, 0, 1)       — Material Design 3 standard
```

### Example: Weak vs. Strong Prompt Language

**Weak:**
```
Make a circle that grows and then a checkmark appears inside it.
```

**Strong:**
```
Animate a success confirmation:
1. Circle scales from 0 to 1 using cubic-bezier(0.34, 1.56, 0.64, 1) — overshoot to 110% then settle
2. After 400ms delay, checkmark draws on using stroke-dasharray/stroke-dashoffset
3. Checkmark uses cubic-bezier(0.22, 1, 0.36, 1) for the draw-on, 600ms duration
4. Subtle radial glow pulses once behind the circle using opacity 0→0.3→0
```

---

## Pillar 2: Multi-Element Choreography

Gemini 3.1 Pro's 1M context window and thinking budget let it track complex multi-element sequences without losing coherence. The key is to specify timing relationships precisely.

### Staggering Patterns

**Sequential reveal:**
```
Stage 1 (0-0.5s): Background gradient fades in
Stage 2 (0.3-0.8s): Main shape scales up with spring physics (overlapping start)
Stage 3 (0.6-1.4s): 5 detail elements appear with 100ms stagger
Stage 4 (1.2-1.8s): Text label fades up from y:20 with easeOutQuint
```

**Radial burst:**
```
Center element appears first (0-0.3s), then 6 surrounding elements
burst outward simultaneously but with staggered scale-up:
- Element at 0°: delay 0ms
- Element at 60°: delay 50ms
- Element at 120°: delay 100ms
- ...continuing around the circle
Each element: translateX/Y outward 40px + scale 0→1, duration 400ms
```

**Domino cascade:**
```
5 cards in a row. Each card:
- rotates from -10deg to 0deg
- translates from y:40px to y:0
- opacity 0 to 1
Stagger: 80ms per card
Each card's animation: 500ms with cubic-bezier(0.22, 1, 0.36, 1)
Total sequence: 820ms (500ms + 4×80ms stagger)
```

### Timing Relationships

Use overlapping timing for fluid motion (not strict sequential):

```
OVERLAPPING (feels connected):
  Element A: 0ms — 500ms
  Element B: 200ms — 700ms  ← starts while A is still moving
  Element C: 400ms — 900ms

SEQUENTIAL (feels stepped):
  Element A: 0ms — 500ms
  Element B: 500ms — 1000ms  ← waits for A to finish
  Element C: 1000ms — 1500ms

BURST (feels explosive):
  Element A: 0ms — 400ms
  Element B: 50ms — 450ms   ← nearly simultaneous
  Element C: 100ms — 500ms
```

---

## Pillar 3: Context-Aware Motion Physics

The type of object determines how it should move. Tell Gemini what it IS, not just what it DOES.

### Object Physics Dictionary

| Object Type | Motion Character | CSS Easing | Duration |
|-------------|-----------------|-----------|----------|
| **Heavy mechanical** (gear, anvil, safe) | Rigid rotation, no bounce, constant speed | `linear` or gentle ease | Continuous |
| **Light organic** (leaf, feather, bubble) | Gentle sway, randomized drift, floaty | `ease-in-out-sine` | 3-6s loops |
| **Springy UI** (button, toggle, card) | Snappy with overshoot, responsive | `cubic-bezier(0.34, 1.56, 0.64, 1)` | 200-400ms |
| **Liquid/fluid** (water, mercury, blob) | Morphing shapes, sine-wave distortion | `ease-in-out` | 2-4s loops |
| **Electric/digital** (data, signal, pulse) | Sharp, instant, with afterglow | `cubic-bezier(0.16, 1, 0.3, 1)` | 100-300ms |
| **Gravity-bound** (ball, box, pendulum) | Accelerate down, bounce up with decay | custom multi-step | Varies |
| **Atmospheric** (cloud, smoke, fog) | Ultra-slow drift, barely perceptible | `linear` | 10-30s loops |

### Example: Describing Object Physics in Prompts

```
Create an SVG animation of a notification bell.

PHYSICS:
- Initial state: bell hangs at rest, clapper centered
- Trigger: bell swings right 15deg with cubic-bezier(0.16, 1, 0.3, 1)
- Then swings left 12deg (reduced amplitude — damping)
- Then right 8deg, left 5deg, right 2deg — each swing loses ~35% amplitude
- Clapper follows bell motion with 50ms delay (inertia lag)
- Total decay to stillness: 1.8 seconds
- Sound wave rings pulse outward from bell at peak of first swing

The bell is METAL: rigid body, no deformation, pivot point at top.
The clapper is HEAVY: slight lag behind bell body.
The sound waves are EPHEMERAL: expand and fade rapidly.
```

---

## Pillar 4: Interactivity Deep Dive

Gemini 3.1 Pro writes working code. Push it beyond static loops.

### CSS-Only Interactivity (No JavaScript)

**Hover states:**
```
On hover:
- Box drops 4px (translateY) with spring settle
- Lid flaps fold shut using rotateX with transform-origin at hinge
- Tape slides across and morphs into a green checkmark
- All transitions use cubic-bezier(0.22, 1, 0.36, 1), 400ms

On hover-out:
- Reverse sequence with cubic-bezier(0.3, 0, 0.8, 0.15), 200ms (faster exit)
```

**CSS `:checked` toggle:**
```
Include a hidden checkbox input with a styled label as "trigger button".
When checked:
- Rocket ship translates from y:100 to y:-200 over 2s with easeOutExpo
- Flame particles appear below with staggered opacity pulse
- Star field parallax scrolls upward at 0.5x speed

When unchecked:
- Rocket returns with gravity physics (ease-in, accelerating downward)
- Flame extinguishes (opacity to 0, 200ms)
```

**`:focus-within` for form elements:**
```
When the input inside the SVG receives focus:
- Border color transitions from gray to primary blue
- A subtle glow ring scales up behind the input
- Placeholder text slides up and shrinks into a label position
```

### JavaScript Interactivity (When Needed)

For cursor tracking, scroll-linked, or complex state:

```
CURSOR TRACKING:
The robot's eyes should track the cursor position.
Use embedded JavaScript with addEventListener('mousemove')
to calculate the angle from eye center to cursor
and apply a constrained transform: translate on the iris elements.
Max iris travel: 4px in any direction.
Easing: apply a 0.1 lerp factor for smooth trailing.
```

---

## Pillar 5: Technical Excellence

### GPU Acceleration

Always request these performance optimizations:

```
PERFORMANCE REQUIREMENTS:
- Add will-change: transform on all elements that animate transform
- Add will-change: opacity on all elements that animate opacity
- Prefer transform (translate, scale, rotate) over position properties
- Avoid animating path d-attribute (use transform instead)
- Keep filter effects minimal (max blur stdDeviation="4")
- Total element count under 100
```

### Dark Mode Support

```
THEMING:
Include @media (prefers-color-scheme: dark) block that remaps:
- Light backgrounds → dark equivalents
- Dark text → light equivalents
- Brand colors → slightly lighter/more saturated variants for dark backgrounds
Use CSS custom properties for all colors so the entire palette swaps cleanly.
```

### Accessibility

```
ACCESSIBILITY:
- <title>Descriptive name of what this SVG shows</title>
- role="img" on the root SVG if it conveys meaning
- aria-hidden="true" if purely decorative
- @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
```

---

## Anti-Patterns to Avoid

| Anti-Pattern | Why It Fails | What to Do Instead |
|-------------|-------------|-------------------|
| "Make it look cool" | Too vague, Gemini guesses | Specify exact style, colors, motion |
| Using SMIL (`<animate>`) | Poor browser support, deprecated | Always require CSS `@keyframes` |
| `animation: ease` | Generic, no personality | Specify `cubic-bezier(...)` values |
| Fixed `width`/`height` on `<svg>` | Breaks responsiveness | Use `viewBox` only |
| `<script>` for simple animation | Security risk, unnecessary | CSS handles 90% of cases |
| Animating `d` attribute | Expensive, janky | Use `transform` on groups |
| Missing `prefers-reduced-motion` | Accessibility violation | Always include the media query |
| Linear timing on UI elements | Feels robotic | Use easeOut for entrances |
