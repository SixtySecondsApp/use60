# Layout Patterns Reference

Dashboard layouts, responsive grids, animations, and advanced patterns.

## Dashboard Layouts

### Standard Dashboard Shell

```tsx
<div className="min-h-screen bg-white dark:bg-gray-950">
  {/* Sidebar */}
  <aside className="fixed left-0 top-0 h-screen w-64 
                    bg-[#FCFCFC] dark:bg-gray-900 
                    border-r border-gray-200 dark:border-gray-800/50">
    {/* Nav content */}
  </aside>
  
  {/* Main content */}
  <main className="ml-64 p-6">
    {children}
  </main>
</div>
```

### Header with Actions

```tsx
<header className="flex items-center justify-between mb-6">
  <div>
    <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
      Page Title
    </h1>
    <p className="text-gray-500 dark:text-gray-400 mt-1">
      Page description
    </p>
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
      <p className="text-3xl font-semibold text-gray-900 dark:text-white mt-1">
        {stat.value}
      </p>
    </div>
  ))}
</div>
```

### Two-Column Content

```tsx
<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
  {/* Main content - 2 columns */}
  <div className="lg:col-span-2 space-y-6">
    {/* Primary content cards */}
  </div>
  
  {/* Sidebar - 1 column */}
  <div className="space-y-6">
    {/* Secondary content cards */}
  </div>
</div>
```

## Responsive Patterns

### Container

```tsx
<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
  {children}
</div>
```

### Responsive Grid

```tsx
// 1 → 2 → 3 → 4 columns
"grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"

// 1 → 2 → 3 columns
"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"

// Sidebar layout (stacked on mobile)
"grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6"
```

### Responsive Text

```tsx
// Responsive heading
"text-2xl sm:text-3xl lg:text-4xl font-semibold"

// Hide on mobile
"hidden sm:block"

// Show only on mobile
"sm:hidden"
```

### Responsive Spacing

```tsx
// Responsive padding
"p-4 sm:p-6 lg:p-8"

// Responsive gaps
"gap-4 sm:gap-6 lg:gap-8"
```

## Animation Patterns

### Shimmer Loading

```css
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.shimmer {
  animation: shimmer 2s linear infinite;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.3) 50%,
    transparent 100%
  );
  background-size: 200% 100%;
}
```

### Tailwind Shimmer

```tsx
<div className="relative overflow-hidden bg-gray-200 dark:bg-gray-800 rounded">
  <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite]
                  bg-gradient-to-r from-transparent via-white/30 to-transparent" />
</div>
```

### Fade In

```tsx
// Add to tailwind.config.js
keyframes: {
  fadeIn: {
    '0%': { opacity: '0', transform: 'translateY(10px)' },
    '100%': { opacity: '1', transform: 'translateY(0)' },
  },
},
animation: {
  'fade-in': 'fadeIn 0.3s ease-out',
}

// Usage
"animate-fade-in"
```

### Scale on Hover

```tsx
"transform hover:scale-[1.02] transition-transform duration-200"
```

### Pulse (Loading)

```tsx
"animate-pulse"
```

## Advanced Card Patterns

### Card with Gradient Accent

```tsx
<div className="relative overflow-hidden bg-white dark:bg-gray-900/80 
                dark:backdrop-blur-sm rounded-xl border 
                border-gray-200 dark:border-gray-700/50">
  {/* Gradient accent */}
  <div className="absolute top-0 left-0 right-0 h-1 
                  bg-gradient-to-r from-blue-500 to-purple-500" />
  <div className="p-6">
    {children}
  </div>
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

## List Patterns

### Stacked List with Dividers

```tsx
<div className="bg-white dark:bg-gray-900/80 dark:backdrop-blur-sm 
                rounded-xl border border-gray-200 dark:border-gray-700/50
                divide-y divide-gray-100 dark:divide-gray-800/50">
  {items.map(item => (
    <div className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/30">
      {item}
    </div>
  ))}
</div>
```

### Horizontal List

```tsx
<div className="flex flex-wrap gap-2">
  {items.map(item => (
    <div className="px-3 py-1.5 rounded-full 
                    bg-gray-100 dark:bg-gray-800 
                    text-sm text-gray-700 dark:text-gray-300">
      {item}
    </div>
  ))}
</div>
```

## Empty States

```tsx
<div className="flex flex-col items-center justify-center py-12 text-center">
  <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 
                  flex items-center justify-center mb-4">
    <Icon className="w-8 h-8 text-gray-400 dark:text-gray-500" />
  </div>
  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">
    No items found
  </h3>
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

/* Smooth theme transitions */
* {
  @apply transition-colors duration-200 ease-in-out;
}

/* Prevent transition on page load */
.no-transition * {
  transition: none !important;
}

/* Theme backgrounds */
[data-theme="light"] {
  background-color: #ffffff;
}

[data-theme="dark"] {
  background-color: #030712;
}

/* Typography defaults */
body {
  @apply font-sans antialiased;
}

/* Focus states */
*:focus {
  outline: none;
}

/* Custom scrollbar for dark mode */
[data-theme="dark"] ::-webkit-scrollbar {
  width: 8px;
}

[data-theme="dark"] ::-webkit-scrollbar-track {
  @apply bg-gray-900;
}

[data-theme="dark"] ::-webkit-scrollbar-thumb {
  @apply bg-gray-700 rounded-full;
}

[data-theme="dark"] ::-webkit-scrollbar-thumb:hover {
  @apply bg-gray-600;
}
```

## Accessibility Guidelines

### Focus States

```tsx
// All interactive elements should have visible focus
"focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 
 dark:focus:ring-offset-gray-900"
```

### Contrast Requirements

- Text on backgrounds must meet WCAG AA (4.5:1 minimum)
- Large text (18px+) requires 3:1 minimum
- Interactive elements need visible borders even with glass effects

### Reduced Motion

```tsx
// Respect user preference
"motion-reduce:transition-none motion-reduce:animate-none"
```

### Screen Reader Only

```tsx
"sr-only" // Visually hidden but accessible
```

## Performance Guidelines

### Backdrop Blur Limits

- Maximum 2-3 overlapping glass layers
- Prefer `backdrop-blur-sm` (4px) over larger values
- Test on older devices for performance
- Consider fallbacks for low-powered devices

### Transition Performance

```tsx
// Prefer transform over position changes
"transform hover:scale-[1.02]" // ✅ Good
"hover:translate-y-[-2px]" // ✅ Good

// Avoid animating layout properties
"hover:w-full" // ❌ Avoid
"hover:h-auto" // ❌ Avoid
```

### Image Optimization

```tsx
// Use next/image for automatic optimization
import Image from 'next/image'

<Image 
  src="/image.jpg" 
  alt="Description"
  width={400}
  height={300}
  className="rounded-lg"
/>
```
