# Aesthetics Reference

Typography, color, spatial composition, and anti-convergence guidance.

---

## Typography

Typography is the single highest-leverage design decision. The right font choice instantly signals quality.

### Font Recommendations by Aesthetic

**Premium SaaS / Dev Tools** (Linear, Vercel, Resend):
- Display: **Clash Display**, **Cabinet Grotesk**, **Satoshi**, **General Sans**
- Body: **Inter**, **IBM Plex Sans**, **Source Sans 3**
- Mono: **JetBrains Mono**, **Fira Code**, **IBM Plex Mono**

**Editorial / Magazine** (blogs, content sites):
- Display: **Playfair Display**, **Crimson Pro**, **Fraunces**, **Newsreader**
- Body: **Merriweather**, **Source Serif 4**, **Lora**

**Bold / Experimental** (awwwards-style):
- Display: **Bricolage Grotesque**, **Obviously**, **Space Grotesk** (only if paired unusually)
- Body: **Outfit**, **Sora**, **DM Sans**

**Startup / Friendly**:
- Display: **Cal Sans**, **Gilroy** (non-Google), **Plus Jakarta Sans**
- Body: **Nunito Sans**, **Rubik**, **Wix Madefor Text**

**Sixty App UI** (existing system):
- All text: **Inter** (the established app font — acceptable for app UI only)
- Landing pages: Use a distinctive display font from above

