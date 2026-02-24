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
| `space-0` | 0 | No spacing |
| `space-1` | 4px | Tight gaps |
| `space-2` | 8px | Compact spacing |
| `space-3` | 12px | Default gap |
| `space-4` | 16px | Standard padding |
| `space-5` | 20px | Medium spacing |
| `space-6` | 24px | Card padding |
| `space-8` | 32px | Section spacing |
| `space-10` | 40px | Large gaps |
| `space-12` | 48px | Major sections |
| `space-16` | 64px | Page sections |

### Component Spacing

```tsx
// Card padding
"p-6" // 24px

// Button padding
"px-4 py-2.5" // 16px horizontal, 10px vertical

// Input padding
"px-4 py-2.5" // 16px horizontal, 10px vertical

// Modal padding
"p-6" // 24px

// Gap between elements
"gap-4" // 16px default
"gap-2" // 8px tight
"gap-6" // 24px loose
```

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

## Transition Tokens

```tsx
// Default transition
"transition-colors duration-200"

// All properties
"transition-all duration-200"

// Smooth entrance
"transition-all duration-300 ease-in-out"

// Theme transition
"transition-[background-color,border-color,color] duration-300"
```

## Responsive Breakpoints

| Breakpoint | Min Width | Usage |
|------------|-----------|-------|
| `sm` | 640px | Large phones |
| `md` | 768px | Tablets |
| `lg` | 1024px | Small laptops |
| `xl` | 1280px | Desktops |
| `2xl` | 1536px | Large screens |
