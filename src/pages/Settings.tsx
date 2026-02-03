/**
 * Settings - User Settings Page (Tier 1)
 *
 * Simplified settings page for all authenticated users.
 * Contains only user-specific settings:
 * - Account (profile)
 * - Appearance (theme)
 * - Proposals
 * - AI Personalization
 * - Email Sync
 * - Task Auto-Sync
 *
 * Team-level settings are shown here for admins only.
 * Platform-level settings (internal-only) are separate.
 */

import { useNavigate } from 'react-router-dom';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';
import { useMemo } from 'react';
import { useSlackOrgSettings } from '@/lib/hooks/useSlackSettings';
import { useFathomIntegration } from '@/lib/hooks/useFathomIntegration';
import { useJustCallIntegration } from '@/lib/hooks/useJustCallIntegration';
import { useHubSpotIntegration } from '@/lib/hooks/useHubSpotIntegration';
import { useBullhornIntegration } from '@/lib/hooks/useBullhornIntegration';
import {
  User,
  Palette,
  Sparkles,
  MessageSquare,
  Mail,
  CheckSquare,
  Key,
  ChevronRight,
  Users,
  Building2,
  Video,
  Phone,
  Workflow,
  Paintbrush,
  CreditCard,
  Brain,
  Briefcase,
} from 'lucide-react';

interface SettingsSection {
  id: string;
  label: string;
  icon: React.ElementType;
  description: string;
  path: string;
  requiresOrgAdmin?: boolean;
}

