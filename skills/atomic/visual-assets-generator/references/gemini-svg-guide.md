# Gemini 3.1 Pro SVG Animation Guide

Reference for generating production-ready animated SVGs using Google Gemini 3.1 Pro.

---

## API Reference

| Field | Value |
|-------|-------|
| Model | `gemini-3.1-pro-preview` |
| Endpoint | `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent` |
| Auth | `x-goog-api-key` header |
| Context window | 1M tokens input / 64K tokens output |
| Pricing | ~$2 per 1M input tokens / ~$12 per 1M output tokens |
| Best for | Complex reasoning, creative generation, structured output |

### Request Structure

```json
{
  "contents": [{
    "parts": [{ "text": "<prompt>" }]
  }],
  "generationConfig": {
    "temperature": 0.7,
    "maxOutputTokens": 16384,
    "thinkingConfig": {
      "thinkingBudget": 8192
    }
  }
}
```

### Thinking Budget by Complexity

| Complexity | Budget | Examples |
|------------|--------|----------|
| Simple | `2048` | Single icon animation, spinner, checkmark |
| Medium | `8192` | Multi-element scene, onboarding step, empty state |
| Complex | `16384` | Narrative sequence, isometric scene, multi-stage animation |

### Authentication

The Gemini API key is stored in the user's settings. In edge functions, use `Deno.env.get('GEMINI_API_KEY')`. In the frontend context, retrieve from the user's `user_settings` table (never expose via `VITE_` prefix).

---

## Prompt Templates

### Template 1: General SVG Animation

Use for most animation requests.

```
Generate a single, self-contained SVG animation of: [DESCRIPTION]

REQUIREMENTS:
- Output ONLY the raw <svg>...</svg> markup. No markdown, no explanation, no code fences.
- Use a viewBox attribute (e.g., viewBox="0 0 400 300"). Do NOT set fixed width or height attributes.
- Add xmlns="http://www.w3.org/2000/svg" to the root <svg> element.
- All animations MUST use CSS @keyframes inside a <style> tag. Do NOT use SMIL (<animate>, <animateTransform>, <set>, <animateMotion>).
- Include a <title> element for accessibility.
- Include a @media (prefers-reduced-motion: reduce) query that stops all animations.
- Do NOT include any <script> tags or external resources.

DESIGN SYSTEM COLORS:
- Primary: #2563EB (actions, links, interactive elements)
- Success: #059669 (confirmations, positive states)
- Warning: #D97706 (caution states)
- Error: #DC2626 (error states)
- Background: #FFFFFF
- Surface: #F9FAFB
- Text primary: #111827
- Text secondary: #6B7280
- Border: #E5E7EB
- Font: Inter, system-ui, sans-serif

DARK MODE:
Include a @media (prefers-color-scheme: dark) block that remaps:
- Background: #030712
- Surface: #111827
- Text primary: #F3F4F6
- Text secondary: #9CA3AF
- Border: #374151
- Primary: #3B82F6
- Success: #10B981

ANIMATION GUIDELINES:
- Use ease-out or cubic-bezier(0.22, 1, 0.36, 1) for entrances
- Use ease-in for exits
- Keep total animation duration under 3 seconds for loops, 2 seconds for one-shot
- Use animation-fill-mode: forwards for one-shot animations
- Prefer transform and opacity for smooth 60fps performance
```

### Template 2: Icon/Logo Animation

Use for small animated icons (24x24 to 48x48).

```
Generate a single, self-contained animated SVG icon of: [DESCRIPTION]

REQUIREMENTS:
- Output ONLY the raw <svg>...</svg> markup. No markdown, no explanation.
- viewBox="0 0 24 24" (or 48 48 for detailed icons). No fixed width/height.
- xmlns="http://www.w3.org/2000/svg"
- CSS @keyframes only. No SMIL. No <script>.
- <title>[icon name]</title> for accessibility.
- @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
- Total animation duration: 1-2 seconds.
- Stroke-based line art style, stroke-width="2", stroke-linecap="round", stroke-linejoin="round".
- Color: currentColor (inherits from parent).
- Keep it simple — max 10 path elements.

ANIMATION STYLE:
- Draw-on effect using stroke-dasharray/stroke-dashoffset
- Or subtle transform animations (scale, rotate, translate)
- Ease: cubic-bezier(0.22, 1, 0.36, 1)
```

### Template 3: Narrative/Sequential Animation

Use for multi-stage storytelling animations.

```
Generate a single, self-contained SVG animation that tells a visual story: [DESCRIPTION]

SEQUENCE:
Stage 1 (0-1s): [describe]
Stage 2 (1-2s): [describe]
Stage 3 (2-3s): [describe]

REQUIREMENTS:
- Output ONLY the raw <svg>...</svg> markup. No markdown, no explanation.
- viewBox="0 0 600 400". No fixed width/height.
- xmlns="http://www.w3.org/2000/svg"
- CSS @keyframes only. No SMIL. No <script>.
- <title>[animation name]</title> for accessibility.
- @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
- Use animation-delay to sequence stages.
- Total duration: 3-5 seconds. Loop with a 1-second pause at the end.

DESIGN SYSTEM:
- Primary: #2563EB / Dark: #3B82F6
- Success: #059669 / Dark: #10B981
- Background: #FFFFFF / Dark: #030712
- Text: #111827 / Dark: #F3F4F6
- Include @media (prefers-color-scheme: dark) overrides.

STYLE:
- Clean, modern, flat illustration style
- Rounded corners on shapes (rx="4" to rx="8")
- Subtle shadows using filter: drop-shadow where appropriate
- Consistent 2px stroke weight for outlines
```

