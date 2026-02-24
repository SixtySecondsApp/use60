import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase/clientV2'

export type ThemeMode = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'theme-preference'

/**
 * Gets the system color scheme preference
 * Returns 'dark' as fallback if not available
 */
function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark'

  try {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    return mediaQuery.matches ? 'dark' : 'light'
  } catch {
    // Fallback to dark if matchMedia not available
    return 'dark'
  }
}

/**
 * Gets the currently applied theme from the DOM
 */
function getAppliedTheme(): ResolvedTheme {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/**
 * Gets the stored theme preference from localStorage
 */
function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark'

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored
    }
  } catch {
    // localStorage not available
  }

  // Default to dark theme for new users
  return 'dark'
}

/**
 * Saves theme preference to the user_settings.preferences JSONB column
 */
async function saveThemeToProfile(mode: ThemeMode) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: existing } = await supabase
      .from('user_settings')
      .select('id, preferences')
      .eq('user_id', user.id)
      .maybeSingle()

    const prefs = (existing?.preferences || {}) as Record<string, unknown>
    const nextPrefs = { ...prefs, theme: mode }

    const payload = { user_id: user.id, preferences: nextPrefs }

    if (existing) {
      await supabase.from('user_settings').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('user_settings').insert(payload)
    }
  } catch {
    // Silently fail - localStorage is the fallback
  }
}

/**
 * Loads theme preference from the user_settings.preferences JSONB column
 */
async function loadThemeFromProfile(): Promise<ThemeMode | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: settings } = await supabase
      .from('user_settings')
      .select('preferences')
      .eq('user_id', user.id)
      .maybeSingle()

    const prefs = (settings?.preferences || {}) as Record<string, unknown>
    const theme = prefs.theme
    if (theme === 'light' || theme === 'dark' || theme === 'system') {
      return theme
    }
  } catch {
    // Silently fail
  }
  return null
}

/**
 * Resolves the theme mode to an actual theme (light or dark)
 */
function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') {
    return getSystemTheme()
  }
  return mode
}

/**
 * Applies the theme to the document with smooth transition
 */
function applyTheme(theme: ResolvedTheme) {
  const root = document.documentElement

  // Add transition class for smooth theme changes
  root.classList.add('theme-transition')

  // Set data-theme attribute
  root.setAttribute('data-theme', theme)

  // Also set class for Tailwind dark mode
  if (theme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }

  // Remove transition class after animation completes
  setTimeout(() => {
    root.classList.remove('theme-transition')
  }, 300)
}

/**
 * Custom hook for managing theme state
 *
 * Priority order:
 * 1. User preference from localStorage (if set)
 * 2. System preference (default)
 * 3. Dark fallback (if system preference unavailable)
 *
 * @returns {Object} Theme state and controls
 * @property {ThemeMode} themeMode - Current theme mode preference (system/light/dark)
 * @property {ResolvedTheme} resolvedTheme - Actual theme applied (light/dark)
 * @property {Function} setThemeMode - Function to change theme preference
 */
export function useTheme() {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => getStoredTheme())
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    const stored = getStoredTheme()
    return resolveTheme(stored)
  })
  const profileLoaded = useRef(false)

  // Set theme mode
  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode)

    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      // localStorage not available
    }

    const resolved = resolveTheme(mode)
    setResolvedTheme(resolved)
    applyTheme(resolved)

    // Persist to user profile in database
    saveThemeToProfile(mode)

    // Dispatch custom event so other components using useTheme can sync
    window.dispatchEvent(new CustomEvent('theme-changed', { detail: { mode, resolved } }))
  }

  // Initialize theme on mount - load from localStorage first, then sync from profile
  useEffect(() => {
    const stored = getStoredTheme()
    const resolved = resolveTheme(stored)
    setThemeModeState(stored)
    setResolvedTheme(resolved)
    applyTheme(resolved)

    // Load from profile (database) and apply if different from localStorage
    if (!profileLoaded.current) {
      profileLoaded.current = true
      loadThemeFromProfile().then((profileTheme) => {
        if (profileTheme && profileTheme !== stored) {
          // Profile has a saved preference - use it and update localStorage
          try {
            localStorage.setItem(STORAGE_KEY, profileTheme)
          } catch {
            // localStorage not available
          }
          const profileResolved = resolveTheme(profileTheme)
          setThemeModeState(profileTheme)
          setResolvedTheme(profileResolved)
          applyTheme(profileResolved)
          window.dispatchEvent(new CustomEvent('theme-changed', { detail: { mode: profileTheme, resolved: profileResolved } }))
        } else if (!profileTheme && stored !== 'dark') {
          // No profile preference yet but user has a localStorage preference - seed it
          saveThemeToProfile(stored)
        }
      })
    }
  }, [])

  // Listen for theme changes from other components
  useEffect(() => {
    const handleThemeChange = (event: CustomEvent<{ mode: ThemeMode; resolved: ResolvedTheme }>) => {
      setThemeModeState(event.detail.mode)
      setResolvedTheme(event.detail.resolved)
    }

    window.addEventListener('theme-changed', handleThemeChange as EventListener)
    return () => window.removeEventListener('theme-changed', handleThemeChange as EventListener)
  }, [])

  // Listen for system theme changes when in 'system' mode
  useEffect(() => {
    if (themeMode !== 'system') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = (e: MediaQueryListEvent) => {
      const newTheme: ResolvedTheme = e.matches ? 'dark' : 'light'
      setResolvedTheme(newTheme)
      applyTheme(newTheme)
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [themeMode])

  return {
    themeMode,
    resolvedTheme,
    setThemeMode,
  }
}

/**
 * Initialize theme before React renders (call in main.tsx)
 * This prevents flash of wrong theme
 */
export function initializeTheme() {
  const stored = getStoredTheme()
  const resolved = resolveTheme(stored)
  applyTheme(resolved)
}
