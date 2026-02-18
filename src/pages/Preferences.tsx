import { Monitor, Moon, Sun, Bell, Globe, Clock, Loader2 } from 'lucide-react'
import { useTheme, type ThemeMode } from '@/hooks/useTheme'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase/clientV2'
import { toast } from 'sonner'

/**
 * Preferences Page
 *
 * Dedicated page for user preferences including theme controls,
 * notification settings, language, and timezone.
 */

// Common IANA timezones for the selector
const COMMON_TIMEZONES = [
  'Pacific/Honolulu',
  'America/Anchorage',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Sao_Paulo',
  'Atlantic/Reykjavik',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Helsinki',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
]

const TIMEZONE_LABELS: Record<string, string> = {
  'Pacific/Honolulu': 'Hawaii (UTC-10)',
  'America/Anchorage': 'Alaska (UTC-9)',
  'America/Los_Angeles': 'Pacific Time (UTC-8/-7)',
  'America/Denver': 'Mountain Time (UTC-7/-6)',
  'America/Chicago': 'Central Time (UTC-6/-5)',
  'America/New_York': 'Eastern Time (UTC-5/-4)',
  'America/Sao_Paulo': 'Brasilia (UTC-3)',
  'Atlantic/Reykjavik': 'Reykjavik (UTC+0)',
  'Europe/London': 'London (UTC+0/+1)',
  'Europe/Paris': 'Paris / Madrid (UTC+1/+2)',
  'Europe/Berlin': 'Berlin / Amsterdam (UTC+1/+2)',
  'Europe/Helsinki': 'Helsinki / Kyiv (UTC+2/+3)',
  'Europe/Moscow': 'Moscow (UTC+3)',
  'Asia/Dubai': 'Dubai / Abu Dhabi (UTC+4)',
  'Asia/Kolkata': 'India (UTC+5:30)',
  'Asia/Dhaka': 'Dhaka (UTC+6)',
  'Asia/Bangkok': 'Bangkok / Jakarta (UTC+7)',
  'Asia/Singapore': 'Singapore / Kuala Lumpur (UTC+8)',
  'Asia/Tokyo': 'Tokyo / Seoul (UTC+9)',
  'Australia/Sydney': 'Sydney (UTC+10/+11)',
  'Pacific/Auckland': 'Auckland (UTC+12/+13)',
}

const SUPPORTED_LANGUAGES = [
  { value: 'en', label: 'English' },
]

interface UserPrefs {
  notification_email: boolean
  notification_browser: boolean
  language: string
  timezone: string
}

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'Europe/London'
  }
}

async function loadUserPrefs(): Promise<UserPrefs | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: settings } = await supabase
      .from('user_settings')
      .select('preferences')
      .eq('user_id', user.id)
      .maybeSingle()

    const prefs = (settings?.preferences || {}) as Record<string, unknown>
    return {
      notification_email: prefs.notification_email !== false, // default true
      notification_browser: prefs.notification_browser !== false, // default true
      language: (prefs.language as string) || 'en',
      timezone: (prefs.timezone as string) || detectTimezone(),
    }
  } catch {
    return null
  }
}

async function saveUserPrefs(partial: Partial<UserPrefs>): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const { data: existing } = await supabase
      .from('user_settings')
      .select('id, preferences')
      .eq('user_id', user.id)
      .maybeSingle()

    const current = (existing?.preferences || {}) as Record<string, unknown>
    const next = { ...current, ...partial }

    const payload = { user_id: user.id, preferences: next }

    if (existing) {
      await supabase.from('user_settings').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('user_settings').insert(payload)
    }
    return true
  } catch {
    return false
  }
}

