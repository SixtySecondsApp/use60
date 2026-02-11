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
// Standard Secondary
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