export default function Settings() {
  const navigate = useNavigate();
  const { permissions } = useOrg();
  const { isPlatformAdmin } = useUserPermissions();
  const { data: slackOrgSettings, isLoading: slackOrgLoading, error: slackOrgError } = useSlackOrgSettings();
  const isSlackConnected = !slackOrgLoading && !slackOrgError && slackOrgSettings?.is_connected === true;
  
  const { isConnected: isFathomConnected, loading: fathomLoading } = useFathomIntegration();
  const showFathomSettings = !fathomLoading && isFathomConnected;

  const { isConnected: isJustCallConnected, loading: justcallLoading } = useJustCallIntegration();
  const showJustCallSettings = !justcallLoading && isJustCallConnected;

  const { isConnected: isHubSpotConnected, loading: hubspotLoading } = useHubSpotIntegration();
  const showHubSpotSettings = !hubspotLoading && isHubSpotConnected;

  const { isConnected: isBullhornConnected, loading: bullhornLoading } = useBullhornIntegration();
  const showBullhornSettings = !bullhornLoading && isBullhornConnected;

  const allSettingsSections: SettingsSection[] = [
    {
      id: 'account',
      label: 'Account',
      icon: User,
      description: 'Manage your profile and account settings',
      path: '/settings/account',
    },
    {
      id: 'appearance',
      label: 'Appearance',
      icon: Palette,
      description: 'Customize theme and display preferences',
      path: '/settings/appearance',
    },
    {
      id: 'ai-intelligence',
      label: 'AI Intelligence',
      icon: Brain,
      description: 'Company context, AI skills, and writing styles',
      path: '/settings/ai-intelligence',
      requiresOrgAdmin: true,
    },
    {
      id: 'ai-personalization',
      label: 'AI Personalization',
      icon: Sparkles,
      description: 'Customize AI behavior and preferences',
      path: '/settings/ai-personalization',
    },
    {
      id: 'sales-coaching',
      label: 'Sales Coaching',
      icon: MessageSquare,
      description: 'Configure AI coaching preferences and reference meetings',
      path: '/settings/sales-coaching',
    },
    {
      id: 'api-keys',
      label: 'API Keys',
      icon: Key,
      description: 'Manage AI provider API keys (encrypted and secure)',
      path: '/settings/api-keys',
    },
    {
      id: 'follow-ups',
      label: 'Follow Ups',
      icon: Workflow,
      description: 'Configure follow-up workflows, templates, and AI settings',
      path: '/settings/follow-ups',
      requiresOrgAdmin: true,
    },
    {
      id: 'task-sync',
      label: 'Task Auto-Sync',
      icon: CheckSquare,
      description: 'AI-powered automatic task creation from action items',
      path: '/settings/task-sync',
    },
    {
      id: 'meeting-sync',
      label: 'Meeting Sync',
      icon: Video,
      description: 'Auto-log meetings from Fathom, Fireflies, and other integrations',
      path: '/settings/meeting-sync',
    },
    {
      id: 'call-types',
      label: 'Call Types',
      icon: Phone,
      description: 'Configure call types for AI-powered meeting classification',
      path: '/settings/call-types',
      requiresOrgAdmin: true,
    },
    {
      id: 'email-sync',
      label: 'Email Sync',
      icon: Mail,
      description: 'Sync and analyze email communications',
      path: '/settings/email-sync',
    },
    {
      id: 'slack',
      label: 'Slack',
      icon: MessageSquare,
      description: 'Send meeting, deal, and digest notifications to Slack',
      path: '/settings/integrations/slack',
    },
    {
      id: 'justcall',
      label: 'JustCall',
      icon: Phone,
      description: 'Configure call sync, webhooks, and outbound activity logging',
      path: '/settings/integrations/justcall',
      requiresOrgAdmin: true,
    },
    {
      id: 'hubspot',
      label: 'HubSpot',
      icon: Users,
      description: 'Configure pipeline sync, contact sync, deal sync, and AI notes',
      path: '/settings/integrations/hubspot',
      requiresOrgAdmin: true,
    },
    {
      id: 'bullhorn',
      label: 'Bullhorn ATS',
      icon: Briefcase,
      description: 'Configure candidate sync, job orders, placements, and AI notes',
      path: '/settings/integrations/bullhorn',
      requiresOrgAdmin: true,
    },
    {
      id: 'organization-management',
      label: 'Organization Management',
      icon: Building2,
      description: 'Manage organization, team members, and invitations',
      path: '/settings/organization-management',
      requiresOrgAdmin: false,
    },
    {
      id: 'branding',
      label: 'Branding',
      icon: Paintbrush,
      description: 'Manage your organization logo and branding',
      path: '/settings/branding',
      requiresOrgAdmin: true,
    },
    {
      id: 'billing',
      label: 'Billing',
      icon: CreditCard,
      description: 'Manage your subscription and billing',
      path: '/settings/billing',
      requiresOrgAdmin: true,
    },
  ];

  // Filter sections based on permissions
  const settingsSections = useMemo(() => {
    return allSettingsSections.filter(section => {
      // Slack settings should only appear when the org is already connected.
      // If Slack isn't connected (or the status can't be determined), hide the entry entirely.
      if (section.id === 'slack') {
        return isSlackConnected;
      }
      // JustCall settings should only appear when JustCall is connected.
      if (section.id === 'justcall') {
        return showJustCallSettings;
      }
      // HubSpot settings should only appear when HubSpot is connected.
      if (section.id === 'hubspot') {
        return showHubSpotSettings;
      }
      // Bullhorn settings should only appear when Bullhorn is connected.
      if (section.id === 'bullhorn') {
        return showBullhornSettings;
      }
      // Meeting Sync settings should only appear when Fathom is connected.
      if (section.id === 'meeting-sync') {
        return showFathomSettings;
      }
      if (section.requiresOrgAdmin) {
        // Allow org admins AND platform admins to see team settings
        return permissions.canManageTeam || permissions.canManageSettings || isPlatformAdmin;
      }
      return true;
    });
  }, [allSettingsSections, permissions, isPlatformAdmin, isSlackConnected, showFathomSettings, showJustCallSettings, showHubSpotSettings, showBullhornSettings]);

  const categories = useMemo(() => {
    const personalSections = settingsSections.filter(s =>
      ['account', 'appearance'].includes(s.id)
    );
    const aiSections = settingsSections.filter(s =>
      ['ai-intelligence', 'ai-personalization', 'sales-coaching', 'api-keys', 'follow-ups', 'task-sync', 'call-types'].includes(s.id)
    );
    // Meeting Sync is now under Integrations (only shown when Fathom is connected)
    const integrationSections = settingsSections.filter(s =>
      ['email-sync', 'slack', 'justcall', 'hubspot', 'bullhorn', 'meeting-sync'].includes(s.id)
    );
    const teamSections = settingsSections.filter(s =>
      ['organization-management', 'branding', 'billing'].includes(s.id)
    );

    const cats = [
      {
        id: 'personal',
        label: 'Personal',
        sections: personalSections,
      },
      {
        id: 'ai',
        label: 'AI & Intelligence',
        sections: aiSections,
      },
      {
        id: 'integrations',
        label: 'Integrations',
        sections: integrationSections,
      },
    ];

    // Only show Team category if user has team management permissions
    if (teamSections.length > 0) {
      cats.push({
        id: 'team',
        label: 'Team',
        sections: teamSections,
      });
    }

    return cats.filter(cat => cat.sections.length > 0);
  }, [settingsSections]);

  return (
    <div className="min-h-screen">
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Page Header */}
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#1E293B] dark:text-white">
              Settings
            </h1>
            <p className="text-[#64748B] dark:text-gray-400 mt-2">
              Manage your account, preferences, and integrations
            </p>
          </div>

          {/* Settings Categories */}
          {categories.map((category) => (
            <div key={category.id} className="space-y-4">
              {/* Category Header */}
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-800 to-transparent" />
                <h2 className="text-xs font-semibold text-[#64748B] dark:text-gray-500 uppercase tracking-wider px-3">
                  {category.label}
                </h2>
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-800 to-transparent" />
              </div>

              {/* Setting Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {category.sections.map((section) => {
                  const Icon = section.icon;
                  return (
                    <button
                      key={section.id}
                      onClick={() => navigate(section.path)}
                      className="group bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800/50 rounded-xl p-5 backdrop-blur-xl transition-all hover:border-[#37bd7e]/50 dark:hover:border-[#37bd7e]/50 hover:shadow-lg hover:shadow-[#37bd7e]/10 text-left"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4 flex-1">
                          <div className="p-3 bg-[#37bd7e]/10 dark:bg-[#37bd7e]/20 rounded-xl group-hover:bg-[#37bd7e]/20 dark:group-hover:bg-[#37bd7e]/30 transition-colors">
                            <Icon className="w-6 h-6 text-[#37bd7e]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-[#1E293B] dark:text-white text-base mb-1">
                              {section.label}
                            </h3>
                            <p className="text-sm text-[#64748B] dark:text-gray-400 line-clamp-2">
                              {section.description}
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-[#64748B] dark:text-gray-400 group-hover:text-[#37bd7e] transition-colors flex-shrink-0 mt-1" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
