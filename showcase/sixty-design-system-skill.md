---
name: sixty-design-system
description: Sixty's production design system for enterprise SaaS applications. Use when building UI components, creating React/Next.js interfaces, styling dashboards, implementing light/dark themes, or applying Sixty's glassmorphic dark mode aesthetic. Triggers on frontend development, UI styling, component creation, theme implementation, and any Sixty product interface work.
requires-profile: true
---

# Sixty Design System

Production-ready design system with clean minimal light mode and premium glassmorphic dark mode. Built for Next.js/React with Tailwind CSS.

---

## Core Principles

**Light Mode**: Pure white backgrounds (#FFFFFF, #FCFCFC), high contrast text (gray-900/gray-700), clean borders (gray-200), minimal shadows.

**Dark Mode (Glassmorphism)**: Deep backgrounds (gray-950: #030712), glass cards with `bg-gray-900/80 backdrop-blur-sm`, subtle borders with opacity (`border-gray-700/50`), no shadows.

## Essential Patterns

### Theme-Aware Classes (Use These First)

```tsx
// Backgrounds
"bg-white dark:bg-gray-950"              // Page background
"bg-white dark:bg-gray-900/80 backdrop-blur-sm"  // Cards
"bg-[#FCFCFC] dark:bg-gray-900"          // Secondary surfaces

// Text
"text-gray-900 dark:text-gray-100"       // Primary
"text-gray-700 dark:text-gray-300"       // Secondary
"text-gray-500 dark:text-gray-400"       // Tertiary

// Borders
"border-gray-200 dark:border-gray-700/50"  // Standard
"border-gray-300 dark:border-gray-800/50"  // Emphasized

// Interactive states
"hover:bg-gray-50 dark:hover:bg-gray-800/30"
```

### Card Pattern

```tsx
// Standard card
<div className="bg-white dark:bg-gray-900/80 dark:backdrop-blur-sm
                border border-gray-200 dark:border-gray-700/50
                rounded-xl p-6 shadow-sm dark:shadow-none">
  {children}
</div>
```

### Button Variants

```tsx
// Primary (blue)
"bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2.5 font-medium transition-colors"

// Secondary
"bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700
 text-gray-900 dark:text-gray-100 rounded-lg px-4 py-2.5 font-medium"

// Ghost
"bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800/50
 text-gray-700 dark:text-gray-300 rounded-lg px-4 py-2.5"
```

### Input Fields

```tsx
"bg-white dark:bg-gray-800/50
 border border-gray-300 dark:border-gray-700/50
 text-gray-900 dark:text-gray-100
 rounded-lg px-4 py-2.5
 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
```

## Setup Requirements

### Dependencies

```bash
npm install tailwindcss class-variance-authority clsx tailwind-merge
```

### tailwind.config.js

```js
module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
}
```

### Utility Function (lib/utils.ts)

```typescript
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

## Quick Reference

| Element | Light | Dark |
|---------|-------|------|
| Page BG | `#FFFFFF` | `gray-950` (#030712) |
| Card BG | `white` + `shadow-sm` | `gray-900/80` + `backdrop-blur-sm` |
| Border | `gray-200` | `gray-700/50` |
| Text Primary | `gray-900` | `gray-100` |
| Text Secondary | `gray-700` | `gray-300` |
| Shadow | `shadow-sm` / `shadow-md` | `shadow-none` |

## Glassmorphism Rules

**DO:**
- Use `backdrop-blur-sm` (4px) for cards/modals, `backdrop-blur-xl` (24px) for premium surfaces
- Combine blur with semi-transparent backgrounds: `bg-gray-900/80`
- Add inset highlights: `inset 0 1px 0 rgba(255,255,255,0.05)`
- Include webkit prefix: `-webkit-backdrop-filter`
- Use `shadow-none` in dark mode

**DON'T:**
- Use backdrop blur without semi-transparent backgrounds
- Stack more than 2-3 glass layers
- Use heavy shadows with glass effects
- Apply glassmorphism in light mode
- Exceed `blur(24px)` for performance

## Icons (Lucide React)

**DO:**
- Use `lucide-react` for all icons
- Match icon stroke width to text weight context
- Use semantic icon names that match their purpose

**DON'T:**
- Use `Sparkles` icon from Lucide - it renders poorly and doesn't match our aesthetic. Use alternatives like `Wand2`, `Stars`, or `Zap` instead

---
---

# Component Reference

Complete component specifications for the Sixty Design System.

## Button System

### Primary Buttons

```tsx
// Blue Primary
"bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2.5 font-medium transition-colors"

// Green/Success Primary
"bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2.5 font-medium transition-colors"

// Destructive
"bg-red-600 hover:bg-red-700 text-white rounded-lg px-4 py-2.5 font-medium transition-colors"
```

### Secondary Buttons

```tsx
"bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700
 text-gray-900 dark:text-gray-100 rounded-lg px-4 py-2.5 font-medium transition-colors"
```

### Ghost Buttons

```tsx
"bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800/50
 text-gray-700 dark:text-gray-300 rounded-lg px-4 py-2.5 transition-colors"
```

### Outline Buttons

```tsx
"bg-transparent border border-gray-300 dark:border-gray-600
 hover:bg-gray-50 dark:hover:bg-gray-800/50
 text-gray-700 dark:text-gray-300 rounded-lg px-4 py-2.5 font-medium transition-colors"
```

### Button Sizes

| Size | Classes |
|------|---------|
| Small | `px-3 py-1.5 text-sm` |
| Medium | `px-4 py-2.5 text-sm` |
| Large | `px-6 py-3 text-base` |

## Cards

### Standard Card

```tsx
<div className="bg-white dark:bg-gray-900/80 dark:backdrop-blur-sm
                border border-gray-200 dark:border-gray-700/50
                rounded-xl p-6 shadow-sm dark:shadow-none">
  {children}
</div>
```

### Interactive Card (Hover)

```tsx
<div className="bg-white dark:bg-gray-900/80 dark:backdrop-blur-sm
                border border-gray-200 dark:border-gray-700/50
                rounded-xl p-6 shadow-sm dark:shadow-none
                hover:shadow-md dark:hover:bg-gray-800/80
                transition-all duration-200 cursor-pointer">
  {children}
</div>
```

### Premium Glassmorphic Card (Dark Mode Hero)

```tsx
<div className="relative overflow-hidden rounded-2xl"
     style={{
       background: 'rgba(20, 28, 36, 0.6)',
       backdropFilter: 'blur(16px)',
       WebkitBackdropFilter: 'blur(16px)',
       boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 8px 32px rgba(0,0,0,0.3)',
     }}>
  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent" />
  <div className="relative p-8">
    {children}
  </div>
</div>
```

### Dashboard Stats Card

```tsx
<div className="bg-white dark:bg-gray-900/40 dark:backdrop-blur-xl
                border border-gray-200 dark:border-gray-700/30
                rounded-xl overflow-hidden">
  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5" />
  <div className="relative p-6">
    <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
    <p className="text-3xl font-semibold text-gray-900 dark:text-white mt-1">{value}</p>
  </div>
</div>
```

## Modal / Dialog

### Overlay

```tsx
"fixed inset-0 z-50 bg-gray-900/40 dark:bg-black/80 backdrop-blur-sm"
```

### Modal Content

```tsx
"bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm
 border border-gray-200 dark:border-gray-700/50
 rounded-xl p-6 shadow-lg dark:shadow-none
 max-w-md w-full mx-4"
```

### Modal Header

```tsx
<div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-700/50">
  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
  <button className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
    <X className="w-5 h-5" />
  </button>
</div>
```

## Popover / Dropdown

```tsx
"bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm
 border border-gray-200 dark:border-gray-700/50
 rounded-md p-2 shadow-lg dark:shadow-none
 min-w-[200px]"
```

### Dropdown Item

```tsx
"px-3 py-2 rounded-md text-gray-700 dark:text-gray-300
 hover:bg-gray-100 dark:hover:bg-gray-800/50
 cursor-pointer transition-colors"
```

## Form Elements

### Input Field

```tsx
<input className="w-full bg-white dark:bg-gray-800/50
                  border border-gray-300 dark:border-gray-700/50
                  text-gray-900 dark:text-gray-100
                  placeholder-gray-400 dark:placeholder-gray-500
                  rounded-lg px-4 py-2.5
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                  transition-all" />
```

### Select

```tsx
<select className="w-full bg-white dark:bg-gray-800/50
                   border border-gray-300 dark:border-gray-700/50
                   text-gray-900 dark:text-gray-100
                   rounded-lg px-4 py-2.5
                   focus:outline-none focus:ring-2 focus:ring-blue-500">
  <option>Option 1</option>
</select>
```

### Textarea

```tsx
<textarea className="w-full bg-white dark:bg-gray-800/50
                     border border-gray-300 dark:border-gray-700/50
                     text-gray-900 dark:text-gray-100
                     rounded-lg px-4 py-3 min-h-[120px]
                     focus:outline-none focus:ring-2 focus:ring-blue-500" />
```

### Checkbox

```tsx
<label className="flex items-center gap-3 cursor-pointer">
  <input type="checkbox"
         className="w-4 h-4 rounded border-gray-300 dark:border-gray-600
                    text-blue-600 focus:ring-blue-500
                    bg-white dark:bg-gray-800" />
  <span className="text-gray-700 dark:text-gray-300">Label</span>
</label>
```

## Navigation

### Sidebar Nav Item

```tsx
// Default state
"flex items-center gap-3 px-3 py-2 rounded-lg
 text-gray-700 dark:text-gray-300
 hover:bg-gray-100 dark:hover:bg-gray-800/50
 transition-colors"

// Active state
"flex items-center gap-3 px-3 py-2 rounded-lg
 bg-blue-50 dark:bg-blue-500/10
 text-blue-600 dark:text-blue-400
 border border-blue-200 dark:border-blue-500/20"
```

### Tab Navigation

```tsx
// Tab container
"flex gap-1 p-1 bg-gray-100 dark:bg-gray-800/50 rounded-lg"

// Tab (inactive)
"px-4 py-2 rounded-md text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"

// Tab (active)
"px-4 py-2 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
```

## Table

```tsx
<table className="w-full">
  <thead>
    <tr className="border-b border-gray-200 dark:border-gray-700/50">
      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
        Header
      </th>
    </tr>
  </thead>
  <tbody>
    <tr className="border-b border-gray-100 dark:border-gray-800/50
                   hover:bg-gray-50 dark:hover:bg-gray-800/30">
      <td className="py-3 px-4 text-gray-900 dark:text-gray-100">
        Cell
      </td>
    </tr>
  </tbody>
</table>
```

## Badges / Tags

```tsx
// Default
"inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"

// Blue
"bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300"

// Green
"bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"

// Red
"bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300"

// Yellow
"bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300"
```

## Toast / Notification

```tsx
"bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm
 border border-gray-200 dark:border-gray-700/50
 rounded-lg p-4 shadow-lg dark:shadow-none
 flex items-start gap-3"
```

## Skeleton Loaders

```tsx
// Container
"bg-white dark:bg-gray-900/80 border border-gray-200 dark:border-gray-700/50 rounded-xl p-6"

// Skeleton element
"bg-gray-200 dark:bg-gray-800 rounded animate-pulse"

// Text line skeleton
<div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-3/4 animate-pulse" />

// Avatar skeleton
<div className="w-10 h-10 bg-gray-200 dark:bg-gray-800 rounded-full animate-pulse" />
```

## Theme Toggle Component

```tsx
'use client'

import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem('theme') as 'light' | 'dark' | null
    const system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    const initial = saved || system
    setTheme(initial)
    document.documentElement.setAttribute('data-theme', initial)
  }, [])

  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('theme', next)
  }

  if (!mounted) return <div className="w-10 h-10" />

  return (
    <button
      onClick={toggle}
      className="inline-flex items-center justify-center rounded-lg w-10 h-10
                 text-gray-700 dark:text-gray-300
                 hover:bg-gray-100 dark:hover:bg-gray-800/30
                 transition-colors"
      aria-label="Toggle theme"
    >
      {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
    </button>
  )
}
```

---
---

# Design Tokens Reference

Complete color, typography, and spacing specifications.

## Color Tokens

### Background Colors

| Token | Light Mode | Dark Mode | Usage |
|-------|-----------|-----------|-------|
| `bg-primary` | `#FFFFFF` | `#030712` (gray-950) | Page background |
| `bg-secondary` | `#FCFCFC` | `#111827` (gray-900) | Secondary surfaces |
| `bg-tertiary` | `#F9FAFB` (gray-50) | `#1F2937` (gray-800) | Tertiary surfaces |
| `bg-card` | `white` | `gray-900/80` + blur | Card backgrounds |
| `bg-elevated` | `white` | `gray-800` | Elevated surfaces |

### Text Colors

| Token | Light Mode | Dark Mode | Usage |
|-------|-----------|-----------|-------|
| `text-primary` | `#111827` (gray-900) | `#F3F4F6` (gray-100) | Primary text |
| `text-secondary` | `#374151` (gray-700) | `#D1D5DB` (gray-300) | Secondary text |
| `text-tertiary` | `#6B7280` (gray-500) | `#9CA3AF` (gray-400) | Tertiary text |
| `text-muted` | `#9CA3AF` (gray-400) | `#6B7280` (gray-500) | Muted/disabled |

### Border Colors

| Token | Light Mode | Dark Mode | Usage |
|-------|-----------|-----------|-------|
| `border-default` | `#E5E7EB` (gray-200) | `gray-700/50` | Standard borders |
| `border-subtle` | `#F3F4F6` (gray-100) | `gray-800/50` | Subtle dividers |
| `border-emphasis` | `#D1D5DB` (gray-300) | `gray-600/50` | Emphasized borders |

### Semantic Colors

| Color | Base | Light Variant | Dark Variant |
|-------|------|--------------|--------------|
| Blue (Primary) | `blue-600` | `blue-50` bg, `blue-700` text | `blue-500/10` bg, `blue-400` text |
| Green (Success) | `emerald-600` | `emerald-50` bg, `emerald-700` text | `emerald-500/10` bg, `emerald-400` text |
| Red (Error) | `red-600` | `red-50` bg, `red-700` text | `red-500/10` bg, `red-400` text |
| Yellow (Warning) | `amber-600` | `amber-50` bg, `amber-700` text | `amber-500/10` bg, `amber-400` text |
| Purple | `purple-600` | `purple-50` bg, `purple-700` text | `purple-500/10` bg, `purple-400` text |

### State Colors

```tsx
// Hover backgrounds
"hover:bg-gray-50 dark:hover:bg-gray-800/30"

// Active/Selected
"bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20"

// Focus ring
"focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"

// Disabled
"opacity-50 cursor-not-allowed"
```

## Typography

### Font Stack

```css
font-family: 'Inter', system-ui, -apple-system, sans-serif;
```

### Font Weights

| Weight | Value | Usage |
|--------|-------|-------|
| Light | 300 | Decorative text |
| Regular | 400 | Body text |
| Medium | 500 | Emphasis, labels |
| Semibold | 600 | Headings, buttons |
| Bold | 700 | Strong emphasis |

### Type Scale

| Name | Size | Line Height | Usage |
|------|------|-------------|-------|
| `text-xs` | 12px | 16px | Captions, badges |
| `text-sm` | 14px | 20px | Secondary text, labels |
| `text-base` | 16px | 24px | Body text |
| `text-lg` | 18px | 28px | Large body |
| `text-xl` | 20px | 28px | H4 headings |
| `text-2xl` | 24px | 32px | H3 headings |
| `text-3xl` | 30px | 36px | H2 headings |
| `text-4xl` | 36px | 40px | H1 headings |
| `text-5xl` | 48px | 1 | Display headings |

### Heading Styles

```tsx
// H1 - Page title
"text-3xl font-semibold text-gray-900 dark:text-gray-100"

// H2 - Section title
"text-2xl font-semibold text-gray-900 dark:text-gray-100"

// H3 - Subsection
"text-xl font-semibold text-gray-900 dark:text-gray-100"

// H4 - Card title
"text-lg font-semibold text-gray-900 dark:text-gray-100"

// Label
"text-sm font-medium text-gray-700 dark:text-gray-300"

// Body
"text-base text-gray-700 dark:text-gray-300"

// Small/Caption
"text-sm text-gray-500 dark:text-gray-400"
```

## Spacing

### Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | 4px | Tight gaps |
| `space-2` | 8px | Compact spacing |
| `space-3` | 12px | Default gap |
| `space-4` | 16px | Standard padding |
| `space-6` | 24px | Card padding |
| `space-8` | 32px | Section spacing |
| `space-12` | 48px | Major sections |
| `space-16` | 64px | Page sections |

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `rounded` | 4px | Small elements |
| `rounded-md` | 6px | Buttons, badges |
| `rounded-lg` | 8px | Inputs, dropdowns |
| `rounded-xl` | 12px | Cards, modals |
| `rounded-2xl` | 16px | Hero cards |
| `rounded-full` | 9999px | Avatars, pills |

## Shadow System

### Light Mode Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Cards, buttons |
| `shadow` | `0 1px 3px rgba(0,0,0,0.1)` | Elevated elements |
| `shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Hover states |
| `shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Popovers, dropdowns |

### Dark Mode Shadows

```tsx
// Standard: No shadows (glass effect instead)
"shadow-none"

// Premium glassmorphism
"0 8px 32px rgba(0,0,0,0.3)"

// Inset highlight for glass edges
"inset 0 1px 0 rgba(255,255,255,0.05)"
```

## Glassmorphism Tokens

### Backdrop Blur Levels

| Level | CSS | Tailwind | Usage |
|-------|-----|----------|-------|
| Standard | `blur(4px)` | `backdrop-blur-sm` | Cards, dialogs |
| Enhanced | `blur(24px)` | `backdrop-blur-xl` | Premium cards |
| Strong | `blur(16px)` | Custom | Glass surfaces |

### Glass Surface Opacity

| Context | Opacity | Tailwind |
|---------|---------|----------|
| Card | 80% | `bg-gray-900/80` |
| Modal | 95% | `bg-gray-900/95` |
| Premium | 60% | `rgba(20, 28, 36, 0.6)` |

## Z-Index Scale

| Token | Value | Usage |
|-------|-------|-------|
| `z-0` | 0 | Base layer |
| `z-10` | 10 | Elevated elements |
| `z-20` | 20 | Dropdowns |
| `z-30` | 30 | Fixed headers |
| `z-40` | 40 | Overlays |
| `z-50` | 50 | Modals, dialogs |
| `z-[100]` | 100 | Toasts |

## Responsive Breakpoints

| Breakpoint | Min Width | Usage |
|------------|-----------|-------|
| `sm` | 640px | Large phones |
| `md` | 768px | Tablets |
| `lg` | 1024px | Small laptops |
| `xl` | 1280px | Desktops |
| `2xl` | 1536px | Large screens |

---
---

# Layout Patterns Reference

Dashboard layouts, responsive grids, animations, and advanced patterns.

## Dashboard Layouts

### Standard Dashboard Shell

```tsx
<div className="min-h-screen bg-white dark:bg-gray-950">
  <aside className="fixed left-0 top-0 h-screen w-64
                    bg-[#FCFCFC] dark:bg-gray-900
                    border-r border-gray-200 dark:border-gray-800/50">
    {/* Nav content */}
  </aside>
  <main className="ml-64 p-6">
    {children}
  </main>
</div>
```

### Header with Actions

```tsx
<header className="flex items-center justify-between mb-6">
  <div>
    <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Page Title</h1>
    <p className="text-gray-500 dark:text-gray-400 mt-1">Page description</p>
  </div>
  <div className="flex items-center gap-3">
    {/* Action buttons */}
  </div>
</header>
```

### Stats Grid

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
  {stats.map(stat => (
    <div className="bg-white dark:bg-gray-900/80 dark:backdrop-blur-sm
                    border border-gray-200 dark:border-gray-700/50
                    rounded-xl p-6">
      <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
      <p className="text-3xl font-semibold text-gray-900 dark:text-white mt-1">{stat.value}</p>
    </div>
  ))}
</div>
```

### Two-Column Content

```tsx
<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
  <div className="lg:col-span-2 space-y-6">{/* Primary content */}</div>
  <div className="space-y-6">{/* Sidebar */}</div>
</div>
```

## Responsive Patterns

### Container

```tsx
<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">{children}</div>
```

### Responsive Grid

```tsx
// 1 → 2 → 3 → 4 columns
"grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"

// Sidebar layout (stacked on mobile)
"grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6"
```

## Advanced Card Patterns

### Card with Gradient Accent

```tsx
<div className="relative overflow-hidden bg-white dark:bg-gray-900/80
                dark:backdrop-blur-sm rounded-xl border
                border-gray-200 dark:border-gray-700/50">
  <div className="absolute top-0 left-0 right-0 h-1
                  bg-gradient-to-r from-blue-500 to-purple-500" />
  <div className="p-6">{children}</div>
</div>
```

### Card with Icon Header

```tsx
<div className="bg-white dark:bg-gray-900/80 dark:backdrop-blur-sm
                rounded-xl border border-gray-200 dark:border-gray-700/50 p-6">
  <div className="flex items-center gap-3 mb-4">
    <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-500/20
                    flex items-center justify-center">
      <Icon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
    </div>
    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
  </div>
  {children}
</div>
```

### Selected/Active Card

```tsx
// Not selected
"bg-white dark:bg-gray-900/80 border border-gray-200 dark:border-gray-700/50"

// Selected
"bg-emerald-50 dark:bg-emerald-500/5 border-2 border-emerald-500 dark:border-emerald-500/50"
```

## Empty States

```tsx
<div className="flex flex-col items-center justify-center py-12 text-center">
  <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800
                  flex items-center justify-center mb-4">
    <Icon className="w-8 h-8 text-gray-400 dark:text-gray-500" />
  </div>
  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">No items found</h3>
  <p className="text-gray-500 dark:text-gray-400 mb-4 max-w-sm">
    Get started by creating your first item.
  </p>
  <button className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2.5">
    Create Item
  </button>
</div>
```

## CSS Custom Properties (Global CSS)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

:root {
  color-scheme: light dark;
}

/* Theme backgrounds */
[data-theme="light"] { background-color: #ffffff; }
[data-theme="dark"] { background-color: #030712; }

/* Typography defaults */
body { @apply font-sans antialiased; }

/* Custom scrollbar for dark mode */
[data-theme="dark"] ::-webkit-scrollbar { width: 8px; }
[data-theme="dark"] ::-webkit-scrollbar-track { @apply bg-gray-900; }
[data-theme="dark"] ::-webkit-scrollbar-thumb { @apply bg-gray-700 rounded-full; }
[data-theme="dark"] ::-webkit-scrollbar-thumb:hover { @apply bg-gray-600; }
```

## Accessibility Guidelines

### Focus States

```tsx
"focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
 dark:focus:ring-offset-gray-900"
```

### Contrast Requirements
- Text on backgrounds must meet WCAG AA (4.5:1 minimum)
- Large text (18px+) requires 3:1 minimum
- Interactive elements need visible borders even with glass effects

### Reduced Motion

```tsx
"motion-reduce:transition-none motion-reduce:animate-none"
```

### Screen Reader Only

```tsx
"sr-only" // Visually hidden but accessible
```

## Sheets & Panels (Critical)

The app has a fixed top bar (`h-16` / 4rem). All `<SheetContent>` and side panels **MUST** include:

```tsx
className="!top-16 !h-[calc(100vh-4rem)]"
```

Without this, panels render behind the fixed top bar. Dialogs/modals are unaffected.