---

## Design System Color Map (SVG CSS Variables)

Inject this `<style>` block at the top of every generated SVG for theme support:

```css
<style>
  :root {
    --primary: #2563EB;
    --primary-light: #3B82F6;
    --success: #059669;
    --success-light: #10B981;
    --warning: #D97706;
    --error: #DC2626;
    --bg: #FFFFFF;
    --surface: #F9FAFB;
    --text: #111827;
    --text-secondary: #6B7280;
    --border: #E5E7EB;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --primary: #3B82F6;
      --primary-light: #60A5FA;
      --success: #10B981;
      --success-light: #34D399;
      --warning: #F59E0B;
      --error: #EF4444;
      --bg: #030712;
      --surface: #111827;
      --text: #F3F4F6;
      --text-secondary: #9CA3AF;
      --border: #374151;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    * {
      animation: none !important;
      transition: none !important;
    }
  }
</style>
```

---

## Validation Checklist

Run these checks on every generated SVG before delivering:

### Structure
- [ ] Root `<svg>` has `viewBox` attribute
- [ ] Root `<svg>` has `xmlns="http://www.w3.org/2000/svg"`
- [ ] No fixed `width` or `height` on root `<svg>`
- [ ] Contains `<title>` element
- [ ] Total file size < 50KB

### Animation
- [ ] Uses CSS `@keyframes` inside `<style>`
- [ ] No SMIL: no `<animate>`, `<animateTransform>`, `<animateMotion>`, `<set>`
- [ ] Total animation duration reasonable (< 5s for loops)
- [ ] Uses `animation-fill-mode: forwards` for one-shot animations

### Performance
- [ ] Prefers `transform` and `opacity` for animated properties
- [ ] No excessive blur filters (max `stdDeviation="4"`)
- [ ] Reasonable element count (< 100 elements)

### Brand
- [ ] Colors match Sixty design tokens (or user-specified override)
- [ ] Clean, modern, professional aesthetic
- [ ] Consistent stroke widths

### Accessibility
- [ ] `@media (prefers-reduced-motion: reduce)` stops all animation
- [ ] `@media (prefers-color-scheme: dark)` adjusts colors
- [ ] `<title>` provides meaningful description

### Security
- [ ] No `<script>` tags
- [ ] No `javascript:` URIs
- [ ] No external resource loads (`xlink:href` to external URLs)
- [ ] No `onclick` or other event handler attributes

---

## Example: Animated Checkmark Confirmation

**Prompt used:**
```
Generate a single, self-contained SVG animation of a checkmark appearing inside a circle,
representing a successful action confirmation.

The circle should scale up from 0 with a bounce, then the checkmark draws on with a stroke animation.
```

**Expected output characteristics:**
- Circle scales from 0 to 1 with `cubic-bezier(0.34, 1.56, 0.64, 1)` (overshoot)
- Checkmark uses `stroke-dasharray`/`stroke-dashoffset` for draw-on effect
- Total duration: ~1.5s
- Colors: Success green (`#059669`) circle, white checkmark
- `animation-fill-mode: forwards` on both animations
- Checkmark delayed 0.4s after circle

---

## Example: Package Delivery Animation

**Prompt used:**
```
Generate a single, self-contained SVG animation showing a cardboard box opening
and a checkmark floating up from inside it, representing order confirmation or delivery success.

Stage 1 (0-0.8s): Box slides up into view and settles
Stage 2 (0.8-1.5s): Box lid opens upward
Stage 3 (1.5-2.5s): Checkmark floats up from inside the box with a gentle glow

DESIGN SYSTEM COLORS:
- Box: #D97706 (amber/cardboard)
- Checkmark: #059669 (success green)
- Glow: #059669 at 20% opacity
- Background: transparent
```

**Expected output characteristics:**
- Box made of simple geometric shapes (rect + trapezoid lid)
- Lid rotates open using `transform-origin` set at hinge point
- Checkmark translates Y upward with opacity fade-in
- Glow uses radial gradient with animated opacity
- Sequenced with `animation-delay`

---

## Troubleshooting

### Gemini returns markdown fences
Re-prompt: "Output ONLY the raw SVG markup. Do not wrap in code fences or markdown."

### Gemini uses SMIL
Re-prompt: "Replace all SMIL animation (<animate>, <animateTransform>) with CSS @keyframes inside a <style> tag."

### SVG too large (>50KB)
- Ask Gemini to simplify: "Reduce the SVG complexity. Use fewer path points, simpler shapes, and no embedded images."
- Check for inline data URIs or embedded fonts

### Colors don't match
- Verify the design token hex values in the prompt
- Check that dark mode overrides are in a `@media (prefers-color-scheme: dark)` block

### Animation janky/not smooth
- Ensure animated properties are `transform` and `opacity` only
- Avoid animating `d` attribute (path morphing) — use `transform` instead
- Check for missing `will-change` hints on complex animations