export default function Preferences() {
  const { themeMode, resolvedTheme, setThemeMode } = useTheme()

  // User preferences state
  const [prefsLoaded, setPrefsLoaded] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [notificationEmail, setNotificationEmail] = useState(true)
  const [notificationBrowser, setNotificationBrowser] = useState(true)
  const [language, setLanguage] = useState('en')
  const [timezone, setTimezone] = useState(detectTimezone)

  // Load preferences on mount
  useEffect(() => {
    loadUserPrefs().then((prefs) => {
      if (prefs) {
        setNotificationEmail(prefs.notification_email)
        setNotificationBrowser(prefs.notification_browser)
        setLanguage(prefs.language)
        setTimezone(prefs.timezone)
      }
      setPrefsLoaded(true)
    })
  }, [])

  const handleSavePrefs = useCallback(async () => {
    setIsSaving(true)
    const ok = await saveUserPrefs({
      notification_email: notificationEmail,
      notification_browser: notificationBrowser,
      language,
      timezone,
    })
    setIsSaving(false)
    if (ok) {
      toast.success('Preferences saved')
    } else {
      toast.error('Failed to save preferences')
    }
  }, [notificationEmail, notificationBrowser, language, timezone])

  const themes: Array<{
    value: ThemeMode
    label: string
    description: string
    icon: React.ReactNode
  }> = [
    {
      value: 'system',
      label: 'System',
      description: 'Automatically match your device settings',
      icon: <Monitor className="w-5 h-5" />,
    },
    {
      value: 'light',
      label: 'Light',
      description: 'Clean white background with dark text',
      icon: <Sun className="w-5 h-5" />,
    },
    {
      value: 'dark',
      label: 'Dark',
      description: 'Dark background with light text',
      icon: <Moon className="w-5 h-5" />,
    },
  ]

  return (
    <div className="min-h-screen p-8 transition-colors duration-200">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Preferences
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Customize your experience and application settings
          </p>
        </div>

        {/* Appearance Section */}
        <Card className="bg-white/85 border border-transparent dark:bg-gray-900/50 dark:backdrop-blur-xl dark:border-gray-800/50 rounded-xl p-6 shadow-sm dark:shadow-none">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-1">
              Appearance
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Choose how the application looks to you
            </p>
          </div>

          {/* Theme Options */}
          <div className="space-y-3">
            {themes.map((theme) => {
              const isSelected = themeMode === theme.value

              return (
                <button
                  key={theme.value}
                  onClick={() => setThemeMode(theme.value)}
                  className={`
                    w-full flex items-center gap-4 p-4 rounded-lg border-2 transition-all duration-200
                    ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-500/10'
                        : 'border-gray-200 dark:border-gray-700/50 hover:border-gray-300 dark:hover:border-gray-600/50'
                    }
                    ${
                      isSelected
                        ? 'hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/20'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800/30'
                    }
                  `}
                >
                  {/* Icon */}
                  <div
                    className={`
                    flex items-center justify-center w-12 h-12 rounded-lg transition-colors
                    ${
                      isSelected
                        ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                    }
                  `}
                  >
                    {theme.icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span
                        className={`
                        font-medium transition-colors
                        ${
                          isSelected
                            ? 'text-gray-900 dark:text-gray-100'
                            : 'text-gray-700 dark:text-gray-300'
                        }
                      `}
                      >
                        {theme.label}
                      </span>
                      {theme.value === 'system' && themeMode === 'system' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 font-medium">
                          {resolvedTheme === 'light' ? 'Light' : 'Dark'}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                      {theme.description}
                    </p>
                  </div>

                  {/* Selection Indicator */}
                  {isSelected && (
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500 text-white">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Info Message */}
          <div className="mt-6 p-4 rounded-lg bg-blue-50/50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
            <p className="text-sm text-blue-900 dark:text-blue-300">
              {themeMode === 'system' ? (
                <>
                  <strong>System mode:</strong> The theme automatically matches your device's
                  settings. Currently displaying <strong>{resolvedTheme} mode</strong>.
                </>
              ) : (
                <>
                  <strong>{themeMode === 'light' ? 'Light' : 'Dark'} mode:</strong> The theme
                  is manually set. Change to System mode to follow your device settings.
                </>
              )}
            </p>
          </div>
        </Card>

        {/* Notifications Section */}
        <Card className="bg-white/85 border border-transparent dark:bg-gray-900/50 dark:backdrop-blur-xl dark:border-gray-800/50 rounded-xl p-6 shadow-sm dark:shadow-none">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-1 flex items-center gap-2">
              <Bell className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              Notifications
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Choose how you want to be notified
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/20">
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                  Email notifications
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Receive updates and alerts via email
                </p>
              </div>
              <Switch
                checked={notificationEmail}
                onCheckedChange={setNotificationEmail}
                disabled={!prefsLoaded}
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/20">
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                  Browser notifications
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Receive push notifications in the browser
                </p>
              </div>
              <Switch
                checked={notificationBrowser}
                onCheckedChange={setNotificationBrowser}
                disabled={!prefsLoaded}
              />
            </div>
          </div>
        </Card>

        {/* Language Section */}
        <Card className="bg-white/85 border border-transparent dark:bg-gray-900/50 dark:backdrop-blur-xl dark:border-gray-800/50 rounded-xl p-6 shadow-sm dark:shadow-none">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-1 flex items-center gap-2">
              <Globe className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              Language
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Choose your preferred display language
            </p>
          </div>

          <div className="max-w-xs">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={!prefsLoaded}
              className="w-full bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>
        </Card>

        {/* Timezone Section */}
        <Card className="bg-white/85 border border-transparent dark:bg-gray-900/50 dark:backdrop-blur-xl dark:border-gray-800/50 rounded-xl p-6 shadow-sm dark:shadow-none">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-1 flex items-center gap-2">
              <Clock className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              Time Zone
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Set your local timezone for accurate meeting and activity times
            </p>
          </div>

          <div className="max-w-xs">
            <select
              value={
                COMMON_TIMEZONES.includes(timezone) ? timezone : COMMON_TIMEZONES[8] // fallback to London
              }
              onChange={(e) => setTimezone(e.target.value)}
              disabled={!prefsLoaded}
              className="w-full bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {TIMEZONE_LABELS[tz] || tz}
                </option>
              ))}
            </select>
            {!COMMON_TIMEZONES.includes(timezone) && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Detected timezone: <span className="font-mono">{timezone}</span>
              </p>
            )}
          </div>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={handleSavePrefs}
            disabled={!prefsLoaded || isSaving}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Preferences'
            )}
          </button>
        </div>

        {/* Theme Preview Section */}
        <Card className="bg-white/85 border border-transparent dark:bg-gray-900/50 dark:backdrop-blur-xl dark:border-gray-800/50 rounded-xl p-6 shadow-sm dark:shadow-none">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
              Preview
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              See how the theme looks across different components
            </p>
          </div>

          {/* Preview Components */}
          <div className="space-y-4">
            {/* Preview Card */}
            <div className="bg-white/85 dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Card Component
              </h4>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                This is how cards look in the current theme with glassmorphism effects.
              </p>
              <div className="flex gap-2">
                <button className="px-3 py-1.5 text-sm font-medium bg-blue-600/10 dark:bg-blue-500/10 border border-blue-600/20 dark:border-blue-500/20 text-blue-700 dark:text-blue-400 rounded-md hover:bg-blue-600/20 dark:hover:bg-blue-500/20 transition-colors">
                  Primary
                </button>
                <button className="px-3 py-1.5 text-sm font-medium bg-gray-100/80 dark:bg-gray-600/10 border border-gray-300 dark:border-gray-500/20 text-gray-700 dark:text-gray-400 rounded-md hover:bg-gray-200/80 dark:hover:bg-gray-600/20 transition-colors">
                  Secondary
                </button>
              </div>
            </div>

            {/* Preview Text */}
            <div className="space-y-2">
              <p className="text-base text-gray-900 dark:text-gray-100">
                Primary text - main headings and important content
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Secondary text - body content and descriptions
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Muted text - subtle information and helper text
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
