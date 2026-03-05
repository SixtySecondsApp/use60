/**
 * View Mode Settings
 *
 * Allows internal users to configure their "View as External" preferences
 * and see information about their access level.
 */

import { Eye, EyeOff, Shield, Users, Info, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';
import { useUser } from '@/lib/hooks/useUser';

export default function ViewModeSettings() {
  const { userData } = useUser();
  const { userType, isInternal, isAdmin, featureAccess, isViewingAsExternal, toggleExternalView } = useUserPermissions();

  // Use the external view state from UserPermissionsContext
  const isExternalViewActive = isViewingAsExternal;

  // External users don't see this tab (handled in Settings.tsx), but show a message if they somehow reach here
  if (!isInternal) {
    return (
      <div className="space-y-6">
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-6 text-center">
          <Users className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            External User Account
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            View mode settings are only available for internal team members.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current Status */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Your Access Level</h3>
        </div>
        <div className="p-6 space-y-4">
          {/* User Type Badge */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                <Shield className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">Internal Team Member</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Full access to CRM, admin features, and all tools
                </p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
              Internal
            </span>
          </div>

          {/* Admin Status */}
          {isAdmin && (
            <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                  <Shield className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">Administrator</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Access to admin dashboard, user management, and system settings
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
                Admin
              </span>
            </div>
          )}
        </div>
      </div>

      {/* View as External Toggle */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">View as External Customer</h3>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                'p-2 rounded-lg',
                isExternalViewActive
                  ? 'bg-amber-100 dark:bg-amber-900/30'
                  : 'bg-gray-100 dark:bg-gray-800'
              )}>
                {isExternalViewActive ? (
                  <EyeOff className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                ) : (
                  <Eye className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                )}
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {isExternalViewActive ? 'External View Active' : 'Normal View'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {isExternalViewActive
                    ? 'You are viewing the app as an external customer would see it'
                    : 'Toggle to preview the external customer experience'}
                </p>
              </div>
            </div>
            <Switch
              checked={isExternalViewActive}
              onCheckedChange={toggleExternalView}
            />
          </div>

          {/* Info box */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex gap-3">
              <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-700 dark:text-blue-300">
                <p>When "View as External" is active:</p>
                <ul className="mt-2 space-y-1 list-disc list-inside text-blue-600 dark:text-blue-400">
                  <li>CRM features (deals, contacts, pipeline) are hidden</li>
                  <li>Admin features are hidden</li>
                  <li>Only meetings-related features are visible</li>
                  <li>A banner shows at the top indicating external view mode</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feature Access Summary */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Feature Access Summary</h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { label: 'Meetings', key: 'meetings' as const, icon: '📅' },
              { label: 'Insights', key: 'meetingAnalytics' as const, icon: '📊' },
              { label: 'Team Insights', key: 'teamInsights' as const, icon: '👥' },
              { label: 'CRM', key: 'crm' as const, icon: '💼' },
              { label: 'Pipeline', key: 'pipeline' as const, icon: '📈' },
              { label: 'Workflows', key: 'workflows' as const, icon: '⚡' },
              { label: 'Calendar', key: 'calendar' as const, icon: '📆' },
              { label: 'Email', key: 'email' as const, icon: '✉️' },
              { label: 'Admin Dashboard', key: 'adminDashboard' as const, icon: '🛡️' },
            ].map(feature => (
              <div
                key={feature.key}
                className={cn(
                  'flex items-center gap-2 p-3 rounded-lg',
                  featureAccess[feature.key]
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                    : 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
                )}
              >
                <span>{feature.icon}</span>
                <span className="text-sm font-medium">{feature.label}</span>
                {featureAccess[feature.key] ? (
                  <span className="ml-auto text-emerald-500">✓</span>
                ) : (
                  <span className="ml-auto">✗</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Admin Link */}
      {isAdmin && (
        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-3">
              <Shield className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-purple-700 dark:text-purple-300">Admin Settings</p>
                <p className="text-sm text-purple-600 dark:text-purple-400 mt-1">
                  Manage internal email domains and user access settings
                </p>
              </div>
            </div>
            <Link to="/admin/internal-domains">
              <Button variant="outline" className="border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/30">
                <ExternalLink className="w-4 h-4 mr-2" />
                Configure Domains
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