### BANNED Fonts (for landing pages / marketing)
- Inter (as display font)
- Roboto
- Arial
- Open Sans
- Lato
- System default fonts
- Space Grotesk (Claude's convergence default — avoid unless deliberately paired)

### Typography Rules

**Weight contrast**: Use extremes. `font-extralight` (200) vs `font-extrabold` (800), not `font-normal` (400) vs `font-semibold` (600).

**Size jumps**: 3x minimum between heading and body. `text-6xl` heading with `text-base` body, not `text-2xl` with `text-lg`.

**Tracking**: Tight on large text (`tracking-tight` or `tracking-tighter` on `text-3xl`+), normal or loose on small text.

**Line height**: Tight on headings (`leading-tight` or `leading-none`), relaxed on body (`leading-relaxed`).

**Utility classes**:
- `text-balance` on all headings (prevents orphaned last words)
- `text-pretty` on body paragraphs (better line breaks)
- `tabular-nums` on numbers and data
- `font-feature-settings: 'ss01'` for stylistic alternates when available

### Loading Fonts

Always load from Google Fonts with `display=swap`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Clash+Display:wght@200;400;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
```

Tailwind config:
```js
fontFamily: {
  display: ['Clash Display', 'sans-serif'],
  sans: ['Inter', 'system-ui', 'sans-serif'],
  mono: ['JetBrains Mono', 'monospace'],
}
```

---

## Color Palettes

### The "Linear Dark" Palette (most requested)
```
Background:  zinc-950 (#09090b)
Surface:     white/5 with backdrop-blur
Border:      white/10
Text primary: white
Text secondary: zinc-400
Accent 1:    violet-500 (#8b5cf6)
Accent 2:    cyan-400 (#22d3ee)
CTA:         white bg, black text
```

### The "Vercel Mono" Palette
```
Background:  black (#000000)
Surface:     zinc-900/80
Border:      zinc-800
Text primary: white
Text secondary: zinc-400
Accent:      white (yes, white as accent on black)
CTA:         white bg, black text / gradient border
```

### The "Stripe Warm" Palette
```
Background:  slate-950 (#020617)
Surface:     slate-900/60
Border:      slate-700/30
Text primary: white
Text secondary: slate-300
Accent 1:    indigo-400 (#818cf8)
Accent 2:    emerald-400 (#34d399)
Accent 3:    amber-400 (#fbbf24)
CTA:         indigo-500 bg, white text
```

### The "Sixty Product" Palette (for app UI)
```
Light:
  Background:  white (#FFFFFF)
  Surface:     white + shadow-sm
  Border:      gray-200
  Text primary: gray-900
  Text secondary: gray-700
  Accent:      blue-600

Dark:
  Background:  gray-950 (#030712)
  Surface:     gray-900/80 + backdrop-blur-sm
  Border:      gray-700/50
  Text primary: gray-100
  Text secondary: gray-300
  Accent:      blue-500
```

### Color Rules

1. **One dominant, one accent** — not 5 equally-weighted colors
2. **Dark mode gradients**: use radial gradients with accent color at 10-20% opacity for atmosphere
3. **Never** evenly distribute colors — one should dominate 80%+
4. **Semantic colors** stay consistent: emerald=success, red=error, amber=warning
5. **Glass borders**: `border-white/10` in dark mode, never solid gray borders on glass surfaces

---

## Spatial Composition

### Break the Grid

Generic AI output creates perfectly symmetrical layouts. Premium design breaks this:

**Asymmetric hero**: Title left-aligned at 60% width, image/graphic right at 40%, overlapping
```tsx
<div className="grid grid-cols-1 lg:grid-cols-5 gap-0 items-center">
  <div className="lg:col-span-3 pr-0 lg:pr-12">{/* Title + CTA */}</div>
  <div className="lg:col-span-2 lg:-ml-12">{/* Visual, overlapping */}</div>
</div>
```

**Bento grid** (varied card sizes):
```tsx
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
  <div className="md:col-span-2 md:row-span-2">{/* Large feature */}</div>
  <div>{/* Small feature */}</div>
  <div>{/* Small feature */}</div>
  <div className="md:col-span-3">{/* Full-width feature */}</div>
</div>
```

**Offset sections**: Alternate padding sides
```tsx
<section className="pl-8 pr-4 md:pl-24 md:pr-12">{/* Left-heavy */}</section>
<section className="pl-4 pr-8 md:pl-12 md:pr-24">{/* Right-heavy */}</section>
```

### Negative Space

- Hero sections: generous vertical padding (`py-24 md:py-32 lg:py-40`)
- Between sections: `py-16 md:py-24` minimum
- Max width for text: `max-w-2xl` for readability (never full-width body text)
- Let content breathe — white space is not wasted space

### Depth & Layering

Create visual depth without 3D:

1. **Background layer**: Radial glow, grid pattern, noise texture
2. **Content layer**: Cards, text, images
3. **Accent layer**: Floating badges, gradient borders, spotlight effects
4. **Foreground layer**: Cursor effects, tooltip overlays (Tier 3 only)

```tsx
<section className="relative overflow-hidden">
  {/* Background: radial glow */}
  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/3
    w-[800px] h-[600px] rounded-full
    bg-[radial-gradient(ellipse,rgba(139,92,246,0.15),transparent_70%)]
    blur-3xl pointer-events-none" />

  {/* Background: grid pattern */}
  <div className="absolute inset-0
    bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)]
    bg-[size:64px_64px]" />

  {/* Content */}
  <div className="relative z-10 max-w-6xl mx-auto px-4">
    {children}
  </div>
</section>
```

### Gradient Text

The signature move of premium dark SaaS sites:

```tsx
// Top-to-bottom fade (most common — Linear/Vercel style)
<h1 className="text-5xl md:text-7xl font-bold tracking-tight
  bg-clip-text text-transparent
  bg-gradient-to-b from-white via-white to-zinc-500">
  Build something amazing
</h1>

// Left-to-right accent gradient
<span className="bg-clip-text text-transparent
  bg-gradient-to-r from-violet-400 to-cyan-400">
  highlighted text
</span>
```

---

## Atmosphere Effects

### Noise Texture Overlay (adds tactile quality)
```tsx
// As a CSS class — apply to section wrappers
<div className="relative">
  {children}
  <div className="absolute inset-0 pointer-events-none opacity-[0.03]
    [background-image:url('data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%20256%20256%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cfilter%20id%3D%22n%22%3E%3CfeTurbulence%20type%3D%22fractalNoise%22%20baseFrequency%3D%220.9%22%20numOctaves%3D%224%22%20stitchTiles%3D%22stitch%22%2F%3E%3C%2Ffilter%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20filter%3D%22url(%23n)%22%2F%3E%3C%2Fsvg%3E')]
    mix-blend-mode-overlay" />
</div>
```

### Dot Grid Background
```tsx
<div className="absolute inset-0
  bg-[radial-gradient(circle,rgba(255,255,255,0.06)_1px,transparent_1px)]
  bg-[size:24px_24px]" />
```

### Radial Glow (hero atmosphere)
```tsx
<div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2
  h-[600px] w-[600px] rounded-full opacity-20
  bg-[radial-gradient(ellipse,rgba(124,58,237,0.5),transparent_70%)]
  blur-3xl pointer-events-none" />
```

### Animated Gradient Border
```tsx
<div className="relative rounded-xl p-px
  bg-gradient-to-r from-violet-500 via-cyan-500 to-violet-500
  bg-[length:200%_auto] animate-gradient">
  <div className="rounded-[11px] bg-zinc-950 p-6">{children}</div>
</div>
```

Tailwind config addition:
```js
keyframes: { gradient: { "0%,100%": { backgroundPosition: "0% center" }, "50%": { backgroundPosition: "200% center" } } }
animation: { gradient: "gradient 3s linear infinite" }
```
