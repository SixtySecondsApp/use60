# Sixty Design Tokens

Design tokens, component patterns, and glassmorphism specs for the Sixty product (app.use60.com). Use these when building app UI (not landing pages).

For landing pages, use the aesthetics.md reference instead.

---

## Color Tokens

### Backgrounds

| Context | Light | Dark | Tailwind |
|---------|-------|------|----------|
| Page | `#FFFFFF` | `#030712` (gray-950) | `bg-white dark:bg-gray-950` |
| Card | `white` + shadow-sm | `gray-900/80` + blur | `bg-white dark:bg-gray-900/80 dark:backdrop-blur-sm` |
| Secondary | `#FCFCFC` | `gray-900` | `bg-[#FCFCFC] dark:bg-gray-900` |
| Tertiary | `gray-50` | `gray-800` | `bg-gray-50 dark:bg-gray-800` |
| Input | `white` | `gray-800/50` | `bg-white dark:bg-gray-800/50` |
| Hover | `gray-50` | `gray-800/30` | `hover:bg-gray-50 dark:hover:bg-gray-800/30` |

### Text

| Context | Light | Dark | Tailwind |
|---------|-------|------|----------|
| Primary | `gray-900` | `gray-100` | `text-gray-900 dark:text-gray-100` |
| Secondary | `gray-700` | `gray-300` | `text-gray-700 dark:text-gray-300` |
| Tertiary | `gray-500` | `gray-400` | `text-gray-500 dark:text-gray-400` |
| Muted | `gray-400` | `gray-500` | `text-gray-400 dark:text-gray-500` |

### Borders

| Context | Light | Dark | Tailwind |
|---------|-------|------|----------|
| Standard | `gray-200` | `gray-700/50` | `border-gray-200 dark:border-gray-700/50` |
| Subtle | `gray-100` | `gray-800/50` | `border-gray-100 dark:border-gray-800/50` |
| Emphasis | `gray-300` | `gray-600/50` | `border-gray-300 dark:border-gray-600/50` |

### Semantic Colors

| Color | Use | Light bg | Light text | Dark bg | Dark text |
|-------|-----|----------|-----------|---------|-----------|
| Blue | Primary/Action | `blue-50` | `blue-700` | `blue-500/10` | `blue-400` |
| Emerald | Success | `emerald-50` | `emerald-700` | `emerald-500/10` | `emerald-400` |
| Red | Error/Danger | `red-50` | `red-700` | `red-500/10` | `red-400` |
| Amber | Warning | `amber-50` | `amber-700` | `amber-500/10` | `amber-400` |
| Violet | Brand accent | `violet-50` | `violet-700` | `violet-500/10` | `violet-400` |

### Brand Colors

```
brand-violet: #8129D7
brand-blue:   #2A5EDB
brand-teal:   #03AD9C
```

---

## Typography

**App font**: Inter (all weights 300-700)
**Landing display**: See aesthetics.md for distinctive options

### Type Scale

| Element | Classes |
|---------|---------|
| Page title (H1) | `text-3xl font-semibold text-gray-900 dark:text-gray-100` |
| Section title (H2) | `text-2xl font-semibold text-gray-900 dark:text-gray-100` |
| Subsection (H3) | `text-xl font-semibold text-gray-900 dark:text-gray-100` |
| Card title (H4) | `text-lg font-semibold text-gray-900 dark:text-gray-100` |
| Label | `text-sm font-medium text-gray-700 dark:text-gray-300` |
| Body | `text-base text-gray-700 dark:text-gray-300` |
| Caption | `text-sm text-gray-500 dark:text-gray-400` |
| Tiny | `text-xs text-gray-500 dark:text-gray-400` |

---

## Component Patterns

### Card
```tsx
<div className="bg-white dark:bg-gray-900/80 dark:backdrop-blur-sm
  border border-gray-200 dark:border-gray-700/50
  rounded-xl p-6 shadow-sm dark:shadow-none">
  {children}
</div>
```

### Interactive Card
```tsx
<div className="bg-white dark:bg-gray-900/80 dark:backdrop-blur-sm
  border border-gray-200 dark:border-gray-700/50
  rounded-xl p-6 shadow-sm dark:shadow-none
  hover:shadow-md dark:hover:bg-gray-800/80
  transition-all duration-200 cursor-pointer">
  {children}
</div>
```

### Premium Glass Card (dark mode hero)
```tsx
<div className="relative overflow-hidden rounded-2xl"
  style={{
    background: 'rgba(20, 28, 36, 0.6)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 8px 32px rgba(0,0,0,0.3)',
  }}>
  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent" />
  <div className="relative p-8">{children}</div>
</div>
```

### Button Variants
```tsx
// Primary
"bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2.5 font-medium transition-colors"

// Secondary
"bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700
  text-gray-900 dark:text-gray-100 rounded-lg px-4 py-2.5 font-medium transition-colors"

// Ghost
"bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800/50
  text-gray-700 dark:text-gray-300 rounded-lg px-4 py-2.5 transition-colors"

// Outline
"bg-transparent border border-gray-300 dark:border-gray-600
  hover:bg-gray-50 dark:hover:bg-gray-800/50
  text-gray-700 dark:text-gray-300 rounded-lg px-4 py-2.5 font-medium transition-colors"
```

### Input
```tsx
"w-full bg-white dark:bg-gray-800/50
  border border-gray-300 dark:border-gray-700/50
  text-gray-900 dark:text-gray-100
  placeholder-gray-400 dark:placeholder-gray-500
  rounded-lg px-4 py-2.5
  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
  transition-all"
```

### Badge
```tsx
// Default
"inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
  bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"

// Status variants follow semantic colors:
// Blue:    bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300
// Green:   bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300
// Red:     bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300
// Yellow:  bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300
```

### Navigation
```tsx
// Sidebar item (default)
"flex items-center gap-3 px-3 py-2 rounded-lg
  text-gray-700 dark:text-gray-300
  hover:bg-gray-100 dark:hover:bg-gray-800/50
  transition-colors"

// Sidebar item (active)
"flex items-center gap-3 px-3 py-2 rounded-lg
  bg-blue-50 dark:bg-blue-500/10
  text-blue-600 dark:text-blue-400
  border border-blue-200 dark:border-blue-500/20"

// Tab (inactive)
"px-4 py-2 rounded-md text-gray-600 dark:text-gray-400
  hover:text-gray-900 dark:hover:text-gray-200"

// Tab (active)
"px-4 py-2 rounded-md bg-white dark:bg-gray-700
  text-gray-900 dark:text-gray-100 shadow-sm"
```

---

## Glassmorphism Rules

### DO:
- Use `backdrop-blur-sm` (4px) for standard cards and modals
- Use `backdrop-blur-xl` (24px) for premium surfaces only
- Combine blur with semi-transparent backgrounds: `bg-gray-900/80`
- Add inset highlight: `inset 0 1px 0 rgba(255,255,255,0.05)`
- Include webkit prefix: `-webkit-backdrop-filter`
- Use `shadow-none` in dark mode

### DON'T:
- Use backdrop blur without semi-transparent backgrounds
- Stack more than 2-3 glass layers
- Use heavy shadows with glass effects
- Apply glassmorphism in light mode (use shadows instead)
- Exceed `blur(24px)` for performance

### Glass Surface Opacity

| Context | Opacity | Class |
|---------|---------|-------|
| Card | 80% | `bg-gray-900/80` |
| Modal | 95% | `bg-gray-900/95` |
| Premium | 60% | custom rgba |
| Overlay | 40-80% | `bg-black/40` to `bg-black/80` |

---

## Spacing

| Context | Value | Tailwind |
|---------|-------|----------|
| Card padding | 24px | `p-6` |
| Button padding | 16px × 10px | `px-4 py-2.5` |
| Input padding | 16px × 10px | `px-4 py-2.5` |
| Modal padding | 24px | `p-6` |
| Gap (tight) | 8px | `gap-2` |
| Gap (default) | 16px | `gap-4` |
| Gap (loose) | 24px | `gap-6` |
| Section spacing | 24-64px | `py-6` to `py-16` |

---

## Shadows

### Light Mode
| Token | Usage |
|-------|-------|
| `shadow-sm` | Cards, buttons |
| `shadow` | Elevated elements |
| `shadow-md` | Hover states |
| `shadow-lg` | Popovers, dropdowns |

### Dark Mode
- Standard: `shadow-none` (glass replaces shadows)
- Premium glass: `0 8px 32px rgba(0,0,0,0.3)`
- Inset highlight: `inset 0 1px 0 rgba(255,255,255,0.05)`

---

## Transitions

| Context | Duration | Property |
|---------|----------|----------|
| Color changes | 200ms | `transition-colors` |
| All properties | 200ms | `transition-all` |
| Smooth entrance | 300ms | `transition-all duration-300 ease-in-out` |
| Theme transition | 300ms | `transition-[background-color,border-color,color]` |

---

## Layout Patterns

### Dashboard Shell
```tsx
<div className="min-h-screen bg-white dark:bg-gray-950">
  <aside className="fixed left-0 top-0 h-screen w-64
    bg-[#FCFCFC] dark:bg-gray-900
    border-r border-gray-200 dark:border-gray-800/50">
    {/* Nav */}
  </aside>
  <main className="ml-64 p-6">{children}</main>
</div>
```

### Stats Grid
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
  {/* Stat cards */}
</div>
```

### Responsive Container
```tsx
<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
  {children}
</div>
```

---

## Icons

- **ALWAYS** use `lucide-react`
- **NEVER** use emoji icons
- **NEVER** use the `Sparkles` icon (renders poorly) — use `Wand2`, `Stars`, or `Zap` instead
- Match stroke width to text weight context
- Standard icon size: `w-5 h-5` for inline, `w-4 h-4` for small, `w-6 h-6` for headers

---

## Sheets & Panels (Critical)

The app has a fixed top bar (`h-16` / 4rem). All `<SheetContent>` and side panels **MUST** include:

```tsx
className="!top-16 !h-[calc(100vh-4rem)]"
```

Without this, panels render behind the fixed top bar.

Dialogs/modals are unaffected (they center in the viewport).
